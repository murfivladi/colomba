import { courierName, eventText, MOUNTAIN_NAMES, notifyText, type Lang, type TripEvent } from '@colomba/shared';
import { exec, one } from '../db.js';
import { pushTo } from './push.js';
import { sendTo } from './sse.js';

interface NotifyOpts {
  courierType?: string | null;
  letterId?: number | null;
  /** Событие в пути: при включённой ежедневной сводке копится до утра. */
  tripEvent?: TripEvent;
  courierLabel?: string;
  url?: string;
  /** Не отправлять push (только в приложении). */
  silent?: boolean;
}

export async function userLang(userId: number): Promise<{ lang: Lang; digest: boolean; tripEvents: boolean } | null> {
  const u = await one<any>('SELECT lang, daily_digest, notify_trip_events FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  return u ? { lang: u.lang, digest: !!u.daily_digest, tripEvents: !!u.notify_trip_events } : null;
}

/** Параметры события на нужном языке (у городов и стран есть варианты *_it). */
function localizeParams(params: Record<string, string> | undefined, lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k.endsWith('_it')) continue;
    out[k] = lang === 'it' && params?.[`${k}_it`] ? params[`${k}_it`] : v;
  }
  if (out.mountains && MOUNTAIN_NAMES[out.mountains]) out.mountains = MOUNTAIN_NAMES[out.mountains][lang];
  return out;
}

export function renderNotification(type: string, params: Record<string, any>, lang: Lang, courierType?: string | null): string {
  const courier = params.courierName || (courierType ? courierName(courierType, lang) : '');
  if (type === 'trip_event') {
    const ev = params.event as TripEvent;
    return eventText({ ...ev, params: localizeParams(ev.params, lang) }, lang, courier);
  }
  return notifyText(type, lang, { courier, ...localizeParams(params, lang) });
}

/**
 * Уведомление: запись в базе (лента в приложении), SSE для открытого приложения
 * и Web Push, когда закрыто. Звук — голос курьера (клиент выбирает по courierType).
 */
export async function notify(userId: number, type: string, params: Record<string, any>, opts: NotifyOpts = {}): Promise<void> {
  const u = await userLang(userId);
  if (!u) return;
  if (type === 'trip_event' && !u.tripEvents) return;
  const p = { ...params, ...(opts.tripEvent ? { event: opts.tripEvent } : {}), ...(opts.courierLabel ? { courierName: opts.courierLabel } : {}) };
  const forDigest = u.digest && type === 'trip_event';
  const res = await exec(
    'INSERT INTO notifications (user_id, type, params, courier_type, letter_id, for_digest, pushed) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, type, JSON.stringify(p), opts.courierType ?? null, opts.letterId ?? null, forDigest ? 1 : 0, forDigest || opts.silent ? 0 : 1],
  );
  const text = renderNotification(type, p, u.lang, opts.courierType);
  sendTo(userId, 'notification', { id: res.insertId, type, text, courier: opts.courierType ?? null, letterId: opts.letterId ?? null });
  if (!forDigest && !opts.silent) {
    await pushTo(userId, {
      title: 'Colomba',
      body: text,
      courier: opts.courierType ?? null,
      url: opts.url ?? (opts.letterId ? `#/letter/${opts.letterId}` : '#/'),
      tag: opts.letterId ? `letter-${opts.letterId}` : type,
    });
  }
}
