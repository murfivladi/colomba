import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COURIER_TYPES, DEFAULT_POST_TARIFFS, checkCapacity, experienceSpeedBonus, haversineKm, positionAt, greatCircle, lineLengthKm, gridCell,
} from '@colomba/shared';
import { isDay, nextSunChange, inWorkHours, nextWorkChange } from '../src/delivery/sun.js';
import { simulate, migrationBonus } from '../src/delivery/simulate.js';
import { airRoute } from '../src/routing/air.js';
import { sameLandmass, isOnLand } from '../src/routing/landmass.js';
import { seaPath } from '../src/routing/sea.js';
import { makeRng } from '../src/lib/rng.js';
import type { PlannedRoute } from '../src/routing/index.js';

const def = (code: string) => DEFAULT_COURIER_TYPES.find((c) => c.code === code)!;
const PALERMO: [number, number] = [13.3615, 38.1157];
const MOSCOW: [number, number] = [37.6173, 55.7558];
const ROME: [number, number] = [12.48, 41.89];
const NEWYORK: [number, number] = [-74.006, 40.7128];

function route(code: string, a: [number, number], b: [number, number]): PlannedRoute {
  const d = def(code);
  const line = greatCircle(a, b, 50);
  return { legs: [{ line, lengthKm: lineLengthKm(line), surface: 'air', mode: 'courier', speedKmh: d.speedKmh }], distanceKm: lineLengthKm(line), source: 'test', warnings: [], avoided: [] };
}

describe('geo', () => {
  it('haversine Palermo–Moscow ≈ 2660 km', () => {
    expect(haversineKm(PALERMO, MOSCOW)).toBeGreaterThan(2600);
    expect(haversineKm(PALERMO, MOSCOW)).toBeLessThan(2720);
  });
  it('positionAt interpolates and stops on rest', () => {
    const tl: [number, number, number][] = [[0, 0, 0], [1, 0, 100], [1, 0, 200], [2, 0, 300]];
    expect(positionAt(tl, 50).pos[0]).toBeCloseTo(0.5, 2);
    expect(positionAt(tl, 150)).toMatchObject({ moving: false, pos: [1, 0] });
    expect(positionAt(tl, 999).pos).toEqual([2, 0]);
  });
  it('grid cells round nearby points together', () => {
    expect(gridCell([13.3615, 38.1157]).key).toBe(gridCell([13.3620, 38.1160]).key);
  });
});

describe('capacity', () => {
  it('pigeon: 500 chars + 1 photo OR drawing', () => {
    const cap = def('pigeon').capacity;
    expect(checkCapacity(cap, { textLength: 500, photos: 1, drawings: 0, voiceSec: 0 })).toEqual([]);
    expect(checkCapacity(cap, { textLength: 501, photos: 0, drawings: 0, voiceSec: 0 })).toContain('text');
    expect(checkCapacity(cap, { textLength: 10, photos: 1, drawings: 1, voiceSec: 0 })).toContain('attachments');
  });
  it('falcon: text only, 140', () => {
    expect(checkCapacity(def('falcon').capacity, { textLength: 100, photos: 1, drawings: 0, voiceSec: 0 })).toContain('photos');
  });
  it('dogs carry 1 minute of voice', () => {
    expect(checkCapacity(def('dogs').capacity, { textLength: 0, photos: 0, drawings: 0, voiceSec: 61 })).toContain('voice');
  });
  it('experience bonus capped at +10%', () => {
    expect(experienceSpeedBonus(1000)).toBeCloseTo(0.1);
  });
});

describe('sun and work hours', () => {
  it('noon in Rome is day, midnight is night', () => {
    expect(isDay(Date.parse('2026-06-21T11:00:00Z'), ROME[1], ROME[0])).toBe(true);
    expect(isDay(Date.parse('2026-06-21T23:00:00Z'), ROME[1], ROME[0])).toBe(false);
  });
  it('next sun change is a flip within a day', () => {
    const t = Date.parse('2026-06-21T11:00:00Z');
    const n = nextSunChange(t, ROME[1], ROME[0]);
    expect(n - t).toBeLessThan(24 * 3600_000);
    expect(isDay(n, ROME[1], ROME[0])).toBe(false);
  });
  it('polar night still has synthetic days', () => {
    const t = Date.parse('2026-12-21T12:00:00Z');
    const n = nextSunChange(t, 78.2, 15.6);
    expect(n - t).toBeLessThan(13 * 3600_000);
  });
  it('work hours boundaries advance (no stuck loop)', () => {
    let t = Date.parse('2026-11-02T10:00:00Z');
    const states = new Set<boolean>();
    for (let i = 0; i < 4; i++) { states.add(inWorkHours(t, 13.36, 8)); t = nextWorkChange(t, 13.36, 8); }
    expect(states.size).toBe(2);
  });
});

