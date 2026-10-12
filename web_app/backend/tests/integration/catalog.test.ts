import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, inject, it } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/client.js';
import { createLogger } from '../../src/shared/logger.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { parseAuthConfig } from '../../src/modules/auth/auth.config.js';
import { DemoOtpSender } from '../../src/integrations/sms/otp-sender.js';
import { hashPassword } from '../../src/modules/auth/auth.crypto.js';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { DEMO_ACCOUNTS, seedDemo } from '../../src/db/seeds/demo.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-catalog-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const catalog = new CatalogService(new CatalogRepository(database.db));
  const app = createApp({ auth, catalog, checkDatabase: database.check, logger: createLogger('silent') });
  const adminId = randomUUID();
  const adminPhone = phone();
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [adminId, adminPhone, await hashed]);
  const login = await request(app).post('/api/v1/admin/auth/login').send({ phone: adminPhone, password });
  expect(login.status).toBe(200);
  const admin = login.body.data;
  const cityId = (await pool.query("select id from cities where code='EG-CAI'")).rows[0].id as number;
  async function register(role: 'customer' | 'expert') {
    const number = phone();
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({ phone: number, name: `Test ${randomUUID()}`, password, role, challengeId: challenge.body.data.challengeId, otp: '123456' });
    expect(result.status).toBe(201);
    return result.body.data;
  }
  async function service() {
    const result = await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 });
    expect(result.status).toBe(201); return result.body.data;
  }
  return { app, auth, catalog, admin, adminPhone, adminId, cityId, register, service };
}

it('exposes Cairo/EGP defaults and completes the admin approval → expert price → public discovery → customer address journey', async () => {
  const h = await harness();
  const config = await request(h.app).get('/api/v1/configuration');
  expect(config.body.data).toMatchObject({ currency: 'EGP', timeZone: 'Africa/Cairo', paymentMode: 'demo', daytimeOnly: true, launchCity: { code: 'EG-CAI', name: 'القاهرة' }, bookingPolicy: { acceptanceTimeoutMinutes: 10, paymentTimeoutMinutes: 10, commissionRate: '20.0000' } });
  const expert = await h.register('expert');
  const service = await h.service();
  const edited = await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId: h.cityId, bio: 'ملف اختباري' });
  expect(edited.status).toBe(200);
  const price = await request(h.app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '300.5' });
  expect(price.status).toBe(200);
  expect(price.body.data).toMatchObject({ price: '300.50', currency: 'EGP' });
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  expect((await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true })).status).toBe(409);
  expect((await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true })).status).toBe(200);
  await pool.query("update expert_profiles set identity_document_key='private-only' where user_id=$1", [expert.user.id]);
  const found = await request(h.app).get('/api/v1/experts').query({ serviceId: service.id, cityId: h.cityId, limit: 1 });
  expect(found.status).toBe(200);
  expect(found.body.data.items[0].id).toBe(expert.user.id);
  expect(found.body.data.pagination).toEqual({ page: 1, limit: 1, hasNext: false });
  const detail = await request(h.app).get(`/api/v1/experts/${expert.user.id}`);
  expect(detail.body.data.services[0]).toMatchObject({ price: '300.50', currency: 'EGP', durationMin: 60 });
  expect(detail.text).not.toContain('private-only');
  expect(detail.text).not.toContain(expert.user.phone);
  const customer = await h.register('customer');
  const address = await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId: h.cityId, label: 'عنوان اختباري', addressText: 'القاهرة — بيانات خيالية', isDefault: true });
  expect(address.status).toBe(201);
  expect(address.body.data.isDefault).toBe(true);
});

