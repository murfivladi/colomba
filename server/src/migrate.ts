import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { exec, q } from './db.js';

/** Делит SQL-файл на операторы (без поддержки DELIMITER — он не нужен). */
export function splitSql(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ''))
    .filter(Boolean);
}

export async function migrate(log: (m: string) => void = console.log): Promise<void> {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const done = new Set((await q<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await fs.readdir(config.migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(config.migrationsDir, f), 'utf8');
    for (const stmt of splitSql(sql)) await exec(stmt);
    await exec('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
    log(`migration applied: ${f}`);
  }
}
