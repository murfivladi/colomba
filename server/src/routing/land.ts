import { greatCircle, gridCell, haversineKm, lineLengthKm, type LonLat } from '@colomba/shared';
import { config } from '../config.js';
import { exec, one } from '../db.js';
import { countUsage } from '../lib/usage.js';
import { sameLandmass } from './landmass.js';

export interface LandRoute {
  line: LonLat[];
  lengthKm: number;
  source: 'ors' | 'graphhopper' | 'fallback' | 'cache';
}

/** Коэффициент извилистости дорог для запасного варианта (дуга ×1,3). */
export const ROAD_TORTUOSITY = 1.3;
const ORS_MAX_KM = 5500; // у ORS предел 6000 км на запрос — режем с запасом

/** Не больше maxPts точек — маршрут хранится в кэше и уходит клиенту. */
export function simplify(line: LonLat[], maxPts = 600): LonLat[] {
  if (line.length <= maxPts) return line;
  const step = (line.length - 1) / (maxPts - 1);
  const out: LonLat[] = [];
  for (let i = 0; i < maxPts; i++) out.push(line[Math.round(i * step)]);
  return out;
}

async function orsRoute(a: LonLat, b: LonLat): Promise<LonLat[] | null> {
  if (!config.orsApiKey) return null;
  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [a, b], radiuses: [-1, -1], instructions: false }),
      signal: AbortSignal.timeout(20000),
    });
    await countUsage('ors', res.ok);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const coords = data?.features?.[0]?.geometry?.coordinates as LonLat[] | undefined;
    return coords && coords.length > 1 ? coords : null;
  } catch {
    await countUsage('ors', false);
    return null;
  }
}

async function graphhopperRoute(a: LonLat, b: LonLat): Promise<LonLat[] | null> {
  if (!config.graphhopperKey) return null;
  try {
    const url = new URL('https://graphhopper.com/api/1/route');
    url.searchParams.append('point', `${a[1]},${a[0]}`);
    url.searchParams.append('point', `${b[1]},${b[0]}`);
    url.searchParams.set('profile', 'car');
    url.searchParams.set('points_encoded', 'false');
    url.searchParams.set('instructions', 'false');
    url.searchParams.set('key', config.graphhopperKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    await countUsage('graphhopper', res.ok);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const coords = data?.paths?.[0]?.points?.coordinates as LonLat[] | undefined;
    return coords && coords.length > 1 ? coords : null;
  } catch {
    await countUsage('graphhopper', false);
    return null;
  }
}

/** Длинный путь режем на отрезки по дуге большого круга — у ORS есть предел длины. */
async function chunked(
  a: LonLat,
  b: LonLat,
  router: (a: LonLat, b: LonLat) => Promise<LonLat[] | null>,
): Promise<LonLat[] | null> {
  const d = haversineKm(a, b);
  const parts = Math.max(1, Math.ceil(d / ORS_MAX_KM));
  const waypoints = parts === 1 ? [a, b] : greatCircle(a, b, d / parts);
  const out: LonLat[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const piece = await router(waypoints[i - 1], waypoints[i]);
    if (!piece) return null;
    out.push(...(out.length ? piece.slice(1) : piece));
  }
  return out;
}

/**
 * Маршрут по дорогам. Точки округляются до сетки ~5 км, и путь между двумя ячейками
 * берётся из кэша, если уже строился. Порядок: кэш → ORS → GraphHopper → дуга ×1,3.
 * Возвращает null, если сушей не дойти (другой континент).
 */
export async function landRoute(a: LonLat, b: LonLat): Promise<LandRoute | null> {
  if (!sameLandmass(a, b)) return null;
  const ca = gridCell(a), cb = gridCell(b);
  const cached = await one<{ line: string; length_km: number }>(
    'SELECT line, length_km FROM route_cache WHERE cell_a = ? AND cell_b = ? AND kind = ?',
    [ca.key, cb.key, 'land'],
  );
  if (cached) {
    const line = JSON.parse(cached.line) as LonLat[];
    return { line: [a, ...line.slice(1, -1), b], lengthKm: cached.length_km, source: 'cache' };
  }
  const reverse = await one<{ line: string; length_km: number }>(
    'SELECT line, length_km FROM route_cache WHERE cell_a = ? AND cell_b = ? AND kind = ?',
    [cb.key, ca.key, 'land'],
  );
  if (reverse) {
    const line = (JSON.parse(reverse.line) as LonLat[]).reverse();
    return { line: [a, ...line.slice(1, -1), b], lengthKm: reverse.length_km, source: 'cache' };
  }

  let line = await chunked(ca.center, cb.center, orsRoute);
  let source: LandRoute['source'] = 'ors';
  if (!line) {
    line = await chunked(ca.center, cb.center, graphhopperRoute);
    source = 'graphhopper';
  }
  if (!line) {
    // запасной вариант: дуга большого круга, длина × извилистость дорог
    const gc = greatCircle(a, b, 50);
    return { line: gc, lengthKm: lineLengthKm(gc) * ROAD_TORTUOSITY, source: 'fallback' };
  }
  const simple = simplify(line);
  const lengthKm = lineLengthKm(line);
  await exec(
    `INSERT IGNORE INTO route_cache (cell_a, cell_b, kind, line, length_km, source) VALUES (?, ?, 'land', ?, ?, ?)`,
    [ca.key, cb.key, JSON.stringify(simple), lengthKm, source],
  );
  return { line: [a, ...simple.slice(1, -1), b], lengthKm, source };
}
