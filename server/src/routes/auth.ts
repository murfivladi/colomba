import type { FastifyInstance } from 'fastify';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { GAME } from '@colomba/shared';
import { config } from '../config.js';
import { exec, one, q } from '../db.js';
import {
  ageYears, createSession, destroySession, hashPassword, randomToken, requireUser, sha256, verifyPassword,
} from '../lib/auth.js';
import { bad, conflict, forbidden, HttpError } from '../lib/errors.js';
import { sendMail } from '../lib/mail.js';
import { createAccount } from '../services/accounts.js';

const USERNAME = z.string().regex(/^[a-zA-Z0-9_.]{3,32}$/);
const LANG = z.enum(['ru', 'it']);

const origin = () => new URL(config.publicUrl).origin;

async function consumeInvite(code: string | undefined): Promise<void> {
  if (!config.inviteOnly) return;
  if (!code) throw forbidden('invite_required');
  // приглашение — личная ссылка пользователя или код, выданный администратором
  const personal = await one('SELECT id FROM users WHERE invite_code = ? AND deleted_at IS NULL', [code]);
  if (personal) return;
  const res = await exec('UPDATE invites SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0', [code]);
  if (res.affectedRows !== 1) throw forbidden('invite_invalid');
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = z
      .object({
        email: z.string().email().max(255),
        password: z.string().min(8).max(200),
        username: USERNAME,
        displayName: z.string().min(1).max(64),
        lang: LANG,
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        invite: z.string().max(32).optional(),
        timezone: z.string().max(64).optional(),
        acceptTerms: z.literal(true),
      })
      .parse(req.body);
    // дети до 14 лет сами не регистрируются — профиль создаёт родитель
    if (ageYears(new Date(b.birthDate)) < GAME.childAgeLimit) throw forbidden('child_must_be_created_by_parent');
    await consumeInvite(b.invite);
    const email = b.email.toLowerCase();
    const id = await createAccount({
      email,
      passwordHash: await hashPassword(b.password),
      username: b.username,
      displayName: b.displayName,
      lang: b.lang,
      birthDate: b.birthDate,
      kind: 'adult',
      role: config.adminEmails.includes(email) ? 'admin' : 'user',
      timezone: b.timezone,
    });
    // приглашение по личной ссылке сразу делает друзьями
    if (b.invite) {
      const inviter = await one<any>('SELECT id, kind FROM users WHERE invite_code = ?', [b.invite]);
      if (inviter && inviter.kind === 'adult') {
        const [a, c] = inviter.id < id ? [inviter.id, id] : [id, inviter.id];
        await exec(`INSERT IGNORE INTO friendships (user_a, user_b, status, requested_by) VALUES (?, ?, 'accepted', ?)`, [a, c, inviter.id]);
      }
    }
    await createSession(reply, id, req.headers['user-agent']);
    return { id };
  });

  app.post('/login', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const u = await one<any>('SELECT id, password_hash FROM users WHERE email = ? AND deleted_at IS NULL', [b.email.toLowerCase()]);
    if (!u || !(await verifyPassword(b.password, u.password_hash))) throw new HttpError(401, 'invalid_credentials');
    await createSession(reply, u.id, req.headers['user-agent']);
    return { id: u.id };
  });

  app.post('/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  // ── Вход по ссылке или коду на почту ──
  app.post('/code/request', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const b = z.object({ email: z.string().email(), lang: LANG.optional() }).parse(req.body);
    const email = b.email.toLowerCase();
    const u = await one<any>('SELECT id, lang FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    // ответ одинаковый, есть аккаунт или нет — чтобы не раскрывать адреса
    if (!u) return { ok: true };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const token = randomToken(24);
    await exec(
      `INSERT INTO login_codes (email, user_id, code_hash, token_hash, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`,
      [email, u.id, sha256(code), sha256(token)],
    );
    const link = `${config.publicUrl}/#/login?token=${token}`;
    const ru = `Ваш код для входа в Colomba: ${code}\n\nИли откройте ссылку: ${link}\n\nКод действует 15 минут.`;
    const it = `Il tuo codice per entrare in Colomba: ${code}\n\nOppure apri il link: ${link}\n\nIl codice è valido 15 minuti.`;
    await sendMail(email, u.lang === 'it' ? 'Colomba: codice di accesso' : 'Colomba: код для входа', u.lang === 'it' ? it : ru);
    return { ok: true };
  });

  app.post('/code/verify', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = z.object({ email: z.string().email().optional(), code: z.string().optional(), token: z.string().optional() }).parse(req.body);
    let row: any;
    if (b.token) {
      row = await one<any>(
        `SELECT * FROM login_codes WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() AND purpose = 'login'`,
        [sha256(b.token)],
      );
    } else if (b.email && b.code) {
      row = await one<any>(
        `SELECT * FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() AND purpose = 'login' ORDER BY id DESC LIMIT 1`,
        [b.email.toLowerCase()],
      );
      if (row) {
        if (row.attempts >= 5) throw new HttpError(429, 'too_many_attempts');
        if (row.code_hash !== sha256(b.code.trim())) {
          await exec('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
          throw new HttpError(401, 'invalid_code');
        }
      }
    } else throw bad('code_or_token_required');
    if (!row) throw new HttpError(401, 'invalid_code');
    await exec('UPDATE login_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
    await createSession(reply, row.user_id, req.headers['user-agent']);
    return { id: row.user_id };
  });

  // ── Вход ребёнка: родитель показывает код на своём устройстве ──
  app.post('/child-device', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = z.object({ code: z.string().min(6).max(64) }).parse(req.body);
    const row = await one<any>(
      `SELECT * FROM login_codes WHERE token_hash = ? AND purpose = 'child_device' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
      [sha256(b.code.trim().toUpperCase())],
    );
    if (!row) throw new HttpError(401, 'invalid_code');
    await exec('UPDATE login_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
    await createSession(reply, row.user_id, req.headers['user-agent']);
    return { id: row.user_id };
  });

  // ── Passkeys (WebAuthn) ──
  app.post('/passkey/register/options', async (req) => {
    const u = requireUser(req);
    const existing = await q<any>('SELECT credential_id, transports FROM passkeys WHERE user_id = ?', [u.id]);
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: u.username,
      userDisplayName: u.display_name,
      userID: new TextEncoder().encode(String(u.id)),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports ? c.transports.split(',') : undefined })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    const id = randomToken(16).slice(0, 32);
    await exec(
      `INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at) VALUES (?, ?, ?, 'register', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))`,
      [id, u.id, options.challenge],
    );
    return { challengeId: id, options };
  });

  app.post('/passkey/register/verify', async (req) => {
    const u = requireUser(req);
    const b = z.object({ challengeId: z.string(), response: z.any(), name: z.string().max(64).optional() }).parse(req.body);
    const ch = await one<any>(
      `SELECT * FROM webauthn_challenges WHERE id = ? AND user_id = ? AND purpose = 'register' AND expires_at > UTC_TIMESTAMP()`,
      [b.challengeId, u.id],
    );
    if (!ch) throw bad('challenge_expired');
    await exec('DELETE FROM webauthn_challenges WHERE id = ?', [ch.id]);
    const v = await verifyRegistrationResponse({
      response: b.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin(),
      expectedRPID: config.rpId,
    });
    if (!v.verified || !v.registrationInfo) throw bad('passkey_not_verified');
    const cred = v.registrationInfo.credential;
    await exec('INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name) VALUES (?, ?, ?, ?, ?, ?)', [
      u.id, cred.id, Buffer.from(cred.publicKey), cred.counter, (cred.transports ?? []).join(','), b.name ?? null,
    ]);
    return { ok: true };
  });

  app.post('/passkey/login/options', async () => {
    const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'preferred' });
    const id = randomToken(16).slice(0, 32);
    await exec(
      `INSERT INTO webauthn_challenges (id, challenge, purpose, expires_at) VALUES (?, ?, 'login', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))`,
      [id, options.challenge],
    );
    return { challengeId: id, options };
  });

  app.post('/passkey/login/verify', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = z.object({ challengeId: z.string(), response: z.any() }).parse(req.body);
    const ch = await one<any>(`SELECT * FROM webauthn_challenges WHERE id = ? AND purpose = 'login' AND expires_at > UTC_TIMESTAMP()`, [b.challengeId]);
    if (!ch) throw bad('challenge_expired');
    await exec('DELETE FROM webauthn_challenges WHERE id = ?', [ch.id]);
    const pk = await one<any>('SELECT * FROM passkeys WHERE credential_id = ?', [b.response?.id]);
    if (!pk) throw new HttpError(401, 'unknown_passkey');
    const v = await verifyAuthenticationResponse({
      response: b.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin(),
      expectedRPID: config.rpId,
      credential: {
        id: pk.credential_id,
        publicKey: new Uint8Array(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports ? pk.transports.split(',') : undefined,
      },
    });
    if (!v.verified) throw new HttpError(401, 'passkey_not_verified');
    await exec('UPDATE passkeys SET counter = ? WHERE id = ?', [v.authenticationInfo.newCounter, pk.id]);
    await createSession(reply, pk.user_id, req.headers['user-agent']);
    return { id: pk.user_id };
  });

  app.get('/config', async () => ({ inviteOnly: config.inviteOnly, childAgeLimit: GAME.childAgeLimit }));

  void conflict;
}
