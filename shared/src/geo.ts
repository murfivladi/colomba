import type { LonLat, TimelinePoint } from './types.js';

export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Начальный азимут из a в b, градусы 0..360 (0 — север). */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const φ1 = a[1] * RAD;
  const φ2 = b[1] * RAD;
  const Δλ = (b[0] - a[0]) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/** Промежуточная точка на дуге большого круга, f ∈ [0,1]. */
export function intermediatePoint(a: LonLat, b: LonLat, f: number): LonLat {
  const φ1 = a[1] * RAD, λ1 = a[0] * RAD;
  const φ2 = b[1] * RAD, λ2 = b[0] * RAD;
  const δ = haversineKm(a, b) / EARTH_RADIUS_KM;
  if (δ < 1e-9) return [a[0], a[1]];
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return [normLon(λ * DEG), φ * DEG];
}

export function normLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

/** Дуга большого круга, разбитая на отрезки не длиннее stepKm. */
export function greatCircle(a: LonLat, b: LonLat, stepKm = 50): LonLat[] {
  const d = haversineKm(a, b);
  const n = Math.max(1, Math.ceil(d / stepKm));
  const pts: LonLat[] = [];
  for (let i = 0; i <= n; i++) pts.push(intermediatePoint(a, b, i / n));
  return pts;
}

export function lineLengthKm(line: LonLat[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversineKm(line[i - 1], line[i]);
  return s;
}

/** Уплотняет ломаную так, чтобы ни один отрезок не был длиннее stepKm. */
export function densify(line: LonLat[], stepKm = 50): LonLat[] {
  if (line.length < 2) return line.slice();
  const out: LonLat[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const seg = greatCircle(line[i - 1], line[i], stepKm);
    for (let j = 1; j < seg.length; j++) out.push(seg[j]);
  }
  return out;
}

/** Точка на ломаной на расстоянии km от начала. */
export function pointAlong(line: LonLat[], km: number): LonLat {
  let left = km;
  for (let i = 1; i < line.length; i++) {
    const d = haversineKm(line[i - 1], line[i]);
    if (left <= d) return intermediatePoint(line[i - 1], line[i], d === 0 ? 0 : left / d);
    left -= d;
  }
  return line[line.length - 1];
}

/**
 * Позиция курьера в момент t (секунды от начала рейса) по временной шкале.
 * Клиент двигает курьера сам, без запросов к серверу.
 */
export function positionAt(timeline: TimelinePoint[], t: number): { pos: LonLat; moving: boolean; index: number } {
  if (timeline.length === 0) return { pos: [0, 0], moving: false, index: 0 };
  if (t <= timeline[0][2]) return { pos: [timeline[0][0], timeline[0][1]], moving: false, index: 0 };
  const last = timeline[timeline.length - 1];
  if (t >= last[2]) return { pos: [last[0], last[1]], moving: false, index: timeline.length - 1 };
  // бинарный поиск отрезка
  let lo = 0, hi = timeline.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid][2] <= t) lo = mid; else hi = mid;
  }
  const p = timeline[lo], q = timeline[hi];
  const f = q[2] === p[2] ? 0 : (t - p[2]) / (q[2] - p[2]);
  const moving = p[0] !== q[0] || p[1] !== q[1];
  if (!moving) return { pos: [p[0], p[1]], moving: false, index: lo };
  return { pos: intermediatePoint([p[0], p[1]], [q[0], q[1]], f), moving: true, index: lo };
}

/** Смещает точку на случайное расстояние до maxKm — для показа на карте чужих позиций. */
export function jitter(p: LonLat, maxKm: number, rnd: () => number = Math.random): LonLat {
  const d = rnd() * maxKm;
  const θ = rnd() * 2 * Math.PI;
  const dLat = (d / EARTH_RADIUS_KM) * DEG * Math.cos(θ);
  const dLon = ((d / EARTH_RADIUS_KM) * DEG * Math.sin(θ)) / Math.max(0.1, Math.cos(p[1] * RAD));
  return [normLon(p[0] + dLon), Math.max(-89.9, Math.min(89.9, p[1] + dLat))];
}

/** Округление точки до сетки ~cellKm для кэша маршрутов. */
export function gridCell(p: LonLat, cellKm = 5): { key: string; center: LonLat } {
  const latStep = cellKm / 111.32;
  const lat = Math.round(p[1] / latStep) * latStep;
  const lonStep = cellKm / (111.32 * Math.max(0.05, Math.cos(lat * RAD)));
  const lon = Math.round(p[0] / lonStep) * lonStep;
  return { key: `${lat.toFixed(3)},${lon.toFixed(3)}`, center: [normLon(lon), lat] };
}

/** Проверка «точка в полигоне» (луч), полигон — кольцо [lon,lat]. */
export function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Пересекаются ли отрезки ab и cd (в плоскости lon/lat). */
export function segmentsIntersect(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const o = (p: LonLat, q: LonLat, r: LonLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