describe('routing', () => {
  it('Afro-Eurasia is one landmass; America is another; Sicily joins Italy', () => {
    expect(sameLandmass(PALERMO, MOSCOW)).toBe(true);
    expect(sameLandmass(PALERMO, NEWYORK)).toBe(false);
    expect(isOnLand(MOSCOW)).toBe(true);
    expect(isOnLand([-30, 30])).toBe(false);
  });
  it('birds avoid the Alps when the detour is reasonable', () => {
    const r = airRoute(ROME, [13.4, 52.52]);
    expect(r.avoided.map((a) => a.code)).toContain('alps');
    expect(r.avoided[0].over).toBeFalsy();
  });
  it('and fly over when the detour is too long', () => {
    const r = airRoute([9.19, 45.46], [11.58, 48.135]);
    expect(r.avoided[0]).toMatchObject({ code: 'alps', over: true });
  });
  it('sea route Palermo → New York goes through Gibraltar', () => {
    const s = seaPath(PALERMO, NEWYORK)!;
    expect(s.lengthKm).toBeGreaterThan(7000);
    expect(s.line.some(([lon, lat]) => Math.abs(lon + 5.6) < 1.5 && Math.abs(lat - 36) < 1)).toBe(true);
  });
});

describe('simulation', () => {
  const start = Date.parse('2026-10-31T10:00:00Z');
  it('pigeon rests at night: much slower than distance/speed', () => {
    const plan = simulate({ def: def('pigeon'), route: route('pigeon', PALERMO, MOSCOW), startMs: start, trips: 0, rng: makeRng(1), weather: [], noSpread: true });
    const pureHours = plan.distanceKm / 80;
    expect(plan.durationSec / 3600).toBeGreaterThan(pureHours * 1.5);
    expect(plan.events.some((e) => e.type === 'night_rest')).toBe(true);
    expect(plan.events[plan.events.length - 1].type).toBe('arrive');
  });
  it('owl flies only at night', () => {
    const plan = simulate({ def: def('owl'), route: route('owl', ROME, [12.6, 43.0]), startMs: Date.parse('2026-10-31T12:00:00Z'), trips: 0, rng: makeRng(1), weather: [], noSpread: true });
    // в полдень сова спит: первая точка движения — после заката
    const firstMove = plan.timeline.findIndex((p, i) => i > 0 && (p[0] !== plan.timeline[i - 1][0] || p[1] !== plan.timeline[i - 1][1]));
    const tMove = start + 2 * 3600_000 + plan.timeline[firstMove - 1][2] * 1000;
    expect(isDay(tMove, 41.9, 12.5)).toBe(false);
  });
  it('airship flies round the clock at 115 km/h', () => {
    const plan = simulate({ def: def('airship'), route: route('airship', PALERMO, MOSCOW), startMs: start, trips: 0, rng: makeRng(1), weather: [], noSpread: true });
    expect(plan.durationSec / 3600).toBeCloseTo(plan.distanceKm / 115, 0);
  });
  it('random spread stays within ±10%', () => {
    const base = simulate({ def: def('airship'), route: route('airship', PALERMO, MOSCOW), startMs: start, trips: 0, rng: makeRng(1), weather: [], noSpread: true }).durationSec;
    for (let s = 1; s < 20; s++) {
      const d = simulate({ def: def('airship'), route: route('airship', PALERMO, MOSCOW), startMs: start, trips: 0, rng: makeRng(s), weather: [] }).durationSec;
      expect(d / base).toBeGreaterThan(1 / 1.1 - 0.01);
      expect(d / base).toBeLessThan(1 / 0.9 + 0.01);
    }
  });
  it('post sorting delay is added', () => {
    const tariff = DEFAULT_POST_TARIFFS.find((t) => t.code === 'express')!;
    const r = route('post', PALERMO, ROME);
    r.legs[0].mode = 'car';
    r.legs[0].speedKmh = 60;
    const plan = simulate({ def: def('post'), tariff, route: r, startMs: start, trips: 0, rng: makeRng(1), weather: [], noSpread: true });
    expect(plan.durationSec / 3600).toBeCloseTo(6 + plan.distanceKm / 60, 0);
  });
  it('spring migration north speeds birds up', () => {
    expect(migrationBonus(def('pigeon'), PALERMO, MOSCOW, new Date('2026-04-10'))).toBeCloseTo(0.1);
    expect(migrationBonus(def('pigeon'), MOSCOW, PALERMO, new Date('2026-04-10'))).toBe(0);
    expect(migrationBonus(def('horse'), PALERMO, MOSCOW, new Date('2026-04-10'))).toBe(0);
  });
});
