import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { get, rt } from '../services/runtime.js';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
let signature = '';

/**
 * Транспорт почты: SMTP из админки, иначе SMTP_URL из .env, иначе — нет почты
 * (тогда, если включено, код входа пишется в лог сервера).
 */
function currentTransport(): ReturnType<typeof nodemailer.createTransport> | null {
  const host = get<string>('smtpHost');
  const opts = host
    ? {
        host,
        port: get<number>('smtpPort'),
        secure: get<boolean>('smtpSecure'),
        auth: get<string>('smtpUser') ? { user: get<string>('smtpUser'), pass: get<string>('smtpPass') } : undefined,
      }
    : config.smtpUrl || null;
  if (!opts) return null;
  const sig = JSON.stringify(opts);
  if (!transport || sig !== signature) {
    transport = nodemailer.createTransport(opts as any);
    signature = sig;
  }
  return transport;
}

export function mailConfigured(): boolean {
  return !!(get<string>('smtpHost') || config.smtpUrl);
}

/** Письма со ссылкой или кодом для входа. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const t = currentTransport();
  if (!t) {
    if (rt.devLogCodes()) console.log(`[mail to ${to}] ${subject}\n${text}`);
    return;
  }
  await t.sendMail({ from: rt.mailFrom(), to, subject, text });
}

/** Проверка из админки: соединение с SMTP и тестовое письмо. */
export async function testMail(to: string): Promise<void> {
  const t = currentTransport();
  if (!t) throw new Error('smtp_not_configured');
  await t.verify();
  await t.sendMail({ from: rt.mailFrom(), to, subject: 'Colomba: проверка почты · prova email', text: 'SMTP работает. · SMTP funziona.' });
}
