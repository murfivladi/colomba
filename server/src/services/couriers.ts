import { GAME, isInSeason, type CourierTypeDef, type Lang } from '@colomba/shared';
import type { PoolConnection } from 'mysql2/promise';
import { exec, one, q, tx } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { courierType, courierTypes, postTariffs } from './catalog.js';
import { checkAchievements } from './progress.js';
import { spend } from './semi.js';

const DEFAULT_NAMES: Record<string, Record<Lang, string[]>> = {
  pigeon: { ru: ['Василий', 'Гоша', 'Пушок'], it: ['Gino', 'Piero', 'Bruno'] },
  falcon: { ru: ['Стриж', 'Финист'], it: ['Saetta', 'Freccia'] },
  albatross: { ru: ['Капитан'], it: ['Capitano'] },
  owl: { ru: ['Филя', 'Луна'], it: ['Gufetto', 'Luna'] },
  snail: { ru: ['Улита', 'Тихоня'], it: ['Lumachina', 'Calma'] },
  turtle: { ru: ['Тортилла'], it: ['Tartarughina'] },
  dogs: { ru: ['Упряжка Балто'], it: ['Muta Balto'] },
  dolphin: { ru: ['Плюх'], it: ['Spruzzo'] },
  horse: { ru: ['Буран'], it: ['Furia'] },
  sailboat: { ru: ['«Надежда»'], it: ['«Speranza»'] },
  airship: { ru: ['«Италия»'], it: ['«Norge»'] },
  bottle: { ru: ['Бутылка'], it: ['Bottiglia'] },
  post: { ru: ['Почта'], it: ['Posta'] },
  reindeer: { ru: ['Рудольф'], it: ['Rodolfo'] },
  stork: { ru: ['Аистёнок'], it: ['Cicognina'] },
};

export function defaultCourierName(code: string, lang: Lang): string {
  const list = DEFAULT_NAMES[code]?.[lang] ?? [code];
  return list[Math.floor(Math.random() * list.length)];
}

export interface CourierRow {
  id: number;
  owner_id: number;
  type_code: string;
  name: string;
  trips: number;
  km_total: number;
  status: 'home' | 'outbound' | 'waiting' | 'returning';
  current_trip_id: number | null;
  waiting_letter_id: number | null;
  waiting_until: Date | null;
}

export async function getCourier(id: number, conn?: PoolConnection): Promise<CourierRow | null> {
  return one<CourierRow>(`SELECT * FROM couriers WHERE id = ?${conn ? ' FOR UPDATE' : ''}`, [id], conn);
}

/** Старт: 3 курьера — голубь, улитка и «Почта» Эконом. */
export async function createStarterCouriers(userId: number, lang: Lang, conn?: PoolConnection): Promise<void> {
  for (const code of ['pigeon', 'snail', 'post']) {
    await exec('INSERT INTO couriers (owner_id, type_code, name) VALUES (?, ?, ?)', [userId, code, defaultCourierName(code, lang)], conn);
  }
}

export async function ownedCouriers(userId: number): Promise<any[]> {
  return q(
    `SELECT c.*, t.end_at AS trip_end_at, t.start_at AS trip_start_at, t.direction AS trip_direction
     FROM couriers c LEFT JOIN trips t ON t.id = c.current_trip_id
     WHERE c.owner_id = ? ORDER BY c.created_at`,
    [userId],
  );
}

export async function questsDone(userId: number): Promise<Set<string>> {
  return new Set((await q<any>('SELECT quest FROM user_quests WHERE user_id = ?', [userId])).map((r) => r.quest));
}

export type UnlockState = 'owned' | 'available' | 'buy' | 'locked' | 'out_of_season';

/** Состояние курьера в каталоге для пользователя: открыт, можно купить, закрыт заданием. */
export async function catalogFor(userId: number): Promise<{ type: CourierTypeDef; state: UnlockState; count: number }[]> {
  const types = (await courierTypes()).filter((t) => t.enabled);
  const owned = await q<any>('SELECT type_code, COUNT(*) AS n FROM couriers WHERE owner_id = ? GROUP BY type_code', [userId]);
  const counts = new Map(owned.map((r) => [r.type_code, Number(r.n)]));
  const quests = await questsDone(userId);
  const now = new Date();
  return types.map((t) => {
    const count = counts.get(t.code) ?? 0;
    let state: UnlockState;
    if (t.unlock.kind === 'start') state = 'available';
    else if (t.unlock.kind === 'semi') state = 'buy';
    else if (t.unlock.kind === 'quest') state = quests.has(t.unlock.quest) ? 'available' : 'locked';
    else state = isInSeason({ seasonMonths: t.unlock.months }, now) ? 'available' : 'out_of_season';
    if (count > 0 && state !== 'buy') state = 'owned';
    return { type: t, state, count };
  });
}

