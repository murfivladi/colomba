import { haversineKm, type LonLat } from '@colomba/shared';
import { q } from '../db.js';

export interface City {
  id: number;
  name: string;
  nameRu: string;
  nameIt: string;
  country: string;
  lon: number;
  lat: number;
  population: number;
}

/**
 * Города для штемпелей и подписей (копия GeoNames в MySQL). Держим в памяти с сеткой 1°,
 * чтобы искать ближайший город вдоль маршрута без сотен SQL-запросов.
 */
let grid: Map<string, City[]> | null = null;
let loadedAt = 0;
const countries = new Map<string, { ru: string; it: string }>();

const key = (lon: number, lat: number) => `${Math.floor(lat)},${Math.floor(lon)}`;

export async function loadCities(force = false): Promise<void> {
  if (grid && !force && Date.now() - loadedAt < 6 * 3600_000) return;
  const rows = await q<any>('SELECT id, name, name_ru, name_it, country, lon, lat, population FROM cities WHERE population >= 15000');
  const g = new Map<string, City[]>();
  for (const r of rows) {
    const c: City = {
      id: Number(r.id), name: r.name, nameRu: r.name_ru || r.name, nameIt: r.name_it || r.name,
      country: r.country, lon: r.lon, lat: r.lat, population: r.population,
    };
    const k = key(c.lon, c.lat);
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(c);
  }
  grid = g;
  loadedAt = Date.now();
  const cs = await q<any>('SELECT code, name_ru, name_it FROM countries');
  countries.clear();
  for (const c of cs) countries.set(c.code, { ru: c.name_ru, it: c.name_it });
}

export function countryName(code: string, lang: 'ru' | 'it'): string {
  return countries.get(code)?.[lang] ?? code;
}

/** Ближайший город с населением не меньше minPop в радиусе maxKm. */
export function nearestCity(p: LonLat, maxKm = 60, minPop = 0): City | null {
  if (!grid) return null;
  const r = Math.ceil(maxKm / 70) + 1;
  const lat0 = Math.floor(p[1]), lon0 = Math.floor(p[0]);
  let best: City | null = null;
  let bd = maxKm;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r * 2; dx <= r * 2; dx++) {
      let lon = lon0 + dx;
      if (lon >= 180) lon -= 360;
      if (lon < -180) lon += 360;
      const cell = grid.get(`${lat0 + dy},${lon}`);
      if (!cell) continue;
      for (const c of cell) {
        if (c.population < minPop) continue;
        const d = haversineKm(p, [c.lon, c.lat]);
        if (d < bd) { bd = d; best = c; }
      }
    }
  }
  return best;
}

/** Крупнейший город поблизости — для штемпеля важнее Рим, чем пригород. */
export function notableCity(p: LonLat, maxKm = 60): City | null {
  if (!grid) return null;
  const near = nearestCity(p, maxKm, 0);
  if (!near) return null;
  let best = near;
  const lat0 = Math.floor(p[1]), lon0 = Math.floor(p[0]);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const c of grid.get(`${lat0 + dy},${lon0 + dx}`) ?? []) {
        if (c.population > best.population * 3 && haversineKm(p, [c.lon, c.lat]) < maxKm) best = c;
      }
    }
  }
  return best;
}
