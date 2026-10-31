import crypto from 'node:crypto';
import {
  GAME,
  checkCapacity,
  courierName,
  haversineKm,
  isInSeason,
  positionAt,
  type CourierTypeDef,
  type LonLat,
  type PostTariffDef,
  type TripPlan,
} from '@colomba/shared';
import { config } from '../config.js';
import { exec, one, pointWkt, q, tx } from '../db.js';
import { loadCities } from '../delivery/cities.js';
import { simulate, TooSlowError } from '../delivery/simulate.js';
import { solarHour } from '../delivery/sun.js';
import { weatherAlong } from '../delivery/weather.js';
import { HttpError, bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { makeRng, randomSeed } from '../lib/rng.js';
import { planRoute, RouteError } from '../routing/index.js';
import { landGroup } from '../routing/landmass.js';
import { POSTMASTER_REPLY, POSTMASTER_USERNAME } from './accounts.js';
import { courierType, postTariff } from './catalog.js';
import { getCourier, ownedTariffs, type CourierRow } from './couriers.js';
import { notify } from './notify.js';
import { assertCanWrite, getLocation, getUser, isBanned, type UserRow } from './people.js';
import { checkAchievements, checkQuests, completeQuest } from './progress.js';
import { award, rewardsToday } from './semi.js';
import { cutTimeline, getTrip, insertTrip, parseTimeline, reverseTimeline } from './trips.js';

// ─────────────────────────── Расчёт до отправки ───────────────────────────

interface QuoteKey {
  userId: number;
  courierId: number;
  toId: number | null;
  tariff: string | null;
  from: LonLat;
  to: LonLat;
}

interface StoredQuote extends QuoteKey {
  plan: TripPlan;
  route: LonLat[];
  createdAt: number;
}

/**
 * Время пути показывается до отправки и дальше не меняется: расчёт сохраняется по токену
 * на 15 минут, и отправка с этим токеном использует ровно его.
 */
const quotes = new Map<string, StoredQuote>();
const QUOTE_TTL = 15 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of quotes) if (now - v.createdAt > QUOTE_TTL) quotes.delete(k);
}, 60_000).unref();

function sameQuote(a: QuoteKey, b: QuoteKey): boolean {
  return (
    a.userId === b.userId && a.courierId === b.courierId && a.toId === b.toId && a.tariff === b.tariff &&
    haversineKm(a.from, b.from) < 2 && haversineKm(a.to, b.to) < 0.5
  );
}

export async function computePlan(
  def: CourierTypeDef,
  tariff: PostTariffDef | undefined,
  from: LonLat,
  to: LonLat,
  trips: number,
  startMs: number,
  opts: { lossMultiplier?: number; seed?: number } = {},
): Promise<{ plan: TripPlan; route: LonLat[] }> {
  await loadCities();
  let route;
  try {
    route = await planRoute(def, from, to, tariff);
  } catch (e) {
    if (e instanceof RouteError) throw new HttpError(422, e.code);
    throw e;
  }
  const line = route.legs.flatMap((l) => l.line);
  const weather = await weatherAlong(line);
  const rng = makeRng(opts.seed ?? (config.deterministic ? 42 : randomSeed()));
  try {
    const plan = simulate({ def, tariff, route, startMs, trips, rng, weather, lossMultiplier: opts.lossMultiplier });
    return { plan, route: line };
  } catch (e) {
    if (e instanceof TooSlowError) throw new HttpError(422, 'too_slow');
    throw e;
  }
}

interface CourierContext {
  courier: CourierRow;
  def: CourierTypeDef;
  /** Ответ тем же курьером, который принёс письмо и ждёт у получателя. */
  isReply: boolean;
  replyToLetterId: number | null;
}

/** Проверяет, может ли пользователь отправить этого курьера к адресату. */
async function courierContext(user: UserRow, courierId: number, toId: number | null): Promise<CourierContext> {
  const courier = await getCourier(courierId);
  if (!courier) throw notFound('courier_not_found');
  const def = await courierType(courier.type_code);
  if (!def) throw notFound('courier_type_not_found');
  if (!isInSeason(def, new Date())) throw forbidden('courier_out_of_season');
  if (courier.owner_id === user.id) {
    if (courier.status !== 'home') throw conflict('courier_busy');
    return { courier, def, isReply: false, replyToLetterId: null };
  }
  // чужой курьер: только ответ тем же курьером
  if (courier.status !== 'waiting' || !courier.waiting_letter_id) throw forbidden('not_your_courier');
  const waiting = await one<any>('SELECT id, from_id, to_id FROM letters WHERE id = ?', [courier.waiting_letter_id]);
  if (!waiting || waiting.to_id !== user.id || toId !== courier.owner_id) throw forbidden('not_your_courier');
  return { courier, def, isReply: true, replyToLetterId: waiting.id };
}

