import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GAME } from '@colomba/shared';
import { config } from '../config.js';
import { exec, one, q } from '../db.js';
import { requireActiveUser, requireUser } from '../lib/auth.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import {
  queueLetter, quote, recallLetter, scheduleForArrival, scheduleLetter, sendLetter, sendToMany, suggestCouriers,
} from '../services/letters.js';
import { cardOf, getUser } from '../services/people.js';
import { parseEvents, parseTimeline } from '../services/trips.js';

const LONLAT = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const DRAFT = z.object({
  kind: z.enum(['letter', 'postcard']).optional(),
  toId: z.number().nullable().optional(),
  replyToId: z.number().nullable().optional(),
  body: z.string().max(20000).optional(),
  paper: z.string().max(32).optional(),
  font: z.string().max(32).optional(),
  stamp: z.string().max(32).nullable().optional(),
  envelope: z.string().max(32).nullable().optional(),
  stickers: z.array(z.object({ code: z.string().max(48), x: z.number(), y: z.number(), r: z.number().optional() })).max(12).optional(),
});

const MIME: Record<string, { kinds: string[]; ext: string; magic?: (b: Buffer) => boolean }> = {
  'image/jpeg': { kinds: ['photo'], ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { kinds: ['photo', 'drawing'], ext: 'png', magic: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  'image/webp': { kinds: ['photo', 'drawing'], ext: 'webp', magic: (b) => b.subarray(8, 12).toString() === 'WEBP' },
  'audio/webm': { kinds: ['voice'], ext: 'webm' },
  'audio/ogg': { kinds: ['voice'], ext: 'ogg' },
  'audio/mp4': { kinds: ['voice'], ext: 'm4a' },
  'audio/mpeg': { kinds: ['voice'], ext: 'mp3' },
};

/** Письмо в ответе API: содержимое видят отправитель и получатель (после доставки). */
async function letterView(l: any, viewerId: number) {
  const isSender = l.from_id === viewerId;
  const isRecipient = l.to_id === viewerId;
  const delivered = l.status === 'delivered';
  const canRead = isSender || (isRecipient && delivered);
  const from = await getUser(l.from_id);
  const to = l.to_id ? await getUser(l.to_id) : null;
  const media = canRead && !l.removed
    ? await q<any>('SELECT id, kind, mime, duration_sec FROM letter_media WHERE letter_id = ?', [l.id])
    : [];
  const postmarks = await q<any>(
    `SELECT name_ru, name_it, country, stamped_at, lon, lat FROM postmarks WHERE letter_id = ? AND stamped_at <= UTC_TIMESTAMP() ORDER BY stamped_at`,
    [l.id],
  );
  // бутылку отправитель видит без имени того, кто её выловил, пока тот не ответит
  const hideRecipient = isSender && l.is_bottle && !(await one('SELECT 1 FROM letters WHERE from_id = ? AND to_id = ? LIMIT 1', [l.to_id, l.from_id]));
  // «прочитано» отправитель видит только если получатель это разрешил
  const showRead = isSender && to && to.read_receipts;
  const courier = l.courier_id ? await one<any>('SELECT id, name, type_code, owner_id, status FROM couriers WHERE id = ?', [l.courier_id]) : null;
  return {
    id: l.id,
    kind: l.kind,
    status: l.status === 'lost' && isSender ? 'in_transit' : l.status,
    from: from ? cardOf(from) : null,
    to: to && !hideRecipient ? cardOf(to) : null,
    isBottle: !!l.is_bottle,
    body: canRead ? (l.removed ? null : l.body) : null,
    removed: !!l.removed,
    paper: l.paper,
    font: l.font,
    stamp: l.stamp,
    envelope: l.envelope,
    stickers: typeof l.stickers === 'string' ? JSON.parse(l.stickers) : l.stickers,
    courierType: l.courier_type,
    courier: courier ? { id: courier.id, name: courier.name, type: courier.type_code, ownerId: courier.owner_id, status: courier.status } : null,
    tariff: l.tariff,
    surprise: !!l.surprise,
    replyToId: l.reply_to_id,
    groupId: l.group_id,
    sentAt: l.sent_at,
    arriveAt: isSender || !l.surprise ? l.arrive_at : null,
    deliveredAt: l.delivered_at,
    releaseAt: l.release_at,
    targetArriveAt: l.target_arrive_at,
    readAt: showRead || isRecipient ? l.read_at : null,
    distanceKm: l.distance_km,
    media: media.map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, durationSec: m.duration_sec })),
    postmarks: postmarks.map((p) => ({ ru: p.name_ru, it: p.name_it, country: p.country, at: p.stamped_at, pos: [p.lon, p.lat] })),
    // ответить можно тем же курьером, пока он ждёт у получателя
    canReplyWithCourier: isRecipient && delivered && !!courier && courier.status === 'waiting' && courier.owner_id === l.from_id,
    recallableUntil: isSender && l.status === 'in_transit' && l.sent_at ? new Date(new Date(l.sent_at).getTime() + GAME.recallWindowMin * 60_000) : null,
  };
}

