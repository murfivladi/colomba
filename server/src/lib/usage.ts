import { exec } from '../db.js';

/** Учёт расхода внешних API (видно в статистике админки). */
export async function countUsage(service: string, ok = true): Promise<void> {
  try {
    await exec(
      `INSERT INTO api_usage (day, service, count, errors) VALUES (UTC_DATE(), ?, 1, ?)
       ON DUPLICATE KEY UPDATE count = count + 1, errors = errors + VALUES(errors)`,
      [service, ok ? 0 : 1],
    );
  } catch {
    /* статистика не должна ломать доставку */
  }
}
