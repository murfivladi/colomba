import { seaRoute } from 'searoute-ts';
import type { LonLat } from '@colomba/shared';

export interface SeaRoute {
  line: LonLat[];
  lengthKm: number;
  /** Насколько далеко от моря точки отправителя и получателя. */
  originSnapKm: number;
  destinationSnapKm: number;
}

/** Морской путь по сети Eurostat (searoute-ts, офлайн, без внешнего API). */
export function seaPath(a: LonLat, b: LonLat): SeaRoute | null {
  try {
    const r = seaRoute(a, b, { units: 'kilometers' }) as any;
    const coords = r.geometry.coordinates as LonLat[];
    if (!coords || coords.length < 2) return null;
    return {
      line: coords.map((c) => [c[0], c[1]] as LonLat),
      lengthKm: Number(r.properties.length),
      originSnapKm: Number(r.properties.originSnapKm ?? 0),
      destinationSnapKm: Number(r.properties.destinationSnapKm ?? 0),
    };
  } catch {
    return null;
  }
}
