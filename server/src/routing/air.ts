import { greatCircle, haversineKm, segmentsIntersect, pointInRing, type LonLat } from '@colomba/shared';

/**
 * Горные массивы, которые птицы облетают. Полигоны грубые (это игра, а не навигация),
 * но заметны на карте: голубь из Милана в Мюнхен пойдёт в обход Альп.
 */
export const MOUNTAINS: { code: string; ring: LonLat[] }[] = [
  { code: 'alps', ring: [[5.6, 44.0], [7.0, 44.1], [7.5, 44.9], [8.6, 45.9], [10.0, 45.9], [11.5, 46.0], [13.0, 46.2], [14.5, 46.3], [16.0, 47.2], [15.5, 47.8], [13.0, 47.7], [11.0, 47.55], [9.6, 47.5], [7.5, 46.6], [6.6, 46.0], [5.9, 45.2]] },
  { code: 'pyrenees', ring: [[-1.9, 43.2], [0.5, 42.9], [3.1, 42.5], [2.8, 42.2], [0.3, 42.4], [-1.9, 42.8]] },
  { code: 'carpathians', ring: [[17.6, 48.6], [20.0, 49.5], [22.5, 49.3], [24.8, 48.0], [26.4, 46.5], [26.3, 45.4], [22.4, 44.7], [21.9, 45.6], [24.2, 46.4], [23.2, 47.5], [20.8, 48.6], [18.2, 48.2]] },
  { code: 'caucasus', ring: [[37.5, 44.6], [40.5, 43.7], [44.0, 43.0], [47.6, 41.6], [49.4, 40.7], [48.4, 40.1], [44.5, 41.4], [41.0, 42.4], [37.5, 44.0]] },
  { code: 'zagros', ring: [[43.8, 37.3], [46.8, 35.2], [50.6, 31.4], [54.5, 28.6], [53.6, 27.6], [49.6, 30.0], [45.6, 33.4], [43.6, 36.3]] },
  { code: 'pamir', ring: [[67.5, 37.2], [74.5, 36.6], [80.0, 40.2], [87.0, 42.6], [95.0, 43.5], [94.5, 42.4], [86.5, 41.4], [80.5, 39.3], [75.0, 38.4], [70.0, 38.3]] },
  { code: 'himalaya', ring: [[72.8, 35.8], [77.8, 34.6], [80.5, 30.2], [86.0, 27.6], [92.0, 27.0], [97.5, 28.0], [100.0, 32.5], [96.5, 36.0], [90.0, 37.0], [80.5, 36.2]] },
  { code: 'altai', ring: [[83.0, 51.2], [88.0, 51.9], [90.6, 50.4], [88.5, 48.9], [84.6, 49.3]] },
  { code: 'rockies', ring: [[-125.5, 59.5], [-118.0, 60.0], [-110.5, 48.5], [-105.2, 41.0], [-105.0, 35.5], [-109.5, 35.0], [-114.5, 42.5], [-120.5, 51.5]] },
  { code: 'andes', ring: [[-79.5, 7.5], [-73.0, 10.5], [-71.8, 4.0], [-74.8, -10.0], [-67.8, -20.0], [-68.4, -35.0], [-70.8, -52.0], [-74.2, -51.5], [-72.0, -35.0], [-70.8, -20.5], [-78.5, -10.0], [-80.2, -1.0]] },
  { code: 'atlas', ring: [[-9.6, 30.4], [-5.0, 31.8], [0.0, 33.8], [3.2, 35.3], [2.0, 34.1], [-4.0, 31.0], [-8.2, 29.8]] },
  { code: 'ethiopia', ring: [[36.6, 14.0], [39.6, 14.2], [42.0, 10.2], [39.6, 6.0], [36.4, 7.4]] },
];

export interface AirRoute {
  line: LonLat[];
  /** Массивы, которые пришлось облетать (или перелетать, если обход слишком долгий). */
  avoided: { code: string; near: LonLat; over?: boolean }[];
}

