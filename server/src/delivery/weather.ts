import { bearingDeg, pointAlong, lineLengthKm, type LonLat } from '@colomba/shared';
import { config } from '../config.js';
import { exec, q } from '../db.js';
import { countUsage } from '../lib/usage.js';

export interface WeatherSample {
  pos: LonLat;
  /** Доля пути (0..1), к которой относится образец. */
  at: number;
  windKmh: number;
  /** Откуда дует ветер, градусы. */
  windFromDeg: number;
  precipMm: number;
}

const cellOf = (p: LonLat) => `${Math.round(p[1])},${Math.round(p[0])}`;

/**
 * Погода по точкам маршрута (Open-Meteo, данные CC-BY 4.0). Берётся в момент отправки.
 * Кэш — по клеткам 1°×1° на текущий час, чтобы не тратить дневной лимит.
 * Если сервис недоступен — нейтральная погода (без ускорения и замедления).
 */
export async function weatherAlong(line: LonLat[], samples = 8): Promise<WeatherSample[]> {
  if (!config.weatherEnabled || line.length < 2) return [];
  const total = lineLengthKm(line);
  const n = Math.max(1, Math.min(samples, Math.ceil(total / 150)));
  const pts: { pos: LonLat; at: number; cell: string }[] = [];
  for (let i = 0; i < n; i++) {
    const at = (i + 0.5) / n;
    const pos = pointAlong(line, total * at);
    pts.push({ pos, at, cell: cellOf(pos) });
  }
  const hour = new Date();
  hour.setUTCMinutes(0, 0, 0);
  const cells = [...new Set(pts.map((p) => p.cell))];
  const cached = new Map<string, { windKmh: number; windFromDeg: number; precipMm: number }>();
  if (cells.length) {
    const rows = await q<{ cell: string; data: any }>(
      `SELECT cell, data FROM weather_cache WHERE hour = ? AND cell IN (${cells.map(() => '?').join(',')})`,
      [hour, ...cells],
    );
    for (const r of rows) cached.set(r.cell, typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  }
  const missing = cells.filter((c) => !cached.has(c));
  if (missing.length) {
    try {
      const lats = missing.map((c) => c.split(',')[0]).join(',');
      const lons = missing.map((c) => c.split(',')[1]).join(',');
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&current=wind_speed_10m,wind_direction_10m,precipitation&wind_speed_unit=kmh`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      await countUsage('open-meteo', res.ok);
      if (res.ok) {
        const data = (await res.json()) as any;
        const arr = Array.isArray(data) ? data : [data];
        for (let i = 0; i < missing.length && i < arr.length; i++) {
          const cur = arr[i]?.current;
          if (!cur) continue;
          const w = {
            windKmh: Number(cur.wind_speed_10m ?? 0),
            windFromDeg: Number(cur.wind_direction_10m ?? 0),
            precipMm: Number(cur.precipitation ?? 0),
          };
          cached.set(missing[i], w);
          await exec('INSERT IGNORE INTO weather_cache (cell, hour, data) VALUES (?, ?, ?)', [missing[i], hour, JSON.stringify(w)]);
        }
      }
    } catch {
      await countUsage('open-meteo', false);
    }
  }
  return pts
    .filter((p) => cached.has(p.cell))
    .map((p) => ({ pos: p.pos, at: p.at, ...cached.get(p.cell)! }));
}

/** Ближайший образец погоды к доле пути at. */
export function sampleAt(samples: WeatherSample[], at: number): WeatherSample | null {
  if (!samples.length) return null;
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.at - at) < Math.abs(best.at - at)) best = s;
  return best;
}

export type WeatherKind = 'bird' | 'airship' | 'sail' | 'ground' | 'none';

/**
 * Множитель скорости от погоды. Встречный ветер и дождь замедляют птиц, попутный ускоряет;
 * парусник зависит от силы ветра.
 */
export function weatherFactor(kind: WeatherKind, s: WeatherSample | null, a: LonLat, b: LonLat, airSpeedKmh: number): number {
  if (!s || kind === 'none') return 1;
  if (kind === 'sail') return Math.max(0.5, Math.min(1.4, s.windKmh / 20));
  if (kind === 'ground') return s.precipMm > 2 ? 0.95 : 1;
  const heading = bearingDeg(a, b);
  const windTo = (s.windFromDeg + 180) % 360;
  const tail = s.windKmh * Math.cos(((windTo - heading) * Math.PI) / 180);
  const weight = kind === 'bird' ? 0.5 : 0.3;
  let f = 1 + (weight * tail) / Math.max(1, airSpeedKmh);
  if (kind === 'bird' && s.precipMm > 0.5) f *= 0.9;
  return Math.max(0.7, Math.min(1.3, f));
}

/** Шторм: ветер от 62 км/ч (8 баллов) задерживает парусник. */
export const STORM_KMH = 62;
