import {
  GAME,
  bearingDeg,
  densify,
  experienceLossFactor,
  experienceSpeedBonus,
  haversineKm,
  intermediatePoint,
  lineLengthKm,
  type CourierTypeDef,
  type LonLat,
  type Postmark,
  type PostTariffDef,
  type TimelinePoint,
  type TripEvent,
  type TripPlan,
} from '@colomba/shared';
import type { Leg, PlannedRoute } from '../routing/index.js';
import { isOnLand } from '../routing/landmass.js';
import { inWorkHours, isDay, nextSunChange, nextWorkChange } from './sun.js';
import { sampleAt, STORM_KMH, weatherFactor, type WeatherKind, type WeatherSample } from './weather.js';
import { countryName, notableCity, type City } from './cities.js';

export interface SimInput {
  def: CourierTypeDef;
  tariff?: PostTariffDef;
  route: PlannedRoute;
  startMs: number;
  /** Рейсов у курьера — опыт. */
  trips: number;
  rng: () => number;
  weather: WeatherSample[];
  /** Множитель шанса потери (0 — без потерь, например для письма почтмейстера). */
  lossMultiplier?: number;
  /** Без случайного разброса (для расчёта «до отправки» оценка ±10% указывается отдельно). */
  noSpread?: boolean;
}

export class TooSlowError extends Error {}

const MAX_YEARS = 60;
const HOUR = 3600;

/** Месяцы миграции: весной на север, осенью на юг птицы летят быстрее. */
export function migrationBonus(def: CourierTypeDef, a: LonLat, b: LonLat, date: Date): number {
  if (def.section !== 'birds') return 0;
  const m = date.getUTCMonth() + 1;
  const south = a[1] < 0; // в южном полушарии сезоны наоборот
  const spring = south ? [9, 10, 11].includes(m) : [3, 4, 5].includes(m);
  const autumn = south ? [3, 4, 5].includes(m) : [9, 10, 11].includes(m);
  const brg = bearingDeg(a, b);
  const north = brg <= 60 || brg >= 300;
  const southward = brg >= 120 && brg <= 240;
  if ((spring && north) || (autumn && southward)) return GAME.migrationBonus;
  return 0;
}

function weatherKindOf(def: CourierTypeDef, leg: Leg): WeatherKind {
  if (leg.mode === 'plane' || leg.mode === 'walk') return 'none';
  if (leg.mode === 'car') return 'ground';
  if (def.windDriven && leg.surface === 'sea') return 'sail';
  if (def.code === 'airship') return 'airship';
  if (def.section === 'birds') return 'bird';
  return 'ground';
}

type Activity = { kind: 'always' } | { kind: 'day' } | { kind: 'night' } | { kind: 'hours'; h: number };

function activityFor(def: CourierTypeDef, leg: Leg, tariff: PostTariffDef | undefined, overSea: boolean): Activity {
  if (leg.mode === 'plane') return { kind: 'always' };
  if (leg.mode === 'car') return tariff && tariff.hoursPerDay < 24 ? { kind: 'hours', h: tariff.hoursPerDay } : { kind: 'always' };
  if (leg.mode === 'walk') return { kind: 'day' };
  switch (def.nightMode) {
    case 'always': return { kind: 'always' };
    case 'rest': return { kind: 'day' };
    case 'night_only': return { kind: 'night' };
    case 'sea_only': return overSea ? { kind: 'always' } : { kind: 'day' };
    case 'hours': return { kind: 'hours', h: tariff?.hoursPerDay ?? 8 };
  }
}

function isActive(act: Activity, tMs: number, p: LonLat): boolean {
  switch (act.kind) {
    case 'always': return true;
    case 'day': return isDay(tMs, p[1], p[0]);
    case 'night': return !isDay(tMs, p[1], p[0]);
    case 'hours': return inWorkHours(tMs, p[0], act.h);
  }
}

function nextChange(act: Activity, tMs: number, p: LonLat): number {
  switch (act.kind) {
    case 'always': return Infinity;
    case 'day':
    case 'night': return nextSunChange(tMs, p[1], p[0]);
    case 'hours': return nextWorkChange(tMs, p[0], act.h);
  }
}

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;

/**
 * Расчёт рейса на сервере в момент отправки: маршрут ÷ скорость + ночёвки, погода, сезон,
 * разброс ±10% и редкие события. Результат — временная шкала, по которой клиент сам
 * двигает курьера по карте, события для уведомлений и штемпели городов.
 */