function centroid(ring: LonLat[]): LonLat {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

/** Вершины, немного вынесенные наружу, чтобы путь шёл вдоль подножия, а не по хребту. */
function expanded(ring: LonLat[], deg = 0.35): LonLat[] {
  const c = centroid(ring);
  return ring.map((p) => {
    const dx = p[0] - c[0], dy = p[1] - c[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / l) * deg, p[1] + (dy / l) * deg] as LonLat;
  });
}

function crossesRing(a: LonLat, b: LonLat, ring: LonLat[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length];
    if (segmentsIntersect(a, b, c, d)) return true;
  }
  const mid: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return pointInRing(mid, ring);
}

/** Пересекает ли дуга большого круга полигон (проверяем по уплотнённой дуге). */
function gcCrosses(a: LonLat, b: LonLat, ring: LonLat[]): boolean {
  const pts = greatCircle(a, b, 40);
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180) continue;
    if (crossesRing(pts[i - 1], pts[i], ring)) return true;
  }
  return false;
}

/**
 * Маршрут птицы: дуга большого круга; если она пересекает горный массив — кратчайший обход
 * по графу видимости (вершины вынесенных полигонов).
 */
/** Если обход длиннее прямого пути больше чем в 1,5 раза — птица перелетает хребет. */
const MAX_DETOUR = 1.5;

export function airRoute(a: LonLat, b: LonLat, avoidMountains = true): AirRoute {
  const direct = greatCircle(a, b, 50);
  if (!avoidMountains) return { line: direct, avoided: [] };
  // старт или финиш внутри массива — облетать нечего (адресат живёт в горах)
  const hit = MOUNTAINS.filter(
    (m) => !pointInRing(a, m.ring) && !pointInRing(b, m.ring) && gcCrosses(a, b, m.ring),
  );
  if (hit.length === 0) return { line: direct, avoided: [] };
  // через антимеридиан не облетаем — таких массивов рядом нет
  if (Math.abs(a[0] - b[0]) > 180) return { line: direct, avoided: [] };

  const obstacles = MOUNTAINS.filter((m) => !pointInRing(a, m.ring) && !pointInRing(b, m.ring));
  const rings = obstacles.map((m) => m.ring);
  const nodes: LonLat[] = [a, b];
  for (const m of obstacles) for (const v of expanded(m.ring)) nodes.push(v);

  const n = nodes.length;
  const visible = (i: number, j: number) => !rings.some((r) => crossesRing(nodes[i], nodes[j], r));
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = haversineKm(nodes[u], nodes[v]);
      if (dist[u] + w >= dist[v]) continue;
      if (!visible(u, v)) continue;
      dist[v] = dist[u] + w;
      prev[v] = u;
    }
  }
  if (dist[1] === Infinity) return { line: direct, avoided: [] };
  const path: LonLat[] = [];
  for (let v = 1; v !== -1; v = prev[v]) path.unshift(nodes[v]);
  const line: LonLat[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const seg = greatCircle(path[i - 1], path[i], 50);
    for (let j = 1; j < seg.length; j++) line.push(seg[j]);
  }
  const directKm = haversineKm(a, b);
  let detourKm = 0;
  for (let i = 1; i < line.length; i++) detourKm += haversineKm(line[i - 1], line[i]);
  if (detourKm > directKm * MAX_DETOUR) {
    // через перевалы: прямой путь, событие «перелетел Альпы»
    return {
      line: direct,
      avoided: hit.map((m) => {
        const c = centroid(m.ring);
        let best = direct[0], bd = Infinity;
        for (const p of direct) {
          const d = haversineKm(p, c);
          if (d < bd) { bd = d; best = p; }
        }
        return { code: m.code, near: best, over: true };
      }),
    };
  }
  const avoided = hit.map((m) => {
    const c = centroid(m.ring);
    // ближайшая к центру массива точка пути — там и «облетел»
    let best = line[0], bd = Infinity;
    for (const p of line) {
      const d = haversineKm(p, c);
      if (d < bd) { bd = d; best = p; }
    }
    return { code: m.code, near: best };
  });
  return { line, avoided };
}

