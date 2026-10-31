import { type TripEvent } from '@colomba/shared';
import { config } from './config.js';
import { exec, q } from './db.js';
import { pushTo } from './services/push.js';
import { notify, renderNotification } from './services/notify.js';
import { completeTrip, releaseScheduled, returnEmpty } from './services/letters.js';
import { parseEvents } from './services/trips.js';

/** События, о которых сообщаем отправителю (ночёвки — только у курьеров-животных и птиц). */
const NOTIFY_EVENTS = new Set<TripEvent['type']>(['border', 'mountains', 'storm', 'city', 'sea_start', 'night_rest']);

/**
 * Планировщик: выпускает события по заранее рассчитанному расписанию полёта.
 * Позицию курьера на карте браузер считает сам по шкале рейса.
 */
export async function tick(now = new Date()): Promise<void> {
  // 1. события в пути
  const active = await q<any>(
    `SELECT t.id, t.letter_id, t.start_at, t.events, t.next_event_idx, t.courier_id, c.type_code, c.name, l.from_id
     FROM trips t JOIN couriers c ON c.id = t.courier_id LEFT JOIN letters l ON l.id = t.letter_id
     WHERE t.status = 'active' AND t.letter_id IS NOT NULL`,
  );
  for (const t of active) {
    const events = parseEvents(t);
    const elapsed = (now.getTime() - new Date(t.start_at).getTime()) / 1000;
    let idx = t.next_event_idx;
    const due: TripEvent[] = [];
    while (idx < events.length && events[idx].t <= elapsed) due.push(events[idx++]);
    if (idx === t.next_event_idx) continue;
    const upd = await exec('UPDATE trips SET next_event_idx = ? WHERE id = ? AND next_event_idx = ?', [idx, t.id, t.next_event_idx]);
    if (upd.affectedRows !== 1) continue;
    // если планировщик отставал — сообщаем только о последнем событии, без лавины
    const interesting = due.filter((e) => NOTIFY_EVENTS.has(e.type));
    const ev = interesting[interesting.length - 1];
    if (ev && t.from_id) {
      await notify(t.from_id, 'trip_event', {}, { tripEvent: ev, courierType: t.type_code, courierLabel: t.name, letterId: t.letter_id, url: `#/flight/${t.letter_id}` });
    }
  }

  // 2. завершённые рейсы: доставка, возвращение
  const ended = await q<any>("SELECT id FROM trips WHERE status = 'active' AND end_at <= ? ORDER BY end_at LIMIT 200", [now]);
  for (const t of ended) {
    try {
      await completeTrip(t.id);
    } catch (e) {
      console.error('completeTrip', t.id, e);
    }
  }

  // 3. курьер не дождался ответа — летит домой
  const waiting = await q<any>("SELECT id FROM couriers WHERE status = 'waiting' AND waiting_until <= ? LIMIT 200", [now]);
  for (const c of waiting) await returnEmpty(c.id);

  // 4. письма по расписанию
  const scheduled = await q<any>("SELECT * FROM letters WHERE status = 'scheduled' AND release_at <= ? LIMIT 100", [now]);
  for (const l of scheduled) await releaseScheduled(l);

  // 5. утренняя сводка вместо многих уведомлений
  await sendDigests(now);
}

async function sendDigests(now: Date): Promise<void> {
  const users = await q<any>(
    `SELECT id, lang, timezone, last_digest_day FROM users WHERE daily_digest = 1 AND deleted_at IS NULL`,
  );
  for (const u of users) {
    let hour: number;
    let day: string;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: u.timezone, hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
      const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
      hour = Number(parts.hour);
      day = `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
      continue;
    }
    const last = u.last_digest_day ? new Date(u.last_digest_day).toISOString().slice(0, 10) : null;
    if (hour !== 8 || last === day) continue;
    const pending = await q<any>('SELECT id, type, params, courier_type FROM notifications WHERE user_id = ? AND for_digest = 1 AND pushed = 0', [u.id]);
    await exec('UPDATE users SET last_digest_day = ? WHERE id = ?', [day, u.id]);
    if (!pending.length) continue;
    await exec('UPDATE notifications SET pushed = 1 WHERE user_id = ? AND for_digest = 1 AND pushed = 0', [u.id]);
    const lines = pending.slice(-3).map((n) => renderNotification(n.type, typeof n.params === 'string' ? JSON.parse(n.params) : n.params, u.lang, n.courier_type));
    await pushTo(u.id, {
      title: renderNotification('digest', { count: String(pending.length) }, u.lang),
      body: lines.join('\n'),
      url: '#/notifications',
      tag: 'digest',
    });
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startScheduler(): void {
  if (!config.schedulerEnabled || timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (e) {
      console.error('scheduler', e);
    } finally {
      running = false;
    }
  };
  timer = setInterval(run, config.schedulerIntervalMs);
  void run();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