it('separates admin and mobile login, access, refresh and logout audiences', async () => {
  const h = await harness();
  const customer = await h.register('customer');
  expect((await request(h.app).post('/api/v1/admin/auth/login').send({ phone: customer.user.phone, password })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: h.adminPhone, password })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/admin/settings').auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/refresh').send({ refreshToken: h.admin.refreshToken })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/auth/logout').send({ refreshToken: h.admin.refreshToken })).status).toBe(204);
  expect((await request(h.app).get('/api/v1/admin/me').auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(200);
  const refreshed = await request(h.app).post('/api/v1/admin/auth/refresh').send({ refreshToken: h.admin.refreshToken });
  expect(refreshed.status).toBe(200);
  expect((await request(h.app).post('/api/v1/admin/auth/logout').send({ refreshToken: refreshed.body.data.refreshToken })).status).toBe(204);
  expect((await request(h.app).get('/api/v1/admin/me').auth(refreshed.body.data.accessToken, { type: 'bearer' })).status).toBe(401);
  // A DB role change cannot upgrade a pre-existing mobile session into an admin session.
  await pool.query("update users set role='admin' where id=$1", [customer.user.id]);
  expect((await request(h.app).get('/api/v1/admin/settings').auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
});

it('updates policy settings atomically with audit records and retains concurrent changes to different fields', async () => {
  const h = await harness();
  const responses = await Promise.all([
    request(h.app).patch('/api/v1/admin/settings').auth(h.admin.accessToken, { type: 'bearer' }).send({ acceptanceTimeoutMinutes: 7 }),
    request(h.app).patch('/api/v1/admin/settings').auth(h.admin.accessToken, { type: 'bearer' }).send({ paymentTimeoutMinutes: 12, commissionRate: '25' }),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  const policy = (await request(h.app).get('/api/v1/configuration')).body.data.bookingPolicy;
  expect(policy).toEqual({ acceptanceTimeoutMinutes: 7, paymentTimeoutMinutes: 12, commissionRate: '25.0000' });
  expect((await pool.query("select id from admin_audit_logs where actor_id=$1 and action='settings.updated'", [h.adminId])).rowCount).toBe(2);
  await expect(h.catalog.updatePolicy({ id: randomUUID(), name: 'missing', phone: phone(), role: 'admin', phoneVerified: true }, { commissionRate: '99.0000' })).rejects.toThrow();
  expect((await h.catalog.configuration()).bookingPolicy).toEqual(policy);
  for (const body of [{ commissionRate: '101' }, { acceptanceTimeoutMinutes: 0 }, { vatRate: '20' }]) {
    expect((await request(h.app).patch('/api/v1/admin/settings').auth(h.admin.accessToken, { type: 'bearer' }).send(body)).status).toBe(422);
  }
});

it('enforces address ownership, active-city coverage, coordinate validation and one default under concurrency', async () => {
  const h = await harness();
  const owner = await h.register('customer');
  const other = await h.register('customer');
  const expert = await h.register('expert');
  const body = { cityId: h.cityId, label: 'Test', addressText: 'Synthetic Cairo address', isDefault: true };
  const results = await Promise.all([1, 2].map(() => request(h.app).post('/api/v1/addresses').auth(owner.accessToken, { type: 'bearer' }).send(body)));
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  const id = results[0]!.body.data.id;
  const rows = (await request(h.app).get('/api/v1/addresses').auth(owner.accessToken, { type: 'bearer' })).body.data.items;
  expect(rows.filter((row: { isDefault: boolean }) => row.isDefault)).toHaveLength(1);
  expect((await request(h.app).get(`/api/v1/addresses/${id}`).auth(other.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).patch(`/api/v1/addresses/${id}`).auth(other.accessToken, { type: 'bearer' }).send({ label: 'stolen' })).status).toBe(404);
  expect((await request(h.app).delete(`/api/v1/addresses/${id}`).auth(other.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).get('/api/v1/addresses').auth(expert.accessToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(h.app).post('/api/v1/addresses').auth(owner.accessToken, { type: 'bearer' }).send({ ...body, customerId: other.user.id })).status).toBe(422);
  expect((await request(h.app).post('/api/v1/addresses').auth(owner.accessToken, { type: 'bearer' }).send({ ...body, lat: '30.0' })).status).toBe(422);
  const otherCity = (await pool.query('insert into cities(name,is_active) values($1,false) returning id', [`Other-${randomUUID()}`])).rows[0].id;
  expect((await request(h.app).post('/api/v1/addresses').auth(owner.accessToken, { type: 'bearer' }).send({ ...body, cityId: otherCity })).status).toBe(409);
  expect((await request(h.app).delete(`/api/v1/addresses/${id}`).auth(owner.accessToken, { type: 'bearer' })).status).toBe(204);
});

it('creates, activates and safely deletes managed cities with atomic audit', async () => {
  const h = await harness();
  const suffix = randomInt(100000, 999999).toString();
  const input = { name: `الإسكندرية ${suffix}`, code: `EG-A${suffix}` };
  for (const invalid of [
    { name: 'Alexandria', code: input.code },
    { name: input.name, code: 'eg-alx' },
    { ...input, isActive: true },
  ]) {
    expect((await request(h.app).post('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' }).send(invalid)).status).toBe(422);
  }
  const created = await request(h.app).post('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' }).send(input);
  expect(created.status).toBe(201);
  expect(created.body.data).toMatchObject({ ...input, isActive: false });
  expect((await request(h.app).post('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' }).send(input)).status).toBe(409);
  expect((await request(h.app).post('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' }).send({ name: `مدينة ${suffix}`, code: input.code })).status).toBe(409);
  expect((await request(h.app).get('/api/v1/cities')).body.data).not.toContainEqual(expect.objectContaining({ id: created.body.data.id }));

  const activated = await request(h.app).patch(`/api/v1/admin/cities/${created.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: true });
  expect(activated.status).toBe(200);
  expect((await request(h.app).get('/api/v1/cities')).body.data).toContainEqual(expect.objectContaining({ id: created.body.data.id, isActive: true }));
  expect((await pool.query("select action from admin_audit_logs where actor_id=$1 and resource_id=$2 and action in ('city.created','city.updated')", [h.adminId, String(created.body.data.id)])).rows.map((row) => row.action).sort()).toEqual(['city.created', 'city.updated']);

  const expert = await h.register('expert');
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId: created.body.data.id });
  expect((await request(h.app).get('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' })).body.data.cityId).toBe(created.body.data.id);
  await request(h.app).patch(`/api/v1/admin/cities/${created.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: false });
  const inUse = await request(h.app).delete(`/api/v1/admin/cities/${created.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(inUse.status).toBe(409);
  expect(inUse.body.error.code).toBe('CITY_IN_USE');
  const protectedLaunch = await request(h.app).delete(`/api/v1/admin/cities/${h.cityId}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(protectedLaunch.status).toBe(409);
  expect(protectedLaunch.body.error.code).toBe('LAUNCH_CITY_PROTECTED');

  const disposable = await request(h.app).post('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' })
    .send({ name: `الجيزة ${suffix}`, code: `EG-G${suffix}` });
  expect(disposable.status).toBe(201);
  await request(h.app).patch(`/api/v1/admin/cities/${disposable.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: true });
  const activeDelete = await request(h.app).delete(`/api/v1/admin/cities/${disposable.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(activeDelete.status).toBe(409);
  expect(activeDelete.body.error.code).toBe('CITY_MUST_BE_INACTIVE');
  await request(h.app).patch(`/api/v1/admin/cities/${disposable.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: false });
  expect((await request(h.app).delete(`/api/v1/admin/cities/${disposable.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(204);
  expect((await request(h.app).get('/api/v1/admin/cities').auth(h.admin.accessToken, { type: 'bearer' })).body.data)
    .not.toContainEqual(expect.objectContaining({ id: disposable.body.data.id }));
  expect((await pool.query("select action from admin_audit_logs where actor_id=$1 and resource_id=$2 and action='city.deleted'", [h.adminId, String(disposable.body.data.id)])).rowCount).toBe(1);
});

it('prevents self-approval and cross-expert writes, hides inactive services, suspended experts and legacy-priced offers', async () => {
  const h = await harness();
  const expert = await h.register('expert');
  const other = await h.register('expert');
  const service = await h.service();
  const ownPath = `/api/v1/experts/me/services/${service.id}`;
  expect((await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ approvalStatus: 'approved' })).status).toBe(422);
  expect((await request(h.app).put(ownPath).auth(expert.accessToken, { type: 'bearer' }).send({ price: '100.00', expertId: other.user.id })).status).toBe(422);
  for (const bad of ['NaN', '1e3', '-1', '1.001']) expect((await request(h.app).put(ownPath).auth(expert.accessToken, { type: 'bearer' }).send({ price: bad })).status).toBe(422);
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId: h.cityId });
  await request(h.app).put(ownPath).auth(expert.accessToken, { type: 'bearer' }).send({ price: '100.00' });
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, { type: 'bearer' });
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(200);
  await pool.query("update expert_services set currency='SAR' where expert_id=$1", [expert.user.id]);
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  await request(h.app).put(ownPath).auth(expert.accessToken, { type: 'bearer' }).send({ price: '150.00' });
  await request(h.app).patch(`/api/v1/admin/services/${service.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: false });
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  expect((await request(h.app).put(ownPath).auth(expert.accessToken, { type: 'bearer' }).send({ price: '150.00' })).status).toBe(409);
  await request(h.app).patch(`/api/v1/admin/services/${service.id}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: true });
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/suspend`).auth(h.admin.accessToken, { type: 'bearer' });
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  const profile = await request(h.app).get('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' });
  expect(profile.body.data).toMatchObject({ approvalStatus: 'suspended', isAcceptingBookings: false });
});

it('paginates on the server, validates filters, and hides a deactivated managed city', async () => {
  const h = await harness();
  await h.service(); await h.service();
  const first = await request(h.app).get('/api/v1/services').query({ page: 1, limit: 1 });
  const second = await request(h.app).get('/api/v1/services').query({ page: 2, limit: 1 });
  expect(first.body.data.pagination.hasNext).toBe(true);
  expect(first.body.data.items[0].id).not.toBe(second.body.data.items[0].id);
  expect((await request(h.app).get('/api/v1/experts').query({ limit: 1000 })).status).toBe(422);
  expect((await request(h.app).patch(`/api/v1/admin/cities/${h.cityId}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: false })).status).toBe(200);
  try {
    expect((await request(h.app).get('/api/v1/cities')).body.data).toEqual([]);
    expect((await request(h.app).get('/api/v1/experts')).body.data.items).toEqual([]);
  } finally {
    await request(h.app).patch(`/api/v1/admin/cities/${h.cityId}`).auth(h.admin.accessToken, { type: 'bearer' }).send({ isActive: true });
  }
});

