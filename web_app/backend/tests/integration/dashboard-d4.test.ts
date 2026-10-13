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
import type { PushSender } from '../../src/integrations/push/push-sender.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-dashboard-d4-password!';
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
  async function settledBooking() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'D4 fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const slots = (await request(app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
    const booking = (await request(app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
    expect((await request(app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
    const intent = (await request(app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
    const paid = await request(app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
    expect(paid.body.data.confirmed).toBe(true);
    expect((await request(app).post(`/api/v1/bookings/${booking.id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
    return { expert, service, customer, booking, paymentId: intent.payment.id as string };
  }
  return { app, admin, register, settledBooking };
}

it('drives the D4 money journey: payment file, refund guard, eligible list, payout and manual transfer', async () => {
  const h = await harness();
  const adminAuth = { type: 'bearer' } as const;
  const { expert, customer, booking, paymentId } = await h.settledBooking();

  // Payment file: enriched read, no provider secrets, RBAC enforced.
  const file = await request(h.app).get(`/api/v1/admin/payments/${paymentId}`).auth(h.admin.accessToken, adminAuth);
  expect(file.status).toBe(200);
  expect(file.body.data).toMatchObject({ id: paymentId, bookingId: booking.id, status: 'paid', amount: booking.totalAmount });
  expect(file.body.data.booking).toMatchObject({ id: booking.id, status: 'completed', totalAmount: booking.totalAmount });
  expect(file.text).not.toContain('callbackTokenHash');
  expect((await request(h.app).get(`/api/v1/admin/payments/${paymentId}`).auth(customer.accessToken, adminAuth)).status).toBe(401);
  expect((await request(h.app).get('/api/v1/admin/payments/00000000-0000-0000-0000-000000000000').auth(h.admin.accessToken, adminAuth)).status).toBe(404);
  const filtered = await request(h.app).get('/api/v1/admin/payments').auth(h.admin.accessToken, adminAuth).query({ status: 'paid', bookingId: booking.id });
  expect(filtered.body.data.items.map((p: { id: string }) => p.id)).toContain(paymentId);

  // Eligible list mirrors the creation predicate; creating drains it.
  const eligible = await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, adminAuth).query({ expertId: expert.user.id });
  expect(eligible.status).toBe(200);
  expect(eligible.body.data.bookings.map((b: { id: string }) => b.id)).toContain(booking.id);
  expect((await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, adminAuth).query({ expertId: customer.user.id })).status).toBe(404);
  const second = await h.settledBooking();
  const [first, concurrent] = await Promise.all([
    request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, adminAuth).send({ expertId: second.expert.user.id, bookingIds: [second.booking.id] }),
    request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, adminAuth).query({ expertId: second.expert.user.id }),
  ]);
  expect(first.status).toBe(201);
  expect(concurrent.status).toBe(200);

  // Create from eligible, double-link guarded, manual transfer recorded once.
  const created = await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, adminAuth)
    .send({ expertId: expert.user.id, bookingIds: [booking.id] });
  expect(created.status).toBe(201);
  expect(created.body.data).toMatchObject({ expertId: expert.user.id, currency: 'EGP', transferredAt: null });
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, adminAuth)
    .send({ expertId: expert.user.id, bookingIds: [booking.id] })).status).toBe(409);
  const transfer = await request(h.app).post(`/api/v1/admin/payouts/${created.body.data.id}/transfer`).auth(h.admin.accessToken, adminAuth)
    .send({ transferRef: 'D4-ops-1' });
  expect(transfer.status).toBe(200);
  expect(transfer.body.data).toMatchObject({ transferRef: 'D4-ops-1' });
  const replayTransfer = await request(h.app).post(`/api/v1/admin/payouts/${created.body.data.id}/transfer`).auth(h.admin.accessToken, adminAuth)
    .send({ transferRef: 'D4-ops-2' });
  expect(replayTransfer.status).toBe(200);
  expect(replayTransfer.body.data.transferRef).toBe('D4-ops-1');

  // Refund after linkage stays blocked; the record is immutable.
  const blocked = await request(h.app).post(`/api/v1/admin/payments/${paymentId}/refund`).auth(h.admin.accessToken, adminAuth).send({});
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.code).toBe('BOOKING_IN_PAYOUT');
});
