import { greatCircle, haversineKm, lineLengthKm, type CourierTypeDef, type LonLat, type PostTariffDef, type Surface } from '@colomba/shared';
import { airRoute } from './air.js';
import { landRoute } from './land.js';
import { sameLandmass } from './landmass.js';
import { seaPath } from './sea.js';

export type LegMode = 'courier' | 'car' | 'plane' | 'walk';

export interface Leg {
  line: LonLat[];
  /** Длина пути по дорогам/воде (может быть больше геометрической — извилистость). */
  lengthKm: number;
  surface: Surface;
  mode: LegMode;
  speedKmh: number;
}

export interface PlannedRoute {
  legs: Leg[];
  distanceKm: number;
  source: string;
  warnings: string[];
  avoided: { code: string; near: LonLat; over?: boolean }[];
}

export class RouteError extends Error {
  constructor(public code: 'no_route' | 'no_sea_route' | 'tariff_needs_land', message?: string) {
    super(message ?? code);
  }
}

/** Пешком до берега и от берега несёт «местный гонец». */
const WALK_KMH = 5;
const FAR_FROM_SEA_KM = 100;

function straight(a: LonLat, b: LonLat): LonLat[] {
  return greatCircle(a, b, 50);
}

function legOf(line: LonLat[], surface: Surface, mode: LegMode, speedKmh: number, lengthKm?: number): Leg {
  return { line, lengthKm: lengthKm ?? lineLengthKm(line), surface, mode, speedKmh };
}

function seaLegs(a: LonLat, b: LonLat, seaSpeed: number, coastSpeed: number): { legs: Leg[]; warnings: string[] } | null {
  const sea = seaPath(a, b);
  if (!sea) return null;
  const legs: Leg[] = [];
  const warnings: string[] = [];
  const first = sea.line[0];
  const last = sea.line[sea.line.length - 1];
  if (haversineKm(a, first) > 1) legs.push(legOf(straight(a, first), 'coast', 'walk', coastSpeed));
  legs.push(legOf(sea.line, 'sea', 'courier', seaSpeed, sea.lengthKm));
  if (haversineKm(last, b) > 1) legs.push(legOf(straight(last, b), 'coast', 'walk', coastSpeed));
  if (sea.originSnapKm > FAR_FROM_SEA_KM || sea.destinationSnapKm > FAR_FROM_SEA_KM) warnings.push('far_from_sea');
  return { legs, warnings };
}

/**
 * Маршрут по типу курьера (раздел «Маршрутизация» ТЗ):
 * птицы — по воздуху в облёт гор, конь и собаки — по дорогам, парусник, дельфин и бутылка —
 * морем, «Почта» — дорогами или авиа.
 */
export async function planRoute(
  def: CourierTypeDef,
  a: LonLat,
  b: LonLat,
  tariff?: PostTariffDef,
): Promise<PlannedRoute> {
  const warnings: string[] = [];
  switch (def.routeKind) {
    case 'air': {
      const r = airRoute(a, b, true);
      return { legs: [legOf(r.line, 'air', 'courier', def.speedKmh)], distanceKm: lineLengthKm(r.line), source: 'air', warnings, avoided: r.avoided };
    }
    case 'air_direct': {
      const line = airRoute(a, b, false).line;
      return { legs: [legOf(line, 'air', 'courier', def.speedKmh)], distanceKm: lineLengthKm(line), source: 'air', warnings, avoided: [] };
    }
    case 'air_sea': {
      // альбатрос предпочитает море: если морской путь не сильно длиннее — летит над водой
      const direct = airRoute(a, b, true);
      const directKm = lineLengthKm(direct.line);
      const sea = seaPath(a, b);
      if (sea && sea.lengthKm + sea.originSnapKm + sea.destinationSnapKm <= directKm * 1.5 && sea.originSnapKm < 300 && sea.destinationSnapKm < 300) {
        const legs: Leg[] = [];
        const first = sea.line[0], last = sea.line[sea.line.length - 1];
        if (haversineKm(a, first) > 1) legs.push(legOf(straight(a, first), 'air', 'courier', def.speedKmh));
        legs.push(legOf(sea.line, 'sea', 'courier', def.speedKmh, sea.lengthKm));
        if (haversineKm(last, b) > 1) legs.push(legOf(straight(last, b), 'air', 'courier', def.speedKmh));
        return { legs, distanceKm: legs.reduce((s, l) => s + l.lengthKm, 0), source: 'air+searoute', warnings, avoided: [] };
      }
      return { legs: [legOf(direct.line, 'air', 'courier', def.speedKmh)], distanceKm: directKm, source: 'air', warnings, avoided: direct.avoided };
    }
    case 'land': {
      const r = await landRoute(a, b);
      if (!r) throw new RouteError('no_route');
      return { legs: [legOf(r.line, 'land', 'courier', def.speedKmh, r.lengthKm)], distanceKm: r.lengthKm, source: r.source, warnings, avoided: [] };
    }
    case 'land_sea': {
      // черепаха: по суше, если можно, иначе ползёт к берегу и плывёт
      if (sameLandmass(a, b)) {
        const r = await landRoute(a, b);
        if (r) return { legs: [legOf(r.line, 'land', 'courier', def.speedKmh, r.lengthKm)], distanceKm: r.lengthKm, source: r.source, warnings, avoided: [] };
      }
      const s = seaLegs(a, b, def.speedWaterKmh ?? def.speedKmh, def.speedKmh);
      if (!s) throw new RouteError('no_route');
      return { legs: s.legs, distanceKm: s.legs.reduce((x, l) => x + l.lengthKm, 0), source: 'searoute', warnings: s.warnings, avoided: [] };
    }
    case 'sea': {
      const s = seaLegs(a, b, def.speedKmh, WALK_KMH);
      if (!s) throw new RouteError('no_sea_route');
      return { legs: s.legs, distanceKm: s.legs.reduce((x, l) => x + l.lengthKm, 0), source: 'searoute', warnings: s.warnings, avoided: [] };
    }
    case 'post': {
      const t = tariff;
      if (!t) throw new Error('post requires tariff');
      if (t.planeKmh) {
        const line = straight(a, b);
        // самолёт до аэропорта получателя + машина до адреса (условно 40 км)
        const legs = [legOf(line, 'air', 'plane', t.planeKmh), legOf([b, b], 'land', 'car', t.carKmh, 40)];
        return { legs, distanceKm: lineLengthKm(line) + 40, source: 'air', warnings, avoided: [] };
      }
      const r = await landRoute(a, b);
      if (!r) throw new RouteError('tariff_needs_land');
      return { legs: [legOf(r.line, 'land', 'car', t.carKmh, r.lengthKm)], distanceKm: r.lengthKm, source: r.source, warnings, avoided: [] };
    }
  }
}
