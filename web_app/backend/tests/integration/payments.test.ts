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
import { cairoDateString } from '../../src/shared/cairo-time.js';
import type { Notifier } from '../../src/modules/notifications/notifier.js';

const stubNotifier: Notifier = { enqueue: async () => {} };

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-payments-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const app = createApp({
    auth,
    catalog: new CatalogService(new CatalogRepository(database.db)),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, stubNotifier),
    payment: new PaymentService(new PaymentRepository(database.db), stubNotifier),
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
  async function acceptedBooking(price = '300.50') {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'payments fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price });
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
    await request(app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
    return { expert, customer, service, booking };
  }
  return { app, admin, cityId, register, acceptedBooking };
}

const webhook = (app: ReturnType<typeof createApp>, body: object) => request(app).post('/api/v1/webhooks/payments/demo').send(body);

it('guards payment initiation by booking state, role and ownership', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.acceptedBooking();
  const other = await h.register('customer');
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(other.accessToken, { type: 'bearer' })).status).toBe(404);
  const fresh = await h.acceptedBooking();
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${fresh.expert.user.id}/slots`).query({ serviceId: fresh.service.id, from, to: from })).body.data.days[0].slots;
  const customer2 = await h.register('customer');
  const address2 = (await request(h.app).post('/api/v1/addresses').auth(customer2.accessToken, { type: 'bearer' }).send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700' })).body.data;
  const notAccepted = await request(h.app).post('/api/v1/bookings').auth(customer2.accessToken, { type: 'bearer' }).send({ expertId: fresh.expert.user.id, serviceId: fresh.service.id, addressId: address2.id, startsAt: slots[1].startsAt });
  expect((await request(h.app).post(`/api/v1/bookings/${notAccepted.body.data.id}/payments`).auth(customer2.accessToken, { type: 'bearer' })).status).toBe(409);
  const initiated = await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' });
  expect(initiated.status).toBe(201);
  expect(initiated.body.data.payment).toMatchObject({ bookingId: booking.id, amount: booking.totalAmount, currency: 'EGP', status: 'pending', provider: 'demo' });
  expect(initiated.body.data.callbackToken).toMatch(/^dpt_/);
  expect(initiated.body.data.payment).not.toHaveProperty('callbackTokenHash');
  expect(initiated.text).not.toContain('callbackTokenHash');
});

it('confirms the booking on a verified paid callback without trusting client amounts', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.acceptedBooking('250.00');
  const initiated = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  const event = { paymentId: initiated.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: initiated.callbackToken };
  const first = await webhook(h.app, event);
  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({ confirmed: true, payment: { status: 'paid' } });
  expect(first.body.data.payment.paidAt).toEqual(expect.any(String));
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(detail.body.data.status).toBe('confirmed');
  expect(detail.body.data.statusHistory.map((s: { status: string }) => s.status)).toEqual(['pending', 'accepted', 'confirmed']);
  expect(detail.body.data.statusHistory.at(-1).changedBy).toBeNull();
  const expertView = await request(h.app).get(`/api/v1/bookings/${booking.id}/payments`).auth(expert.accessToken, { type: 'bearer' });
  expect(expertView.body.data).toHaveLength(1);
  // Redelivery is a no-op: one paid effect and one confirmation history row.
  const replay = await webhook(h.app, event);
  expect(replay.status).toBe(200);
  expect(replay.body.data.deduped).toBe(true);
  const reread = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(reread.body.data.statusHistory.filter((s: { status: string }) => s.status === 'confirmed')).toHaveLength(1);
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(409);
});

it('rejects untrusted callbacks and records failures without confirming', async () => {
  const h = await harness();
  const { customer, booking } = await h.acceptedBooking();
  const initiated = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  const base = { paymentId: initiated.payment.id, amount: booking.totalAmount, currency: 'EGP', token: initiated.callbackToken };
  expect((await webhook(h.app, { ...base, paymentId: randomUUID(), eventId: `evt-${randomUUID()}`, outcome: 'paid' })).status).toBe(404);
  expect((await webhook(h.app, { ...base, eventId: `evt-${randomUUID()}`, outcome: 'paid', token: 'dpt_wrong-token-value-1234567890' })).status).toBe(401);
  const mismatch = await webhook(h.app, { ...base, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: '1.00' });
  expect(mismatch.status).toBe(409);
  expect(mismatch.body.error.code).toBe('AMOUNT_MISMATCH');
  const second = await h.acceptedBooking();
  const intent2 = (await request(h.app).post(`/api/v1/bookings/${second.booking.id}/payments`).auth(second.customer.accessToken, { type: 'bearer' })).body.data;
  const failed = await webhook(h.app, { paymentId: intent2.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'failed', amount: second.booking.totalAmount, currency: 'EGP', token: intent2.callbackToken, failureReason: 'insufficient funds' });
  expect(failed.status).toBe(200);
  expect(failed.body.data).toMatchObject({ confirmed: false, payment: { status: 'failed', failureReason: 'insufficient funds' } });
  const stillAccepted = await request(h.app).get(`/api/v1/bookings/${second.booking.id}`).auth(second.customer.accessToken, { type: 'bearer' });
  expect(stillAccepted.body.data.status).toBe('accepted');
});

it('records late success without resurrecting an expired booking, consistently under race', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.acceptedBooking();
  const initiated = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [booking.id]);
  const event = { paymentId: initiated.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: initiated.callbackToken };
  const [acceptResult, webhookResult] = await Promise.all([
    request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' }),
    webhook(h.app, event),
  ]);
  expect(acceptResult.status).toBe(409);
  expect(webhookResult.status).toBe(200);
  expect(webhookResult.body.data.confirmed).toBe(false);
  const final = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(final.body.data.status).toBe('expired');
  const payments = await request(h.app).get(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' });
  expect(payments.body.data[0]).toMatchObject({ status: 'paid' });
});

it('lets operations refund a settled payment with audit-safe booking effects', async () => {
  const h = await harness();
  const { customer, booking } = await h.acceptedBooking();
  const initiated = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  await webhook(h.app, { paymentId: initiated.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: initiated.callbackToken });
  expect((await request(h.app).post(`/api/v1/admin/payments/${initiated.payment.id}/refund`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
  const refunded = await request(h.app).post(`/api/v1/admin/payments/${initiated.payment.id}/refund`).auth(h.admin.accessToken, { type: 'bearer' }).send({ reason: 'duplicate charge' });
  expect(refunded.status).toBe(200);
  expect(refunded.body.data).toMatchObject({ status: 'refunded', refundedAmount: booking.totalAmount });
  expect(refunded.body.data.refundedAt).toEqual(expect.any(String));
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(detail.body.data.status).toBe('cancelled');
  expect(detail.body.data.cancellationReason).toBe('duplicate charge');
  const replay = await request(h.app).post(`/api/v1/admin/payments/${initiated.payment.id}/refund`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(replay.status).toBe(200);
  expect(replay.body.data.status).toBe('refunded');
  const audit = await pool.query("select action, actor_id, details from admin_audit_logs where resource_type = 'payment' and resource_id = $1", [initiated.payment.id]);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0]).toMatchObject({ action: 'payment.refunded', actor_id: h.admin.user.id });
  expect(audit.rows[0].details).toMatchObject({ bookingId: booking.id, amount: booking.totalAmount });
  const second = await h.acceptedBooking();
  const intent2 = (await request(h.app).post(`/api/v1/bookings/${second.booking.id}/payments`).auth(second.customer.accessToken, { type: 'bearer' })).body.data;
  expect((await request(h.app).post(`/api/v1/admin/payments/${intent2.payment.id}/refund`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(409);
  const adminList = await request(h.app).get('/api/v1/admin/payments').auth(h.admin.accessToken, { type: 'bearer' }).query({ bookingId: booking.id, status: 'refunded' });
  expect(adminList.body.data.items.map((p: { id: string }) => p.id)).toContain(initiated.payment.id);
});

it('exposes an enriched admin payment file without provider secrets', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.acceptedBooking();
  const initiated = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  expect((await request(h.app).get(`/api/v1/admin/payments/${initiated.payment.id}`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await request(h.app).get(`/api/v1/admin/payments/${expert.user.id}`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(404);
  const detail = await request(h.app).get(`/api/v1/admin/payments/${initiated.payment.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(detail.status).toBe(200);
  expect(detail.body.data).toMatchObject({ id: initiated.payment.id, bookingId: booking.id, status: 'pending' });
  expect(detail.body.data.booking).toMatchObject({
    id: booking.id, customerId: customer.user.id, expertId: expert.user.id, status: 'accepted', totalAmount: booking.totalAmount,
  });
  expect(detail.text).not.toContain('callbackTokenHash');
  expect(detail.text).not.toContain(initiated.callbackToken);
});
