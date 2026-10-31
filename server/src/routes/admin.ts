import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { exec, one, q } from '../db.js';
import { requireAdmin } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { ensurePostmaster } from '../services/accounts.js';
import { invalidateCatalog, rowToCourierType } from '../services/catalog.js';
import { notify } from '../services/notify.js';
import { onlineCount } from '../services/sse.js';

const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Админ-панель: курьеры и события, жалобы и баны, статистика, рассылки. */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });

  // ─── Курьеры, тарифы, предметы, события, достижения — без правки кода ───
  app.get('/courier-types', async () => (await q('SELECT * FROM courier_types ORDER BY sort')).map(rowToCourierType));

  app.put('/courier-types/:code', async (req) => {
    const { code } = z.object({ code: z.string().regex(/^[a-z0-9_]{2,32}$/) }).parse(req.params);
    const b = z
      .object({
        section: z.enum(['birds', 'animals', 'history', 'post']),
        speedKmh: z.number().positive(),
        speedWaterKmh: z.number().positive().nullable().optional(),
        nightMode: z.enum(['rest', 'night_only', 'always', 'sea_only', 'hours']),
        routeKind: z.enum(['air', 'air_sea', 'air_direct', 'land', 'land_sea', 'sea', 'post']),
        capacity: z.object({ text: z.number().int().min(0), photos: z.number().int().min(0), drawings: z.number().int().min(0), voiceSec: z.number().min(0), maxAttachments: z.number().int().min(0).optional() }),
        unlock: z.any(),
        look: z.string().max(32),
        sound: z.string().max(32),
        seasonMonths: z.array(z.number().int().min(1).max(12)).nullable().optional(),
        unpredictability: z.number().min(0).max(1).nullable().optional(),
        windDriven: z.boolean().optional(),
        noReturn: z.boolean().optional(),
        illustration: z.string().max(200000).nullable().optional(),
        nameRu: z.string().max(64).optional(),
        nameIt: z.string().max(64).optional(),
        sort: z.number().int().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(req.body);
    await exec(
      `INSERT INTO courier_types (code, section, speed_kmh, speed_water_kmh, night_mode, route_kind, capacity, unlock_rule, look, sound,
         season_months, unpredictability, wind_driven, no_return, illustration, name_ru, name_it, sort, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE section = VALUES(section), speed_kmh = VALUES(speed_kmh), speed_water_kmh = VALUES(speed_water_kmh),
         night_mode = VALUES(night_mode), route_kind = VALUES(route_kind), capacity = VALUES(capacity), unlock_rule = VALUES(unlock_rule),
         look = VALUES(look), sound = VALUES(sound), season_months = VALUES(season_months), unpredictability = VALUES(unpredictability),
         wind_driven = VALUES(wind_driven), no_return = VALUES(no_return), illustration = VALUES(illustration),
         name_ru = VALUES(name_ru), name_it = VALUES(name_it), sort = VALUES(sort), enabled = VALUES(enabled)`,
      [code, b.section, b.speedKmh, b.speedWaterKmh ?? null, b.nightMode, b.routeKind, JSON.stringify(b.capacity), JSON.stringify(b.unlock ?? { kind: 'semi', price: 50 }),
        b.look, b.sound, b.seasonMonths ? JSON.stringify(b.seasonMonths) : null, b.unpredictability ?? null, b.windDriven ? 1 : 0,
        b.noReturn ? 1 : 0, b.illustration ?? null, b.nameRu ?? null, b.nameIt ?? null, b.sort ?? 0, b.enabled === false ? 0 : 1],
    );
    invalidateCatalog();
    return { ok: true };
  });

  app.get('/tariffs', async () => q('SELECT * FROM post_tariffs'));
  app.put('/tariffs/:code', async (req) => {
    const { code } = z.object({ code: z.string().max(16) }).parse(req.params);
    const b = z.object({ carKmh: z.number().positive(), hoursPerDay: z.number().min(1).max(24), planeKmh: z.number().positive().nullable().optional(), sortingHours: z.number().min(0), unlock: z.any() }).parse(req.body);
    await exec(
      `INSERT INTO post_tariffs (code, car_kmh, hours_per_day, plane_kmh, sorting_hours, unlock_rule) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE car_kmh = VALUES(car_kmh), hours_per_day = VALUES(hours_per_day), plane_kmh = VALUES(plane_kmh),
         sorting_hours = VALUES(sorting_hours), unlock_rule = VALUES(unlock_rule)`,
      [code, b.carKmh, b.hoursPerDay, b.planeKmh ?? null, b.sortingHours, JSON.stringify(b.unlock ?? { kind: 'start' })],
    );
    invalidateCatalog();
    return { ok: true };
  });

  app.get('/items', async () => (await q('SELECT * FROM items ORDER BY kind, sort')).map((i: any) => ({ ...i, data: json(i.data) })));
  app.put('/items/:code', async (req) => {
    const { code } = z.object({ code: z.string().regex(/^[a-z0-9_]{2,48}$/) }).parse(req.params);
    const b = z.object({
      kind: z.enum(['stamp', 'envelope', 'paper', 'sticker', 'tariff', 'slot']), price: z.number().int().min(0), free: z.boolean(),
      eventCode: z.string().max(32).nullable().optional(), nameRu: z.string().max(128), nameIt: z.string().max(128),
      data: z.any().optional(), sort: z.number().int().optional(), enabled: z.boolean().optional(),
    }).parse(req.body);
    await exec(
      `INSERT INTO items (code, kind, price, free, event_code, name_ru, name_it, data, sort, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE kind = VALUES(kind), price = VALUES(price), free = VALUES(free), event_code = VALUES(event_code),
         name_ru = VALUES(name_ru), name_it = VALUES(name_it), data = VALUES(data), sort = VALUES(sort), enabled = VALUES(enabled)`,
      [code, b.kind, b.price, b.free ? 1 : 0, b.eventCode ?? null, b.nameRu, b.nameIt, b.data ? JSON.stringify(b.data) : null, b.sort ?? 0, b.enabled === false ? 0 : 1],
    );
    return { ok: true };
  });

  app.get('/events', async () => (await q('SELECT * FROM events ORDER BY start_md')).map((e: any) => ({ ...e, params: json(e.params) })));
  app.put('/events/:code', async (req) => {
    const { code } = z.object({ code: z.string().regex(/^[a-z0-9_]{2,32}$/) }).parse(req.params);
    const b = z.object({
      kind: z.enum(['holiday', 'season', 'migration']), nameRu: z.string().max(128), nameIt: z.string().max(128),
      startMd: z.string().regex(/^\d{2}-\d{2}$/), endMd: z.string().regex(/^\d{2}-\d{2}$/), params: z.any().optional(), enabled: z.boolean().optional(),
    }).parse(req.body);
    await exec(
      `INSERT INTO events (code, kind, name_ru, name_it, start_md, end_md, params, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE kind = VALUES(kind), name_ru = VALUES(name_ru), name_it = VALUES(name_it), start_md = VALUES(start_md),
         end_md = VALUES(end_md), params = VALUES(params), enabled = VALUES(enabled)`,
      [code, b.kind, b.nameRu, b.nameIt, b.startMd, b.endMd, b.params ? JSON.stringify(b.params) : null, b.enabled === false ? 0 : 1],
    );
    return { ok: true };
  });

  app.get('/achievements', async () => q('SELECT * FROM achievements ORDER BY sort'));
  app.put('/achievements/:code', async (req) => {
    const { code } = z.object({ code: z.string().regex(/^[a-z0-9_]{2,48}$/) }).parse(req.params);
    const b = z.object({
      category: z.string().max(32), threshold: z.number(), reward: z.number().int().min(5).max(50),
      nameRu: z.string().max(128), nameIt: z.string().max(128), descRu: z.string().max(255), descIt: z.string().max(255),
      sort: z.number().int().optional(), enabled: z.boolean().optional(),
    }).parse(req.body);
    await exec(
      `INSERT INTO achievements (code, category, threshold, reward, name_ru, name_it, desc_ru, desc_it, sort, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE category = VALUES(category), threshold = VALUES(threshold), reward = VALUES(reward), name_ru = VALUES(name_ru),
         name_it = VALUES(name_it), desc_ru = VALUES(desc_ru), desc_it = VALUES(desc_it), sort = VALUES(sort), enabled = VALUES(enabled)`,
      [code, b.category, b.threshold, b.reward, b.nameRu, b.nameIt, b.descRu, b.descIt, b.sort ?? 0, b.enabled === false ? 0 : 1],
    );
    return { ok: true };
  });

  // ─── Жалобы и баны ───
  app.get('/reports', async (req) => {
    const { status } = z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }).parse(req.query);
    const rows = await q<any>(
      `SELECT r.*, ru.username AS reporter_username, tu.username AS target_username, tu.display_name AS target_name,
              tu.banned_until, l.body AS letter_body, l.kind AS letter_kind, l.sent_at AS letter_sent_at
       FROM reports r JOIN users ru ON ru.id = r.reporter_id JOIN users tu ON tu.id = r.target_user_id
       LEFT JOIN letters l ON l.id = r.letter_id WHERE r.status = ? ORDER BY r.created_at LIMIT 200`,
      [status],
    );
    for (const r of rows) {
      r.media = r.letter_id ? await q('SELECT id, kind, mime FROM letter_media WHERE letter_id = ?', [r.letter_id]) : [];
      r.priorReports = Number((await one<any>('SELECT COUNT(*) AS n FROM reports WHERE target_user_id = ?', [r.target_user_id]))?.n ?? 0);
    }
    return rows;
  });

  app.post('/reports/:id/resolve', async (req) => {
    const admin = requireAdmin(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z.object({
      action: z.enum(['dismiss', 'delete_letter', 'warn', 'ban']),
      banDays: z.number().int().positive().nullable().optional(), // null — навсегда
      reason: z.string().max(255).default(''),
    }).parse(req.body);
    const r = await one<any>('SELECT * FROM reports WHERE id = ?', [id]);
    if (!r) throw notFound();
    if (b.action === 'delete_letter' && r.letter_id) await exec('UPDATE letters SET removed = 1 WHERE id = ?', [r.letter_id]);
    if (b.action === 'warn') await notify(r.target_user_id, 'warning', { text: b.reason || '—' });
    if (b.action === 'ban') {
      const until = b.banDays ? new Date(Date.now() + b.banDays * 86400_000) : new Date('9999-12-31T00:00:00Z');
      await exec('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?', [until, b.reason, r.target_user_id]);
      await exec('INSERT INTO bans (user_id, until_at, reason, admin_id, report_id) VALUES (?, ?, ?, ?, ?)', [r.target_user_id, b.banDays ? until : null, b.reason, admin.id, r.id]);
      if (r.letter_id) await exec('UPDATE letters SET removed = 1 WHERE id = ?', [r.letter_id]);
    }
    await exec('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?', [
      b.action === 'dismiss' ? 'dismissed' : 'resolved', b.action, admin.id, id,
    ]);
    return { ok: true };
  });

  app.post('/users/:id/unban', async (req) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await exec('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?', [id]);
    return { ok: true };
  });

  app.get('/users', async (req) => {
    const { q: term } = z.object({ q: z.string().max(64).default('') }).parse(req.query);
    return q(
      `SELECT id, username, display_name, email, kind, role, banned_until, created_at, letters_sent, semi FROM users
       WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 100`,
      [`%${term}%`, `%${term}%`],
    );
  });

  // ─── Приглашения в закрытую бету ───
  app.get('/invites', async () => q('SELECT * FROM invites ORDER BY created_at DESC LIMIT 200'));
  app.post('/invites', async (req) => {
    const admin = requireAdmin(req);
    const b = z.object({ uses: z.number().int().min(1).max(1000).default(1), note: z.string().max(255).optional() }).parse(req.body ?? {});
    const code = Math.random().toString(36).slice(2, 10);
    await exec('INSERT INTO invites (code, created_by, uses_left, note) VALUES (?, ?, ?, ?)', [code, admin.id, b.uses, b.note ?? null]);
    return { code, link: `${config.publicUrl}/#/register?invite=${code}` };
  });

  // ─── Статистика (без внешней аналитики — только своя база) ───
  app.get('/stats', async () => {
    const n = async (sql: string, p: unknown[] = []) => Number((await one<any>(sql, p))?.n ?? 0);
    let disk: any = null;
    try {
      const s = await fs.statfs(config.mediaDir);
      disk = { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
    } catch { /* каталога ещё нет */ }
    const media = await one<any>('SELECT COALESCE(SUM(size_bytes),0) AS n FROM letter_media');
    return {
      users: await n('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL'),
      children: await n("SELECT COUNT(*) AS n FROM users WHERE kind = 'child' AND deleted_at IS NULL"),
      registrationsByDay: await q("SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users WHERE created_at > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY day ORDER BY day"),
      activeToday: await n('SELECT COUNT(*) AS n FROM users WHERE last_login_day = UTC_DATE()'),
      active7d: await n('SELECT COUNT(*) AS n FROM users WHERE last_login_day >= UTC_DATE() - INTERVAL 7 DAY'),
      onlineNow: onlineCount(),
      lettersByDay: await q("SELECT DATE(sent_at) AS day, COUNT(*) AS n FROM letters WHERE sent_at > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY day ORDER BY day"),
      couriersInFlight: await n("SELECT COUNT(*) AS n FROM couriers WHERE status IN ('outbound','returning')"),
      couriersWaiting: await n("SELECT COUNT(*) AS n FROM couriers WHERE status = 'waiting'"),
      openReports: await n("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      apiUsage: await q('SELECT day, service, count, errors FROM api_usage WHERE day >= UTC_DATE() - INTERVAL 14 DAY ORDER BY day DESC, service'),
      routeCache: await n('SELECT COUNT(*) AS n FROM route_cache'),
      mediaBytes: Number(media?.n ?? 0),
      disk,
    };
  });

  // ─── Рассылки от почтмейстера: прилетают как обычное письмо ───
  app.get('/broadcasts', async () => q('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 50'));
  app.post('/broadcasts', async (req) => {
    const admin = requireAdmin(req);
    const b = z.object({ textRu: z.string().min(1).max(10000), textIt: z.string().min(1).max(10000) }).parse(req.body);
    const pm = await ensurePostmaster();
    const res = await exec('INSERT INTO broadcasts (text_ru, text_it, created_by) VALUES (?, ?, ?)', [b.textRu, b.textIt, admin.id]);
    const users = await q<any>("SELECT id, lang FROM users WHERE deleted_at IS NULL AND id <> ? AND username <> 'postmaster'", [pm]);
    for (const u of users) {
      const l = await exec(
        `INSERT INTO letters (from_id, to_id, kind, body, paper, font, stamp, courier_type, status, sent_at, arrive_at, delivered_at, distance_km)
         VALUES (?, ?, 'broadcast', ?, 'paper_parchment', 'bad_script', 'stamp_postmaster', 'pigeon', 'delivered', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP(), 0)`,
        [pm, u.id, u.lang === 'it' ? b.textIt : b.textRu],
      );
      await notify(u.id, 'broadcast', {}, { courierType: 'pigeon', letterId: l.insertId });
    }
    await exec('UPDATE broadcasts SET sent_at = UTC_TIMESTAMP(), recipients = ? WHERE id = ?', [users.length, res.insertId]);
    return { recipients: users.length };
  });
}