async function ownDraft(userId: number, id: number) {
  const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [id, userId]);
  if (!l) throw notFound('letter_not_found');
  if (!['draft', 'scheduled', 'queued'].includes(l.status)) throw conflict('letter_already_sent');
  return l;
}

export async function letterRoutes(app: FastifyInstance): Promise<void> {
  // ─── Черновики (сохраняются автоматически) ───
  app.post('/letters', async (req) => {
    const u = requireActiveUser(req);
    const b = DRAFT.parse(req.body ?? {});
    const res = await exec(
      `INSERT INTO letters (from_id, to_id, kind, reply_to_id, body, paper, font, stamp, envelope, stickers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.id, b.toId ?? null, b.kind ?? 'letter', b.replyToId ?? null, b.body ?? '', b.paper ?? 'paper_cream', b.font ?? 'caveat',
        b.stamp ?? null, b.envelope ?? null, b.stickers ? JSON.stringify(b.stickers) : null],
    );
    return letterView(await one('SELECT * FROM letters WHERE id = ?', [res.insertId]), u.id);
  });

  app.patch('/letters/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const l = await ownDraft(u.id, id);
    const b = DRAFT.parse(req.body ?? {});
    const map: Record<string, string> = { kind: 'kind', toId: 'to_id', replyToId: 'reply_to_id', body: 'body', paper: 'paper', font: 'font', stamp: 'stamp', envelope: 'envelope' };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if ((b as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((b as any)[k]); }
    }
    if (b.stickers !== undefined) { sets.push('stickers = ?'); vals.push(JSON.stringify(b.stickers)); }
    if (sets.length) await exec(`UPDATE letters SET ${sets.join(', ')} WHERE id = ?`, [...vals, l.id]);
    return letterView(await one('SELECT * FROM letters WHERE id = ?', [l.id]), u.id);
  });

  app.get('/letters/drafts', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      "SELECT * FROM letters WHERE from_id = ? AND status IN ('draft','scheduled','queued') ORDER BY updated_at DESC LIMIT 100",
      [u.id],
    );
    return Promise.all(rows.map((l) => letterView(l, u.id)));
  });

  app.delete('/letters/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const l = await ownDraft(u.id, id);
    const media = await q<any>('SELECT * FROM letter_media WHERE letter_id = ?', [l.id]);
    await exec('DELETE FROM letter_media WHERE letter_id = ?', [l.id]);
    await exec('DELETE FROM letters WHERE id = ?', [l.id]);
    for (const m of media) {
      const still = await one('SELECT 1 FROM letter_media WHERE path = ? LIMIT 1', [m.path]);
      if (!still) await fsp.rm(path.join(config.mediaDir, m.path), { force: true });
    }
    return { ok: true };
  });

  // ─── Вложения: фото, голос, рисунки — на диске VPS, отдаются с проверкой прав ───
  app.post('/letters/:id/media', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const l = await ownDraft(u.id, id);
    const file = await req.file();
    if (!file) throw bad('file_required');
    const fields = Object.fromEntries(Object.entries(file.fields).map(([k, v]: any) => [k, v?.value]));
    const kind = z.enum(['photo', 'voice', 'drawing']).parse(fields.kind);
    const info = MIME[file.mimetype.split(';')[0]];
    if (!info || !info.kinds.includes(kind)) throw bad('unsupported_media');
    const buf = await file.toBuffer();
    if (info.magic && !info.magic(buf)) throw bad('bad_file');
    let duration: number | null = null;
    if (kind === 'voice') {
      duration = Math.max(1, Number(fields.durationSec ?? 0));
      // заявленная длительность не может быть меньше, чем позволяет размер файла (≤ 256 кбит/с)
      duration = Math.max(duration, buf.length / 32000);
      if (duration > 300) throw bad('voice_too_long');
    }
    const now = new Date();
    const rel = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${crypto.randomUUID()}.${info.ext}`);
    await fsp.mkdir(path.dirname(path.join(config.mediaDir, rel)), { recursive: true });
    await fsp.writeFile(path.join(config.mediaDir, rel), buf);
    const res = await exec(
      'INSERT INTO letter_media (letter_id, owner_id, kind, path, mime, size_bytes, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [l.id, u.id, kind, rel, file.mimetype.split(';')[0], buf.length, duration],
    );
    return { id: res.insertId, kind, mime: file.mimetype, durationSec: duration };
  });

  app.delete('/letters/:id/media/:mediaId', async (req) => {
    const u = requireUser(req);
    const { id, mediaId } = z.object({ id: z.coerce.number(), mediaId: z.coerce.number() }).parse(req.params);
    await ownDraft(u.id, id);
    const m = await one<any>('SELECT * FROM letter_media WHERE id = ? AND letter_id = ?', [mediaId, id]);
    if (!m) throw notFound();
    await exec('DELETE FROM letter_media WHERE id = ?', [m.id]);
    const still = await one('SELECT 1 FROM letter_media WHERE path = ? LIMIT 1', [m.path]);
    if (!still) await fsp.rm(path.join(config.mediaDir, m.path), { force: true });
    return { ok: true };
  });

  app.get('/media/:id', async (req, reply) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const m = await one<any>(
      'SELECT m.*, l.from_id, l.to_id, l.status, l.removed FROM letter_media m LEFT JOIN letters l ON l.id = m.letter_id WHERE m.id = ?',
      [id],
    );
    if (!m) throw notFound();
    const allowed = m.owner_id === u.id || m.from_id === u.id || (m.to_id === u.id && m.status === 'delivered') || u.role === 'admin';
    if (!allowed || (m.removed && u.role !== 'admin')) throw forbidden();
    const file = path.join(config.mediaDir, m.path);
    if (!file.startsWith(config.mediaDir)) throw forbidden();
    reply.header('Content-Type', m.mime);
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(file));
  });

  // ─── Расчёт и отправка ───
  app.post('/letters/quote', async (req) => {
    const u = requireActiveUser(req);
    const b = z.object({ courierId: z.number(), toId: z.number(), tariff: z.string().nullable().optional(), from: LONLAT.nullable().optional() }).parse(req.body);
    return quote(u, b);
  });

  app.post('/letters/suggest', async (req) => {
    const u = requireActiveUser(req);
    const b = z.object({ toId: z.number(), from: LONLAT.nullable().optional() }).parse(req.body);
    return suggestCouriers(u, b.toId, b.from ?? null);
  });

  app.post('/letters/:id/send', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z
      .object({
        courierId: z.number(),
        toId: z.number().nullable().optional(),
        bottle: z.boolean().optional(),
        tariff: z.string().nullable().optional(),
        from: LONLAT.nullable().optional(),
        surprise: z.boolean().optional(),
        quoteToken: z.string().nullable().optional(),
      })
      .parse(req.body);
    return sendLetter(u, { letterId: id, ...b, toId: b.toId ?? null });
  });

  app.post('/letters/:id/send-many', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z
      .object({
        targets: z.array(z.object({ toId: z.number(), courierId: z.number(), tariff: z.string().nullable().optional() })).min(1).max(20),
        from: LONLAT.nullable().optional(),
        surprise: z.boolean().optional(),
      })
      .parse(req.body);
    return sendToMany(u, id, b.targets, { from: b.from, surprise: b.surprise });
  });

  /** Отправка по времени: точное время вылета или «чтобы пришло к дате». */
  app.post('/letters/:id/schedule', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z
      .object({
        courierId: z.number(),
        toId: z.number(),
        tariff: z.string().nullable().optional(),
        releaseAt: z.string().optional(),
        arriveBy: z.string().optional(),
        surprise: z.boolean().optional(),
      })
      .parse(req.body);
    if (b.arriveBy) return scheduleForArrival(u, { letterId: id, courierId: b.courierId, toId: b.toId, tariff: b.tariff, arriveBy: b.arriveBy, surprise: b.surprise });
    if (!b.releaseAt) throw bad('release_or_arrive_required');
    if (new Date(b.releaseAt).getTime() < Date.now() - 60_000) throw bad('release_in_past');
    return scheduleLetter(u, { letterId: id, courierId: b.courierId, toId: b.toId, tariff: b.tariff, releaseAt: b.releaseAt, surprise: b.surprise });
  });

  app.post('/letters/:id/queue', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z.object({ courierId: z.number(), toId: z.number(), tariff: z.string().nullable().optional(), surprise: z.boolean().optional() }).parse(req.body);
    return queueLetter(u, { letterId: id, ...b });
  });

  app.post('/letters/:id/unschedule', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await ownDraft(u.id, id);
    await exec("UPDATE letters SET status = 'draft', release_at = NULL, target_arrive_at = NULL WHERE id = ?", [id]);
    return { ok: true };
  });

  app.post('/letters/:id/recall', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    return recallLetter(u, id);
  });

  /** Быстрая реакция: открытка «Получил, отвечу позже!» — курьер возвращается с ней домой. */
  app.post('/letters/:id/postcard', async (req) => {
    const u = requireActiveUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z.object({ text: z.string().min(1).max(140), stamp: z.string().max(32).optional(), from: LONLAT.nullable().optional() }).parse(req.body);
    const orig = await one<any>("SELECT * FROM letters WHERE id = ? AND to_id = ? AND status = 'delivered'", [id, u.id]);
    if (!orig) throw notFound('letter_not_found');
    const c = await one<any>("SELECT * FROM couriers WHERE id = ? AND status = 'waiting' AND waiting_letter_id = ?", [orig.courier_id, orig.id]);
    if (!c) throw conflict('courier_not_waiting');
    const res = await exec(
      `INSERT INTO letters (from_id, to_id, kind, reply_to_id, body, paper, font, stamp) VALUES (?, ?, 'postcard', ?, ?, 'paper_cream', 'caveat', ?)`,
      [u.id, orig.from_id, orig.id, b.text, b.stamp ?? 'stamp_colomba'],
    );
    return sendLetter(u, { letterId: res.insertId, courierId: c.id, toId: orig.from_id, from: b.from ?? null });
  });

  app.post('/letters/:id/read', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await exec("UPDATE letters SET read_at = COALESCE(read_at, UTC_TIMESTAMP()) WHERE id = ? AND to_id = ? AND status = 'delivered'", [id, u.id]);
    return { ok: true };
  });

  app.get('/letters/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const l = await one<any>('SELECT * FROM letters WHERE id = ?', [id]);
    if (!l) throw notFound();
    const isRecipient = l.to_id === u.id && l.status === 'delivered';
    if (l.from_id !== u.id && !isRecipient && u.role !== 'admin') throw notFound();
    return letterView(l, u.id);
  });

  /** Полёт: карту видит только отправитель. */
  app.get('/letters/:id/flight', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const l = await one<any>('SELECT * FROM letters WHERE id = ? AND from_id = ?', [id, u.id]);
    if (!l) throw notFound();
    const t = await one<any>("SELECT * FROM trips WHERE letter_id = ? AND status <> 'recalled' ORDER BY id DESC LIMIT 1", [id]);
    if (!t) throw notFound('no_trip');
    const elapsed = (Date.now() - new Date(t.start_at).getTime()) / 1000;
    const events = parseEvents(t).filter((e) => e.t <= elapsed);
    const courier = await one<any>('SELECT id, name, type_code FROM couriers WHERE id = ?', [t.courier_id]);
    const lostHere = l.status === 'lost';
    return {
      letterId: l.id,
      tripId: t.id,
      direction: t.direction,
      startAt: t.start_at,
      endAt: t.end_at,
      distanceKm: t.distance_km,
      from: [t.from_lon, t.from_lat],
      to: [t.to_lon, t.to_lat],
      timeline: parseTimeline(t),
      events,
      courier: courier ? { id: courier.id, name: courier.name, type: courier.type_code } : null,
      status: lostHere ? 'delayed' : l.status,
      postmarks: (await q<any>('SELECT name_ru, name_it, country, stamped_at, lon, lat FROM postmarks WHERE trip_id = ? ORDER BY stamped_at', [t.id]))
        .map((p) => ({ ru: p.name_ru, it: p.name_it, country: p.country, at: p.stamped_at, pos: [p.lon, p.lat], stamped: new Date(p.stamped_at).getTime() <= Date.now() })),
      routeSource: t.route_source,
    };
  });

  // ─── Почтовый ящик, переписки, шкатулка ───
  app.get('/mailbox', async (req) => {
    const u = requireUser(req);
    const delivered = await q<any>(
      `SELECT * FROM letters WHERE to_id = ? AND status = 'delivered' AND removed = 0 ORDER BY delivered_at DESC, id DESC LIMIT 50`,
      [u.id],
    );
    // письма в пути к пользователю — если отправитель не выбрал сюрприз
    const incoming = await q<any>(
      `SELECT l.id, l.courier_type, l.arrive_at, l.sent_at, u.display_name, u.username, u.avatar, u.id AS uid, u.kind
       FROM letters l JOIN users u ON u.id = l.from_id
       WHERE l.to_id = ? AND l.status IN ('in_transit','lost') AND l.surprise = 0 ORDER BY l.arrive_at`,
      [u.id],
    );
    const requests = await q<any>(
      `SELECT f.id, u.id AS uid, u.username, u.display_name, u.avatar, u.kind FROM friendships f
       JOIN users u ON u.id = f.requested_by
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending' AND f.requested_by <> ?`,
      [u.id, u.id, u.id],
    );
    return {
      letters: await Promise.all(delivered.map((l) => letterView(l, u.id))),
      incoming: incoming.map((i) => ({
        letterId: i.id, courierType: i.courier_type, sentAt: i.sent_at, arriveAt: i.arrive_at,
        from: cardOf({ id: i.uid, username: i.username, display_name: i.display_name, avatar: i.avatar, kind: i.kind }),
      })),
      friendRequests: requests.map((r) => ({ friendshipId: r.id, from: cardOf({ id: r.uid, username: r.username, display_name: r.display_name, avatar: r.avatar, kind: r.kind }) })),
    };
  });

  app.get('/outbox', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      `SELECT * FROM letters WHERE from_id = ? AND status IN ('in_transit','lost','scheduled','queued') ORDER BY COALESCE(arrive_at, release_at, updated_at)`,
      [u.id],
    );
    return Promise.all(rows.map((l) => letterView(l, u.id)));
  });

  app.get('/conversations', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      `SELECT other, MAX(ts) AS last_at, COUNT(*) AS n FROM (
         SELECT IF(from_id = ?, to_id, from_id) AS other, COALESCE(delivered_at, sent_at) AS ts FROM letters
         WHERE (from_id = ? AND status IN ('in_transit','delivered','lost')) OR (to_id = ? AND status = 'delivered')
       ) x WHERE other IS NOT NULL GROUP BY other ORDER BY last_at DESC LIMIT 100`,
      [u.id, u.id, u.id],
    );
    const out = [];
    for (const r of rows) {
      const o = await getUser(r.other);
      if (!o) continue;
      const unread = await one<any>(
        "SELECT COUNT(*) AS n FROM letters WHERE from_id = ? AND to_id = ? AND status = 'delivered' AND read_at IS NULL",
        [o.id, u.id],
      );
      out.push({ user: cardOf(o), lastAt: r.last_at, count: Number(r.n), unread: Number(unread?.n ?? 0) });
    }
    return out;
  });

  /** Переписка с человеком: лента писем как стопка конвертов. */
  app.get('/conversations/:userId', async (req) => {
    const u = requireUser(req);
    const { userId } = z.object({ userId: z.coerce.number() }).parse(req.params);
    const rows = await q<any>(
      `SELECT * FROM letters WHERE
         (from_id = ? AND to_id = ? AND status IN ('in_transit','delivered','lost'))
         OR (from_id = ? AND to_id = ? AND status = 'delivered')
       ORDER BY COALESCE(delivered_at, sent_at) DESC LIMIT 200`,
      [u.id, userId, userId, u.id],
    );
    const other = await getUser(userId);
    return { user: other ? cardOf(other) : null, letters: await Promise.all(rows.map((l) => letterView(l, u.id))) };
  });

  /** «Шкатулка»: вся переписка хранится всегда. */
  app.get('/box', async (req) => {
    const u = requireUser(req);
    const { before } = z.object({ before: z.coerce.number().optional() }).parse(req.query);
    const rows = await q<any>(
      `SELECT * FROM letters WHERE ((to_id = ? AND status = 'delivered') OR (from_id = ? AND status = 'delivered'))
       ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT 50`,
      before ? [u.id, u.id, before] : [u.id, u.id],
    );
    return Promise.all(rows.map((l) => letterView(l, u.id)));
  });
}
