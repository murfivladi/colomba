import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

function env(name: string, def?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (def === undefined) throw new Error(`Missing env ${name}`);
    return def;
  }
  return v;
}
const bool = (v: string) => ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

export const config = {
  port: Number(env('PORT', '8080')),
  host: env('HOST', '0.0.0.0'),
  /** Публичный адрес приложения (для ссылок в письмах, WebAuthn origin). */
  publicUrl: env('PUBLIC_URL', 'http://localhost:5173/colomba'),
  /** Префикс API: на хостинге /colomba/api проксируется на VPS как /api. */
  apiPrefix: env('API_PREFIX', '/api'),
  cookiePath: env('COOKIE_PATH', '/'),
  cookieSecure: bool(env('COOKIE_SECURE', 'false')),
  corsOrigins: env('CORS_ORIGINS', '').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '3306')),
    user: env('DB_USER', 'colomba'),
    password: env('DB_PASSWORD', 'colomba'),
    database: env('DB_NAME', 'colomba'),
  },
  mediaDir: path.resolve(env('MEDIA_DIR', path.join(SERVER_ROOT, 'media'))),
  dataDir: path.resolve(env('DATA_DIR', path.join(SERVER_ROOT, 'data'))),
  migrationsDir: path.resolve(env('MIGRATIONS_DIR', path.join(SERVER_ROOT, 'migrations'))),
  orsApiKey: env('ORS_API_KEY', ''),
  graphhopperKey: env('GRAPHHOPPER_API_KEY', ''),
  weatherEnabled: bool(env('WEATHER_ENABLED', 'true')),
  smtpUrl: env('SMTP_URL', ''),
  mailFrom: env('MAIL_FROM', 'Colomba <colomba@vladinc.ru>'),
  vapidPublic: env('VAPID_PUBLIC_KEY', ''),
  vapidPrivate: env('VAPID_PRIVATE_KEY', ''),
  vapidSubject: env('VAPID_SUBJECT', 'mailto:colomba@vladinc.ru'),
  adminEmails: env('ADMIN_EMAILS', '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  inviteOnly: bool(env('INVITE_ONLY', 'true')),
  schedulerIntervalMs: Number(env('SCHEDULER_INTERVAL_MS', '15000')),
  schedulerEnabled: bool(env('SCHEDULER_ENABLED', 'true')),
  rpName: 'Colomba',
  rpId: env('WEBAUTHN_RP_ID', 'localhost'),
  /** Для тестов: отключить случайность. */
  deterministic: bool(env('DETERMINISTIC', 'false')),
  rateLimit: bool(env('RATE_LIMIT', 'true')),
  /** HTTPS прямо в бэкенде (сертификат certbot, скопированный деплоем). Пусто — обычный HTTP. */
  tlsCertFile: env('TLS_CERT_FILE', ''),
  tlsKeyFile: env('TLS_KEY_FILE', ''),
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '8')),
  devLogCodes: bool(env('DEV_LOG_CODES', 'true')),
};
