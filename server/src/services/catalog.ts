import type { CourierTypeDef, PostTariffDef } from '@colomba/shared';
import { q } from '../db.js';

let types: { at: number; list: CourierTypeDef[] } | null = null;
let tariffs: { at: number; list: PostTariffDef[] } | null = null;
const TTL = 60_000;

const j = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

export function rowToCourierType(r: any): CourierTypeDef & { nameRu?: string; nameIt?: string; illustration?: string | null } {
  return {
    code: r.code,
    section: r.section,
    speedKmh: Number(r.speed_kmh),
    speedWaterKmh: r.speed_water_kmh === null ? undefined : Number(r.speed_water_kmh),
    nightMode: r.night_mode,
    routeKind: r.route_kind,
    capacity: j(r.capacity),
    unlock: j(r.unlock_rule),
    look: r.look,
    sound: r.sound,
    seasonMonths: r.season_months ? j<number[]>(r.season_months) : undefined,
    unpredictability: r.unpredictability === null ? undefined : Number(r.unpredictability),
    windDriven: !!r.wind_driven,
    noReturn: !!r.no_return,
    sort: r.sort,
    enabled: !!r.enabled,
    nameRu: r.name_ru ?? undefined,
    nameIt: r.name_it ?? undefined,
    illustration: r.illustration ?? null,
  };
}

/** Каталог курьеров из БД (правится в админке без кода). */
export async function courierTypes(): Promise<CourierTypeDef[]> {
  if (types && Date.now() - types.at < TTL) return types.list;
  const rows = await q('SELECT * FROM courier_types ORDER BY sort, code');
  types = { at: Date.now(), list: rows.map(rowToCourierType) };
  return types.list;
}

export async function courierType(code: string): Promise<CourierTypeDef | null> {
  return (await courierTypes()).find((t) => t.code === code) ?? null;
}

export async function postTariffs(): Promise<PostTariffDef[]> {
  if (tariffs && Date.now() - tariffs.at < TTL) return tariffs.list;
  const rows = await q('SELECT * FROM post_tariffs');
  tariffs = {
    at: Date.now(),
    list: rows.map((r: any) => ({
      code: r.code,
      carKmh: Number(r.car_kmh),
      hoursPerDay: Number(r.hours_per_day),
      planeKmh: r.plane_kmh === null ? undefined : Number(r.plane_kmh),
      sortingHours: Number(r.sorting_hours),
      unlock: j(r.unlock_rule),
    })),
  };
  return tariffs.list;
}

export async function postTariff(code: string): Promise<PostTariffDef | null> {
  return (await postTariffs()).find((t) => t.code === code) ?? null;
}

export function invalidateCatalog(): void {
  types = null;
  tariffs = null;
}
