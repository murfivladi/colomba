import * as SunCalcNs from 'suncalc';

const SunCalc: typeof SunCalcNs = ((SunCalcNs as any).default ?? SunCalcNs) as typeof SunCalcNs;

const SUN_DOWN = (-0.833 * Math.PI) / 180;
const HOUR = 3600_000;

/** Местное солнечное время (0..24) по долготе — без часовых поясов, как у живого курьера. */
export function solarHour(tMs: number, lon: number): number {
  const utcH = (tMs / HOUR) % 24;
  return (((utcH + lon / 15) % 24) + 24) % 24;
}

function polar(tMs: number, lat: number, lon: number): boolean {
  const times = SunCalc.getTimes(new Date(tMs), lat, lon);
  return !times.sunrise || !times.sunset || Number.isNaN(times.sunrise.getTime()) || Number.isNaN(times.sunset.getTime());
}

/**
 * День ли сейчас в точке: солнце над горизонтом. В полярный день/ночь — условные сутки
 * 6:00–18:00 по солнечному времени, иначе собаки на Шпицбергене встали бы на полгода.
 */
export function isDay(tMs: number, lat: number, lon: number): boolean {
  if (polar(tMs, lat, lon)) {
    const h = solarHour(tMs, lon);
    return h >= 6 && h < 18;
  }
  return SunCalc.getPosition(new Date(tMs), lat, lon).altitude > SUN_DOWN;
}

/** Ближайший момент после tMs, когда день сменится ночью или наоборот. */
export function nextSunChange(tMs: number, lat: number, lon: number): number {
  const now = isDay(tMs, lat, lon);
  const cands: number[] = [];
  for (let d = -1; d <= 2; d++) {
    const times = SunCalc.getTimes(new Date(tMs + d * 24 * HOUR), lat, lon);
    for (const x of [times.sunrise, times.sunset]) {
      const v = x ? x.getTime() : NaN;
      if (!Number.isNaN(v)) cands.push(v);
    }
    // границы условных суток для полярных районов
    const base = tMs + d * 24 * HOUR;
    const h = solarHour(base, lon);
    for (const target of [6, 18]) cands.push(base + (((target - h + 24) % 24) * HOUR));
  }
  cands.sort((a, b) => a - b);
  for (const c of cands) {
    if (c <= tMs + 30_000) continue;
    if (isDay(c + 60_000, lat, lon) !== now) return c + 60_000;
  }
  // запасной путь: перебор с шагом 15 минут
  for (let x = tMs + 15 * 60_000; x < tMs + 72 * HOUR; x += 15 * 60_000) {
    if (isDay(x, lat, lon) !== now) return x;
  }
  return tMs + 12 * HOUR;
}

/** Окно работы «Почты»: hoursPerDay часов вокруг местного полудня. */
export function inWorkHours(tMs: number, lon: number, hoursPerDay: number): boolean {
  if (hoursPerDay >= 24) return true;
  const h = solarHour(tMs, lon);
  return h >= 12 - hoursPerDay / 2 && h < 12 + hoursPerDay / 2;
}

export function nextWorkChange(tMs: number, lon: number, hoursPerDay: number): number {
  const h = solarHour(tMs, lon);
  const start = 12 - hoursPerDay / 2;
  const end = 12 + hoursPerDay / 2;
  const target = inWorkHours(tMs, lon, hoursPerDay) ? end : start;
  let dh = (target - h + 24) % 24;
  // на самой границе из-за округления: шагнуть чуть вперёд, а не на сутки
  if (dh < 1 / 3600 || dh > 24 - 1 / 3600) dh = 1 / 60;
  return tMs + dh * HOUR + 1000;
}
