import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { exec, one } from '../db.js';
import { getUser, isBanned, type UserRow } from '../services/people.js';
import { HttpError } from './errors.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), 32, { ...SCRYPT, N: Number(n) });
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const SESSION_COOKIE = 'colomba_sid';
const SESSION_DAYS = 90;

export async function createSession(reply: FastifyReply, userId: number, userAgent?: string): Promise<void> {
  const token = randomToken();
  await exec('INSERT INTO sessions (token_hash, user_id, user_agent, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))', [
    sha256(token), userId, (userAgent ?? '').slice(0, 255), SESSION_DAYS,
  ]);
  reply.setCookie(SESSION_COOKIE, token, {
    path: config.cookiePath,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await exec('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: config.cookiePath });
}

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

/** Достаёт пользователя по cookie сессии (вызывается хуком на каждый запрос). */
export async function loadUser(req: FastifyRequest): Promise<UserRow | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const s = await one<{ user_id: number }>('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [sha256(token)]);
  if (!s) return null;
  const u = await getUser(s.user_id);
  if (!u || u.deleted_at) return null;
  return u;
}

export function requireUser(req: FastifyRequest): UserRow {
  if (!req.user) throw new HttpError(401, 'unauthorized');
  return req.user;
}

/** Забаненный может читать, но не может отправлять курьеров и писать. */
export function requireActiveUser(req: FastifyRequest): UserRow {
  const u = requireUser(req);
  if (isBanned(u)) throw new HttpError(403, 'banned', { until: u.banned_until, reason: u.ban_reason });
  return u;
}

export function requireAdult(req: FastifyRequest): UserRow {
  const u = requireActiveUser(req);
  if (u.kind !== 'adult') throw new HttpError(403, 'adults_only');
  return u;
}

export function requireAdmin(req: FastifyRequest): UserRow {
  const u = requireUser(req);
  if (u.role !== 'admin') throw new HttpError(403, 'admin_only');
  return u;
}

export function ageYears(birth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function newInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toLowerCase();
}