/** Получить курьера: стартовый/заработанный — бесплатно, обычный — за зёрнышки. Нужен свободный слот. */
export async function acquireCourier(userId: number, code: string, name: string | undefined, lang: Lang): Promise<number> {
  const t = await courierType(code);
  if (!t || !t.enabled) throw notFound('courier_type_not_found');
  const quests = await questsDone(userId);
  // сначала — можно ли вообще получить этого курьера, потом — есть ли слот
  if (t.unlock.kind === 'quest' && !quests.has(t.unlock.quest)) throw forbidden('quest_not_completed');
  if (t.unlock.kind === 'season' && !isInSeason({ seasonMonths: t.unlock.months }, new Date())) throw forbidden('out_of_season');
  const id = await tx(async (c) => {
    const u = await one<any>('SELECT slots FROM users WHERE id = ? FOR UPDATE', [userId], c);
    const n = await one<any>('SELECT COUNT(*) AS n FROM couriers WHERE owner_id = ?', [userId], c);
    if (Number(n.n) >= u.slots) throw conflict('no_free_slot');
    const already = await one<any>('SELECT COUNT(*) AS n FROM couriers WHERE owner_id = ? AND type_code = ?', [userId, code], c);
    switch (t.unlock.kind) {
      case 'start':
        if (Number(already.n) > 0) throw conflict('already_owned');
        break;
      case 'semi':
        await spend(userId, t.unlock.price, 'courier', c);
        break;
      case 'quest':
        if (!quests.has(t.unlock.quest)) throw forbidden('quest_not_completed');
        if (Number(already.n) > 0) throw conflict('already_owned');
        break;
      case 'season':
        if (!isInSeason({ seasonMonths: t.unlock.months }, new Date())) throw forbidden('out_of_season');
        if (Number(already.n) > 0) throw conflict('already_owned');
        break;
    }
    const nm = (name ?? '').trim().slice(0, 40) || defaultCourierName(code, lang);
    const res = await exec('INSERT INTO couriers (owner_id, type_code, name) VALUES (?, ?, ?)', [userId, code, nm], c);
    return res.insertId;
  });
  await checkAchievements(userId);
  return id;
}

/** Новый слот за зёрнышки (максимум 10). */
export async function buySlot(userId: number): Promise<number> {
  return tx(async (c) => {
    const u = await one<any>('SELECT slots FROM users WHERE id = ? FOR UPDATE', [userId], c);
    if (u.slots >= GAME.maxSlots) throw conflict('max_slots');
    await spend(userId, GAME.slotPrice(u.slots + 1), 'slot', c);
    await exec('UPDATE users SET slots = slots + 1 WHERE id = ?', [userId], c);
    return u.slots + 1;
  });
}

/** Отпустить курьера (освободить слот) — только если он дома. */
export async function releaseCourier(userId: number, courierId: number): Promise<void> {
  const c = await getCourier(courierId);
  if (!c || c.owner_id !== userId) throw notFound();
  if (c.status !== 'home') throw conflict('courier_busy');
  const n = await one<any>('SELECT COUNT(*) AS n FROM couriers WHERE owner_id = ?', [userId]);
  if (Number(n.n) <= 1) throw bad('last_courier');
  await exec("UPDATE letters SET courier_id = NULL, status = 'draft' WHERE courier_id = ? AND status IN ('queued','scheduled')", [courierId]);
  await exec('DELETE FROM couriers WHERE id = ?', [courierId]);
}

/** Тарифы «Почты», доступные пользователю: Эконом всегда, остальные — купленные. */
export async function ownedTariffs(userId: number): Promise<string[]> {
  const items = await q<any>("SELECT item_code FROM user_items WHERE user_id = ? AND item_code LIKE 'tariff_%'", [userId]);
  const all = await postTariffs();
  const bought = new Set(items.map((i) => i.item_code.replace('tariff_', '')));
  return all.filter((t) => t.unlock.kind === 'start' || bought.has(t.code)).map((t) => t.code);
}
