import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { closePool, exec, one, q } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed/index.js';
import { tick } from '../src/scheduler.js';

let app: FastifyInstance;

type Client = { cookie: string; id: number };

async function call(c: Client | null, method: string, url: string, body?: unknown) {
  const res = await app.inject({
    method: method as any,
    url: `/api${url}`,
    headers: { ...(c ? { cookie: c.cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    payload: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = res.json(); } catch { /* not json */ }
  return { status: res.statusCode, body: json, res };
}

async function register(username: string, point: [number, number], extra: Record<string, unknown> = {}): Promise<Client> {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({
      email: `${username}@example.com`, password: 'password123', username, displayName: username[0].toUpperCase() + username.slice(1),
      lang: 'ru', birthDate: '1990-05-05', acceptTerms: true, ...extra,
    }),
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = String(res.headers['set-cookie']).split(';')[0];
  const c = { cookie, id: res.json().id };
  await call(c, 'POST', '/me/location', { point });
  return c;
}

async function couriers(c: Client) {
  return (await call(c, 'GET', '/couriers')).body.couriers as any[];
}

async function befriend(a: Client, b: Client) {
  await call(a, 'POST', '/friends/request', { userId: b.id });
  const list = (await call(b, 'GET', '/friends')).body;
  const req = list.find((f: any) => f.user.id === a.id);
  expect((await call(b, 'POST', `/friends/${req.friendshipId}/accept`)).status).toBe(200);
}

const PALERMO: [number, number] = [13.3615, 38.1157];
const MOSCOW: [number, number] = [37.6173, 55.7558];
const VIENNA: [number, number] = [16.38, 48.21];

beforeAll(async () => {
  const tables = await q<any>('SHOW TABLES');
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) await exec(`DROP TABLE \`${Object.values(t)[0]}\``);
  await migrate(() => {});
  await seed(() => {});
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app?.close();
  await closePool();
});

describe('account', () => {
  it('registers adults with 3 starter couriers and a welcome letter', async () => {
    const a = await register('anna', PALERMO);
    const cs = await couriers(a);
    expect(cs.map((c) => c.type).sort()).toEqual(['pigeon', 'post', 'snail']);
    const mb = (await call(a, 'GET', '/mailbox')).body;
    expect(mb.letters[0].kind).toBe('welcome');
    expect(mb.letters[0].body).toContain('почтмейстер');
    const me = (await call(a, 'GET', '/me')).body;
    expect(me.semi).toBe(1); // ежедневный вход
    expect(me.tariffs).toEqual(['economy']);
  });

  it('refuses self-registration of children under 14', async () => {
    const r = await call(null, 'POST', '/auth/register', {
      email: 'kid@example.com', password: 'password123', username: 'kid1', displayName: 'Kid', lang: 'it', birthDate: '2016-01-01', acceptTerms: true,
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('child_must_be_created_by_parent');
  });

  it('logs in with password and with an email code', async () => {
    const bad = await call(null, 'POST', '/auth/login', { email: 'anna@example.com', password: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await call(null, 'POST', '/auth/login', { email: 'anna@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    await call(null, 'POST', '/auth/code/request', { email: 'anna@example.com' });
    const row = await one<any>('SELECT id FROM login_codes WHERE email = ? ORDER BY id DESC LIMIT 1', ['anna@example.com']);
    expect(row).toBeTruthy();
    // известный код подставляем напрямую в базу — письмо в тесте не отправляется
    const { sha256 } = await import('../src/lib/auth.js');
    await exec('UPDATE login_codes SET code_hash = ? WHERE id = ?', [sha256('123456'), row.id]);
    const v = await call(null, 'POST', '/auth/code/verify', { email: 'anna@example.com', code: '123456' });
    expect(v.status).toBe(200);
    const again = await call(null, 'POST', '/auth/code/verify', { email: 'anna@example.com', code: '123456' });
    expect(again.status).toBe(401);
  });
});

describe('letter lifecycle', () => {
  let alice: Client, boris: Client;
  let letterId: number;
  let arriveAt: string;

  beforeAll(async () => {
    alice = await register('alice', PALERMO);
    boris = await register('boris', MOSCOW);
  });

  it('strangers cannot write to someone who accepts only friends', async () => {
    await call(boris, 'PATCH', '/me', { whoCanWrite: 'friends' });
    const d = (await call(alice, 'POST', '/letters', { body: 'Ciao!' })).body;
    const pigeon = (await couriers(alice)).find((c) => c.type === 'pigeon');
    const r = await call(alice, 'POST', `/letters/${d.id}/send`, { courierId: pigeon.id, toId: boris.id });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('recipient_accepts_friends_only');
    await call(alice, 'DELETE', `/letters/${d.id}`);
  });

  it('quote shows the time before sending, and sending keeps it', async () => {
    await befriend(alice, boris);
    const draft = (await call(alice, 'POST', '/letters', { body: 'Привет из Палермо!', paper: 'paper_cream', font: 'caveat' })).body;
    letterId = draft.id;
    const pigeon = (await couriers(alice)).find((c) => c.type === 'pigeon');
    const qt = await call(alice, 'POST', '/letters/quote', { courierId: pigeon.id, toId: boris.id });
    expect(qt.status, JSON.stringify(qt.body)).toBe(200);
    expect(qt.body.distanceKm).toBeGreaterThan(2600);
    expect(qt.body.durationSec).toBeGreaterThan(2 * 86400);
    const sent = await call(alice, 'POST', `/letters/${letterId}/send`, { courierId: pigeon.id, toId: boris.id, quoteToken: qt.body.token });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    // время пути то же, что показали до отправки (сдвиг — только секунды между расчётом и отправкой)
    expect(Math.abs(Date.parse(sent.body.arriveAt) - Date.parse(qt.body.arriveAt))).toBeLessThan(60_000);
    arriveAt = sent.body.arriveAt;
    expect((await couriers(alice)).find((c) => c.type === 'pigeon').status).toBe('outbound');
  });

  it('recipient sees the incoming pigeon, but not the content', async () => {
    const mb = (await call(boris, 'GET', '/mailbox')).body;
    expect(mb.incoming).toHaveLength(1);
    expect(mb.incoming[0].courierType).toBe('pigeon');
    const l = await call(boris, 'GET', `/letters/${letterId}`);
    expect(l.status).toBe(404);
    const flight = await call(boris, 'GET', `/letters/${letterId}/flight`);
    expect(flight.status).toBe(404); // карту видит только отправитель
    const own = (await call(alice, 'GET', `/letters/${letterId}/flight`)).body;
    expect(own.timeline.length).toBeGreaterThan(2);
  });

  it('a busy courier cannot take another letter, but the letter can be queued', async () => {
    const d = (await call(alice, 'POST', '/letters', { body: 'Ещё одно' })).body;
    const pigeon = (await couriers(alice)).find((c) => c.type === 'pigeon');
    const r = await call(alice, 'POST', `/letters/${d.id}/send`, { courierId: pigeon.id, toId: boris.id });
    expect(r.status).toBe(409);
    const qd = await call(alice, 'POST', `/letters/${d.id}/queue`, { courierId: pigeon.id, toId: boris.id });
    expect(qd.status).toBe(200);
    const drafts = (await call(alice, 'GET', '/letters/drafts')).body;
    expect(drafts.find((x: any) => x.id === d.id).status).toBe('queued');
  });

  it('over-capacity letters are refused', async () => {
    const d = (await call(alice, 'POST', '/letters', { body: 'x'.repeat(300) })).body;
    const snail = (await couriers(alice)).find((c) => c.type === 'snail');
    const r = await call(alice, 'POST', `/letters/${d.id}/send`, { courierId: snail.id, toId: boris.id });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('over_capacity');
  });

  it('a letter can be recalled within 5 minutes', async () => {
    const d = (await call(alice, 'POST', '/letters', { body: 'Ой, не то' })).body;
    const post = (await couriers(alice)).find((c) => c.type === 'post');
    const s = await call(alice, 'POST', `/letters/${d.id}/send`, { courierId: post.id, toId: boris.id, tariff: 'economy' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const r = await call(alice, 'POST', `/letters/${d.id}/recall`);
    expect(r.status).toBe(200);
    const l = (await call(alice, 'GET', `/letters/${d.id}`)).body;
    expect(l.status).toBe('draft');
    expect((await couriers(alice)).find((c) => c.type === 'post').status).toBe('returning');
    await tick(new Date(Date.now() + 60_000));
    expect((await couriers(alice)).find((c) => c.type === 'post').status).toBe('home');
  });

  it('on arrival the letter is delivered, seeds awarded, and the courier waits', async () => {
    const semiBefore = (await call(alice, 'GET', '/me')).body.semi;
    await tick(new Date(Date.parse(arriveAt) + 1000));
    const mb = (await call(boris, 'GET', '/mailbox')).body;
    const got = mb.letters.find((l: any) => l.id === letterId);
    expect(got.body).toBe('Привет из Палермо!');
    expect(got.canReplyWithCourier).toBe(true);
    expect(got.postmarks.length).toBeGreaterThan(0);
    const semiAfter = (await call(alice, 'GET', '/me')).body.semi;
    expect(semiAfter - semiBefore).toBeGreaterThanOrEqual(26); // 1 за каждые 100 км
    expect((await couriers(alice)).find((c) => c.type === 'pigeon').status).toBe('waiting');
    const ach = (await call(alice, 'GET', '/album')).body.achievements;
    expect(ach.find((a: any) => a.code === 'first_letter').achievedAt).toBeTruthy();
  });

  it('read receipts follow the recipient setting', async () => {
    await call(boris, 'POST', `/letters/${letterId}/read`);
    expect((await call(alice, 'GET', `/letters/${letterId}`)).body.readAt).toBeTruthy();
    await call(boris, 'PATCH', '/me', { readReceipts: false });
    expect((await call(alice, 'GET', `/letters/${letterId}`)).body.readAt).toBeNull();
  });

  it('the recipient replies with a postcard via the same courier, which flies home', async () => {
    const r = await call(boris, 'POST', `/letters/${letterId}/postcard`, { text: 'Получил, отвечу позже!' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await couriers(alice)).find((c) => c.type === 'pigeon').status).toBe('returning');
    await tick(new Date(Date.parse(r.body.arriveAt) + 1000));
    const pigeon = (await couriers(alice)).find((c) => c.type === 'pigeon');
    // курьер вернулся, и очередь сразу отправила следующее письмо
    expect(pigeon.trips).toBe(2);
    expect(pigeon.status).toBe('outbound');
    const mb = (await call(alice, 'GET', '/mailbox')).body;
    expect(mb.letters.find((l: any) => l.kind === 'postcard').body).toBe('Получил, отвечу позже!');
  });

  it('a waiting courier returns home empty after the waiting period', async () => {
    const pigeon = (await couriers(alice)).find((c) => c.type === 'pigeon');
    const trip = await one<any>('SELECT end_at FROM trips WHERE id = ?', [pigeon.tripId]);
    await tick(new Date(new Date(trip.end_at).getTime() + 1000));
    expect((await couriers(alice)).find((c) => c.type === 'pigeon').status).toBe('waiting');
    await tick(new Date(Date.now() + 8 * 86400_000));
    const back = (await couriers(alice)).find((c) => c.type === 'pigeon');
    expect(back.status).toBe('returning');
    const t2 = await one<any>('SELECT end_at, start_at FROM trips WHERE id = ?', [back.tripId]);
    await tick(new Date(new Date(t2.end_at).getTime() + 1000));
    expect((await couriers(alice)).find((c) => c.type === 'pigeon').status).toBe('home');
  });
});

describe('postmaster onboarding', () => {
  it('replying to the welcome letter brings the pigeon back with a letter', async () => {
    const carol = await register('carol', VIENNA);
    const welcome = (await call(carol, 'GET', '/mailbox')).body.letters[0];
    const pigeon = (await couriers(carol)).find((c) => c.type === 'pigeon');
    const d = (await call(carol, 'POST', '/letters', { body: 'Здравствуйте, почтмейстер!', replyToId: welcome.id })).body;
    const s = await call(carol, 'POST', `/letters/${d.id}/send`, { courierId: pigeon.id, toId: welcome.from.id });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    await tick(new Date(Date.parse(s.body.arriveAt) + 1000));
    const p2 = (await couriers(carol)).find((c) => c.type === 'pigeon');
    expect(p2.status).toBe('returning');
    const trip = await one<any>('SELECT end_at FROM trips WHERE id = ?', [p2.tripId]);
    await tick(new Date(new Date(trip.end_at).getTime() + 1000));
    const mb = (await call(carol, 'GET', '/mailbox')).body;
    expect(mb.letters[0].from.username).toBe('postmaster');
    expect(mb.letters[0].body).toContain('Голубь');
  });
});

describe('children', () => {
  let parent: Client, child: Client, stranger: Client;

  beforeAll(async () => {
    parent = await register('papa', PALERMO);
    stranger = await register('stranger', ROME_PT);
  });

  it('parent creates a child profile and a device code', async () => {
    const r = await call(parent, 'POST', '/me/children', { displayName: 'Лиза', username: 'liza_kid', birthDate: '2017-03-03', lang: 'ru', consent: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const code = (await call(parent, 'POST', `/me/children/${r.body.id}/device-code`)).body.code;
    const login = await app.inject({ method: 'POST', url: '/api/auth/child-device', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ code }) });
    expect(login.statusCode).toBe(200);
    child = { cookie: String(login.headers['set-cookie']).split(';')[0], id: r.body.id };
    const me = (await call(child, 'GET', '/me')).body;
    expect(me.kind).toBe('child');
  });

  it('children cannot use pen-pal search or bottles, and are hidden from search', async () => {
    expect((await call(child, 'GET', '/penpals')).status).toBe(403);
    const found = (await call(stranger, 'GET', '/users/search?q=liza')).body;
    expect(found).toHaveLength(0);
    const p = (await call(stranger, 'GET', `/users/${child.id}`)).body;
    expect(p.restricted).toBe(true);
  });

  it('a stranger needs parent approval before writing to a child', async () => {
    const invite = (await call(child, 'GET', '/me')).body.inviteCode;
    expect((await call(stranger, 'POST', '/friends/request', { inviteCode: invite })).status).toBe(200);
    const d = (await call(stranger, 'POST', '/letters', { body: 'Привет!' })).body;
    const pigeon = (await couriers(stranger)).find((c) => c.type === 'pigeon');
    const r1 = await call(stranger, 'POST', `/letters/${d.id}/send`, { courierId: pigeon.id, toId: child.id });
    expect(r1.status).toBe(403);
    const reqs = (await call(parent, 'GET', '/me/children/requests')).body;
    expect(reqs).toHaveLength(1);
    await call(parent, 'POST', `/me/children/requests/${reqs[0].id}/approve`);
    const r2 = await call(stranger, 'POST', `/letters/${d.id}/send`, { courierId: pigeon.id, toId: child.id });
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
  });

  it("a child's location is shown no more precisely than the city", async () => {
    await call(child, 'POST', '/me/location', { point: [13.3620, 38.1160] });
    const p = (await call(stranger, 'GET', `/users/${child.id}`)).body;
    expect(p.location.city.ru).toBe('Палермо');
    expect(JSON.stringify(p.location)).not.toContain('38.116');
  });
});

describe('moderation and admin', () => {
  it('report → ban: a banned user cannot send couriers', async () => {
    const admin = await register('admin', PALERMO, { email: 'admin@example.com' });
    const troll = await register('troll', MOSCOW);
    const victim = await register('victim', PALERMO);
    expect((await call(victim, 'POST', '/reports', { userId: troll.id, reason: 'abuse', comment: 'грубит' })).status).toBe(200);
    expect((await call(victim, 'GET', '/admin/reports')).status).toBe(403);
    const reports = (await call(admin, 'GET', '/admin/reports')).body;
    expect(reports).toHaveLength(1);
    await call(admin, 'POST', `/admin/reports/${reports[0].id}/resolve`, { action: 'ban', banDays: 7, reason: 'abuse' });
    const d = await call(troll, 'POST', '/letters', { body: 'x' });
    expect(d.status).toBe(403);
    expect(d.body.error).toBe('banned');
    const stats = (await call(admin, 'GET', '/admin/stats')).body;
    expect(stats.users).toBeGreaterThan(5);
  });

  it('broadcast from the postmaster lands in every mailbox', async () => {
    const admin = await call(null, 'POST', '/auth/login', { email: 'admin@example.com', password: 'password123' });
    const cookie = String(admin.res.headers['set-cookie']).split(';')[0];
    const r = await call({ cookie, id: 0 }, 'POST', '/admin/broadcasts', { textRu: 'С Новым годом!', textIt: 'Buon anno!' });
    expect(r.body.recipients).toBeGreaterThan(5);
  });
});

describe('shop and couriers', () => {
  it('buying a courier needs seeds and a free slot', async () => {
    const u = await register('buyer', PALERMO);
    const r = await call(u, 'POST', '/couriers', { type: 'falcon' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('not_enough_semi');
    await exec('UPDATE users SET semi = 500 WHERE id = ?', [u.id]);
    expect((await call(u, 'POST', '/couriers', { type: 'falcon', name: 'Финист' })).status).toBe(200);
    expect((await call(u, 'POST', '/couriers', { type: 'owl' })).body.error).toBe('quest_not_completed');
    expect((await call(u, 'POST', '/couriers', { type: 'horse' })).status).toBe(409); // слоты кончились (4)
    expect((await call(u, 'POST', '/couriers/slots')).body.slots).toBe(5);
    expect((await call(u, 'POST', '/shop/buy', { code: 'tariff_air' })).status).toBe(200);
    expect((await call(u, 'GET', '/me')).body.tariffs).toContain('air');
  });
});

const ROME_PT: [number, number] = [12.48, 41.89];

describe('runtime settings in admin', () => {
  it('stores secrets encrypted and masked, applies values without restart', async () => {
    const login = await call(null, 'POST', '/auth/login', { email: 'admin@example.com', password: 'password123' });
    const admin = { cookie: String(login.res.headers['set-cookie']).split(';')[0], id: 0 };
    const user = await register('plainuser', PALERMO);
    expect((await call(user, 'GET', '/admin/settings')).status).toBe(403);

    const before = (await call(admin, 'GET', '/admin/settings')).body.items;
    expect(before.find((i: any) => i.key === 'smtpPass')).toMatchObject({ kind: 'secret', isSet: false });
    expect(before.find((i: any) => i.key === 'game.waitDays').value).toBe(7);

    const r = await call(admin, 'PUT', '/admin/settings', { values: {
      smtpHost: 'smtp.example.com', smtpUser: 'colomba', smtpPass: 'super-secret-1234', orsApiKey: 'ors-key-abcd',
      inviteOnly: true, adminEmails: 'boss@example.com, Admin@example.com', 'game.recallWindowMin': 0,
    } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const pass = r.body.items.find((i: any) => i.key === 'smtpPass');
    expect(pass).toMatchObject({ isSet: true, value: '••••1234', source: 'admin' });
    expect(r.body.mailConfigured).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('super-secret');
    const raw = await one<any>("SELECT v FROM settings WHERE k = 'runtime'");
    expect(JSON.stringify(raw.v)).not.toContain('super-secret');
    expect(r.body.items.find((i: any) => i.key === 'adminEmails').value).toEqual(['boss@example.com', 'admin@example.com']);

    // пустой секрет не затирает сохранённый
    await call(admin, 'PUT', '/admin/settings', { values: { smtpPass: '' } });
    expect((await call(admin, 'GET', '/admin/settings')).body.items.find((i: any) => i.key === 'smtpPass').isSet).toBe(true);

    // настройки действуют сразу: закрытая регистрация и окно отзыва 0 минут
    expect((await call(null, 'GET', '/auth/config')).body.inviteOnly).toBe(true);
    const reg = await call(null, 'POST', '/auth/register', {
      email: 'late@example.com', password: 'password123', username: 'late', displayName: 'Late', lang: 'ru', birthDate: '1990-01-01', acceptTerms: true,
    });
    expect(reg.body.error).toBe('invite_required');

    expect((await call(admin, 'PUT', '/admin/settings', { values: { 'game.lossChance': 5 } })).status).toBe(400);
    expect((await call(admin, 'PUT', '/admin/settings', { values: { nope: 1 } })).status).toBe(400);

    // сброс к .env
    const keys = ['smtpHost', 'smtpUser', 'smtpPass', 'orsApiKey', 'inviteOnly', 'adminEmails', 'game.recallWindowMin'];
    await call(admin, 'PUT', '/admin/settings', { values: Object.fromEntries(keys.map((k) => [k, null])) });
    const after = (await call(admin, 'GET', '/admin/settings')).body;
    expect(after.items.find((i: any) => i.key === 'inviteOnly')).toMatchObject({ value: false, source: 'env' });
    expect(after.items.find((i: any) => i.key === 'smtpPass').isSet).toBe(false);
    expect(after.mailConfigured).toBe(false);
  });
});
