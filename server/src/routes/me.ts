import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GAME } from '@colomba/shared';
import { exec, one, q } from '../db.js';
import { ageYears, destroySession, hashPassword, requireActiveUser, requireAdult, requireUser, sha256, verifyPassword } from '../lib/auth.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { createAccount, deleteAccount } from '../services/accounts.js';
import { renderNotification } from '../services/notify.js';
import { publicLocation, cardOf, getUser } from '../services/people.js';
import { vapidPublicKey } from '../services/push.js';
import { award } from '../services/semi.js';
import { addClient } from '../services/sse.js';
import { saveLocation } from '../services/letters.js';
import { ownedTariffs } from '../services/couriers.js';

const LONLAT = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

function settingsOf(u: any) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    bio: u.bio,
    lang: u.lang,
    languages: u.languages ?? [],
    country: u.country,
    kind: u.kind,
    role: u.role,
    parentId: u.parent_id,
    locationPrecision: u.location_precision,
    whoCanWrite: u.who_can_write,
    readReceipts: !!u.read_receipts,
    penpalEnabled: !!u.penpal_enabled,
    bottleEnabled: !!u.bottle_enabled,
    dailyDigest: !!u.daily_digest,
    sounds: !!u.sounds,
    animations: !!u.animations,
    notifyTripEvents: !!u.notify_trip_events,
    timezone: u.timezone,
    semi: u.semi,
    slots: u.slots,
    inviteCode: u.invite_code,
    onboarded: !!u.onboarded,
    bannedUntil: u.banned_until,
    banReason: u.ban_reason,
    stats: { lettersSent: u.letters_sent, lettersReceived: u.letters_received, km: Math.round(u.km_total) },
  };
}

const SETTINGS = z
  .object({
    displayName: z.string().min(1).max(64),
    avatar: z.string().max(64),
    bio: z.string().max(500),
    lang: z.enum(['ru', 'it']),
    languages: z.array(z.string().regex(/^[a-z]{2}$/)).max(10),
    country: z.string().regex(/^[A-Z]{2}$/).nullable(),
    locationPrecision: z.enum(['city', 'country', 'distance']),
    whoCanWrite: z.enum(['friends', 'friends_penpals', 'everyone']),
    readReceipts: z.boolean(),
    penpalEnabled: z.boolean(),
    bottleEnabled: z.boolean(),
    dailyDigest: z.boolean(),
    sounds: z.boolean(),
    animations: z.boolean(),
    notifyTripEvents: z.boolean(),
    timezone: z.string().max(64),
    onboarded: z.boolean(),
    interests: z.array(z.string().max(32)).max(20),
  })
  .partial();

const COLUMN: Record<string, string> = {
  displayName: 'display_name', avatar: 'avatar', bio: 'bio', lang: 'lang', country: 'country',
  locationPrecision: 'location_precision', whoCanWrite: 'who_can_write', readReceipts: 'read_receipts',
  penpalEnabled: 'penpal_enabled', bottleEnabled: 'bottle_enabled', dailyDigest: 'daily_digest', sounds: 'sounds',
  animations: 'animations', notifyTripEvents: 'notify_trip_events', timezone: 'timezone', onboarded: 'onboarded',
};