async function resolveTariff(user: UserRow, def: CourierTypeDef, tariffCode: string | null | undefined, isReply: boolean): Promise<PostTariffDef | undefined> {
  if (def.routeKind !== 'post') return undefined;
  const code = tariffCode || 'economy';
  if (!isReply) {
    const owned = await ownedTariffs(user.id);
    if (!owned.includes(code)) throw forbidden('tariff_not_owned');
  }
  const t = await postTariff(code);
  if (!t) throw bad('unknown_tariff');
  return t;
}

export interface QuoteInput {
  courierId: number;
  toId: number | null;
  tariff?: string | null;
  from?: LonLat | null;
  startAt?: string | null;
}

/** Время пути и что вместит курьер — до отправки. */
export async function quote(user: UserRow, input: QuoteInput) {
  const ctx = await courierContext(user, input.courierId, input.toId);
  if (input.toId === null) throw bad('recipient_required');
  const to = await getUser(input.toId);
  if (!to) throw notFound('recipient_not_found');
  const from = input.from ?? (await getLocation(user.id));
  if (!from) throw bad('no_sender_location');
  const dest = await getLocation(to.id);
  if (!dest) throw bad('recipient_has_no_location');
  const tariff = await resolveTariff(user, ctx.def, input.tariff, ctx.isReply);
  const startMs = input.startAt ? new Date(input.startAt).getTime() : Date.now();
  const { plan, route } = await computePlan(ctx.def, tariff, from, dest, ctx.courier.trips, startMs);
  const token = crypto.randomBytes(12).toString('hex');
  if (!input.startAt) {
    quotes.set(token, { userId: user.id, courierId: ctx.courier.id, toId: to.id, tariff: tariff?.code ?? null, from, to: dest, plan, route, createdAt: Date.now() });
  }
  return {
    token: input.startAt ? null : token,
    distanceKm: plan.distanceKm,
    durationSec: plan.durationSec,
    arriveAt: new Date(startMs + plan.durationSec * 1000).toISOString(),
    warnings: plan.warnings,
    capacity: ctx.def.capacity,
    routeSource: plan.routeSource,
    route: thin(route, 300),
    postmarks: plan.postmarks.map((p) => ({ ru: p.nameRu, it: p.nameIt, country: p.country })),
    isReply: ctx.isReply,
  };
}

function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

/** Подбор курьеров для адресата: у кого есть маршрут его типа и сколько он будет идти. */
export async function suggestCouriers(user: UserRow, toId: number, from: LonLat | null) {
  const own = await q<any>("SELECT id FROM couriers WHERE owner_id = ? AND status = 'home'", [user.id]);
  const waiting = await q<any>(
    `SELECT c.id FROM couriers c JOIN letters l ON l.id = c.waiting_letter_id
     WHERE c.status = 'waiting' AND l.to_id = ? AND c.owner_id = ?`,
    [user.id, toId],
  );
  const out: any[] = [];
  for (const c of [...waiting, ...own]) {
    try {
      const qt = await quote(user, { courierId: c.id, toId, from });
      out.push({ courierId: c.id, ok: true, durationSec: qt.durationSec, distanceKm: qt.distanceKm, token: qt.token, warnings: qt.warnings, isReply: qt.isReply });
    } catch (e: any) {
      out.push({ courierId: c.id, ok: false, error: e.code ?? 'error' });
    }
  }
  return out;
}

// ─────────────────────────────── Отправка ───────────────────────────────

async function letterContentSize(letterId: number, body: string | null) {
  const media = await q<any>('SELECT kind, duration_sec FROM letter_media WHERE letter_id = ?', [letterId]);
  return {
    textLength: [...(body ?? '')].length,
    photos: media.filter((m) => m.kind === 'photo').length,
    drawings: media.filter((m) => m.kind === 'drawing').length,
    voiceSec: Math.ceil(media.filter((m) => m.kind === 'voice').reduce((s, m) => s + Number(m.duration_sec ?? 0), 0)),
    mediaCount: media.length,
  };
}

function isNightAt(ms: number, lon: number): boolean {
  const h = solarHour(ms, lon);
  return h >= 22 || h < 5;
}

export interface SendInput {
  letterId: number;
  courierId: number;
  toId: number | null;
  bottle?: boolean;
  tariff?: string | null;
  from?: LonLat | null;
  surprise?: boolean;
  quoteToken?: string | null;
}

