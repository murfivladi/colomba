import fs from 'node:fs';
import path from 'node:path';
import { haversineKm, pointInRing, type LonLat } from '@colomba/shared';
import { config } from '../config.js';

/**
 * Суша по Natural Earth 110m (public domain). Нужна, чтобы:
 *  - понимать, есть ли у наземного курьера путь (конь из Палермо в Нью-Йорк — нет);
 *  - знать, над морем или сушей летит альбатрос.
 * Острова, отделённые проливом до ~45 км (Сицилия, Британия, Дания), склеиваются
 * с материком в одну «группу» — там есть паромы, мосты или тоннели.
 */

interface Land {
  ring: LonLat[];
  bbox: [number, number, number, number];
  group: number;
  /** Прорежённые вершины для поиска ближайшей суши. */
  sample: LonLat[];
}

let lands: Land[] | null = null;
const STRAIT_KM = 45;

function load(): Land[] {
  if (lands) return lands;
  const file = path.join(config.dataDir, 'ne_110m_land.geojson');
  const gj = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    features: { geometry: { type: string; coordinates: any } }[];
  };
  const out: Land[] = [];
  for (const f of gj.features) {
    const polys: LonLat[][][] =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const ring = poly[0] as LonLat[];
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const [x, y] of ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      out.push({ ring, bbox: [minX, minY, maxX, maxY], group: out.length, sample: ring });
    }
  }
  // склейка через проливы (union-find)
  const parent = out.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const pad = 0.6;
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i].bbox, b = out[j].bbox;
      if (a[0] - pad > b[2] || b[0] - pad > a[2] || a[1] - pad > b[3] || b[1] - pad > a[3]) continue;
      if (find(i) === find(j)) continue;
      if (ringsClose(out[i].ring, out[j].ring, STRAIT_KM)) parent[find(i)] = find(j);
    }
  }
  for (let i = 0; i < out.length; i++) out[i].group = find(i);
  lands = out;
  return out;
}

function ringsClose(a: LonLat[], b: LonLat[], km: number): boolean {
  for (const p of a) {
    for (const r of b) {
      if (Math.abs(p[1] - r[1]) > 1 || Math.abs(p[0] - r[0]) > 2) continue;
      if (haversineKm(p, r) <= km) return true;
    }
  }
  return false;
}

export function isOnLand(p: LonLat): boolean {
  for (const l of load()) {
    const [x0, y0, x1, y1] = l.bbox;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    if (pointInRing(p, l.ring)) return true;
  }
  return false;
}

/**
 * Группа суши, к которой относится точка: внутри полигона или в пределах maxKm от берега
 * (прибрежные города при грубом масштабе 110m часто «в воде»).
 */
export function landGroup(p: LonLat, maxKm = 150): number | null {
  const ls = load();
  for (const l of ls) {
    const [x0, y0, x1, y1] = l.bbox;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    if (pointInRing(p, l.ring)) return l.group;
  }
  let best: number | null = null;
  let bestD = maxKm;
  const degPad = maxKm / 80;
  for (const l of ls) {
    const [x0, y0, x1, y1] = l.bbox;
    if (p[0] < x0 - degPad * 3 || p[0] > x1 + degPad * 3 || p[1] < y0 - degPad || p[1] > y1 + degPad) continue;
    for (let i = 0; i < l.ring.length - 1; i++) {
      const d = distToSegmentKm(p, l.ring[i], l.ring[i + 1]);
      if (d < bestD) { bestD = d; best = l.group; }
    }
  }
  return best;
}

function distToSegmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  // проекция в локальной равнопромежуточной системе — для коротких отрезков достаточно
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * 111.32;
}

/** Связаны ли две точки сушей (с учётом проливов-паромов). */
export function sameLandmass(a: LonLat, b: LonLat): boolean {
  const ga = landGroup(a), gb = landGroup(b);
  return ga !== null && ga === gb;
}
