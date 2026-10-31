import type { PoolConnection } from 'mysql2/promise';
import { exec, one } from '../db.js';
import { conflict } from '../lib/errors.js';

/** Зёрнышки (Semi) — единственная валюта, только зарабатывается. Каждое движение — в журнале. */
export async function award(
  userId: number,
  amount: number,
  reason: string,
  opts: { ref?: number | null; other?: number | null; conn?: PoolConnection } = {},
): Promise<void> {
  if (amount === 0) return;
  await exec('UPDATE users SET semi = semi + ? WHERE id = ?', [amount, userId], opts.conn);
  await exec(
    'INSERT INTO semi_ledger (user_id, amount, reason, ref_id, other_user_id) VALUES (?, ?, ?, ?, ?)',
    [userId, amount, reason, opts.ref ?? null, opts.other ?? null],
    opts.conn,
  );
}

export async function spend(userId: number, amount: number, reason: string, conn: PoolConnection, ref?: number): Promise<void> {
  if (amount <= 0) return;
  const res = await exec('UPDATE users SET semi = semi - ? WHERE id = ? AND semi >= ?', [amount, userId, amount], conn);
  if (res.affectedRows !== 1) throw conflict('not_enough_semi');
  await exec('INSERT INTO semi_ledger (user_id, amount, reason, ref_id) VALUES (?, ?, ?, ?)', [userId, -amount, reason, ref ?? null], conn);
}

/** Сколько наград данного типа уже получено сегодня за переписку с этим человеком (защита от фарма). */
export async function rewardsToday(userId: number, otherId: number, reason: string): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM semi_ledger WHERE user_id = ? AND other_user_id = ? AND reason = ? AND created_at >= UTC_DATE()`,
    [userId, otherId, reason],
  );
  return Number(r?.n ?? 0);
}
