import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exec, one, q, tx } from '../db.js';
import { requireActiveUser, requireUser } from '../lib/auth.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { spend } from '../services/semi.js';

/** Активные сезонные события и праздники (даты в формате ММ-ДД, могут переходить через Новый год). */
export async function activeEvents(now = new Date()): Promise<any[]> {
  const md = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const rows = await q<any>('SELECT * FROM events WHERE enabled = 1');
  return rows.filter((e) => (e.start_md <= e.end_md ? md >= e.start_md && md <= e.end_md : md >= e.start_md || md <= e.end_md));
}

export async function worldRoutes(app: FastifyInstance): Promise<void> {
  /** Альбом: штемпели, страны, марки, достижения. */
  app.get('/album', async (req) => {
    const u = requireUser(req);
    const postmarks = await q<any>(
      `SELECT p.name_ru, p.name_it, p.country, MIN(p.stamped_at) AS first_at, COUNT(*) AS n
       FROM postmarks p JOIN letters l ON l.id = p.letter_id
       WHERE (l.from_id = ? OR l.to_id = ?) AND l.status = 'delivered' AND p.stamped_at <= UTC_TIMESTAMP()
       GROUP BY p.name_ru, p.name_it, p.country ORDER BY first_at`,
      [u.id, u.id],
    );
    const countries = await q<any>(
      `SELECT c.code, c.name_ru, c.name_it, COUNT(*) AS n FROM postmarks p
       JOIN letters l ON l.id = p.letter_id JOIN countries c ON c.code = p.country
       WHERE (l.from_id = ? OR l.to_id = ?) AND l.status = 'delivered' GROUP BY c.code, c.name_ru, c.name_it ORDER BY c.code`,
      [u.id, u.id],
    );
    const achievements = await q<any>(
      `SELECT a.*, ua.achieved_at FROM achievements a LEFT JOIN user_achievements ua ON ua.code = a.code AND ua.user_id = ?
       WHERE a.enabled = 1 ORDER BY a.sort`,
      [u.id],
    );
    const stamps = await q<any>(
      `SELECT i.code, i.name_ru, i.name_it, i.data, i.event_code, (ui.item_code IS NOT NULL OR i.free = 1) AS owned
       FROM items i LEFT JOIN user_items ui ON ui.item_code = i.code AND ui.user_id = ? WHERE i.kind = 'stamp' AND i.enabled = 1 ORDER BY i.sort`,
      [u.id],
    );
    return {
      postmarks: postmarks.map((p) => ({ ru: p.name_ru, it: p.name_it, country: p.country, firstAt: p.first_at, count: Number(p.n) })),
      countries: countries.map((c) => ({ code: c.code, ru: c.name_ru, it: c.name_it, count: Number(c.n) })),
      achievements: achievements.map((a) => ({
        code: a.code, category: a.category, threshold: a.threshold, reward: a.reward,
        ru: a.name_ru, it: a.name_it, descRu: a.desc_ru, descIt: a.desc_it, achievedAt: a.achieved_at,
      })),
      stamps: stamps.map((s) => ({ code: s.code, ru: s.name_ru, it: s.name_it, data: typeof s.data === 'string' ? JSON.parse(s.data) : s.data, event: s.event_code, owned: !!s.owned })),
    };
  });

  /** Лавка: марки, конверты, бумага, наклейки, тарифы «Почты» — только за зёрнышки. */
  app.get('/shop', async (req) => {
    const u = requireUser(req);
    const events = new Set((await activeEvents()).map((e) => e.code));
    const items = await q<any>(
      `SELECT i.*, ui.qty FROM items i LEFT JOIN user_items ui ON ui.item_code = i.code AND ui.user_id = ? WHERE i.enabled = 1 ORDER BY i.kind, i.sort`,
      [u.id],
    );
    return {
      semi: u.semi,
      items: items.map((i) => ({
        code: i.code, kind: i.kind, price: i.price, free: !!i.free, event: i.event_code,
        ru: i.name_ru, it: i.name_it, data: typeof i.data === 'string' ? JSON.parse(i.data) : i.data,
        owned: !!i.free || !!i.qty,
        available: !i.event_code || events.has(i.event_code),
      })),
    };
  });

  app.post('/shop/buy', async (req) => {
    const u = requireActiveUser(req);
    const b = z.object({ code: z.string().max(48) }).parse(req.body);
    const item = await one<any>('SELECT * FROM items WHERE code = ? AND enabled = 1', [b.code]);
    if (!item) throw notFound('item_not_found');
    if (item.free) return { ok: true };
    if (item.event_code) {
      const events = new Set((await activeEvents()).map((e) => e.code));
      if (!events.has(item.event_code)) throw forbidden('event_not_active');
    }
    await tx(async (c) => {
      const owned = await one('SELECT 1 FROM user_items WHERE user_id = ? AND item_code = ?', [u.id, item.code], c);
      if (owned) throw conflict('already_owned');
      await spend(u.id, item.price, `item:${item.kind}`, c);
      await exec('INSERT INTO user_items (user_id, item_code) VALUES (?, ?)', [u.id, item.code], c);
    });
    return { ok: true };
  });

  /** Что есть у пользователя для оформления письма. */
  app.get('/stationery', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      `SELECT i.code, i.kind, i.name_ru, i.name_it, i.data FROM items i LEFT JOIN user_items ui ON ui.item_code = i.code AND ui.user_id = ?
       WHERE i.enabled = 1 AND i.kind IN ('paper','envelope','stamp','sticker') AND (i.free = 1 OR ui.item_code IS NOT NULL) ORDER BY i.kind, i.sort`,
      [u.id],
    );
    return rows.map((r) => ({ code: r.code, kind: r.kind, ru: r.name_ru, it: r.name_it, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
  });

  app.get('/events/active', async () => {
    return (await activeEvents()).map((e) => ({ code: e.code, kind: e.kind, ru: e.name_ru, it: e.name_it, params: typeof e.params === 'string' ? JSON.parse(e.params) : e.params }));
  });

  app.get('/interests', async () => {
    const rows = await q<any>('SELECT code, name_ru, name_it FROM interests ORDER BY id');
    return rows.map((r) => ({ code: r.code, ru: r.name_ru, it: r.name_it }));
  });

  app.get('/countries', async () => {
    return (await q<any>('SELECT code, name_ru, name_it FROM countries ORDER BY code')).map((c) => ({ code: c.code, ru: c.name_ru, it: c.name_it }));
  });

  /** Атрибуция данных — для раздела «О приложении». */
  app.get('/about', async () => ({
    attributions: [
      { name: 'OpenStreetMap contributors', license: 'ODbL', url: 'https://www.openstreetmap.org/copyright' },
      { name: 'OpenRouteService', license: 'CC-BY 4.0', url: 'https://openrouteservice.org' },
      { name: 'Open-Meteo', license: 'CC-BY 4.0', url: 'https://open-meteo.com' },
      { name: 'GeoNames', license: 'CC-BY 4.0', url: 'https://www.geonames.org' },
      { name: 'Natural Earth', license: 'Public domain', url: 'https://www.naturalearthdata.com' },
      { name: 'Eurostat MARNET (searoute-ts)', license: 'MIT / EUPL', url: 'https://github.com/johnx25bd/searoute' },
      { name: 'OpenFreeMap', license: 'OpenMapTiles / ODbL', url: 'https://openfreemap.org' },
    ],
  }));
}
