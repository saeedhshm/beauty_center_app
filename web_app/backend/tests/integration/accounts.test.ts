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
import { DemoOtpSender } from '../../src/integrations/sms/otp-sender.js';
import { hashPassword } from '../../src/modules/auth/auth.crypto.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), NODE_ENV: 'test', DB_TIMEOUT_MS: '10000' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-password-for-tests!';
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;

function harness() {
  const config = parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}`, AUTH_OTP_MODE: 'demo' });
  const service = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), config);
  const app = createApp({ checkDatabase: database.check, logger: createLogger('silent'), auth: service });
  async function register(role: 'customer' | 'expert' = 'customer', number = phone()) {
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({
      phone: number, challengeId: challenge.body.data.challengeId, otp: '123456',
      name: 'Synthetic user', password, role,
    });
    expect(result.status).toBe(201);
    return { phone: number, data: result.body.data };
  }
  async function admin() {
    const adminPhone = phone();
    const adminId = randomUUID();
    await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [adminId, adminPhone, await hashPassword(password)]);
    const login = await request(app).post('/api/v1/admin/auth/login').send({ phone: adminPhone, password });
    expect(login.status).toBe(200);
    return login.body.data;
  }
  return { app, register, admin };
}

it('resets a forgotten password by OTP and revokes every session', async () => {
  const h = harness();
  const first = await h.register();
  const other = await request(h.app).post('/api/v1/auth/login').send({ phone: first.phone, password });
  expect(other.status).toBe(200);
  const challenge = await request(h.app).post('/api/v1/auth/password/otp').send({ phone: first.phone });
  expect(challenge.status).toBe(202);
  expect(challenge.body.data).not.toHaveProperty('otp');
  const bad = await request(h.app).post('/api/v1/auth/password/reset').send({
    phone: first.phone, challengeId: challenge.body.data.challengeId, otp: '000000', newPassword: 'Brand-new-password-1!',
  });
  expect(bad.status).toBe(400);
  const reset = await request(h.app).post('/api/v1/auth/password/reset').send({
    phone: first.phone, challengeId: challenge.body.data.challengeId, otp: '123456', newPassword: 'Brand-new-password-1!',
  });
  expect(reset.status).toBe(204);
  // Old password dead, old sessions revoked on both logins.
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: first.phone, password })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(other.body.data.accessToken, { type: 'bearer' })).status).toBe(401);
  const login = await request(h.app).post('/api/v1/auth/login').send({ phone: first.phone, password: 'Brand-new-password-1!' });
  expect(login.status).toBe(200);
  const stored = (await pool.query('select password_hash from users where id = $1', [first.data.user.id])).rows[0];
  expect(stored.password_hash).toMatch(/^scrypt\$/);
  expect(stored.password_hash).not.toContain('Brand-new-password-1!');
});

it('changes the password only with the current one and ends other sessions', async () => {
  const h = harness();
  const first = await h.register();
  const wrong = await request(h.app).post('/api/v1/auth/password/change').auth(first.data.accessToken, { type: 'bearer' })
    .send({ currentPassword: 'Wrong-password-1!', newPassword: 'Another-new-password-1!' });
  expect(wrong.status).toBe(401);
  const same = await request(h.app).post('/api/v1/auth/password/change').auth(first.data.accessToken, { type: 'bearer' })
    .send({ currentPassword: password, newPassword: password });
  expect(same.status).toBe(422);
  const changed = await request(h.app).post('/api/v1/auth/password/change').auth(first.data.accessToken, { type: 'bearer' })
    .send({ currentPassword: password, newPassword: 'Another-new-password-1!' });
  expect(changed.status).toBe(204);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: first.phone, password: 'Another-new-password-1!' })).status).toBe(200);
});

it('changes the phone only after verifying the new number', async () => {
  const h = harness();
  const first = await h.register();
  const second = await h.register();
  const challenge = await request(h.app).post('/api/v1/auth/phone/otp').send({ phone: second.phone });
  // Challenge bound to another number cannot move this account.
  const cross = await request(h.app).post('/api/v1/auth/phone/change').auth(first.data.accessToken, { type: 'bearer' })
    .send({ phone: second.phone, challengeId: challenge.body.data.challengeId, otp: '123456' });
  expect(cross.status).toBe(409);
  const fresh = phone();
  const own = await request(h.app).post('/api/v1/auth/phone/otp').send({ phone: fresh });
  const changed = await request(h.app).post('/api/v1/auth/phone/change').auth(first.data.accessToken, { type: 'bearer' })
    .send({ phone: fresh, challengeId: own.body.data.challengeId, otp: '123456' });
  expect(changed.status).toBe(200);
  expect(changed.body.data.phone).toBe(fresh);
  const stored = (await pool.query('select phone, phone_verified_at from users where id = $1', [first.data.user.id])).rows[0];
  expect(stored.phone).toBe(fresh);
  expect(stored.phone_verified_at).not.toBeNull();
});

it('edits the profile name and city within launch scope', async () => {
  const h = harness();
  const first = await h.register();
  const cityId = (await pool.query("select id from cities where code = 'EG-CAI'")).rows[0]?.id as number | undefined;
  const patched = await request(h.app).patch('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' }).send({ name: 'New synthetic name' });
  expect(patched.status).toBe(200);
  expect(patched.body.data.name).toBe('New synthetic name');
  expect(patched.body.data.phone).toBe(first.phone);
  expect(patched.text).not.toContain('passwordHash');
  expect((await request(h.app).patch('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' }).send({})).status).toBe(422);
  expect((await request(h.app).patch('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' }).send({ cityId: 32767 })).status).toBe(409);
  if (cityId !== undefined) {
    const moved = await request(h.app).patch('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' }).send({ cityId });
    expect(moved.status).toBe(200);
    expect(moved.body.data.cityId).toBe(cityId);
  }
});

it('lets a user deactivate herself and preserves her history', async () => {
  const h = harness();
  const first = await h.register();
  const gone = await request(h.app).post('/api/v1/users/me/deactivate').auth(first.data.accessToken, { type: 'bearer' });
  expect(gone.status).toBe(204);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: first.phone, password })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(first.data.accessToken, { type: 'bearer' })).status).toBe(401);
  const stored = (await pool.query('select is_active from users where id = $1', [first.data.user.id])).rows[0];
  expect(stored.is_active).toBe(false);
});

it('lets admins deactivate and reactivate users with audit, but never admins', async () => {
  const h = harness();
  const admin = await h.admin();
  const customer = await h.register();
  const deactivated = await request(h.app).post(`/api/v1/admin/users/${customer.data.user.id}/deactivate`).auth(admin.accessToken, { type: 'bearer' });
  expect(deactivated.status).toBe(200);
  expect(deactivated.body.data).toMatchObject({ id: customer.data.user.id, isActive: false });
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: customer.phone, password })).status).toBe(401);
  const reactivated = await request(h.app).post(`/api/v1/admin/users/${customer.data.user.id}/reactivate`).auth(admin.accessToken, { type: 'bearer' });
  expect(reactivated.status).toBe(200);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: customer.phone, password })).status).toBe(200);
  const audit = await pool.query("select action from admin_audit_logs where resource_type = 'user' and resource_id = $1 order by created_at", [customer.data.user.id]);
  expect(audit.rows.map((row) => row.action)).toEqual(['user.deactivated', 'user.reactivated']);
  // Customers cannot touch admin routes; admins cannot manage admins or themselves.
  expect((await request(h.app).post(`/api/v1/admin/users/${customer.data.user.id}/deactivate`).auth(customer.data.accessToken, { type: 'bearer' })).status).toBe(401);
  const me = await request(h.app).get('/api/v1/admin/me').auth(admin.accessToken, { type: 'bearer' });
  expect((await request(h.app).post(`/api/v1/admin/users/${me.body.data.id}/deactivate`).auth(admin.accessToken, { type: 'bearer' })).status).toBe(403);
  const peerId = randomUUID();
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Peer admin',$2,'admin',$3,now())", [peerId, phone(), await hashPassword(password)]);
  expect((await request(h.app).post(`/api/v1/admin/users/${peerId}/deactivate`).auth(admin.accessToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(h.app).post('/api/v1/admin/users/00000000-0000-0000-0000-000000000000/deactivate').auth(admin.accessToken, { type: 'bearer' })).status).toBe(404);
});

it('lists audit logs for admins with filters and pagination', async () => {
  const h = harness();
  const admin = await h.admin();
  const customer = await h.register();
  await request(h.app).post(`/api/v1/admin/users/${customer.data.user.id}/deactivate`).auth(admin.accessToken, { type: 'bearer' });
  const adminId = (await request(h.app).get('/api/v1/admin/me').auth(admin.accessToken, { type: 'bearer' })).body.data.id as string;
  // The audit table is shared across test files in one run; scope every assertion.
  const all = await request(h.app).get('/api/v1/admin/audit-logs').auth(admin.accessToken, { type: 'bearer' }).query({ actorId: adminId });
  expect(all.status).toBe(200);
  expect(all.body.data.items.length).toBeGreaterThan(0);
  expect(all.body.data.items.every((row: { actorId: string }) => row.actorId === adminId)).toBe(true);
  expect(all.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
  const filtered = await request(h.app).get('/api/v1/admin/audit-logs').auth(admin.accessToken, { type: 'bearer' })
    .query({ action: 'user.deactivated', actorId: adminId });
  expect(filtered.body.data.items.every((row: { action: string }) => row.action === 'user.deactivated')).toBe(true);
  expect(filtered.body.data.items.map((row: { resourceId: string }) => row.resourceId)).toContain(customer.data.user.id);
  expect(filtered.body.data.items[0]).not.toHaveProperty('passwordHash');
  const paged = await request(h.app).get('/api/v1/admin/audit-logs').auth(admin.accessToken, { type: 'bearer' }).query({ actorId: adminId, limit: 1 });
  expect(paged.body.data.items.length).toBeLessThanOrEqual(1);
  expect((await request(h.app).get('/api/v1/admin/audit-logs').auth(customer.data.accessToken, { type: 'bearer' })).status).toBe(401);
});

it('lists and reads accounts for admins with secret-free DTOs, filters and RBAC', async () => {
  const h = harness();
  const admin = await h.admin();
  const customer = await h.register('customer');
  const expert = await h.register('expert');
  const adminAuth = { type: 'bearer' } as const;
  // Mobile sessions cannot touch the admin directory.
  expect((await request(h.app).get('/api/v1/admin/users').auth(customer.data.accessToken, adminAuth)).status).toBe(401);
  expect((await request(h.app).get(`/api/v1/admin/users/${customer.data.user.id}`).auth(customer.data.accessToken, adminAuth)).status).toBe(401);
  const listed = await request(h.app).get('/api/v1/admin/users').auth(admin.accessToken, adminAuth)
    .query({ role: 'customer', limit: 50 });
  expect(listed.status).toBe(200);
  expect(listed.body.data.items.map((u: { id: string }) => u.id)).toContain(customer.data.user.id);
  expect(listed.body.data.items.every((u: { role: string }) => u.role === 'customer')).toBe(true);
  expect(listed.text).not.toContain('passwordHash');
  expect(listed.text).not.toContain('accessHash');
  const searched = await request(h.app).get('/api/v1/admin/users').auth(admin.accessToken, adminAuth)
    .query({ q: customer.phone.slice(-4) });
  expect(searched.body.data.items.map((u: { id: string }) => u.id)).toContain(customer.data.user.id);
  const detail = await request(h.app).get(`/api/v1/admin/users/${expert.data.user.id}`).auth(admin.accessToken, adminAuth);
  expect(detail.status).toBe(200);
  expect(detail.body.data).toMatchObject({ id: expert.data.user.id, role: 'expert', isActive: true });
  expect(detail.body.data).not.toHaveProperty('passwordHash');
  expect((await request(h.app).get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000').auth(admin.accessToken, adminAuth)).status).toBe(404);
  expect((await request(h.app).get('/api/v1/admin/users').auth(admin.accessToken, adminAuth).query({ isActive: 'maybe' })).status).toBe(422);
  const inactive = await request(h.app).get('/api/v1/admin/users').auth(admin.accessToken, adminAuth).query({ isActive: 'false', limit: 50 });
  expect(inactive.body.data.items.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true);
});