export function simulate(input: SimInput): TripPlan {
  const { def, tariff, route, startMs, rng, weather } = input;
  const legs = route.legs;
  const a = legs[0].line[0];
  const lastLeg = legs[legs.length - 1];
  const b = lastLeg.line[lastLeg.line.length - 1];
  const start = new Date(startMs);

  const spread = input.noSpread ? 1 : 1 + (rng() * 2 - 1) * GAME.randomSpread;
  const global =
    spread * (1 + experienceSpeedBonus(input.trips)) * (1 + migrationBonus(def, a, b, start));

  const timeline: TimelinePoint[] = [[r5(a[0]), r5(a[1]), 0]];
  const events: TripEvent[] = [{ t: 0, type: 'depart', pos: a }];
  const warnings = [...route.warnings];
  let t = 0; // секунды от начала
  let pos: LonLat = a;
  const push = (p: LonLat, time: number) => {
    const last = timeline[timeline.length - 1];
    if (last[2] === Math.round(time) && last[0] === r5(p[0]) && last[1] === r5(p[1])) return;
    timeline.push([r5(p[0]), r5(p[1]), Math.round(time)]);
  };

  if (tariff && tariff.sortingHours > 0) {
    events.push({ t: 0, type: 'sorting', pos: a });
    t += tariff.sortingHours * HOUR;
    push(a, t);
  }

  const totalKm = route.distanceKm || 1;
  let doneKm = 0;
  let nightsLogged = 0;
  let lastNightLogT = -Infinity;
  const maxT = MAX_YEARS * 365 * 24 * HOUR;
  let stormDone = false;
  let seaStarted = false;

  for (const leg of legs) {
    const geom = lineLengthKm(leg.line);
    const pts = geom > 0 ? densify(leg.line, 50) : leg.line;
    // длина по дорогам может быть больше геометрической
    const stretch = geom > 0 ? leg.lengthKm / geom : 1;
    const wkind = weatherKindOf(def, leg);
    if (leg.surface === 'sea' && !seaStarted && leg.mode === 'courier' && def.routeKind !== 'air_sea') {
      seaStarted = true;
      events.push({ t, type: 'sea_start', pos });
    }

    // отрезок нулевой геометрии: только время (машина от аэропорта до адреса)
    if (geom === 0) {
      t += (leg.lengthKm / leg.speedKmh) * HOUR;
      push(pos, t);
      doneKm += leg.lengthKm;
      continue;
    }

    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const segKm = haversineKm(p, q) * stretch;
      if (segKm <= 0) continue;
      const mid = intermediatePoint(p, q, 0.5);
      const overSea = leg.surface === 'sea' || (def.nightMode === 'sea_only' && leg.surface === 'air' && !isOnLand(mid));
      const act = activityFor(def, leg, tariff, overSea);
      let speed = leg.speedKmh * (leg.mode === 'courier' ? global : spread);
      speed *= weatherFactor(wkind, sampleAt(weather, (doneKm + segKm / 2) / totalKm), p, q, leg.speedKmh);
      if (def.unpredictability && leg.mode === 'courier') speed *= 1 + (rng() * 2 - 1) * def.unpredictability;
      speed = Math.max(0.001, speed);

      // шторм у парусника: реальный по погоде или редкий случайный
      if (wkind === 'sail' && !stormDone) {
        const s = sampleAt(weather, doneKm / totalKm);
        const randomStorm = rng() < (segKm / 1000) * 0.02;
        if ((s && s.windKmh >= STORM_KMH) || randomStorm) {
          stormDone = true;
          const delay = (12 + rng() * 24) * HOUR;
          events.push({ t, type: 'storm', pos: p });
          push(p, t);
          t += delay;
          push(p, t);
        }
      }

      let remaining = segKm;
      let cur = p;
      let guard = 0;
      while (remaining > 1e-6) {
        if (++guard > 200000) throw new TooSlowError('loop');
        const tMs = startMs + t * 1000;
        if (!isActive(act, tMs, cur)) {
          const wakeMs = Math.max(nextChange(act, tMs, cur), tMs + 60_000);
          const restStart = t;
          push(cur, t);
          t = (wakeMs - startMs) / 1000;
          push(cur, t);
          // ночёвки в журнал: в коротких рейсах каждая, в долгих — не чаще раза в неделю
          if (act.kind !== 'hours' && (nightsLogged < 3 || restStart - lastNightLogT > 7 * 24 * HOUR)) {
            events.push({ t: restStart, type: act.kind === 'night' ? 'night_rest' : 'night_rest', pos: cur });
            events.push({ t, type: 'wake', pos: cur });
            nightsLogged++;
            lastNightLogT = restStart;
          }
          if (t > maxT) throw new TooSlowError('too_slow');
          continue;
        }
        const changeMs = nextChange(act, tMs, cur);
        const needSec = (remaining / speed) * HOUR;
        const availSec = changeMs === Infinity ? Infinity : Math.max(60, (changeMs - tMs) / 1000);
        if (needSec <= availSec) {
          t += needSec;
          cur = q;
          remaining = 0;
          push(cur, t);
        } else {
          const km = (speed * availSec) / HOUR;
          const f = 1 - (remaining - km) / segKm;
          cur = intermediatePoint(p, q, Math.min(1, Math.max(0, f)));
          remaining -= km;
          t += availSec;
          push(cur, t);
        }
        if (t > maxT) throw new TooSlowError('too_slow');
      }
      doneKm += segKm;
      pos = q;
    }
  }
  push(b, t);
  events.push({ t, type: 'arrive', pos: b });

  // горы, которые пришлось облетать
  for (const av of route.avoided) {
    events.push({ t: timeAtPoint(timeline, av.near), type: 'mountains', params: { mountains: av.code, mode: av.over ? 'over' : 'around' }, pos: av.near });
  }

  const postmarks = buildPostmarks(timeline, def);
  addCityAndBorderEvents(events, postmarks);
  events.sort((x, y) => x.t - y.t);

  const lossChance = GAME.lossChance * experienceLossFactor(input.trips) * (input.lossMultiplier ?? 1);
  const lost = rng() < lossChance;

  const durationSec = Math.round(t);
  if (durationSec / (24 * HOUR) > GAME.slowWarningDays) warnings.push('very_slow');
  return {
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    durationSec,
    timeline,
    events,
    postmarks,
    routeSource: route.source,
    warnings,
    lost,
  };
}

