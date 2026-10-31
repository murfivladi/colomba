import crypto from 'node:crypto';
import { GAME } from '@colomba/shared';
import { config } from '../config.js';
import { exec, one } from '../db.js';
import { bad } from '../lib/errors.js';

/**
 * Настройки, которые не нужны для запуска и меняются в админке без перезапуска:
 * почта (SMTP), ключи API, доступ, игровые параметры. Хранятся в таблице settings (k = 'runtime').
 * Приоритет: значение из админки → переменная окружения (.env) → значение по умолчанию.
 * Для запуска нужны только база, порт, TLS, CORS и cookie — они остаются в .env.
 */

export type SettingKind = 'string' | 'secret' | 'bool' | 'number' | 'list';
export type SettingGroup = 'mail' | 'apis' | 'access' | 'push' | 'game';

export interface SettingDef {
  key: string;
  group: SettingGroup;
  kind: SettingKind;
  /** Значение из .env/конфига, если в админке не задано. */
  fallback: () => unknown;
  min?: number;
  max?: number;
}

type GameKey = Exclude<keyof typeof GAME, 'slotPrice' | 'childAgeLimit'>;
// Порог детского режима (14 лет) задан законом — в админке не меняется.
const GAME_BOUNDS: Record<GameKey, [number, number]> = {
  startSlots: [1, 10],
  maxSlots: [1, 30],
  recallWindowMin: [0, 120],
  waitDays: [1, 60],
  lossChance: [0, 0.1],
  randomSpread: [0, 0.5],
  migrationBonus: [0, 0.5],
  maxExperienceBonus: [0, 0.5],
  experiencePerTrip: [0, 0.05],
  semiPer100Km: [0, 100],
  semiReply: [0, 100],
  semiLongCorrespondence: [0, 500],
  semiDailyLogin: [0, 100],
  rewardedRepliesPerPairPerDay: [0, 100],
  slowWarningDays: [1, 3650],
};
const GAME_DEFAULTS = { ...GAME } as Record<string, unknown>;

export const SETTING_DEFS: SettingDef[] = [
  { key: 'smtpHost', group: 'mail', kind: 'string', fallback: () => '' },
  { key: 'smtpPort', group: 'mail', kind: 'number', fallback: () => 465, min: 1, max: 65535 },
  { key: 'smtpSecure', group: 'mail', kind: 'bool', fallback: () => true },
  { key: 'smtpUser', group: 'mail', kind: 'string', fallback: () => '' },
  { key: 'smtpPass', group: 'mail', kind: 'secret', fallback: () => '' },
  { key: 'mailFrom', group: 'mail', kind: 'string', fallback: () => config.mailFrom },
  { key: 'devLogCodes', group: 'mail', kind: 'bool', fallback: () => config.devLogCodes },

  { key: 'orsApiKey', group: 'apis', kind: 'secret', fallback: () => config.orsApiKey },
  { key: 'graphhopperKey', group: 'apis', kind: 'secret', fallback: () => config.graphhopperKey },
  { key: 'weatherEnabled', group: 'apis', kind: 'bool', fallback: () => config.weatherEnabled },

  { key: 'inviteOnly', group: 'access', kind: 'bool', fallback: () => config.inviteOnly },
  { key: 'adminEmails', group: 'access', kind: 'list', fallback: () => config.adminEmails },
  { key: 'publicUrl', group: 'access', kind: 'string', fallback: () => config.publicUrl },

  { key: 'vapidSubject', group: 'push', kind: 'string', fallback: () => config.vapidSubject },

  ...(Object.keys(GAME_BOUNDS) as GameKey[]).map((k) => ({
    key: `game.${k}`, group: 'game' as const, kind: 'number' as const,
    fallback: () => GAME_DEFAULTS[k], min: GAME_BOUNDS[k][0], max: GAME_BOUNDS[k][1],
  })),
];

const DEF = new Map(SETTING_DEFS.map((d) => [d.key, d]));

