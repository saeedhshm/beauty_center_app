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
import { AvailabilityRepository } from '../../src/modules/availability/availability.repository.js';
import { AvailabilityService } from '../../src/modules/availability/availability.service.js';
import { BookingRepository } from '../../src/modules/bookings/booking.repository.js';
import { BookingService } from '../../src/modules/bookings/booking.service.js';
import { NotificationRepository } from '../../src/modules/notifications/notification.repository.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import type { PushSender } from '../../src/integrations/push/push-sender.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-dashboard-d2-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));
const silentSender: PushSender = { mode: 'demo', send: async () => {} };

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const notification = new NotificationService(new NotificationRepository(database.db), silentSender);
  const app = createApp({
    auth,
    catalog: new CatalogService(new CatalogRepository(database.db)),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, notification),
    notification,
    checkDatabase: database.check,
    logger: createLogger('silent'),
  });
  const adminPhone = phone();
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [randomUUID(), adminPhone, await hashed]);
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
  return { app, admin, cityId, register };
}

it('drives the D2 admin journey: service lifecycle, expert review cycle, booking detail and guarded cancel', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;

  // Services: create, edit, disable — history preserved, no delete endpoint.
  const created = await request(h.app).post('/api/v1/admin/services').auth(h.admin.accessToken, adminAuth)
    .send({ name: `D2 Service ${randomUUID()}`, description: 'D2 fixture', durationMin: 60 });
  expect(created.status).toBe(201);
  const serviceId = created.body.data.id as number;
  const edited = await request(h.app).patch(`/api/v1/admin/services/${serviceId}`).auth(h.admin.accessToken, adminAuth)
    .send({ name: `D2 Service edited ${randomUUID()}` });
  expect(edited.status).toBe(200);
  expect(edited.body.data.name).not.toBe(created.body.data.name);
  const disabled = await request(h.app).patch(`/api/v1/admin/services/${serviceId}`).auth(h.admin.accessToken, adminAuth)
    .send({ isActive: false });
  expect(disabled.status).toBe(200);
  expect(disabled.body.data.isActive).toBe(false);
  // The test database is shared across files, so walk server pages until found.
  const foundOnPages: number[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const listed = await request(h.app).get('/api/v1/admin/services').auth(h.admin.accessToken, adminAuth).query({ page, limit: 50 });
    expect(listed.status).toBe(200);
    if (listed.body.data.items.map((s: { id: number }) => s.id).includes(serviceId)) {
      foundOnPages.push(page);
      break;
    }
    if (!listed.body.data.pagination.hasNext) break;
  }
  expect(foundOnPages.length).toBe(1);
  await request(h.app).patch(`/api/v1/admin/services/${serviceId}`).auth(h.admin.accessToken, adminAuth)
    .send({ isActive: true });

  // Experts: pending file visible to admins only, then approve, then suspend.
  const expert = await h.register('expert');
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, adminAuth).send({ cityId: h.cityId, bio: 'D2 review fixture' });
  await request(h.app).put(`/api/v1/experts/me/services/${serviceId}`).auth(expert.accessToken, adminAuth).send({ price: '450.00' });
  await pool.query("update expert_profiles set identity_document_key='d2-private-doc' where user_id=$1", [expert.user.id]);
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}`)).status).toBe(404);
  const file = await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(h.admin.accessToken, adminAuth);
  expect(file.status).toBe(200);
  expect(file.body.data).toMatchObject({ approvalStatus: 'pending', identityDocument: { present: true } });
  expect(file.body.data.services).toHaveLength(1);
  expect(file.text).not.toContain('d2-private-doc');
  expect((await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, adminAuth)).status).toBe(200);
  expect((await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(h.admin.accessToken, adminAuth)).body.data.approvalStatus).toBe('approved');
  expect((await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/suspend`).auth(h.admin.accessToken, adminAuth)).status).toBe(200);
  const suspended = await request(h.app).get(`/api/v1/admin/experts/${expert.user.id}`).auth(h.admin.accessToken, adminAuth);
  expect(suspended.body.data).toMatchObject({ approvalStatus: 'suspended', isAcceptingBookings: false });
  // Re-approve so the expert can receive the booking below.
  expect((await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, adminAuth)).status).toBe(200);
  expect((await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, adminAuth).send({ isAcceptingBookings: true })).status).toBe(200);

  // Bookings: create through the customer journey, review detail, cancel, replay guarded.
  await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, adminAuth).send({
    slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
  });
  const customer = await h.register('customer');
  const address = (await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, adminAuth)
    .send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId, from, to: from })).body.data.days[0].slots;
  const booking = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, adminAuth)
    .send({ expertId: expert.user.id, serviceId, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
  const detail = await request(h.app).get(`/api/v1/admin/bookings/${booking.id}`).auth(h.admin.accessToken, adminAuth);
  expect(detail.status).toBe(200);
  expect(detail.body.data).toMatchObject({ status: 'pending', totalAmount: '450.00', currency: 'EGP' });
  expect(detail.body.data.statusHistory.map((s: { status: string }) => s.status)).toContain('pending');
  const byStatus = await request(h.app).get('/api/v1/admin/bookings').auth(h.admin.accessToken, adminAuth).query({ status: 'pending', limit: 50 });
  expect(byStatus.body.data.items.map((b: { id: string }) => b.id)).toContain(booking.id);
  const cancelled = await request(h.app).post(`/api/v1/admin/bookings/${booking.id}/cancel`).auth(h.admin.accessToken, adminAuth).send({ reason: 'D2 ops review' });
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data).toMatchObject({ status: 'cancelled', cancellationReason: 'D2 ops review' });
  const reread = await request(h.app).get(`/api/v1/admin/bookings/${booking.id}`).auth(h.admin.accessToken, adminAuth);
  expect(reread.body.data.statusHistory.map((s: { status: string }) => s.status)).toEqual(['pending', 'cancelled']);
  const replay = await request(h.app).post(`/api/v1/admin/bookings/${booking.id}/cancel`).auth(h.admin.accessToken, adminAuth).send({});
  expect(replay.status).toBe(409);
  expect(replay.body.error.code).toBe('INVALID_TRANSITION');
  const audit = await pool.query("select action, actor_id, details from admin_audit_logs where resource_type = 'booking' and resource_id = $1", [booking.id]);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0]).toMatchObject({ action: 'booking.cancelled', actor_id: h.admin.user.id });
  expect(audit.rows[0].details).toMatchObject({ from: 'pending', reason: 'D2 ops review' });
});
