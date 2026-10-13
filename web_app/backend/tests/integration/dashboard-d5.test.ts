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
import { PaymentRepository } from '../../src/modules/payments/payment.repository.js';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
import { PayoutRepository } from '../../src/modules/payouts/payout.repository.js';
import { PayoutService } from '../../src/modules/payouts/payout.service.js';
import { NotificationRepository } from '../../src/modules/notifications/notification.repository.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import { OverviewRepository } from '../../src/modules/overview/overview.repository.js';
import { OverviewService } from '../../src/modules/overview/overview.service.js';
import type { PushSender } from '../../src/integrations/push/push-sender.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-dashboard-d5-password!';
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
    payment: new PaymentService(new PaymentRepository(database.db), notification),
    payout: new PayoutService(new PayoutRepository(database.db)),
    notification,
    overview: new OverviewService(new OverviewRepository(database.db)),
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
  async function readyExpert() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'D5 fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    return { expert, service };
  }
  return { app, admin, cityId, register, readyExpert };
}

it('aggregates the admin overview across full data with documented definitions', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;
  const { expert, service } = await h.readyExpert();
  const customer = await h.register('customer');
  const address = (await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, adminAuth)
    .send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const booking = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, adminAuth)
    .send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, adminAuth)).status).toBe(200);
  const summary = await request(h.app).get('/api/v1/admin/overview').auth(h.admin.accessToken, adminAuth);
  expect(summary.status).toBe(200);
  expect(summary.body.data.range).toMatchObject({ timeZone: 'Africa/Cairo' });
  const pending = summary.body.data.bookings.find((b: { status: string }) => b.status === 'accepted');
  expect(pending).toBeDefined();
  // Same predicate as the server, counted straight from the table on the shared test database.
  const direct = await pool.query("select count(*)::int as total from bookings where status = 'accepted' and created_at >= now() - interval '30 days'");
  expect(pending.count).toBe(direct.rows[0].total);
  const paidRow = summary.body.data.payments.find((p: { status: string }) => p.status === 'paid');
  expect(paidRow === undefined || typeof paidRow.total === 'string').toBe(true);
  expect(summary.body.data.worker === null || typeof summary.body.data.worker.tickAt === 'string').toBe(true);
  expect((await request(h.app).get('/api/v1/admin/overview').auth(customer.accessToken, adminAuth)).status).toBe(401);
  const ranged = await request(h.app).get('/api/v1/admin/overview').auth(h.admin.accessToken, adminAuth)
    .query({ from: new Date(Date.now() - 86400000).toISOString(), to: new Date().toISOString() });
  expect(ranged.status).toBe(200);
  expect(ranged.body.data.range.from <= ranged.body.data.range.to).toBe(true);
});

it('reviews and retries failed outbox rows idempotently with audit and worker safety', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;
  const customer = await h.register('customer');
  const note = (await pool.query("insert into notifications (user_id, type, title, body) values ($1, 'booking_expired', 't', 'b') returning id", [customer.user.id])).rows[0];
  const row = (await pool.query(
    "insert into notification_outbox (notification_id, user_id, status, attempts, next_attempt_at) values ($1, $2, 'failed', 8, now() - interval '1 hour') returning id",
    [note.id, customer.user.id],
  )).rows[0];
  const listed = await request(h.app).get('/api/v1/admin/notifications/outbox').auth(h.admin.accessToken, adminAuth).query({ status: 'failed' });
  expect(listed.status).toBe(200);
  expect(listed.body.data.items.map((r: { id: string }) => r.id)).toContain(row.id);
  const found = listed.body.data.items.find((r: { id: string }) => r.id === row.id);
  expect(found).toMatchObject({ status: 'failed', attempts: 8, userId: customer.user.id, type: 'booking_expired' });
  expect(JSON.stringify(found)).not.toContain('token');
  expect((await request(h.app).post(`/api/v1/admin/notifications/outbox/${row.id}/retry`).auth(customer.accessToken, adminAuth)).status).toBe(401);
  const [first, second] = await Promise.all([
    request(h.app).post(`/api/v1/admin/notifications/outbox/${row.id}/retry`).auth(h.admin.accessToken, adminAuth),
    request(h.app).post(`/api/v1/admin/notifications/outbox/${row.id}/retry`).auth(h.admin.accessToken, adminAuth),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 409]);
  const winner = first.status === 200 ? first : second;
  expect(winner.body.data).toMatchObject({ id: row.id, status: 'pending' });
  const retry = await request(h.app).post(`/api/v1/admin/notifications/outbox/${row.id}/retry`).auth(h.admin.accessToken, adminAuth);
  expect(retry.status).toBe(409);
  expect(retry.body.error.code).toBe('INVALID_TRANSITION');
  const audit = await pool.query("select action from admin_audit_logs where resource_type = 'notification_outbox' and resource_id = $1", [row.id]);
  expect(audit.rows.map((r) => r.action)).toEqual(['outbox.retried']);
});

it('lists late paid attempts without settling them', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;
  const { expert, service } = await h.readyExpert();
  const customer = await h.register('customer');
  const address = (await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, adminAuth)
    .send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const booking = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, adminAuth)
    .send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, adminAuth)).status).toBe(200);
  const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, adminAuth)).body.data;
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [booking.id]);
  const paid = await request(h.app).post('/api/v1/webhooks/payments/demo').send({
    paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid',
    amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken,
  });
  expect(paid.body.data.confirmed).toBe(false);
  const late = await request(h.app).get('/api/v1/admin/payments/late').auth(h.admin.accessToken, adminAuth);
  expect(late.status).toBe(200);
  expect(late.body.data.items.map((p: { id: string }) => p.id)).toContain(intent.payment.id);
  const row = late.body.data.items.find((p: { id: string }) => p.id === intent.payment.id);
  expect(row).toMatchObject({ status: 'paid', bookingStatus: 'expired' });
  expect(row).not.toHaveProperty('callbackTokenHash');
  expect((await request(h.app).get('/api/v1/admin/payments/late').auth(customer.accessToken, adminAuth)).status).toBe(401);
});

it('records worker heartbeats visible in the overview', async () => {
  const repo = new OverviewRepository(database.db);
  await repo.recordHeartbeat({ tickAt: new Date(), expired: 2, claimed: 3, sent: 3, retried: 0, cleaned: 1 });
  const heartbeat = await repo.heartbeat();
  expect(heartbeat).toMatchObject({ key: 'operations-worker', expired: 2, claimed: 3, sent: 3 });
  await repo.recordHeartbeat({ tickAt: new Date(), expired: 0, claimed: 0, sent: 0, retried: 0, cleaned: 0 });
  expect((await repo.heartbeat())?.expired).toBe(0);
});
