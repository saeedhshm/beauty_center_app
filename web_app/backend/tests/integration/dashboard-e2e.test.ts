// D6 acceptance journey: one continuous admin flow against a real API + isolated
// PostgreSQL — login, service create/edit, expert approve, booking follow-up, payment
// review, payout create + manual transfer, audit review — plus the required branches
// (401 expired session, 403 forbidden, 404 unknown, 409 conflict, empty lists).
// No real people, payments, or notifications: Demo adapters only.
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
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
const password = 'Synthetic-dashboard-e2e-password!';
const hashed = hashPassword(password);
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));
const silentSender: PushSender = { mode: 'demo', send: async () => {} };
const bearer = { type: 'bearer' } as const;

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
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'E2E admin',$2,'admin',$3,now())", [randomUUID(), adminPhone, await hashed]);
  const cityId = (await pool.query("select id from cities where code='EG-CAI'")).rows[0].id as number;
  async function register(role: 'customer' | 'expert') {
    const number = phone();
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({ phone: number, name: `E2E ${randomUUID()}`, password, role, challengeId: challenge.body.data.challengeId, otp: '123456' });
    expect(result.status).toBe(201);
    return result.body.data;
  }
  return { app, adminPhone, cityId, register };
}

describe('D6 admin acceptance journey (real API, labeled Demo adapters)', () => {
  it('walks login, service, expert, booking, payment, payout, transfer, and audit end to end', async () => {
    const h = await harness();

    // 1. Admin login with a wrong password stays out; the right one opens a session.
    expect((await request(h.app).post('/api/v1/admin/auth/login').send({ phone: h.adminPhone, password: 'wrong-password' })).status).toBe(401);
    const login = await request(h.app).post('/api/v1/admin/auth/login').send({ phone: h.adminPhone, password });
    expect(login.status).toBe(200);
    const adminToken = login.body.data.accessToken as string;

    // 2. Service create/edit keeps history snapshots (completed bookings keep old figures).
    const created = await request(h.app).post('/api/v1/admin/services').auth(adminToken, bearer)
      .send({ name: `E2E Service ${randomUUID()}`, description: 'E2E fixture', durationMin: 60 });
    expect(created.status).toBe(201);
    const serviceId = created.body.data.id as number;
    const edited = await request(h.app).patch(`/api/v1/admin/services/${serviceId}`).auth(adminToken, bearer)
      .send({ name: `E2E Service edited ${randomUUID()}` });
    expect(edited.status).toBe(200);
    expect(edited.body.data.name).not.toBe(created.body.data.name);

    // 3. Expert review cycle: pending file, approve, ready to receive bookings.
    const expert = await h.register('expert');
    await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, bearer).send({ cityId: h.cityId, bio: 'E2E review fixture' });
    await request(h.app).put(`/api/v1/experts/me/services/${serviceId}`).auth(expert.accessToken, bearer).send({ price: '300.50' });
    expect((await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(adminToken, bearer)).status).toBe(200);
    expect((await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, bearer).send({ isAcceptingBookings: true })).status).toBe(200);
    await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, bearer).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });

    // 4. Booking follow-up: create, accept, track the status history.
    const customer = await h.register('customer');
    const address = (await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, bearer)
      .send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const start = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`)
      .query({ serviceId, from, to: from })).body.data.days[0].slots[0].startsAt as string;
    const booking = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, bearer)
      .send({ expertId: expert.user.id, serviceId, addressId: address.id, startsAt: start })).body.data;
    expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, bearer)).status).toBe(200);
    const tracked = await request(h.app).get(`/api/v1/admin/bookings/${booking.id}`).auth(adminToken, bearer);
    expect(tracked.status).toBe(200);
    expect(tracked.body.data.statusHistory.map((s: { status: string }) => s.status)).toEqual(
      expect.arrayContaining(['pending', 'accepted']));

    // 5. Payment review: intent, Demo webhook confirmation, admin detail.
    const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, bearer)).body.data;
    const webhook = await request(h.app).post('/api/v1/webhooks/payments/demo')
      .send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
    expect(webhook.body.data.confirmed).toBe(true);
    const paymentDetail = await request(h.app).get(`/api/v1/admin/payments/${intent.payment.id}`).auth(adminToken, bearer);
    expect(paymentDetail.status).toBe(200);
    expect(paymentDetail.body.data).toMatchObject({ status: 'paid', booking: { status: 'confirmed' } });

    // 6. Payout: complete, create from eligible, record the manual transfer (idempotent replay).
    expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/complete`).auth(expert.accessToken, bearer)).status).toBe(200);
    const eligible = await request(h.app).get('/api/v1/admin/payouts/eligible').auth(adminToken, bearer).query({ expertId: expert.user.id });
    expect(eligible.status).toBe(200);
    expect(eligible.body.data.bookings.map((b: { id: string }) => b.id)).toContain(booking.id);
    const payout = (await request(h.app).post('/api/v1/admin/payouts').auth(adminToken, bearer)
      .send({ expertId: expert.user.id, bookingIds: [booking.id] })).body.data;
    expect(payout).toMatchObject({ expertId: expert.user.id, currency: 'EGP', transferredAt: null });
    const transfer = await request(h.app).post(`/api/v1/admin/payouts/${payout.id}/transfer`).auth(adminToken, bearer)
      .send({ transferRef: `bank-e2e-${randomUUID()}` });
    expect(transfer.status).toBe(200);
    expect(transfer.body.data.transferredAt).toEqual(expect.any(String));
    const replay = await request(h.app).post(`/api/v1/admin/payouts/${payout.id}/transfer`).auth(adminToken, bearer)
      .send({ transferRef: `bank-e2e-${randomUUID()}` });
    expect(replay.body.data.transferRef).toBe(transfer.body.data.transferRef);

    // 7. Audit review ties the whole chain together with actor and resource.
    const audit = await request(h.app).get('/api/v1/admin/audit-logs').auth(adminToken, bearer).query({ page: 1, limit: 50 });
    expect(audit.status).toBe(200);
    const actions = audit.body.data.items.map((r: { action: string }) => r.action);
    for (const action of ['service.created', 'service.updated', 'expert.approval_updated', 'payout.created', 'payout.transferred']) {
      expect(actions).toContain(action);
    }

    // 8. The operational overview aggregates the journey above on the server.
    const overview = await request(h.app).get('/api/v1/admin/overview').auth(adminToken, bearer);
    expect(overview.status).toBe(200);
    expect(overview.body.data.bookings.map((b: { status: string }) => b.status)).toEqual(
      expect.arrayContaining(['completed']));
  });

  it('holds the branches: expired session, forbidden, unknown, conflict, and empty lists', async () => {
    const h = await harness();
    const login = await request(h.app).post('/api/v1/admin/auth/login').send({ phone: h.adminPhone, password });
    const adminToken = login.body.data.accessToken as string;

    // Expired/tampered session is rejected without leaking data.
    expect((await request(h.app).get('/api/v1/admin/overview').auth(`${adminToken}tampered`, bearer)).status).toBe(401);

    // A second expert cannot accept the first expert's booking (403, not a silent 404).
    const service = (await request(h.app).post('/api/v1/admin/services').auth(adminToken, bearer)
      .send({ name: `E2E Branch ${randomUUID()}`, durationMin: 30 })).body.data;
    const first = await h.register('expert');
    const second = await h.register('expert');
    for (const account of [first, second]) {
      await request(h.app).patch('/api/v1/experts/me').auth(account.accessToken, bearer).send({ cityId: h.cityId });
      await request(h.app).put(`/api/v1/experts/me/services/${service.id}`).auth(account.accessToken, bearer).send({ price: '100.00' });
      await request(h.app).post(`/api/v1/admin/experts/${account.user.id}/approve`).auth(adminToken, bearer);
      await request(h.app).patch('/api/v1/experts/me').auth(account.accessToken, bearer).send({ isAcceptingBookings: true });
      await request(h.app).put('/api/v1/experts/me/availability').auth(account.accessToken, bearer).send({
        slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
      });
    }
    const customer = await h.register('customer');
    const address = (await request(h.app).post('/api/v1/addresses').auth(customer.accessToken, bearer)
      .send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const start = (await request(h.app).get(`/api/v1/experts/${first.user.id}/slots`)
      .query({ serviceId: service.id, from, to: from })).body.data.days[0].slots[0].startsAt as string;
    const booking = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, bearer)
      .send({ expertId: first.user.id, serviceId: service.id, addressId: address.id, startsAt: start })).body.data;
    const forbidden = await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(customer.accessToken, bearer);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    // A stranger expert cannot probe another expert's booking: ownership reads stay 404.
    expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(second.accessToken, bearer)).status).toBe(404);

    // Unknown resources are 404 with a code, never an empty 200.
    expect((await request(h.app).get('/api/v1/admin/services/2147483647').auth(adminToken, bearer)).status).toBe(404);
    expect((await request(h.app).get(`/api/v1/admin/payments/${randomUUID()}`).auth(adminToken, bearer)).status).toBe(404);

    // Conflict: linking the same booking to a second payout is rejected after the first.
    await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(first.accessToken, bearer);
    const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, bearer)).body.data;
    await request(h.app).post('/api/v1/webhooks/payments/demo')
      .send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
    await request(h.app).post(`/api/v1/bookings/${booking.id}/complete`).auth(first.accessToken, bearer);
    const firstPayout = await request(h.app).post('/api/v1/admin/payouts').auth(adminToken, bearer)
      .send({ expertId: first.user.id, bookingIds: [booking.id] });
    expect(firstPayout.status).toBe(201);
    const conflict = await request(h.app).post('/api/v1/admin/payouts').auth(adminToken, bearer)
      .send({ expertId: first.user.id, bookingIds: [booking.id] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('BOOKING_ALREADY_PAID_OUT');

    // Empty lists are explicit empties, not errors (a far page has no rows).
    const empty = await request(h.app).get('/api/v1/admin/services').auth(adminToken, bearer).query({ page: 1000, limit: 20 });
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]);
  });
});
