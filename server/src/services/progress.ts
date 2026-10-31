import { courierName, type QuestCode } from '@colomba/shared';
import { exec, one, q } from '../db.js';
import { courierTypes } from './catalog.js';
import { notify } from './notify.js';
import { award } from './semi.js';

/** Статистика пользователя для достижений. */
async function stats(userId: number): Promise<Record<string, number>> {
  const u = await one<any>('SELECT letters_sent, km_total FROM users WHERE id = ?', [userId]);
  const countries = await one<any>(
    `SELECT COUNT(DISTINCT p.country) AS n FROM postmarks p JOIN letters l ON l.id = p.letter_id
     WHERE (l.from_id = ? OR l.to_id = ?) AND l.status = 'delivered' AND p.stamped_at <= UTC_TIMESTAMP()`,
    [userId, userId],
  );
  const postmarks = await one<any>(
    `SELECT COUNT(*) AS n FROM postmarks p JOIN letters l ON l.id = p.letter_id
     WHERE (l.from_id = ? OR l.to_id = ?) AND l.status = 'delivered'`,
    [userId, userId],
  );
  const couriers = await one<any>('SELECT COUNT(DISTINCT type_code) AS n FROM couriers WHERE owner_id = ?', [userId]);
  const variety = await one<any>(
    `SELECT COUNT(DISTINCT courier_type) AS n FROM letters WHERE from_id = ? AND status IN ('in_transit','delivered','lost')`,
    [userId],
  );
  const corr = await one<any>(
    `SELECT MAX(n) AS n FROM (
       SELECT LEAST(from_id, to_id) a, GREATEST(from_id, to_id) b, COUNT(*) n FROM letters
       WHERE (from_id = ? OR to_id = ?) AND to_id IS NOT NULL AND status = 'delivered' GROUP BY a, b) x`,
    [userId, userId],
  );
  const quests = await q<any>('SELECT quest FROM user_quests WHERE user_id = ?', [userId]);
  const night = await one<any>(`SELECT COUNT(*) AS n FROM letters WHERE from_id = ? AND night_sent = 1 AND status IN ('in_transit','delivered','lost')`, [userId]);
  const bottles = await one<any>(`SELECT COUNT(*) AS n FROM letters WHERE to_id = ? AND is_bottle = 1 AND status = 'delivered'`, [userId]);
  return {
    letters_sent: Number(u?.letters_sent ?? 0),
    km: Number(u?.km_total ?? 0),
    countries: Number(countries?.n ?? 0),
    postmarks: Number(postmarks?.n ?? 0),
    couriers: Number(couriers?.n ?? 0),
    courier_variety: Number(variety?.n ?? 0),
    correspondence: Number(corr?.n ?? 0),
    night_letters: Number(night?.n ?? 0),
    ocean: quests.some((x) => x.quest === 'ocean_letter') ? 1 : 0,
    bottle_caught: Number(bottles?.n ?? 0),
  };
}

/** Проверяет и выдаёт новые достижения (с наградой зёрнышками). */
export async function checkAchievements(userId: number): Promise<string[]> {
  const st = await stats(userId);
  const all = await q<any>('SELECT * FROM achievements WHERE enabled = 1');
  const have = new Set((await q<any>('SELECT code FROM user_achievements WHERE user_id = ?', [userId])).map((r) => r.code));
  const got: string[] = [];
  for (const a of all) {
    if (have.has(a.code)) continue;
    const v = st[a.category];
    if (v === undefined || v < Number(a.threshold)) continue;
    const res = await exec('INSERT IGNORE INTO user_achievements (user_id, code) VALUES (?, ?)', [userId, a.code]);
    if (res.affectedRows !== 1) continue;
    got.push(a.code);
    await award(userId, a.reward, 'achievement');
    await notify(userId, 'achievement', { name: a.name_ru, name_it: a.name_it });
  }
  return got;
}

/**
 * Задание выполнено: редкий курьер становится доступен (забрать — в каталоге, если есть слот).
 */
export async function completeQuest(userId: number, quest: QuestCode): Promise<boolean> {
  const res = await exec('INSERT IGNORE INTO user_quests (user_id, quest) VALUES (?, ?)', [userId, quest]);
  if (res.affectedRows !== 1) return false;
  const types = await courierTypes();
  for (const t of types) {
    if (t.unlock.kind === 'quest' && t.unlock.quest === quest) {
      await notify(userId, 'courier_unlocked', { courier: courierName(t.code, 'ru'), courier_it: courierName(t.code, 'it') }, { courierType: t.code });
    }
  }
  return true;
}

/** Задания, которые зависят от накопленной статистики. */
export async function checkQuests(userId: number): Promise<void> {
  const u = await one<any>('SELECT letters_sent, km_total FROM users WHERE id = ?', [userId]);
  if (!u) return;
  if (u.letters_sent >= 5) await completeQuest(userId, 'letters_5');
  if (u.km_total >= 5000) await completeQuest(userId, 'distance_5000');
  const corr = await one<any>(
    `SELECT MAX(n) AS n FROM (
       SELECT LEAST(from_id, to_id) a, GREATEST(from_id, to_id) b, COUNT(*) n FROM letters
       WHERE (from_id = ? OR to_id = ?) AND to_id IS NOT NULL AND status = 'delivered' GROUP BY a, b) x`,
    [userId, userId],
  );
  if (Number(corr?.n ?? 0) >= 10) await completeQuest(userId, 'long_correspondence');
}
