import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, inject, it } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/logger.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { parseAuthConfig } from '../../src/modules/auth/auth.config.js';
import { createOtpSender, UnconfiguredOtpSender, type OtpSender } from '../../src/integrations/sms/otp-sender.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), NODE_ENV: 'test', DB_TIMEOUT_MS: '10000' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-password-for-tests!';
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;

// Random-code capture is test-only; the runtime fixed-code demo adapter is tested separately.
class FakeSms implements OtpSender {
  readonly codes = new Map<string, string>();
  async sendRegistrationCode(input: { phone: string; code: string }) { this.codes.set(input.phone, input.code); }
}

function harness(sender?: OtpSender, configOverrides: NodeJS.ProcessEnv = {}) {
  let now = new Date();
  const sms = new FakeSms();
  const config = parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}`, ...configOverrides });
  const repo = new AuthRepository(database.db);
  const service = new AuthService(repo, sender ?? sms, config, () => now);
  const app = createApp({ checkDatabase: database.check, logger: createLogger('silent'), auth: service });
  async function challenge(number = phone()) {
    const result = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(result.status).toBe(202);
    expect(result.body.data).not.toHaveProperty('otp');
    expect(result.body.data).not.toHaveProperty('code');
    return { phone: number, challengeId: result.body.data.challengeId as string, otp: sms.codes.get(number)! };
  }
  async function register(role: 'customer' | 'expert' = 'customer') {
    const input = await challenge();
    const result = await request(app).post('/api/v1/auth/register').send({ ...input, password, name: 'Synthetic user', role });
    expect(result.status).toBe(201);
    return { input, data: result.body.data };
  }
  return { app, service, repo, config, sms, challenge, register, advance: (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); } };
}

it('registers a verified customer, hashes secrets, logs in by local phone format and isolates /users/me', async () => {
  const h = harness();
  const first = await h.register();
  const second = await h.register();
  const result = await request(h.app).get(`/api/v1/users/me?userId=${second.data.user.id}`).auth(first.data.accessToken, { type: 'bearer' });
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual(first.data.user);
  expect(result.text).not.toContain('passwordHash');
  expect(result.text).not.toContain(second.input.phone);
  const stored = (await pool.query('select password_hash, phone_verified_at from users where id = $1', [first.data.user.id])).rows[0];
  expect(stored.password_hash).toMatch(/^scrypt\$/);
  expect(stored.password_hash).not.toContain(password);
  expect(stored.phone_verified_at).not.toBeNull();
  const otp = (await pool.query('select code_hash, consumed_at from auth_otp_challenges where id = $1', [first.input.challengeId])).rows[0];
  expect(otp.code_hash).not.toBe(first.input.otp);
  expect(otp.consumed_at).not.toBeNull();
  const login = await request(h.app).post('/api/v1/auth/login').send({ phone: `0${first.input.phone.slice(3)}`, password });
  expect(login.status).toBe(200);
  expect(login.body.data.user.id).toBe(first.data.user.id);
  expect(login.headers['set-cookie']).toBeUndefined();
  const sessions = await pool.query('select access_hash from auth_sessions where user_id = $1', [first.data.user.id]);
  expect(sessions.rows.every((row) => row.access_hash !== first.data.accessToken)).toBe(true);
});

it('creates an expert pending approval and prevents a customer from reading expert resources', async () => {
  const h = harness();
  const expert = await h.register('expert');
  const otherExpert = await h.register('expert');
  const customer = await h.register();
  await pool.query("update expert_profiles set identity_document_key = 'private-test-document' where user_id = $1", [expert.data.user.id]);
  const profile = await request(h.app).get(`/api/v1/experts/me?expertId=${otherExpert.data.user.id}`).auth(expert.data.accessToken, { type: 'bearer' });
  expect(profile.status).toBe(200);
  expect(profile.body.data).toMatchObject({ userId: expert.data.user.id, approvalStatus: 'pending', isAcceptingBookings: false });
  expect(profile.text).not.toContain('private-test-document');
  const denied = await request(h.app).get('/api/v1/experts/me').auth(customer.data.accessToken, { type: 'bearer' });
  expect(denied.status).toBe(403);
  expect(denied.body.error.code).toBe('FORBIDDEN');
  expect((await request(h.app).get('/api/v1/users/me')).status).toBe(401);
});

it('requires OTP and rejects admin roles, extra privilege fields, and weak passwords without creating a user', async () => {
  const h = harness();
  const input = await h.challenge();
  const body = { ...input, password, name: 'Test', role: 'customer' };
  for (const change of [{ role: 'admin' }, { isActive: true }, { approvalStatus: 'approved' }, { password: 'short' }, { otp: undefined }]) {
    const response = await request(h.app).post('/api/v1/auth/register').send({ ...body, ...change });
    expect(response.status).toBe(422);
    expect(response.body.error.fields).toBeDefined();
  }
  expect((await pool.query('select id from users where phone = $1', [input.phone])).rowCount).toBe(0);
  const fakeProof = await request(h.app).post('/api/v1/auth/register').send({ ...body, challengeId: randomUUID() });
  expect(fakeProof.status).toBe(400);
});

it('persists five wrong-code attempts and rejects even the correct code afterward', async () => {
  const h = harness();
  const input = await h.challenge();
  const body = { ...input, name: 'Test', password, role: 'customer' };
  for (let i = 0; i < 5; i++) {
    const response = await request(h.app).post('/api/v1/auth/register').send({ ...body, otp: input.otp === '000000' ? '111111' : '000000' });
    expect(response.status).toBe(400);
  }
  const attempts = (await pool.query('select attempts, consumed_at from auth_otp_challenges where id = $1', [input.challengeId])).rows[0];
  expect(attempts.attempts).toBe(5);
  expect(attempts.consumed_at).not.toBeNull();
  expect((await request(h.app).post('/api/v1/auth/register').send(body)).status).toBe(400);
});

it('expires OTPs and invalidates previous challenges after resend', async () => {
  const h = harness();
  const first = await h.challenge();
  h.advance(61);
  const second = await h.challenge(first.phone);
  expect((await request(h.app).post('/api/v1/auth/register').send({ ...first, name: 'Test', password, role: 'customer' })).status).toBe(400);
  h.advance(301);
  expect((await request(h.app).post('/api/v1/auth/register').send({ ...second, name: 'Test', password, role: 'customer' })).status).toBe(400);
});

it('does not accept a challenge for another phone and allows only one concurrent registration per challenge', async () => {
  const h = harness();
  const input = await h.challenge();
  const body = { ...input, name: 'Test', password, role: 'expert' };
  const mismatch = await request(h.app).post('/api/v1/auth/register').send({ ...body, phone: phone() });
  expect(mismatch.status).toBe(400);
  const results = await Promise.all([
    request(h.app).post('/api/v1/auth/register').send(body),
    request(h.app).post('/api/v1/auth/register').send(body),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  const accounts = await pool.query('select u.id from users u join expert_profiles e on e.user_id = u.id where u.phone = $1', [input.phone]);
  expect(accounts.rowCount).toBe(1);
});

it('returns a generic login failure for unknown phones, wrong passwords and disabled accounts', async () => {
  const h = harness();
  const account = await h.register();
  const unknown = await request(h.app).post('/api/v1/auth/login').send({ phone: phone(), password });
  const wrong = await request(h.app).post('/api/v1/auth/login').send({ phone: account.input.phone, password: `${password}-wrong` });
  await pool.query('update users set is_active = false where id = $1', [account.data.user.id]);
  const disabled = await request(h.app).post('/api/v1/auth/login').send({ phone: account.input.phone, password });
  expect([unknown.status, wrong.status, disabled.status]).toEqual([401, 401, 401]);
  expect(unknown.body.error).toEqual(wrong.body.error);
  expect(wrong.body.error).toEqual(disabled.body.error);
  expect((await request(h.app).get('/api/v1/users/me').auth(account.data.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: account.data.refreshToken })).status).toBe(401);
});

it('rotates tokens, invalidates the old access token and revokes the family on refresh-token reuse', async () => {
  const h = harness();
  const account = await h.register();
  const rotated = await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: account.data.refreshToken });
  expect(rotated.status).toBe(200);
  expect(rotated.body.data.refreshToken).not.toBe(account.data.refreshToken);
  expect(rotated.body.data.refreshExpiresAt).toBe(account.data.refreshExpiresAt);
  expect((await request(h.app).get('/api/v1/users/me').auth(account.data.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(rotated.body.data.accessToken, { type: 'bearer' })).status).toBe(200);
  // Another service instance must also detect reuse from the durable records.
  const restarted = new AuthService(new AuthRepository(database.db), h.sms, h.config);
  await expect(restarted.refresh(account.data.refreshToken)).rejects.toMatchObject({ status: 401 });
  expect((await request(h.app).get('/api/v1/users/me').auth(rotated.body.data.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken })).status).toBe(401);
});

it('handles concurrent refreshes with one rotation and durable revocation on the duplicate', async () => {
  const h = harness();
  const account = await h.register();
  const responses = await Promise.all([
    request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: account.data.refreshToken }),
    request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: account.data.refreshToken }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
  const winner = responses.find((r) => r.status === 200)!;
  expect((await request(h.app).get('/api/v1/users/me').auth(winner.body.data.accessToken, { type: 'bearer' })).status).toBe(401);
});

it('expires access tokens, supports refresh until the absolute session expiry, and logs out idempotently', async () => {
  const h = harness();
  const account = await h.register();
  h.advance(901);
  expect((await request(h.app).get('/api/v1/users/me').auth(account.data.accessToken, { type: 'bearer' })).status).toBe(401);
  const refreshed = await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: account.data.refreshToken });
  expect(refreshed.status).toBe(200);
  for (let i = 0; i < 2; i++) expect((await request(h.app).post('/api/v1/auth/logout').send({ refreshToken: refreshed.body.data.refreshToken })).status).toBe(204);
  expect((await request(h.app).get('/api/v1/users/me').auth(refreshed.body.data.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: refreshed.body.data.refreshToken })).status).toBe(401);
  const other = await h.register();
  h.advance(2592001);
  expect((await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: other.data.refreshToken })).status).toBe(401);
});

it('enforces cooldown across phone formats and process instances, and limits OTP traffic by IP', async () => {
  const h = harness();
  const input = await h.challenge();
  const retry = await request(h.app).post('/api/v1/auth/register/otp').set('X-Forwarded-For', '192.0.2.10').send({ phone: `0${input.phone.slice(3)}` });
  expect(retry.status).toBe(429);
  expect(Number(retry.headers['retry-after'])).toBeGreaterThan(0);
  const restarted = new AuthService(new AuthRepository(database.db), h.sms, h.config);
  await expect(restarted.requestOtp(input.phone)).rejects.toMatchObject({ status: 429 });
  // Repeated invalid bodies still count toward the IP budget, even with changing spoofed headers.
  let response;
  for (let i = 0; i < 19; i++) response = await request(h.app).post('/api/v1/auth/register/otp').set('X-Forwarded-For', `192.0.2.${i + 1}`).send({ phone: 'invalid' });
  expect(response!.status).toBe(429);
});

it('limits password guesses per phone durably', async () => {
  const h = harness();
  const number = phone();
  for (let i = 0; i < 10; i++) await expect(h.service.login(number, password)).rejects.toMatchObject({ status: 401 });
  const restarted = new AuthService(new AuthRepository(database.db), h.sms, h.config);
  await expect(restarted.login(number, password)).rejects.toMatchObject({ status: 429 });
});

it('fails closed when SMS is unavailable and never creates a verified account', async () => {
  const h = harness(new UnconfiguredOtpSender());
  const number = phone();
  const response = await request(h.app).post('/api/v1/auth/register/otp').send({ phone: number });
  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('OTP_DELIVERY_UNAVAILABLE');
  const row = (await pool.query('select delivered_at, consumed_at from auth_otp_challenges where phone = $1', [number])).rows[0];
  expect(row.delivered_at).toBeNull();
  expect(row.consumed_at).not.toBeNull();
  expect((await pool.query('select id from users where phone = $1', [number])).rowCount).toBe(0);
});

it('does not hold a transaction during SMS delivery or accept a code before the sender succeeds', async () => {
  let finishSend!: () => void;
  let enteredSend!: () => void;
  let capturedCode = '';
  const waiting = new Promise<void>((resolve) => { enteredSend = resolve; });
  const delivery = new Promise<void>((resolve) => { finishSend = resolve; });
  const h = harness({
    async sendRegistrationCode(input) {
      capturedCode = input.code;
      enteredSend();
      await delivery;
    },
  });
  const number = phone();
  const sending = h.service.requestOtp(number);
  await waiting;
  try {
    // A separate connection can see the committed challenge while the sender is still waiting.
    const row = (await pool.query('select id, delivered_at from auth_otp_challenges where phone = $1', [number])).rows[0];
    expect(row.delivered_at).toBeNull();
    await expect(h.service.register({ phone: number, challengeId: row.id, otp: capturedCode, name: 'Test', password, role: 'customer' })).rejects.toMatchObject({ code: 'INVALID_OTP' });
  } finally { finishSend(); }
  const challenge = await sending;
  const account = await h.service.register({ phone: number, challengeId: challenge.challengeId, otp: capturedCode, name: 'Test', password, role: 'customer' });
  expect(account.user.phoneVerified).toBe(true);
});

it('rejects unverified legacy accounts and admin accounts through the mobile login path', async () => {
  const h = harness();
  const account = await h.register();
  await pool.query('update users set phone_verified_at = null where id = $1', [account.data.user.id]);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: account.input.phone, password })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(account.data.accessToken, { type: 'bearer' })).status).toBe(401);
  await pool.query("update users set phone_verified_at = now(), role = 'admin' where id = $1", [account.data.user.id]);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: account.input.phone, password })).status).toBe(401);
});

it('supports the runtime demo adapter with fixed OTP while enforcing challenges, wrong codes and one-time consumption', async () => {
  const config = parseAuthConfig({});
  const h = harness(createOtpSender(config), { AUTH_OTP_MODE: config.AUTH_OTP_MODE, AUTH_SECRET: config.AUTH_SECRET });
  const number = phone();
  const body = { phone: number, name: 'Demo customer', password, role: 'customer', otp: '123456' };
  const noChallenge = await request(h.app).post('/api/v1/auth/register').send({ ...body, challengeId: randomUUID() });
  expect(noChallenge.status).toBe(400);
  const challenge = await request(h.app).post('/api/v1/auth/register/otp').send({ phone: number });
  expect(challenge.status).toBe(202);
  expect(challenge.body.data.deliveryMode).toBe('demo');
  const input = { ...body, challengeId: challenge.body.data.challengeId };
  expect((await request(h.app).post('/api/v1/auth/register').send({ ...input, otp: '000000' })).status).toBe(400);
  const registered = await request(h.app).post('/api/v1/auth/register').send(input);
  expect(registered.status).toBe(201);
  expect((await request(h.app).post('/api/v1/auth/register').send(input)).status).toBe(400);
  const login = await request(h.app).post('/api/v1/auth/login').send({ phone: number, password });
  expect(login.status).toBe(200);
  expect(login.body.data.user.id).toBe(registered.body.data.user.id);
});

it('does not replace an existing account after a second verified registration attempt', async () => {
  const h = harness();
  const account = await h.register();
  h.advance(61);
  const input = await h.challenge(account.input.phone);
  const response = await request(h.app).post('/api/v1/auth/register').send({ ...input, password: 'Different-password-for-tests!', name: 'Different', role: 'expert' });
  expect(response.status).toBe(409);
  const login = await request(h.app).post('/api/v1/auth/login').send({ phone: input.phone, password });
  expect(login.status).toBe(200);
  expect(login.body.data.user.role).toBe('customer');
});
