import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exec, one, q } from '../db.js';
import { requireActiveUser, requireAdult, requireUser } from '../lib/auth.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { notify } from '../services/notify.js';
import { cardOf, friendship, getLocation, getUser, isBlocked, publicLocation, publicProfile } from '../services/people.js';

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  /** Поиск по @нику. Дети в поиске не видны — их добавляют по ссылке или QR. */
  app.get('/users/search', async (req) => {
    const u = requireUser(req);
    const { q: term } = z.object({ q: z.string().min(2).max(32) }).parse(req.query);
    const t = term.replace(/^@/, '').replace(/[%_]/g, '');
    const rows = await q<any>(
      `SELECT id, username, display_name, avatar, kind FROM users
       WHERE username LIKE ? AND kind = 'adult' AND deleted_at IS NULL AND id <> ? AND username <> 'postmaster'
       ORDER BY username = ? DESC, username LIMIT 20`,
      [`${t}%`, u.id, t],
    );
    return rows.map(cardOf);
  });

  app.get('/users/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const p = await publicProfile(id, u.id);
    if (!p) throw notFound();
    return p;
  });

  /** Личная ссылка-приглашение и QR: кто за ней стоит. */
  app.get('/invite/:code', async (req) => {
    const { code } = z.object({ code: z.string().max(32) }).parse(req.params);
    const u = await one<any>('SELECT id, username, display_name, avatar, kind FROM users WHERE invite_code = ? AND deleted_at IS NULL', [code]);
    if (!u) {
      const admin = await one<any>('SELECT code FROM invites WHERE code = ? AND uses_left > 0', [code]);
      if (admin) return { kind: 'beta', code };
      throw notFound('invite_not_found');
    }
    return { kind: 'user', user: cardOf(u) };
  });

  app.get('/friends', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      `SELECT f.*, o.id AS oid, o.username, o.display_name, o.avatar, o.kind
       FROM friendships f JOIN users o ON o.id = IF(f.user_a = ?, f.user_b, f.user_a)
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status <> 'declined' AND o.deleted_at IS NULL`,
      [u.id, u.id, u.id],
    );
    const out: any[] = [];
    for (const r of rows) {
      const approved = !!r.parent_approved_a && !!r.parent_approved_b;
      const other = await getUser(r.oid);
      out.push({
        friendshipId: r.id,
        user: cardOf({ id: r.oid, username: r.username, display_name: r.display_name, avatar: r.avatar, kind: r.kind }),
        status: r.status === 'accepted' && !approved ? 'awaiting_parent' : r.status,
        incoming: r.status === 'pending' && r.requested_by !== u.id,
        location: other ? await publicLocation(other, u.id) : null,
      });
    }
    return out;
  });

  /** Заявка в друзья приходит как «прилетевший голубь». */
  app.post('/friends/request', async (req) => {
    const u = requireActiveUser(req);
    const b = z.object({ userId: z.number().optional(), inviteCode: z.string().max(32).optional() }).parse(req.body);
    let target: any = null;
    if (b.userId) target = await getUser(b.userId);
    else if (b.inviteCode) target = await one<any>('SELECT * FROM users WHERE invite_code = ? AND deleted_at IS NULL', [b.inviteCode]);
    if (!target || target.deleted_at) throw notFound('user_not_found');
    if (target.id === u.id) throw bad('cannot_friend_self');
    if (await isBlocked(u.id, target.id)) throw forbidden('blocked');
    // незнакомец не может найти ребёнка поиском — только по ссылке/QR от семьи
    if (target.kind === 'child' && !b.inviteCode && target.parent_id !== u.id) throw forbidden('child_by_invite_only');
    const [a, c] = u.id < target.id ? [u.id, target.id] : [target.id, u.id];
    const ua = a === u.id ? u : target;
    const ub = c === u.id ? u : target;
    const existing = await friendship(u.id, target.id);
    if (existing && existing.status === 'accepted') throw conflict('already_friends');
    if (existing && existing.status === 'pending' && existing.requested_by !== u.id) {
      // встречная заявка — принимаем
      await exec("UPDATE friendships SET status = 'accepted' WHERE id = ?", [existing.id]);
      await notify(target.id, 'friend_accepted', { from: u.display_name }, { courierType: 'pigeon' });
      return { status: 'accepted' };
    }
    await exec(
      `INSERT INTO friendships (user_a, user_b, status, requested_by, parent_approved_a, parent_approved_b) VALUES (?, ?, 'pending', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'pending', requested_by = VALUES(requested_by),
         parent_approved_a = VALUES(parent_approved_a), parent_approved_b = VALUES(parent_approved_b)`,
      [a, c, u.id, ua.kind === 'child' ? 0 : 1, ub.kind === 'child' ? 0 : 1],
    );
    if (target.kind === 'child') {
      await notify(target.parent_id, 'child_friend_request', { from: u.display_name, child: target.display_name }, { courierType: 'pigeon', url: '#/settings/children' });
    } else {
      await notify(target.id, 'friend_request', { from: u.display_name }, { courierType: 'pigeon', url: '#/friends' });
    }
    if (u.kind === 'child' && u.parent_id) {
      await notify(u.parent_id, 'child_friend_request', { from: target.display_name, child: u.display_name }, { courierType: 'pigeon', url: '#/settings/children' });
    }
    return { status: 'pending' };
  });

  app.post('/friends/:id/:action', async (req) => {
    const u = requireActiveUser(req);
    const { id, action } = z.object({ id: z.coerce.number(), action: z.enum(['accept', 'decline']) }).parse(req.params);
    const f = await one<any>('SELECT * FROM friendships WHERE id = ? AND (user_a = ? OR user_b = ?)', [id, u.id, u.id]);
    if (!f || f.status !== 'pending' || f.requested_by === u.id) throw notFound();
    // за ребёнка заявки принимает родитель
    if (u.kind === 'child') throw forbidden('parent_approves');
    await exec('UPDATE friendships SET status = ? WHERE id = ?', [action === 'accept' ? 'accepted' : 'declined', id]);
    if (action === 'accept') await notify(f.requested_by, 'friend_accepted', { from: u.display_name }, { courierType: 'pigeon' });
    return { ok: true };
  });

  app.delete('/friends/:userId', async (req) => {
    const u = requireUser(req);
    const { userId } = z.object({ userId: z.coerce.number() }).parse(req.params);
    const [a, c] = u.id < userId ? [u.id, userId] : [userId, u.id];
    await exec('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', [a, c]);
    return { ok: true };
  });

  /**
   * Контакты телефона — только с явного разрешения: браузер (Contact Picker API) отдаёт
   * выбранные пользователем адреса, мы ищем совпадения. Адреса не сохраняются.
   */
  app.post('/friends/contacts', async (req) => {
    const u = requireAdult(req);
    const b = z.object({ emails: z.array(z.string().email()).max(200) }).parse(req.body);
    if (!b.emails.length) return [];
    const emails = b.emails.map((e) => e.toLowerCase());
    const rows = await q<any>(
      `SELECT id, username, display_name, avatar, kind FROM users WHERE email IN (${emails.map(() => '?').join(',')})
       AND kind = 'adult' AND deleted_at IS NULL AND id <> ?`,
      [...emails, u.id],
    );
    return rows.map(cardOf);
  });

  /** Поиск друзей по переписке: интересы, языковой обмен РУ–IT, рядом или на другом конце света. */
  app.get('/penpals', async (req) => {
    const u = requireAdult(req);
    const b = z
      .object({
        mode: z.enum(['interests', 'language', 'near', 'far', 'random']).default('random'),
        lang: z.string().regex(/^[a-z]{2}$/).optional(),
      })
      .parse(req.query);
    const me = await getLocation(u.id);
    let order = 'RAND()';
    const params: unknown[] = [u.id, u.id, u.id];
    let extra = '';
    if (b.mode === 'interests') {
      order = `(SELECT COUNT(*) FROM user_interests a JOIN user_interests x ON x.interest_id = a.interest_id WHERE a.user_id = u.id AND x.user_id = ${Number(u.id)}) DESC, RAND()`;
    } else if (b.mode === 'language') {
      const want = b.lang ?? (u.lang === 'ru' ? 'it' : 'ru');
      extra = ` AND (u.lang = ? OR JSON_CONTAINS(COALESCE(u.languages, '[]'), JSON_QUOTE(?)))`;
      params.push(want, want);
    } else if ((b.mode === 'near' || b.mode === 'far') && me) {
      order = `ST_Distance_Sphere(l.pt, ST_GeomFromText('POINT(${Number(me[0])} ${Number(me[1])})')) ${b.mode === 'near' ? 'ASC' : 'DESC'}`;
    }
    const rows = await q<any>(
      `SELECT u.* FROM users u JOIN locations l ON l.user_id = u.id
       WHERE u.kind = 'adult' AND u.penpal_enabled = 1 AND u.deleted_at IS NULL AND u.id <> ? AND u.username <> 'postmaster'
         AND (u.banned_until IS NULL OR u.banned_until < UTC_TIMESTAMP())
         AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = u.id AND bl.blocked_id = ?) OR (bl.blocker_id = ? AND bl.blocked_id = u.id))
         ${extra}
       ORDER BY ${order} LIMIT 20`,
      params,
    );
    const out = [];
    for (const r of rows) out.push(await publicProfile(r.id, u.id));
    return out;
  });

  /** Начать переписку с найденным человеком: связь «друзья по переписке». */
  app.post('/penpals/:id/connect', async (req) => {
    const u = requireAdult(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const t = await getUser(id);
    if (!t || t.kind !== 'adult' || !t.penpal_enabled || t.deleted_at) throw notFound();
    if (await isBlocked(u.id, t.id)) throw forbidden('blocked');
    const [a, c] = u.id < t.id ? [u.id, t.id] : [t.id, u.id];
    await exec(`INSERT IGNORE INTO friendships (user_a, user_b, status, requested_by) VALUES (?, ?, 'penpal', ?)`, [a, c, u.id]);
    return { ok: true };
  });

  // ── Блокировки и жалобы ──
  app.get('/blocks', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?', [u.id]);
    return rows.map(cardOf);
  });

  app.post('/blocks', async (req) => {
    const u = requireUser(req);
    const b = z.object({ userId: z.number() }).parse(req.body);
    if (b.userId === u.id) throw bad('cannot_block_self');
    await exec('INSERT IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [u.id, b.userId]);
    const [a, c] = u.id < b.userId ? [u.id, b.userId] : [b.userId, u.id];
    await exec("UPDATE friendships SET status = 'declined' WHERE user_a = ? AND user_b = ?", [a, c]);
    return { ok: true };
  });

  app.delete('/blocks/:userId', async (req) => {
    const u = requireUser(req);
    const { userId } = z.object({ userId: z.coerce.number() }).parse(req.params);
    await exec('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [u.id, userId]);
    return { ok: true };
  });

  app.post('/reports', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const u = requireUser(req);
    const b = z
      .object({
        userId: z.number(),
        letterId: z.number().optional(),
        reason: z.enum(['spam', 'abuse', 'inappropriate', 'child_safety', 'other']),
        comment: z.string().max(1000).default(''),
        block: z.boolean().default(false),
      })
      .parse(req.body);
    if (b.letterId) {
      const l = await one<any>('SELECT from_id, to_id FROM letters WHERE id = ?', [b.letterId]);
      if (!l || (l.to_id !== u.id && l.from_id !== u.id)) throw forbidden();
    }
    await exec('INSERT INTO reports (reporter_id, target_user_id, letter_id, reason, comment) VALUES (?, ?, ?, ?, ?)', [
      u.id, b.userId, b.letterId ?? null, b.reason, b.comment,
    ]);
    if (b.block) await exec('INSERT IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [u.id, b.userId]);
    return { ok: true };
  });

  void crypto;
}
