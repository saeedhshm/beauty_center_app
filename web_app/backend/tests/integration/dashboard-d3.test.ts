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
import { ReviewRepository } from '../../src/modules/reviews/review.repository.js';
import { ReviewService } from '../../src/modules/reviews/review.service.js';
import { NotificationRepository } from '../../src/modules/notifications/notification.repository.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import type { PushSender } from '../../src/integrations/push/push-sender.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-dashboard-d3-password!';
const hashed = hashPassword(password);
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const silentSender: PushSender = { mode: 'demo', send: async () => {} };

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const catalogRepository = new CatalogRepository(database.db);
  const notification = new NotificationService(new NotificationRepository(database.db), silentSender);
  const app = createApp({
    auth,
    catalog: new CatalogService(catalogRepository),
    notification,
    review: new ReviewService(new ReviewRepository(database.db), catalogRepository, notification),
    checkDatabase: database.check,
    logger: createLogger('silent'),
  });
  const adminPhone = phone();
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [randomUUID(), adminPhone, await hashed]);
  const login = await request(app).post('/api/v1/admin/auth/login').send({ phone: adminPhone, password });
  expect(login.status).toBe(200);
  const admin = login.body.data;
  async function register(role: 'customer' | 'expert') {
    const number = phone();
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({ phone: number, name: `Test ${randomUUID()}`, password, role, challengeId: challenge.body.data.challengeId, otp: '123456' });
    expect(result.status).toBe(201);
    return result.body.data;
  }
  return { app, admin, register };
}

it('drives the D3 admin journey: directory, deactivation with session kill, reviews and audit trail', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;
  const customer = await h.register('customer');
  const expert = await h.register('expert');

  // Directory: role filter, search, secret-free DTOs, unknown id.
  const directory = await request(h.app).get('/api/v1/admin/users').auth(h.admin.accessToken, adminAuth).query({ role: 'customer', limit: 50 });
  expect(directory.status).toBe(200);
  expect(directory.body.data.items.map((u: { id: string }) => u.id)).toContain(customer.user.id);
  expect(directory.body.data.items.every((u: { role: string }) => u.role === 'customer')).toBe(true);
  expect(directory.text).not.toContain('passwordHash');
  expect(directory.text).not.toContain('accessHash');
  const search = await request(h.app).get('/api/v1/admin/users').auth(h.admin.accessToken, adminAuth).query({ q: customer.user.phone.slice(-6) });
  expect(search.body.data.items.map((u: { id: string }) => u.id)).toContain(customer.user.id);
  const file = await request(h.app).get(`/api/v1/admin/users/${expert.user.id}`).auth(h.admin.accessToken, adminAuth);
  expect(file.status).toBe(200);
  expect(file.body.data).toMatchObject({ id: expert.user.id, role: 'expert', isActive: true });
  expect(file.body.data).not.toHaveProperty('passwordHash');
  expect((await request(h.app).get('/api/v1/admin/users').auth(customer.accessToken, adminAuth)).status).toBe(401);

  // Deactivation kills the session and preserves history; reactivation restores login only.
  expect((await request(h.app).post(`/api/v1/admin/users/${customer.user.id}/deactivate`).auth(h.admin.accessToken, adminAuth)).status).toBe(200);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: customer.user.phone, password })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/users/me').auth(customer.accessToken, adminAuth)).status).toBe(401);
  const stored = await pool.query('select id, phone, role from users where id = $1', [customer.user.id]);
  expect(stored.rows).toHaveLength(1);
  expect((await request(h.app).post(`/api/v1/admin/users/${customer.user.id}/reactivate`).auth(h.admin.accessToken, adminAuth)).status).toBe(200);
  expect((await request(h.app).post('/api/v1/auth/login').send({ phone: customer.user.phone, password })).status).toBe(200);
  expect((await request(h.app).get(`/api/v1/admin/users/${customer.user.id}`).auth(h.admin.accessToken, adminAuth)).body.data.isActive).toBe(true);

  // Reviews stay read-only from the admin side with working filters.
  const reviews = await request(h.app).get('/api/v1/admin/reviews').auth(h.admin.accessToken, adminAuth).query({ rating: 5 });
  expect(reviews.status).toBe(200);
  expect(Array.isArray(reviews.body.data.items)).toBe(true);
  expect((await request(h.app).get('/api/v1/admin/reviews').auth(customer.accessToken, adminAuth)).status).toBe(401);

  // Every approved admin command above left its audit reference.
  const adminId = (await request(h.app).get('/api/v1/admin/me').auth(h.admin.accessToken, adminAuth)).body.data.id as string;
  const trail = await request(h.app).get('/api/v1/admin/audit-logs').auth(h.admin.accessToken, adminAuth).query({ actorId: adminId, limit: 50 });
  const actions = trail.body.data.items.map((row: { action: string }) => row.action);
  expect(actions).toContain('user.deactivated');
  expect(actions).toContain('user.reactivated');
});