/** Случайный взрослый, который «выловит» бутылку: достижим морем, не заблокирован. */
async function pickBottleCatcher(user: UserRow, from: LonLat, def: CourierTypeDef): Promise<{ id: number; dest: LonLat } | null> {
  const cands = await q<any>(
    `SELECT u.id, l.lon, l.lat FROM users u JOIN locations l ON l.user_id = u.id
     WHERE u.kind = 'adult' AND u.bottle_enabled = 1 AND u.deleted_at IS NULL AND u.id <> ?
       AND (u.banned_until IS NULL OR u.banned_until < UTC_TIMESTAMP())
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
     ORDER BY RAND() LIMIT 12`,
    [user.id, user.id, user.id],
  );
  for (const c of cands) {
    try {
      await planRoute(def, from, [c.lon, c.lat]);
      return { id: Number(c.id), dest: [c.lon, c.lat] };
    } catch {
      /* следующий */
    }
  }
  return null;
}

export async function sendLetter(user: UserRow, input: SendInput): Promise<{ letterId: number; tripId: number; arriveAt: string }> {
  if (isBanned(user)) throw forbidden('banned');
  const letter = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [input.letterId, user.id]);
  if (!letter) throw notFound('letter_not_found');
  if (!['draft', 'scheduled', 'queued'].includes(letter.status)) throw conflict('letter_already_sent');

  const bottle = !!input.bottle;
  if (bottle && user.kind === 'child') throw forbidden('children_no_bottle');
  const ctx = await courierContext(user, input.courierId, bottle ? null : input.toId);
  if (bottle && ctx.def.code !== 'bottle') throw bad('bottle_needs_bottle_courier');
  if (!bottle && ctx.def.code === 'bottle' && user.kind === 'child') throw forbidden('children_no_bottle');

  const from = input.from ?? (await getLocation(user.id));
  if (!from) throw bad('no_sender_location');
  // живой GPS отправителя запоминаем как последнее известное место
  if (input.from) await saveLocation(user.id, input.from);

  let toId: number;
  let dest: LonLat;
  if (bottle) {
    const catcher = await pickBottleCatcher(user, from, ctx.def);
    if (!catcher) throw new HttpError(422, 'no_one_to_catch_bottle');
    toId = catcher.id;
    dest = catcher.dest;
  } else {
    if (!input.toId) throw bad('recipient_required');
    const to = await getUser(input.toId);
    if (!to) throw notFound('recipient_not_found');
    await assertCanWrite(user, to, { isReply: ctx.isReply });
    if (isBanned(to)) throw forbidden('recipient_unavailable');
    const d = await getLocation(to.id);
    if (!d) throw bad('recipient_has_no_location');
    toId = to.id;
    dest = d;
  }

  const kind: 'letter' | 'postcard' = letter.kind === 'postcard' ? 'postcard' : 'letter';
  const size = await letterContentSize(letter.id, letter.body);
  if (kind === 'postcard' && (size.textLength > 140 || size.mediaCount > 0)) throw bad('postcard_too_long');
  const capErrors = checkCapacity(ctx.def.capacity, size);
  if (capErrors.length) throw new HttpError(422, 'over_capacity', capErrors);
  if (size.textLength === 0 && size.mediaCount === 0) throw bad('empty_letter');

  const tariff = await resolveTariff(user, ctx.def, input.tariff, ctx.isReply);
  const now = Date.now();
  let plan: TripPlan | null = null;
  if (input.quoteToken && !bottle) {
    const stored = quotes.get(input.quoteToken);
    if (stored && now - stored.createdAt < QUOTE_TTL &&
      sameQuote(stored, { userId: user.id, courierId: ctx.courier.id, toId, tariff: tariff?.code ?? null, from, to: dest })) {
      plan = stored.plan;
      quotes.delete(input.quoteToken);
    }
  }
  if (!plan) plan = (await computePlan(ctx.def, tariff, from, dest, ctx.courier.trips, now)).plan;

  const night = isNightAt(now, from[0]);
  const gFrom = landGroup(from), gTo = landGroup(dest);
  const ocean = plan.distanceKm > 2000 && gFrom !== null && gTo !== null && gFrom !== gTo;
  const surprise = bottle ? true : !!input.surprise;

  const tripId = await tx(async (c) => {
    // курьер мог уйти, пока считали маршрут
    const cr = await getCourier(ctx.courier.id, c);
    if (!cr) throw notFound('courier_not_found');
    if (ctx.isReply ? cr.status !== 'waiting' : cr.status !== 'home') throw conflict('courier_busy');
    await exec(
      `UPDATE letters SET status = 'in_transit', to_id = ?, courier_id = ?, courier_type = ?, tariff = ?, is_bottle = ?,
         surprise = ?, sent_at = ?, arrive_at = ?, origin_lon = ?, origin_lat = ?, dest_lon = ?, dest_lat = ?, distance_km = ?,
         lost = ?, night_sent = ?, ocean = ?, reply_to_id = COALESCE(reply_to_id, ?), release_at = NULL
       WHERE id = ?`,
      [toId, cr.id, ctx.def.code, tariff?.code ?? null, bottle ? 1 : 0, surprise ? 1 : 0, new Date(now),
        new Date(now + plan!.durationSec * 1000), from[0], from[1], dest[0], dest[1], plan!.distanceKm,
        plan!.lost ? 1 : 0, night ? 1 : 0, ocean ? 1 : 0, ctx.replyToLetterId, letter.id],
      c,
    );
    const tid = await insertTrip(c, {
      letterId: letter.id, courierId: cr.id, direction: ctx.isReply ? 'back' : 'out', purpose: ctx.isReply ? 'reply' : 'deliver',
      from, to: dest, startMs: now, plan: plan!,
    });
    await exec(
      `UPDATE couriers SET status = ?, current_trip_id = ?, waiting_letter_id = NULL, waiting_until = NULL WHERE id = ?`,
      [ctx.isReply ? 'returning' : 'outbound', tid, cr.id],
      c,
    );
    await exec('UPDATE users SET letters_sent = letters_sent + 1 WHERE id = ?', [user.id], c);
    return tid;
  });

  const arriveAt = new Date(now + plan.durationSec * 1000).toISOString();
  if (!surprise) {
    await notify(toId, 'incoming', { from: user.display_name, eta: arriveAt }, { courierType: ctx.def.code, letterId: letter.id, url: '#/mailbox' });
  }
  if (night) await completeQuest(user.id, 'night_letter');
  if (ctx.isReply) await rewardReply(user.id, ctx.courier.owner_id, letter.id, size.textLength + size.mediaCount > 0);
  await checkQuests(user.id);
  await checkAchievements(user.id);
  return { letterId: letter.id, tripId, arriveAt };
}