// ── шифрование секретов в базе (дамп базы не раскрывает пароли и ключи) ──
function cipherKey(): Buffer {
  const base = process.env.SETTINGS_KEY || `colomba-settings:${config.db.password}`;
  return crypto.createHash('sha256').update(base).digest();
}
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')}`;
}
function decrypt(blob: string): string | null {
  try {
    const raw = Buffer.from(blob.replace(/^v1:/, ''), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null; // ключ сменился — считаем, что секрет не задан
  }
}

let stored: Record<string, unknown> = {};
const listeners: (() => void)[] = [];

export function onRuntimeChange(fn: () => void): void {
  listeners.push(fn);
}

function applyGame(): void {
  const g = GAME as unknown as Record<string, unknown>;
  for (const k of Object.keys(GAME_BOUNDS)) g[k] = get(`game.${k}`);
}

export async function loadRuntime(): Promise<void> {
  const row = await one<{ v: any }>("SELECT v FROM settings WHERE k = 'runtime'");
  stored = row ? (typeof row.v === 'string' ? JSON.parse(row.v) : row.v) : {};
  applyGame();
  for (const fn of listeners) fn();
}

/** Текущее значение настройки (синхронно, из памяти). */
export function get<T = unknown>(key: string): T {
  const def = DEF.get(key);
  if (!def) throw new Error(`unknown setting ${key}`);
  const v = stored[key];
  if (v === undefined || v === null) return def.fallback() as T;
  if (def.kind === 'secret') return (decrypt(String(v)) ?? def.fallback()) as T;
  return v as T;
}

export function source(key: string): 'admin' | 'env' | 'default' {
  if (stored[key] !== undefined && stored[key] !== null) return 'admin';
  // игровые параметры не читаются из .env — это значения по умолчанию из кода
  if (DEF.get(key)!.group === 'game') return 'default';
  const v = DEF.get(key)!.fallback();
  return v === '' || v === undefined || (Array.isArray(v) && v.length === 0) ? 'default' : 'env';
}

function mask(s: string): string {
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

/** Для админки: секреты не отдаются, только маска и признак «задано». */
export function describeSettings() {
  return SETTING_DEFS.map((d) => {
    const v = get(d.key);
    return {
      key: d.key, group: d.group, kind: d.kind, min: d.min, max: d.max, source: source(d.key),
      value: d.kind === 'secret' ? mask(String(v ?? '')) : v,
      isSet: d.kind === 'secret' ? !!v : undefined,
    };
  });
}

/**
 * Сохранить значения из админки. null — сбросить к .env/умолчанию;
 * для секретов пустая строка или отсутствие ключа — оставить как было.
 */
export async function saveSettings(values: Record<string, unknown>): Promise<void> {
  const next = { ...stored };
  for (const [key, raw] of Object.entries(values)) {
    const d = DEF.get(key);
    if (!d) throw bad('unknown_setting', key);
    if (raw === null) { delete next[key]; continue; }
    switch (d.kind) {
      case 'secret':
        if (typeof raw !== 'string') throw bad('invalid_setting', key);
        if (raw === '') continue;
        next[key] = encrypt(raw.trim());
        break;
      case 'string':
        if (typeof raw !== 'string' || raw.length > 500) throw bad('invalid_setting', key);
        next[key] = raw.trim();
        break;
      case 'bool':
        if (typeof raw !== 'boolean') throw bad('invalid_setting', key);
        next[key] = raw;
        break;
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n) || (d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max)) throw bad('invalid_setting', key);
        next[key] = n;
        break;
      }
      case 'list': {
        const arr = Array.isArray(raw) ? raw : String(raw).split(',');
        next[key] = arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
        break;
      }
    }
  }
  if (next.publicUrl) {
    try { new URL(String(next.publicUrl)); } catch { throw bad('invalid_setting', 'publicUrl'); }
  }
  await exec(
    "INSERT INTO settings (k, v) VALUES ('runtime', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
    [JSON.stringify(next)],
  );
  await loadRuntime();
}

/** Удобные геттеры для частых мест. */
export const rt = {
  orsApiKey: () => get<string>('orsApiKey'),
  graphhopperKey: () => get<string>('graphhopperKey'),
  weatherEnabled: () => get<boolean>('weatherEnabled'),
  inviteOnly: () => get<boolean>('inviteOnly'),
  adminEmails: () => get<string[]>('adminEmails'),
  publicUrl: () => get<string>('publicUrl').replace(/\/$/, ''),
  vapidSubject: () => get<string>('vapidSubject'),
  mailFrom: () => get<string>('mailFrom'),
  devLogCodes: () => get<boolean>('devLogCodes'),
};