async function applySettings(userId: number, kind: 'adult' | 'child', b: z.infer<typeof SETTINGS>): Promise<void> {
  if (kind === 'child') {
    // детский режим: поиск друзей по переписке, бутылка и письма от незнакомцев недоступны
    delete b.penpalEnabled;
    delete b.bottleEnabled;
    if (b.whoCanWrite) b.whoCanWrite = 'friends';
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (k === 'interests' || k === 'languages') continue;
    const col = COLUMN[k];
    if (!col) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if (b.languages) {
    sets.push('languages = ?');
    vals.push(JSON.stringify(b.languages));
  }
  if (sets.length) await exec(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, userId]);
  if (b.interests) {
    await exec('DELETE FROM user_interests WHERE user_id = ?', [userId]);
    if (b.interests.length) {
      const ids = await q<any>(`SELECT id FROM interests WHERE code IN (${b.interests.map(() => '?').join(',')})`, b.interests);
      for (const r of ids) await exec('INSERT IGNORE INTO user_interests (user_id, interest_id) VALUES (?, ?)', [userId, r.id]);
    }
  }
}

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req) => {
    const u = requireUser(req);
    // +1 зёрнышко за ежедневный вход
    const today = new Date().toISOString().slice(0, 10);
    const last = u.last_login_day ? new Date(u.last_login_day).toISOString().slice(0, 10) : null;
    let dailyBonus = 0;
    if (last !== today) {
      const res = await exec('UPDATE users SET last_login_day = UTC_DATE() WHERE id = ? AND (last_login_day IS NULL OR last_login_day < UTC_DATE())', [u.id]);
      if (res.affectedRows === 1) {
        await award(u.id, GAME.semiDailyLogin, 'daily_login');
        dailyBonus = GAME.semiDailyLogin;
      }
    }
    const fresh = (await getUser(u.id))!;
    const interests = await q<any>('SELECT i.code FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = ?', [u.id]);
    const unread = await one<any>(
      `SELECT COUNT(*) AS n FROM letters WHERE to_id = ? AND status = 'delivered' AND read_at IS NULL AND removed = 0`,
      [u.id],
    );
    const unreadNotes = await one<any>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [u.id]);
    const loc = await one<any>('SELECT lon, lat, updated_at FROM locations WHERE user_id = ?', [u.id]);
    return {
      ...settingsOf(fresh),
      interests: interests.map((i) => i.code),
      dailyBonus,
      unreadLetters: Number(unread?.n ?? 0),
      unreadNotifications: Number(unreadNotes?.n ?? 0),
      hasLocation: !!loc,
      // своё точное место видит только сам пользователь
      location: loc ? { lon: loc.lon, lat: loc.lat, updatedAt: loc.updated_at } : null,
      publicLocation: await publicLocation(fresh, null),
      tariffs: await ownedTariffs(u.id),
      vapidPublicKey: await vapidPublicKey(),
    };
  });

  app.patch('/', async (req) => {
    const u = requireUser(req);
    await applySettings(u.id, u.kind, SETTINGS.parse(req.body));
    return settingsOf((await getUser(u.id))!);
  });

  app.post('/password', async (req) => {
    const u = requireUser(req);
    const b = z.object({ current: z.string().optional(), password: z.string().min(8).max(200) }).parse(req.body);
    if (u.password_hash && !(await verifyPassword(b.current ?? '', u.password_hash))) throw forbidden('wrong_password');
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(b.password), u.id]);
    return { ok: true };
  });

  /** Последняя известная позиция — обновляется при открытии приложения. */
  app.post('/location', async (req) => {
    const u = requireUser(req);
    const b = z.object({ point: LONLAT, accuracy: z.number().nonnegative().optional() }).parse(req.body);
    await saveLocation(u.id, b.point, b.accuracy);
    return { ok: true };
  });

  app.get('/notifications', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', [u.id]);
    return rows.map((n) => {
      const params = typeof n.params === 'string' ? JSON.parse(n.params) : n.params ?? {};
      return {
        id: n.id, type: n.type, courier: n.courier_type, letterId: n.letter_id, createdAt: n.created_at, read: !!n.read_at,
        text: renderNotification(n.type, params, u.lang, n.courier_type),
        pos: params.event?.pos ?? null,
      };
    });
  });

  app.post('/notifications/read', async (req) => {
    const u = requireUser(req);
    await exec('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [u.id]);
    return { ok: true };
  });

  app.post('/push', async (req) => {
    const u = requireUser(req);
    const b = z.object({ endpoint: z.string().url().max(700), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
    await exec(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [u.id, b.endpoint, b.keys.p256dh, b.keys.auth],
    );
    return { ok: true };
  });

  app.delete('/push', async (req) => {
    const u = requireUser(req);
    const b = z.object({ endpoint: z.string() }).parse(req.body);
    await exec('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [u.id, b.endpoint]);
    return { ok: true };
  });

  /** SSE: уведомления, пока приложение открыто. */
  app.get('/stream', async (req, reply) => {
    const u = requireUser(req);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 5000\n\nevent: hello\ndata: {}\n\n`);
    const remove = addClient(u.id, res);
    req.raw.on('close', remove);
  });

  app.get('/semi', async (req) => {
    const u = requireUser(req);
    return q('SELECT amount, reason, created_at AS createdAt FROM semi_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100', [u.id]);
  });

  app.get('/passkeys', async (req) => {
    const u = requireUser(req);
    return q('SELECT id, name, created_at AS createdAt FROM passkeys WHERE user_id = ?', [u.id]);
  });

  app.delete('/passkeys/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await exec('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [id, u.id]);
    return { ok: true };
  });

  /** Выгрузка своих данных (GDPR, ст. 20). */
  app.get('/export', async (req) => {
    const u = requireUser(req);
    return {
      user: settingsOf(u),
      location: await one('SELECT lon, lat, updated_at FROM locations WHERE user_id = ?', [u.id]),
      couriers: await q('SELECT * FROM couriers WHERE owner_id = ?', [u.id]),
      lettersSent: await q('SELECT id, to_id, kind, body, status, sent_at, arrive_at FROM letters WHERE from_id = ?', [u.id]),
      lettersReceived: await q("SELECT id, from_id, kind, body, delivered_at FROM letters WHERE to_id = ? AND status = 'delivered'", [u.id]),
      friends: await q('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?', [u.id, u.id]),
      semi: await q('SELECT * FROM semi_ledger WHERE user_id = ?', [u.id]),
    };
  });

  /** Удаление аккаунта: письма остаются у получателей, автор анонимизируется. */
  app.delete('/', async (req, reply) => {
    const u = requireUser(req);
    const b = z.object({ confirm: z.literal('DELETE'), password: z.string().optional() }).parse(req.body);
    if (u.password_hash && !(await verifyPassword(b.password ?? '', u.password_hash))) throw forbidden('wrong_password');
    void b.confirm;
    await deleteAccount(u.id);
    await destroySession(req, reply);
    return { ok: true };
  });

  // ─────────────── Детские профили ───────────────

  app.get('/children', async (req) => {
    const u = requireAdult(req);
    const kids = await q<any>('SELECT * FROM users WHERE parent_id = ? AND deleted_at IS NULL', [u.id]);
    return kids.map((k) => ({ ...cardOf(k), birthDate: k.birth_date, locationPrecision: k.location_precision, sounds: !!k.sounds }));
  });

  app.post('/children', async (req) => {
    const u = requireAdult(req);
    const b = z
      .object({
        displayName: z.string().min(1).max(64),
        username: z.string().regex(/^[a-zA-Z0-9_.]{3,32}$/),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lang: z.enum(['ru', 'it']),
        consent: z.literal(true),
      })
      .parse(req.body);
    if (ageYears(new Date(b.birthDate)) >= GAME.childAgeLimit) throw bad('not_a_child');
    const id = await createAccount({
      email: null, passwordHash: null, username: b.username, displayName: b.displayName, lang: b.lang,
      birthDate: b.birthDate, kind: 'child', parentId: u.id, timezone: u.timezone,
    });
    // ребёнок и родитель — сразу друзья
    const [a, c] = u.id < id ? [u.id, id] : [id, u.id];
    await exec(`INSERT INTO friendships (user_a, user_b, status, requested_by) VALUES (?, ?, 'accepted', ?)`, [a, c, u.id]);
    // место ребёнка по умолчанию — место родителя (уточнится при открытии приложения)
    await exec(`INSERT IGNORE INTO locations (user_id, pt, lon, lat) SELECT ?, pt, lon, lat FROM locations WHERE user_id = ?`, [id, u.id]);
    return { id };
  });

  async function ownChild(parentId: number, childId: number) {
    const k = await one<any>('SELECT * FROM users WHERE id = ? AND parent_id = ? AND deleted_at IS NULL', [childId, parentId]);
    if (!k) throw notFound('child_not_found');
    return k;
  }

  /** Одноразовый код для входа ребёнка на его устройстве (24 часа). */
  app.post('/children/:id/device-code', async (req) => {
    const u = requireAdult(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await ownChild(u.id, id);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.randomBytes(8), (x) => alphabet[x % alphabet.length]).join('');
    await exec(
      `INSERT INTO login_codes (user_id, purpose, code_hash, token_hash, expires_at) VALUES (?, 'child_device', ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
      [id, sha256(code), sha256(code)],
    );
    return { code, expiresInHours: 24 };
  });

  app.patch('/children/:id', async (req) => {
    const u = requireAdult(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await ownChild(u.id, id);
    await applySettings(id, 'child', SETTINGS.parse(req.body));
    return { ok: true };
  });

  app.delete('/children/:id', async (req) => {
    const u = requireAdult(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await ownChild(u.id, id);
    await deleteAccount(id);
    return { ok: true };
  });

  /** Заявки в друзья детей, ждущие одобрения родителя. */
  app.get('/children/requests', async (req) => {
    const u = requireAdult(req);
    const rows = await q<any>(
      `SELECT f.*, ka.display_name AS a_name, kb.display_name AS b_name, ka.parent_id AS a_parent, kb.parent_id AS b_parent,
              ka.username AS a_username, kb.username AS b_username
       FROM friendships f JOIN users ka ON ka.id = f.user_a JOIN users kb ON kb.id = f.user_b
       WHERE f.status IN ('pending','accepted') AND (
         (ka.parent_id = ? AND f.parent_approved_a = 0) OR (kb.parent_id = ? AND f.parent_approved_b = 0))`,
      [u.id, u.id],
    );
    return rows.map((r) => {
      const childIsA = r.a_parent === u.id && !r.parent_approved_a;
      return {
        id: r.id,
        child: { id: childIsA ? r.user_a : r.user_b, displayName: childIsA ? r.a_name : r.b_name },
        other: { id: childIsA ? r.user_b : r.user_a, displayName: childIsA ? r.b_name : r.a_name, username: childIsA ? r.b_username : r.a_username },
        requestedBy: r.requested_by,
      };
    });
  });

  app.post('/children/requests/:id/:action', async (req) => {
    const u = requireActiveUser(req);
    const { id, action } = z.object({ id: z.coerce.number(), action: z.enum(['approve', 'decline']) }).parse(req.params);
    const f = await one<any>('SELECT * FROM friendships WHERE id = ?', [id]);
    if (!f) throw notFound();
    const a = await getUser(f.user_a);
    const b = await getUser(f.user_b);
    const side = a?.parent_id === u.id ? 'a' : b?.parent_id === u.id ? 'b' : null;
    if (!side) throw forbidden();
    if (action === 'decline') {
      await exec("UPDATE friendships SET status = 'declined' WHERE id = ?", [id]);
      return { ok: true };
    }
    await exec(`UPDATE friendships SET parent_approved_${side} = 1 WHERE id = ?`, [id]);
    // одобрение родителя получателя-ребёнка равно согласию самого ребёнка
    const approvedUserId = side === 'a' ? f.user_a : f.user_b;
    if (approvedUserId !== f.requested_by) await exec("UPDATE friendships SET status = 'accepted' WHERE id = ?", [id]);
    const other = side === 'a' ? b : a;
    const child = side === 'a' ? a : b;
    if (other && child) {
      const { notify } = await import('../services/notify.js');
      await notify(other.id, 'child_request_approved', { from: child.display_name });
    }
    return { ok: true };
  });

  void conflict;
}