/** Момент, когда курьер ближе всего к точке. */
export function timeAtPoint(timeline: TimelinePoint[], p: LonLat): number {
  let best = 0, bd = Infinity;
  for (const x of timeline) {
    const d = haversineKm([x[0], x[1]], p);
    if (d < bd) { bd = d; best = x[2]; }
  }
  return best;
}

/** Время, когда курьер прошёл km от начала (по движущимся участкам шкалы). */
export function timeAtKm(timeline: TimelinePoint[], km: number): { t: number; pos: LonLat } {
  let acc = 0;
  for (let i = 1; i < timeline.length; i++) {
    const p = timeline[i - 1], q = timeline[i];
    const d = haversineKm([p[0], p[1]], [q[0], q[1]]);
    if (d > 0 && acc + d >= km) {
      const f = (km - acc) / d;
      return { t: p[2] + (q[2] - p[2]) * f, pos: intermediatePoint([p[0], p[1]], [q[0], q[1]], f) };
    }
    acc += d;
  }
  const last = timeline[timeline.length - 1];
  return { t: last[2], pos: [last[0], last[1]] };
}

function timelineKm(timeline: TimelinePoint[]): number {
  let acc = 0;
  for (let i = 1; i < timeline.length; i++) acc += haversineKm([timeline[i - 1][0], timeline[i - 1][1]], [timeline[i][0], timeline[i][1]]);
  return acc;
}

function toPostmark(c: City, t: number): Postmark {
  return { t: Math.round(t), cityId: c.id, nameRu: c.nameRu, nameIt: c.nameIt, country: c.country, pos: [c.lon, c.lat] };
}

/**
 * Штемпели городов по маршруту (Палермо → Рим → Вена → Варшава → Москва):
 * город отправления, до ~10 заметных городов по пути и город назначения.
 */
export function buildPostmarks(timeline: TimelinePoint[], def: CourierTypeDef): Postmark[] {
  const total = timelineKm(timeline);
  const out: Postmark[] = [];
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const startCity = notableCity([first[0], first[1]], 80);
  if (startCity) out.push(toPostmark(startCity, 0));
  const step = Math.max(40, total / 12);
  const seen = new Set(out.map((p) => p.cityId));
  // над морем городов нет — штемпели только у берега
  const radius = 60;
  for (let km = step; km < total - step / 2; km += step) {
    const { t, pos } = timeAtKm(timeline, km);
    const c = notableCity(pos, radius);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(toPostmark(c, t));
    }
  }
  const endCity = notableCity([last[0], last[1]], 80);
  if (endCity && !seen.has(endCity.id)) out.push(toPostmark(endCity, last[2]));
  else if (endCity && out.length && out[out.length - 1].cityId === endCity.id) out[out.length - 1].t = last[2];
  return out;
}

function addCityAndBorderEvents(events: TripEvent[], postmarks: Postmark[]): void {
  for (let i = 1; i < postmarks.length; i++) {
    const pm = postmarks[i];
    const isLast = i === postmarks.length - 1;
    if (pm.country !== postmarks[i - 1].country) {
      events.push({
        t: pm.t, type: 'border', pos: pm.pos,
        params: { countryCode: pm.country, country: countryName(pm.country, 'ru'), country_it: countryName(pm.country, 'it') },
      });
    }
    if (!isLast) events.push({ t: pm.t, type: 'city', pos: pm.pos, params: { city: pm.nameRu, city_it: pm.nameIt } });
  }
}