/** +2 за ответ в переписке — не чаще лимита в день с одним человеком. */
async function rewardReply(userId: number, otherId: number, letterId: number, nonEmpty: boolean): Promise<void> {
  if (!nonEmpty) return;
  if ((await rewardsToday(userId, otherId, 'reply')) >= GAME.rewardedRepliesPerPairPerDay) return;
  await award(userId, GAME.semiReply, 'reply', { ref: letterId, other: otherId });
}

export async function saveLocation(userId: number, p: LonLat, accuracy?: number | null): Promise<void> {
  await exec(
    `INSERT INTO locations (user_id, pt, lon, lat, accuracy_m, updated_at) VALUES (?, ST_GeomFromText(?), ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE pt = VALUES(pt), lon = VALUES(lon), lat = VALUES(lat), accuracy_m = VALUES(accuracy_m), updated_at = UTC_TIMESTAMP()`,
    [userId, pointWkt(p[0], p[1]), p[0], p[1], accuracy ?? null],
  );
}

// ─────────────────────────────── Отзыв ───────────────────────────────

/** Письмо можно вернуть только в первые минуты после отправки — курьер разворачивается. */
export async function recallLetter(user: UserRow, letterId: number): Promise<{ returnAt: string }> {
  const now = Date.now();
  const result = await tx(async (c) => {
    const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ? FOR UPDATE', [letterId, user.id], c);
    if (!l) throw notFound('letter_not_found');
    if (l.status !== 'in_transit') throw conflict('not_in_transit');
    const elapsed = (now - new Date(l.sent_at).getTime()) / 1000;
    if (elapsed > GAME.recallWindowMin * 60) throw conflict('recall_window_passed');
    const trip = await one<any>("SELECT * FROM trips WHERE letter_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [l.id], c);
    if (!trip) throw conflict('no_trip');
    const tl = parseTimeline(trip);
    const { pos } = positionAt(tl, elapsed);
    const back = reverseTimeline(cutTimeline(tl, elapsed, pos));
    await exec("UPDATE trips SET status = 'recalled', end_at = ? WHERE id = ?", [new Date(now), trip.id], c);
    await exec('DELETE FROM postmarks WHERE trip_id = ?', [trip.id], c);
    const backId = await insertTrip(c, {
      letterId: null, courierId: trip.courier_id, direction: 'back', purpose: 'recall', from: pos, to: [trip.from_lon, trip.from_lat],
      startMs: now, plan: { durationSec: Math.max(1, Math.round(elapsed)), distanceKm: 0, timeline: back, events: [], postmarks: [], routeSource: 'recall' },
    });
    const isReply = trip.direction === 'back';
    await exec(
      `UPDATE couriers SET status = 'returning', current_trip_id = ? WHERE id = ?`,
      [backId, trip.courier_id],
      c,
    );
    if (isReply) {
      // ответ отозван: курьер возвращается к отвечавшему и снова ждёт
      await exec(`UPDATE couriers SET status = 'waiting', current_trip_id = NULL, waiting_letter_id = ?, waiting_until = ? WHERE id = ?`,
        [l.reply_to_id, new Date(now + GAME.waitDays * 86400_000), trip.courier_id], c);
      await exec("UPDATE trips SET status = 'done' WHERE id = ?", [backId], c);
    }
    await exec(
      `UPDATE letters SET status = 'draft', sent_at = NULL, arrive_at = NULL, courier_id = NULL, lost = 0 WHERE id = ?`,
      [l.id],
      c,
    );
    await exec('UPDATE users SET letters_sent = GREATEST(0, letters_sent - 1) WHERE id = ?', [user.id], c);
    return { returnAt: new Date(now + elapsed * 1000).toISOString() };
  });
  return result;
}

// ─────────────────────────── Доставка и возврат ───────────────────────────

/** Окончание рейса: письмо доставлено, курьер вернулся, ответ пришёл. Вызывает планировщик. */
export async function completeTrip(tripId: number): Promise<void> {
  const trip = await getTrip(tripId);
  if (!trip || trip.status !== 'active') return;
  const courier = await getCourier(trip.courier_id);
  const def = courier ? await courierType(courier.type_code) : null;
  const now = Date.now();

  if (trip.purpose === 'deliver' || trip.purpose === 'reply') {
    const letter = await one<any>('SELECT * FROM letters WHERE id = ?', [trip.letter_id]);
    if (!letter) {
      await exec("UPDATE trips SET status = 'done' WHERE id = ?", [trip.id]);
      return;
    }
    if (letter.lost) {
      await handleLost(trip, letter, courier, def);
      return;
    }
    await tx(async (c) => {
      const upd = await exec("UPDATE trips SET status = 'done' WHERE id = ? AND status = 'active'", [trip.id], c);
      if (upd.affectedRows !== 1) return;
      await exec("UPDATE letters SET status = 'delivered', delivered_at = ? WHERE id = ?", [trip.end_at, letter.id], c);
      await exec('UPDATE users SET letters_received = letters_received + 1 WHERE id = ?', [letter.to_id], c);
      await exec('UPDATE users SET km_total = km_total + ? WHERE id = ?', [letter.distance_km ?? 0, letter.from_id], c);
      if (courier) {
        await exec('UPDATE couriers SET trips = trips + 1, km_total = km_total + ? WHERE id = ?', [trip.distance_km, courier.id], c);
        if (trip.purpose === 'reply' || def?.noReturn) {
          // ответ пришёл домой или бутылка одноразовая — курьер дома
          await exec("UPDATE couriers SET status = 'home', current_trip_id = NULL, waiting_letter_id = NULL, waiting_until = NULL WHERE id = ?", [courier.id], c);
        } else {
          // курьер ждёт ответа у получателя
          await exec(
            "UPDATE couriers SET status = 'waiting', current_trip_id = NULL, waiting_letter_id = ?, waiting_until = ? WHERE id = ?",
            [letter.id, new Date(now + GAME.waitDays * 86400_000), courier.id],
            c,
          );
        }
      }
    });
    await afterDelivery(trip, letter, courier, def);
    if (courier && (trip.purpose === 'reply' || def?.noReturn)) await processQueue(courier.id);
    return;
  }

  // пустой возврат, возврат после потери, разворот после отзыва
  await tx(async (c) => {
    const upd = await exec("UPDATE trips SET status = 'done' WHERE id = ? AND status = 'active'", [trip.id], c);
    if (upd.affectedRows !== 1) return;
    if (courier) await exec("UPDATE couriers SET status = 'home', current_trip_id = NULL, waiting_letter_id = NULL, waiting_until = NULL WHERE id = ?", [courier.id], c);
  });
  if (courier && trip.purpose !== 'recall') {
    const type = trip.purpose === 'return_lost' ? 'returned_lost' : 'returned';
    await notify(courier.owner_id, type, { courierName: courier.name }, { courierType: courier.type_code, url: '#/' });
  }
  if (courier) await processQueue(courier.id);
}

async function afterDelivery(trip: any, letter: any, courier: CourierRow | null, def: CourierTypeDef | null): Promise<void> {
  const from = await getUser(letter.from_id);
  const to = await getUser(letter.to_id);
  if (!from || !to) return;
  const cname = courier?.name ?? courierName(letter.courier_type, 'ru');
  if (letter.is_bottle) {
    await notify(to.id, 'bottle_caught', {}, { courierType: 'bottle', letterId: letter.id, url: `#/letter/${letter.id}` });
    // бутылка открывает переписку: «друзья по переписке»
    const [a, b] = from.id < to.id ? [from.id, to.id] : [to.id, from.id];
    await exec(`INSERT IGNORE INTO friendships (user_a, user_b, status, requested_by) VALUES (?, ?, 'penpal', ?)`, [a, b, from.id]);
  } else if (trip.purpose !== 'reply') {
    await notify(to.id, 'delivered', { from: from.display_name, courierName: cname }, { courierType: letter.courier_type, letterId: letter.id, url: `#/letter/${letter.id}` });
  }
  if (trip.purpose === 'reply' && courier) {
    await notify(courier.owner_id, 'returned_reply', { from: from.display_name, courierName: cname }, { courierType: letter.courier_type, letterId: letter.id, url: `#/letter/${letter.id}` });
  } else {
    await notify(from.id, 'delivered_sender', { to: letter.is_bottle ? '?' : to.display_name, courierName: cname }, { courierType: letter.courier_type, letterId: letter.id, silent: true });
  }
  // зёрнышки: 1 за каждые 100 км пути, минимум 1 — только за непустые письма
  const nonEmpty = (letter.body ?? '').trim().length > 0 || !!(await one('SELECT 1 FROM letter_media WHERE letter_id = ? LIMIT 1', [letter.id]));
  if (nonEmpty) {
    await award(from.id, Math.max(1, Math.floor((letter.distance_km ?? 0) / 100)) * GAME.semiPer100Km, 'delivered', { ref: letter.id, other: to.id });
    // +10 за каждые 10 писем подряд с одним человеком
    const pair = await one<any>(
      `SELECT COUNT(*) AS n FROM letters WHERE status = 'delivered' AND kind IN ('letter','postcard')
       AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
      [from.id, to.id, to.id, from.id],
    );
    if (Number(pair?.n) > 0 && Number(pair.n) % 10 === 0 && (await rewardsToday(from.id, to.id, 'long_correspondence')) < 1) {
      await award(from.id, GAME.semiLongCorrespondence, 'long_correspondence', { ref: letter.id, other: to.id });
      await award(to.id, GAME.semiLongCorrespondence, 'long_correspondence', { ref: letter.id, other: from.id });
    }
  }
  if (to.username === POSTMASTER_USERNAME && trip.purpose === 'deliver' && courier && !def?.noReturn) {
    await postmasterReply(to, from, courier.id);
  }
  if (letter.ocean) await completeQuest(from.id, 'ocean_letter');
  await checkQuests(from.id);
  await checkQuests(to.id);
  await checkAchievements(from.id);
  await checkAchievements(to.id);
  void def;
}


/** Почтмейстер отвечает тем же курьером — так новичок видит весь круг письма. */
async function postmasterReply(pm: UserRow, user: UserRow, courierId: number): Promise<void> {
  try {
    const res = await exec(
      `INSERT INTO letters (from_id, to_id, kind, body, paper, font, stamp) VALUES (?, ?, 'letter', ?, 'paper_parchment', 'bad_script', 'stamp_postmaster')`,
      [pm.id, user.id, POSTMASTER_REPLY[user.lang]],
    );
    await sendLetter(pm, { letterId: res.insertId, courierId, toId: user.id, surprise: false });
  } catch (e) {
    console.warn('postmaster reply failed', e);
  }
}

/** Потеря: письмо пропало, курьер цел и возвращается позже без письма. */
async function handleLost(trip: any, letter: any, courier: CourierRow | null, def: CourierTypeDef | null): Promise<void> {
  const now = Date.now();
  const delay = (1 + Math.random() * 2) * 86400_000;
  await tx(async (c) => {
    const upd = await exec("UPDATE trips SET status = 'done' WHERE id = ? AND status = 'active'", [trip.id], c);
    if (upd.affectedRows !== 1) return;
    await exec("UPDATE letters SET status = 'lost' WHERE id = ?", [letter.id], c);
    await exec('DELETE FROM postmarks WHERE trip_id = ?', [trip.id], c);
    if (!courier) return;
    if (def?.noReturn) {
      await exec("UPDATE couriers SET status = 'home', current_trip_id = NULL WHERE id = ?", [courier.id], c);
      return;
    }
    const back = reverseTimeline(parseTimeline(trip));
    const T = back[back.length - 1][2];
    const delaySec = Math.round(delay / 1000);
    const shifted = [[back[0][0], back[0][1], 0], ...back.map(([x, y, t]) => [x, y, t + delaySec])] as any;
    const backId = await insertTrip(c, {
      letterId: null, courierId: courier.id, direction: 'back', purpose: 'return_lost',
      from: [trip.to_lon, trip.to_lat], to: [trip.from_lon, trip.from_lat], startMs: now,
      plan: { durationSec: T + delaySec, distanceKm: trip.distance_km, timeline: shifted, events: [], postmarks: [], routeSource: 'return' },
    });
    await exec("UPDATE couriers SET status = 'returning', current_trip_id = ? WHERE id = ?", [backId, courier.id], c);
  });
}

/** Ответа нет — курьер сам летит домой; время обратного пути то же. */
export async function returnEmpty(courierId: number): Promise<void> {
  await tx(async (c) => {
    const cr = await getCourier(courierId, c);
    if (!cr || cr.status !== 'waiting') return;
    const out = await one<any>(
      "SELECT * FROM trips WHERE letter_id = ? AND courier_id = ? AND direction = 'out' ORDER BY id DESC LIMIT 1",
      [cr.waiting_letter_id, cr.id],
      c,
    );
    const now = Date.now();
    if (!out) {
      await exec("UPDATE couriers SET status = 'home', waiting_letter_id = NULL, waiting_until = NULL WHERE id = ?", [cr.id], c);
      return;
    }
    const back = reverseTimeline(parseTimeline(out));
    const id = await insertTrip(c, {
      letterId: null, courierId: cr.id, direction: 'back', purpose: 'return_empty',
      from: [out.to_lon, out.to_lat], to: [out.from_lon, out.from_lat], startMs: now,
      plan: { durationSec: back[back.length - 1][2], distanceKm: out.distance_km, timeline: back, events: [], postmarks: [], routeSource: 'return' },
    });
    await exec("UPDATE couriers SET status = 'returning', current_trip_id = ?, waiting_letter_id = NULL, waiting_until = NULL WHERE id = ?", [id, cr.id], c);
  });
}

/** Очередь «отправить, когда курьер вернётся». */
export async function processQueue(courierId: number): Promise<void> {
  const next = await one<any>(
    "SELECT * FROM letters WHERE courier_id = ? AND status = 'queued' ORDER BY updated_at, id LIMIT 1",
    [courierId],
  );
  if (!next) return;
  const user = await getUser(next.from_id);
  if (!user) return;
  try {
    await sendLetter(user, { letterId: next.id, courierId, toId: next.to_id, tariff: next.tariff, surprise: !!next.surprise });
    await notify(user.id, 'scheduled_sent', {}, { courierType: next.courier_type, letterId: next.id, silent: true });
  } catch (e: any) {
    // не получилось — письмо возвращается в черновики, чтобы не застрять навсегда
    await exec("UPDATE letters SET status = 'draft' WHERE id = ?", [next.id]);
    await notify(user.id, 'queue_failed', { error: e?.code ?? 'error' }, { letterId: next.id, silent: true });
  }
}

/** Письма по расписанию: «чтобы пришло ко дню рождения» — курьер вылетает сам. */
export async function releaseScheduled(letter: any): Promise<void> {
  const user = await getUser(letter.from_id);
  if (!user) return;
  const courier = letter.courier_id ? await getCourier(letter.courier_id) : null;
  if (!courier) {
    await exec("UPDATE letters SET status = 'draft' WHERE id = ?", [letter.id]);
    return;
  }
  if (courier.status !== 'home') {
    // курьер ещё в пути — встанет в очередь и вылетит, как только вернётся
    await exec("UPDATE letters SET status = 'queued' WHERE id = ?", [letter.id]);
    return;
  }
  try {
    await sendLetter(user, { letterId: letter.id, courierId: courier.id, toId: letter.to_id, tariff: letter.tariff, surprise: !!letter.surprise });
    await notify(user.id, 'scheduled_sent', {}, { courierType: courier.type_code, letterId: letter.id, silent: true });
  } catch (e: any) {
    await exec("UPDATE letters SET status = 'draft', release_at = NULL WHERE id = ?", [letter.id]);
    await notify(user.id, 'queue_failed', { error: e?.code ?? 'error' }, { letterId: letter.id, silent: true });
  }
}

/** Когда выпустить курьера, чтобы письмо пришло к нужной дате. */
export async function scheduleForArrival(user: UserRow, input: { letterId: number; courierId: number; toId: number; tariff?: string | null; arriveBy: string; surprise?: boolean }) {
  const target = new Date(input.arriveBy).getTime();
  if (!(target > Date.now())) throw bad('arrive_by_in_past');
  // первая оценка — отправка сейчас; затем уточняем с учётом ночей и сезона в новой дате старта
  let qt = await quote(user, { courierId: input.courierId, toId: input.toId, tariff: input.tariff });
  let release = target - qt.durationSec * 1000;
  if (release > Date.now()) {
    qt = await quote(user, { courierId: input.courierId, toId: input.toId, tariff: input.tariff, startAt: new Date(release).toISOString() });
    release = target - qt.durationSec * 1000;
  }
  if (release < Date.now()) throw new HttpError(422, 'cannot_arrive_in_time', { earliest: new Date(Date.now() + qt.durationSec * 1000).toISOString() });
  return scheduleLetter(user, { ...input, releaseAt: new Date(release).toISOString(), targetArriveAt: input.arriveBy });
}

export async function scheduleLetter(user: UserRow, input: { letterId: number; courierId: number; toId: number; tariff?: string | null; releaseAt: string; surprise?: boolean; targetArriveAt?: string }) {
  const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [input.letterId, user.id]);
  if (!l) throw notFound('letter_not_found');
  if (!['draft', 'scheduled', 'queued'].includes(l.status)) throw conflict('letter_already_sent');
  const courier = await getCourier(input.courierId);
  if (!courier || courier.owner_id !== user.id) throw forbidden('not_your_courier');
  const to = await getUser(input.toId);
  if (!to) throw notFound('recipient_not_found');
  await assertCanWrite(user, to);
  await exec(
    `UPDATE letters SET status = 'scheduled', courier_id = ?, courier_type = ?, to_id = ?, tariff = ?, release_at = ?, target_arrive_at = ?, surprise = ? WHERE id = ?`,
    [courier.id, courier.type_code, to.id, input.tariff ?? null, new Date(input.releaseAt), input.targetArriveAt ? new Date(input.targetArriveAt) : null, input.surprise ? 1 : 0, l.id],
  );
  return { releaseAt: input.releaseAt };
}

/** Поставить в очередь «отправить, когда курьер вернётся». */
export async function queueLetter(user: UserRow, input: { letterId: number; courierId: number; toId: number; tariff?: string | null; surprise?: boolean }) {
  const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [input.letterId, user.id]);
  if (!l) throw notFound('letter_not_found');
  if (!['draft', 'scheduled', 'queued'].includes(l.status)) throw conflict('letter_already_sent');
  const courier = await getCourier(input.courierId);
  if (!courier || courier.owner_id !== user.id) throw forbidden('not_your_courier');
  const to = await getUser(input.toId);
  if (!to) throw notFound('recipient_not_found');
  await assertCanWrite(user, to);
  await exec(
    `UPDATE letters SET status = 'queued', courier_id = ?, courier_type = ?, to_id = ?, tariff = ?, surprise = ?, release_at = NULL WHERE id = ?`,
    [courier.id, courier.type_code, to.id, input.tariff ?? null, input.surprise ? 1 : 0, l.id],
  );
  if (courier.status === 'home') await processQueue(courier.id);
  return { queued: true };
}

/** Рассылка: одно письмо нескольким адресатам; копии с общим group_id, ответы личные. */
export async function sendToMany(user: UserRow, letterId: number, targets: { toId: number; courierId: number; tariff?: string | null }[], opts: { from?: LonLat | null; surprise?: boolean }) {
  const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [letterId, user.id]);
  if (!l) throw notFound('letter_not_found');
  if (l.status !== 'draft') throw conflict('letter_already_sent');
  if (targets.length < 1 || targets.length > 20) throw bad('bad_targets');
  if (new Set(targets.map((t) => t.courierId)).size !== targets.length) throw bad('one_courier_per_recipient');
  for (const t of targets) {
    const to = await getUser(t.toId);
    if (!to) throw notFound('recipient_not_found');
    // рассылки детям — только от одобренных друзей (assertCanWrite проверяет)
    await assertCanWrite(user, to);
  }
  const group = crypto.randomBytes(8).toString('hex');
  const media = await q<any>('SELECT * FROM letter_media WHERE letter_id = ?', [l.id]);
  const results: any[] = [];
  for (let i = 0; i < targets.length; i++) {
    let id = l.id;
    if (i > 0) {
      const res = await exec(
        `INSERT INTO letters (from_id, kind, body, paper, font, stamp, envelope, stickers, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, l.kind, l.body, l.paper, l.font, l.stamp, l.envelope, l.stickers ? JSON.stringify(l.stickers) : null, group],
      );
      id = res.insertId;
      for (const m of media) {
        await exec('INSERT INTO letter_media (letter_id, owner_id, kind, path, mime, size_bytes, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, m.owner_id, m.kind, m.path, m.mime, m.size_bytes, m.duration_sec]);
      }
    } else {
      await exec('UPDATE letters SET group_id = ? WHERE id = ?', [group, l.id]);
    }
    try {
      const r = await sendLetter(user, { letterId: id, courierId: targets[i].courierId, toId: targets[i].toId, tariff: targets[i].tariff, from: opts.from, surprise: opts.surprise });
      results.push({ toId: targets[i].toId, ok: true, ...r });
    } catch (e: any) {
      results.push({ toId: targets[i].toId, ok: false, letterId: id, error: e?.code ?? 'error' });
    }
  }
  return { groupId: group, results };
}

export { GAME };