it('seeds demo fixtures idempotently without promoting existing accounts or resetting edited policy or profiles', async () => {
  const h = await harness();
  await pool.query("insert into users(name,phone,role) values('Pre-existing',$1,'customer')", [DEMO_ACCOUNTS[0].phone]);
  const before = (await h.catalog.configuration()).bookingPolicy;
  const first = await seedDemo(database.db);
  expect(first.createdAccounts).toBe(2);
  const expertId = (await pool.query('select id from users where phone=$1', [DEMO_ACCOUNTS[2].phone])).rows[0].id;
  await pool.query("update expert_profiles set approval_status='suspended' where user_id=$1", [expertId]);
  const second = await seedDemo(database.db);
  expect(second).toEqual({ createdAccounts: 0, createdServices: 0 });
  expect((await pool.query('select role from users where phone=$1', [DEMO_ACCOUNTS[0].phone])).rows[0].role).toBe('customer');
  expect((await pool.query('select approval_status from expert_profiles where user_id=$1', [expertId])).rows[0].approval_status).toBe('suspended');
  expect((await h.catalog.configuration()).bookingPolicy).toEqual(before);
});

it('exposes a rich admin expert file for pending and suspended experts without secret keys', async () => {
  const h = await harness();
  const expert = await h.register('expert');
  const service = await h.service();
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId: h.cityId });
  await request(h.app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '250.00' });
  await pool.query("update expert_profiles set identity_document_key='private-doc-key' where user_id=$1", [expert.user.id]);
  // Pending experts are invisible publicly but fully visible to admins.
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  const pending = await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(pending.status).toBe(200);
  expect(pending.body.data).toMatchObject({
    id: expert.user.id, approvalStatus: 'pending', identityDocument: { present: true },
  });
  expect(pending.body.data.services).toHaveLength(1);
  expect(pending.body.data.services[0]).toMatchObject({ serviceId: service.id, price: '250.00' });
  expect(pending.text).not.toContain('private-doc-key');
  expect(pending.text).not.toContain('storageKey');
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, { type: 'bearer' });
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/suspend`).auth(h.admin.accessToken, { type: 'bearer' });
  const suspended = await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(suspended.status).toBe(200);
  expect(suspended.body.data).toMatchObject({ approvalStatus: 'suspended' });
  // RBAC: mobile sessions rejected, customers hidden, unknown ids 404.
  const customer = await h.register('customer');
  expect((await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).get(`/api/v1/admin/experts/${customer.user.id}`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).get('/api/v1/admin/experts/00000000-0000-0000-0000-000000000000').auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(404);
});
