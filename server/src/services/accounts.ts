import type { Lang } from '@colomba/shared';
import { exec, one, pointWkt, tx } from '../db.js';
import { newInviteCode } from '../lib/auth.js';
import { conflict } from '../lib/errors.js';
import { createStarterCouriers } from './couriers.js';

export const POSTMASTER_USERNAME = 'postmaster';
/** Почтовая станция почтмейстера — Вена, между Италией и Россией. */
export const POSTMASTER_HOME: [number, number] = [16.3721, 48.2085];

export const WELCOME_TEXT: Record<Lang, string> = {
  ru:
    'Добро пожаловать в Colomba!\n\nЯ — старый почтмейстер. Здесь письма не летят мгновенно: каждое несёт настоящий курьер, ' +
    'и идёт оно ровно столько, сколько шёл бы он сам — с ночёвками, ветром и непогодой.\n\n' +
    'Попробуйте ответить мне. Ваш голубь прилетит на мою почтовую станцию в Вене, а я отправлю его обратно с открыткой.\n\n' +
    'И ещё: установите Colomba на экран телефона («Поделиться» → «На экран „Домой“»). Без этого iPhone не покажет уведомления о прилёте курьеров.\n\n' +
    'Никто не ждёт ответа мгновенно. Пишите не спеша.',
  it:
    'Benvenuto in Colomba!\n\nSono il vecchio mastro postino. Qui le lettere non volano all’istante: ognuna è portata da un vero corriere, ' +
    'e viaggia esattamente quanto viaggerebbe lui, con le soste per la notte, il vento e il maltempo.\n\n' +
    'Prova a rispondermi. Il tuo piccione arriverà alla mia stazione postale a Vienna e te lo rimanderò con una cartolina.\n\n' +
    'Ancora una cosa: installa Colomba sulla schermata del telefono («Condividi» → «Aggiungi alla schermata Home»). Senza questo l’iPhone non mostra le notifiche dei corrieri.\n\n' +
    'Nessuno aspetta una risposta immediata. Scrivi con calma.',
};

export const POSTMASTER_REPLY: Record<Lang, string> = {
  ru: 'Получил ваше письмо — прекрасный почерк! Голубь отдохнул и летит домой. Теперь вы знаете, как всё устроено. Удачной переписки!',
  it: 'Ho ricevuto la tua lettera: che bella calligrafia! Il piccione si è riposato e torna a casa. Ora sai come funziona. Buona corrispondenza!',
};

export async function ensurePostmaster(): Promise<number> {
  const u = await one<{ id: number }>('SELECT id FROM users WHERE username = ?', [POSTMASTER_USERNAME]);
  if (u) return Number(u.id);
  const res = await exec(
    `INSERT INTO users (username, display_name, avatar, lang, kind, role, invite_code, who_can_write, onboarded, country, bio)
     VALUES (?, 'Почтмейстер · Mastro postino', 'postmaster', 'ru', 'adult', 'user', ?, 'everyone', 1, 'AT', '')`,
    [POSTMASTER_USERNAME, 'postmstr'],
  );
  await exec('INSERT INTO locations (user_id, pt, lon, lat) VALUES (?, ST_GeomFromText(?), ?, ?)', [
    res.insertId, pointWkt(POSTMASTER_HOME[0], POSTMASTER_HOME[1]), POSTMASTER_HOME[0], POSTMASTER_HOME[1],
  ]);
  return res.insertId;
}

export async function usernameTaken(username: string): Promise<boolean> {
  return !!(await one('SELECT 1 FROM users WHERE username = ?', [username]));
}

/** Первое письмо прилетает от почтмейстера и учит отвечать. */
export async function sendWelcome(userId: number, lang: Lang): Promise<void> {
  const pm = await ensurePostmaster();
  await exec(
    `INSERT INTO letters (from_id, to_id, kind, body, paper, font, stamp, courier_type, status, sent_at, arrive_at, delivered_at,
       origin_lon, origin_lat, distance_km)
     VALUES (?, ?, 'welcome', ?, 'paper_parchment', 'bad_script', 'stamp_colomba', 'pigeon', 'delivered', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?, 0)`,
    [pm, userId, WELCOME_TEXT[lang], POSTMASTER_HOME[0], POSTMASTER_HOME[1]],
  );
  await exec('UPDATE users SET letters_received = letters_received + 1 WHERE id = ?', [userId]);
}

export interface NewAccount {
  email: string | null;
  passwordHash: string | null;
  username: string;
  displayName: string;
  lang: Lang;
  birthDate: string | null;
  kind: 'adult' | 'child';
  parentId?: number | null;
  role?: 'user' | 'admin';
  timezone?: string;
}

export async function createAccount(a: NewAccount): Promise<number> {
  if (await usernameTaken(a.username)) throw conflict('username_taken');
  if (a.email && (await one('SELECT 1 FROM users WHERE email = ?', [a.email]))) throw conflict('email_taken');
  const id = await tx(async (c) => {
    const res = await exec(
      `INSERT INTO users (email, password_hash, username, display_name, lang, birth_date, kind, parent_id, role, invite_code, timezone,
         who_can_write, penpal_enabled, bottle_enabled, location_precision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.email, a.passwordHash, a.username, a.displayName, a.lang, a.birthDate, a.kind, a.parentId ?? null, a.role ?? 'user',
        newInviteCode(), a.timezone ?? (a.lang === 'it' ? 'Europe/Rome' : 'Europe/Moscow'),
        a.kind === 'child' ? 'friends' : 'friends_penpals', 0, a.kind === 'child' ? 0 : 1, 'city',
      ],
      c,
    );
    await createStarterCouriers(res.insertId, a.lang, c);
    return res.insertId;
  });
  await sendWelcome(id, a.lang);
  return id;
}

/**
 * Удаление аккаунта: письма остаются у получателей, автор анонимизируется.
 * Удаляются вход, местоположение, подписки, курьеры, черновики.
 */
export async function deleteAccount(userId: number): Promise<void> {
  await tx(async (c) => {
    await exec(
      `UPDATE users SET email = NULL, password_hash = NULL, username = CONCAT('deleted_', id), display_name = '—', avatar = 'ghost',
         bio = '', birth_date = NULL, languages = NULL, country = NULL, deleted_at = UTC_TIMESTAMP(), penpal_enabled = 0, bottle_enabled = 0
       WHERE id = ?`,
      [userId],
      c,
    );
    for (const t of ['sessions', 'passkeys', 'locations', 'push_subscriptions', 'user_interests', 'notifications']) {
      await exec(`DELETE FROM ${t} WHERE user_id = ?`, [userId], c);
    }
    await exec('DELETE FROM friendships WHERE user_a = ? OR user_b = ?', [userId, userId], c);
    await exec("DELETE FROM letters WHERE from_id = ? AND status IN ('draft','scheduled','queued')", [userId], c);
    await exec("DELETE FROM couriers WHERE owner_id = ? AND status = 'home'", [userId], c);
  });
  // дети удаляются вместе с родителем
  const kids = await one<{ ids: string }>("SELECT GROUP_CONCAT(id) AS ids FROM users WHERE parent_id = ? AND deleted_at IS NULL", [userId]);
  for (const k of (kids?.ids ?? '').split(',').filter(Boolean)) await deleteAccount(Number(k));
}
