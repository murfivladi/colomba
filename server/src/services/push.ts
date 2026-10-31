import webpush from 'web-push';
import { config } from '../config.js';
import { onRuntimeChange, rt } from './runtime.js';
import { exec, one, q } from '../db.js';

let ready: Promise<string | null> | null = null;
// сменили контакт VAPID в админке — переинициализируем при следующей отправке
onRuntimeChange(() => { ready = null; });

/** VAPID-ключи: из переменных окружения или сгенерированные один раз и сохранённые в settings. */
export function vapidPublicKey(): Promise<string | null> {
  if (!ready) ready = init();
  return ready;
}

async function init(): Promise<string | null> {
  let pub = config.vapidPublic;
  let priv = config.vapidPrivate;
  if (!pub || !priv) {
    const row = await one<{ v: any }>("SELECT v FROM settings WHERE k = 'vapid'");
    if (row) {
      const v = typeof row.v === 'string' ? JSON.parse(row.v) : row.v;
      pub = v.publicKey;
      priv = v.privateKey;
    } else {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      await exec("INSERT INTO settings (k, v) VALUES ('vapid', ?)", [JSON.stringify(keys)]);
    }
  }
  webpush.setVapidDetails(rt.vapidSubject(), pub, priv);
  return pub;
}

export interface PushPayload {
  title: string;
  body: string;
  courier?: string | null;
  url?: string;
  tag?: string;
}

/** Web Push на все устройства пользователя; протухшие подписки удаляются. */
export async function pushTo(userId: number, payload: PushPayload): Promise<number> {
  if (!(await vapidPublicKey())) return 0;
  const subs = await q<any>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600 },
      );
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await exec('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
    }
  }
  return sent;
}
