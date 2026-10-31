import type { LonLat, TimelinePoint, TripEvent, TripPlan } from '@colomba/shared';
import type { PoolConnection } from 'mysql2/promise';
import { exec, one } from '../db.js';

export interface TripRow {
  id: number;
  letter_id: number | null;
  courier_id: number;
  direction: 'out' | 'back';
  purpose: 'deliver' | 'reply' | 'return_empty' | 'return_lost' | 'recall';
  from_lon: number;
  from_lat: number;
  to_lon: number;
  to_lat: number;
  start_at: Date;
  end_at: Date;
  distance_km: number;
  timeline: string;
  events: any;
  route_source: string;
  next_event_idx: number;
  status: 'active' | 'done' | 'recalled';
}

export async function insertTrip(
  conn: PoolConnection,
  t: {
    letterId: number | null;
    courierId: number;
    direction: 'out' | 'back';
    purpose: TripRow['purpose'];
    from: LonLat;
    to: LonLat;
    startMs: number;
    plan: Pick<TripPlan, 'durationSec' | 'distanceKm' | 'timeline' | 'events' | 'postmarks' | 'routeSource'>;
  },
): Promise<number> {
  const res = await exec(
    `INSERT INTO trips (letter_id, courier_id, direction, purpose, from_lon, from_lat, to_lon, to_lat, start_at, end_at,
       distance_km, timeline, events, route_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.letterId, t.courierId, t.direction, t.purpose, t.from[0], t.from[1], t.to[0], t.to[1],
      new Date(t.startMs), new Date(t.startMs + t.plan.durationSec * 1000), t.plan.distanceKm,
      JSON.stringify(t.plan.timeline), JSON.stringify(t.plan.events), t.plan.routeSource,
    ],
    conn,
  );
  const tripId = res.insertId;
  for (const pm of t.plan.postmarks) {
    await exec(
      `INSERT INTO postmarks (trip_id, letter_id, city_id, name_ru, name_it, country, stamped_at, lon, lat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tripId, t.letterId, pm.cityId, pm.nameRu, pm.nameIt, pm.country, new Date(t.startMs + pm.t * 1000), pm.pos[0], pm.pos[1]],
      conn,
    );
  }
  return tripId;
}

export async function getTrip(id: number, conn?: PoolConnection): Promise<TripRow | null> {
  return one<TripRow>('SELECT * FROM trips WHERE id = ?', [id], conn);
}

export function parseTimeline(t: TripRow): TimelinePoint[] {
  return typeof t.timeline === 'string' ? JSON.parse(t.timeline) : (t.timeline as any);
}

export function parseEvents(t: TripRow): TripEvent[] {
  return typeof t.events === 'string' ? JSON.parse(t.events) : t.events;
}

/** Обратный путь «то же время»: та же шкала, пройденная в обратную сторону. */
export function reverseTimeline(tl: TimelinePoint[]): TimelinePoint[] {
  const T = tl[tl.length - 1][2];
  return tl
    .slice()
    .reverse()
    .map(([lon, lat, t]) => [lon, lat, T - t] as TimelinePoint);
}

/** Начальный кусок шкалы до момента untilSec (для отзыва письма). */
export function cutTimeline(tl: TimelinePoint[], untilSec: number, pos: LonLat): TimelinePoint[] {
  const out = tl.filter((p) => p[2] < untilSec);
  out.push([pos[0], pos[1], Math.round(untilSec)]);
  return out;
}
