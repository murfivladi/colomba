import { haversineKm, jitter, type LonLat } from '@colomba/shared';
import type { PoolConnection } from 'mysql2/promise';
import { one, q } from '../db.js';
import { countryName, loadCities, notableCity } from '../delivery/cities.js';
import { HttpError } from '../lib/errors.js';

export interface UserRow {
  id: number;
  email: string | null;
  username: string;
  display_name: string;
  avatar: string;
  bio: string;
  lang: 'ru' | 'it';
  languages: string[] | null;
  country: string | null;
  kind: 'adult' | 'child';
  parent_id: number | null;
  role: 'user' | 'admin';
  location_precision: 'city' | 'country' | 'distance';
  who_can_write: 'friends' | 'friends_penpals' | 'everyone';
  read_receipts: number;
  penpal_enabled: number;
  bottle_enabled: number;
  semi: number;
  slots: number;
  letters_sent: number;
  km_total: number;
  banned_until: Date | null;
  deleted_at: Date | null;
  [k: string]: any;
}

export async function getUser(id: number, conn?: PoolConnection): Promise<UserRow | null> {
  const u = await one<UserRow>('SELECT * FROM users WHERE id = ?', [id], conn);
  if (u && typeof u.languages === 'string') u.languages = JSON.parse(u.languages);
  return u;
}

export function isBanned(u: Pick<UserRow, 'banned_until'>): boolean {
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}

export async function getLocation(userId: number): Promise<LonLat | null> {
  const r = await one<{ lon: number; lat: number }>('SELECT lon, lat FROM locations WHERE user_id = ?', [userId]);
  return r ? [r.lon, r.lat] : null;
}

export async function isBlocked(a: number, b: number): Promise<boolean> {
  const r = await one('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [a, b, b, a]);
  return !!r;
}

export async function friendship(a: number, b: number): Promise<any | null> {
  const [x, y] = a < b ? [a, b] : [b, a];
  return one('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', [x, y]);
}

export async function areFriends(a: number, b: number): Promise<boolean> {
  const f = await friendship(a, b);
  return !!f && f.status === 'accepted' && !!f.parent_approved_a && !!f.parent_approved_b;
}

/**
 * Может ли from написать to. Дети: только одобренные родителем друзья.
 * Взрослые: настройка «кто может писать» получателя; блокировка запрещает отправить курьера.
 */
export async function assertCanWrite(from: UserRow, to: UserRow, opts: { viaPenpal?: boolean; isReply?: boolean } = {}): Promise<void> {
  if (to.deleted_at) throw new HttpError(404, 'recipient_not_found');
  if (from.id === to.id) throw new HttpError(400, 'cannot_write_self');
  if (await isBlocked(from.id, to.id)) throw new HttpError(403, 'blocked');
  if (opts.isReply) return; // ответ тем же курьером, который принёс письмо
  const f = await friendship(from.id, to.id);
  const friends = !!f && f.status === 'accepted' && !!f.parent_approved_a && !!f.parent_approved_b;
  if (from.kind === 'child' || to.kind === 'child') {
    if (!friends) throw new HttpError(403, 'child_only_approved_friends');
    return;
  }
  if (friends) return;
  const penpals = !!f && f.status === 'penpal';
  if (to.who_can_write === 'everyone') return;
  if (to.who_can_write === 'friends_penpals' && (penpals || (opts.viaPenpal && to.penpal_enabled))) return;
  throw new HttpError(403, 'recipient_accepts_friends_only');
}

export interface PublicLocation {
  precision: 'city' | 'country' | 'distance';
  city?: { ru: string; it: string };
  country?: { code: string; ru: string; it: string };
  /** Точка на карте — смещённая, не точнее города. */
  point?: LonLat;
  distanceKm?: number;
}

/**
 * Что видят другие о местоположении: город, страна или только расстояние.
 * Точные координаты никому не отдаются; у детей — не точнее города при любых настройках.
 */
export async function publicLocation(user: UserRow, viewerId: number | null): Promise<PublicLocation | null> {
  const loc = await getLocation(user.id);
  if (!loc) return null;
  await loadCities();
  const precision = user.location_precision;
  const viewerLoc = viewerId ? await getLocation(viewerId) : null;
  const distanceKm = viewerLoc ? Math.round(haversineKm(loc, viewerLoc) / 10) * 10 : undefined;
  if (precision === 'distance') return { precision, distanceKm };
  const city = notableCity(loc, 120);
  const cc = city?.country ?? user.country ?? null;
  const country = cc ? { code: cc, ru: countryName(cc, 'ru'), it: countryName(cc, 'it') } : undefined;
  if (precision === 'country') return { precision, country, distanceKm };
  const seed = user.id * 9301 + 49297;
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return {
    precision: 'city',
    city: city ? { ru: city.nameRu, it: city.nameIt } : undefined,
    country,
    point: city ? jitter([city.lon, city.lat], 4, rnd) : jitter(loc, 25, rnd),
    distanceKm,
  };
}

export async function publicProfile(userId: number, viewerId: number | null): Promise<any | null> {
  const u = await getUser(userId);
  if (!u || u.deleted_at) return null;
  const isSelf = viewerId === userId;
  const friends = viewerId ? await areFriends(userId, viewerId) : false;
  // профиль ребёнка видят только одобренные друзья и родитель
  if (u.kind === 'child' && !isSelf && !friends && u.parent_id !== viewerId) {
    return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, kind: 'child', restricted: true };
  }
  const interests = await q<any>(
    'SELECT i.code, i.name_ru, i.name_it FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = ?',
    [userId],
  );
  const couriers = await q<any>('SELECT DISTINCT type_code FROM couriers WHERE owner_id = ?', [userId]);
  const showStats = u.kind === 'adult' || friends || isSelf;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    bio: u.bio,
    kind: u.kind,
    country: u.kind === 'child' && !friends && !isSelf ? null : u.country,
    languages: u.languages ?? [],
    interests: interests.map((i) => ({ code: i.code, ru: i.name_ru, it: i.name_it })),
    collection: couriers.map((c) => c.type_code),
    stats: showStats ? { lettersSent: u.letters_sent, lettersReceived: u.letters_received, km: Math.round(u.km_total) } : null,
    location: await publicLocation(u.kind === 'child' && u.location_precision === 'city' ? u : u, viewerId),
    friendship: viewerId && !isSelf ? (await friendship(userId, viewerId))?.status ?? null : null,
    penpal: !!u.penpal_enabled,
  };
}

/** Короткая карточка для списков. */
export function cardOf(u: any) {
  return { id: Number(u.id), username: u.username, displayName: u.display_name, avatar: u.avatar, kind: u.kind };
}
