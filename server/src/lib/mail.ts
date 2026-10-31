import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Письма со ссылкой или кодом для входа. Без SMTP в разработке код пишется в лог. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!config.smtpUrl) {
    if (config.devLogCodes) console.log(`[mail to ${to}] ${subject}\n${text}`);
    return;
  }
  transport ??= nodemailer.createTransport(config.smtpUrl);
  await transport.sendMail({ from: config.mailFrom, to, subject, text });
}
