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
import type { Notifier } from '../../src/modules/notifications/notifier.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const stubNotifier: Notifier = { enqueue: async () => {} };

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-payouts-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));
const toCents = (v: string) => BigInt(v.replace('.', ''));

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const app = createApp({
    auth,
    catalog: new CatalogService(new CatalogRepository(database.db)),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, stubNotifier),
    payment: new PaymentService(new PaymentRepository(database.db), stubNotifier),
    payout: new PayoutService(new PayoutRepository(database.db)),
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
  async function readyExpert(price = '300.50') {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'payouts fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    return { expert, service };
  }
  /** Full journey to a completed, paid booking with server snapshots. */
  async function settledBooking(target?: { expert: { accessToken: string; user: { id: string } }; service: { id: number } }, startsAt?: string) {
    const { expert, service } = target ?? await readyExpert();
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const start = startsAt ?? (await request(app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots[0].startsAt;
    const booking = (await request(app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: start })).body.data;
    expect((await request(app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
    const intent = (await request(app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
    const paid = await request(app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
    expect(paid.body.data.confirmed).toBe(true);
    expect((await request(app).post(`/api/v1/bookings/${booking.id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
    return { expert, service, customer, booking, paymentId: intent.payment.id as string };
  }
  return { app, admin, cityId, register, readyExpert, settledBooking };
}

it('records a payout from server-computed earnings and blocks double payout, even concurrently', async () => {
  const h = await harness();
  const target = await h.readyExpert('300.50');
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${target.expert.user.id}/slots`).query({ serviceId: target.service.id, from, to: from })).body.data.days[0].slots;
  const one = await h.settledBooking(target, slots[0].startsAt);
  const two = await h.settledBooking(target, slots[2].startsAt);
  const expected = toCents(one.booking.expertEarning) + toCents(two.booking.expertEarning);
  const body = { expertId: target.expert.user.id, bookingIds: [one.booking.id, two.booking.id] };
  const [first, second] = await Promise.all([
    request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send(body),
    request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send(body),
  ]);
  expect([first.status, second.status].sort()).toEqual([201, 409]);
  const winner = first.status === 201 ? first : second;
  const loser = first.status === 201 ? second : first;
  expect(loser.body.error.code).toBe('BOOKING_ALREADY_PAID_OUT');
  expect(winner.body.data).toMatchObject({ expertId: target.expert.user.id, currency: 'EGP', transferredAt: null });
  expect(toCents(winner.body.data.amount)).toBe(expected);
  const detail = await request(h.app).get(`/api/v1/admin/payouts/${winner.body.data.id}`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(detail.body.data.bookings.map((b: { id: string }) => b.id).sort()).toEqual([one.booking.id, two.booking.id].sort());
  const retry = await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send(body);
  expect(retry.status).toBe(409);
  const audit = await pool.query("select action from admin_audit_logs where resource_type='payout' and resource_id=$1", [winner.body.data.id]);
  expect(audit.rows.map((r) => r.action)).toContain('payout.created');
});

it('rejects ineligible bookings, wrong experts and wrong roles', async () => {
  const h = await harness();
  const { expert, service, booking } = await h.settledBooking();
  const otherExpert = (await h.readyExpert()).expert;
  const other = await h.register('customer');
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(expert.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [booking.id] })).status).toBe(401);
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: otherExpert.user.id, bookingIds: [booking.id] })).status).toBe(409);
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [booking.id, booking.id] })).status).toBe(422);
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [] })).status).toBe(422);
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [randomUUID()] })).status).toBe(404);
  // Accepted but not completed is not eligible.
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const customer2 = await h.register('customer');
  const address2 = (await request(h.app).post('/api/v1/addresses').auth(customer2.accessToken, { type: 'bearer' }).send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700' })).body.data;
  const pending = (await request(h.app).post('/api/v1/bookings').auth(customer2.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address2.id, startsAt: slots[5].startsAt })).body.data;
  await request(h.app).post(`/api/v1/bookings/${pending.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  expect((await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [pending.id] })).status).toBe(409);
  expect((await request(h.app).get(`/api/v1/experts/me/payouts/${booking.id}`).auth(other.accessToken, { type: 'bearer' })).status).toBe(403);
});

it('transfers recorded payouts immutably and reports expert earnings from the server', async () => {
  const h = await harness();
  const { expert, service, booking } = await h.settledBooking();
  const created = (await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [booking.id] })).body.data;
  const before = await request(h.app).get('/api/v1/experts/me/earnings').auth(expert.accessToken, { type: 'bearer' });
  expect(before.body.data.recorded).toContainEqual({ currency: 'EGP', amount: created.amount });
  expect(before.body.data.transferred).toEqual([]);
  expect(before.body.data.eligible).toEqual([]);
  const transferred = await request(h.app).post(`/api/v1/admin/payouts/${created.id}/transfer`).auth(h.admin.accessToken, { type: 'bearer' }).send({ transferRef: 'bank-ops-001' });
  expect(transferred.status).toBe(200);
  expect(transferred.body.data).toMatchObject({ transferRef: 'bank-ops-001' });
  expect(transferred.body.data.transferredAt).toEqual(expect.any(String));
  const replay = await request(h.app).post(`/api/v1/admin/payouts/${created.id}/transfer`).auth(h.admin.accessToken, { type: 'bearer' }).send({ transferRef: 'bank-ops-002' });
  expect(replay.status).toBe(200);
  expect(replay.body.data.transferRef).toBe('bank-ops-001');
  const after = await request(h.app).get('/api/v1/experts/me/earnings').auth(expert.accessToken, { type: 'bearer' });
  expect(after.body.data.recorded).toEqual([]);
  expect(after.body.data.transferred).toContainEqual({ currency: 'EGP', amount: created.amount });
  const own = await request(h.app).get('/api/v1/experts/me/payouts').auth(expert.accessToken, { type: 'bearer' });
  expect(own.body.data.items.map((p: { id: string }) => p.id)).toContain(created.id);
  const ownDetail = await request(h.app).get(`/api/v1/experts/me/payouts/${created.id}`).auth(expert.accessToken, { type: 'bearer' });
  expect(ownDetail.body.data.bookings.map((b: { id: string }) => b.id)).toContain(booking.id);
  const otherExpert = await h.register('expert');
  expect((await request(h.app).get(`/api/v1/experts/me/payouts/${created.id}`).auth(otherExpert.accessToken, { type: 'bearer' })).status).toBe(404);
  // A second completed, paid, unlinked booking stays eligible.
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const second = await h.settledBooking({ expert, service }, slots[3].startsAt);
  const earnings = await request(h.app).get('/api/v1/experts/me/earnings').auth(expert.accessToken, { type: 'bearer' });
  expect(earnings.body.data.eligible).toContainEqual({ currency: 'EGP', amount: second.booking.expertEarning });
});

it('blocks refunds once a booking is linked to a recorded payout', async () => {
  const h = await harness();
  const { expert, booking, paymentId } = await h.settledBooking();
  await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [booking.id] });
  const refund = await request(h.app).post(`/api/v1/admin/payments/${paymentId}/refund`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(refund.status).toBe(409);
  expect(refund.body.error.code).toBe('BOOKING_IN_PAYOUT');
});

it('lists payout-eligible bookings per expert with the creation predicate', async () => {
  const h = await harness();
  const target = await h.readyExpert('300.50');
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${target.expert.user.id}/slots`).query({ serviceId: target.service.id, from, to: from })).body.data.days[0].slots;
  const one = await h.settledBooking(target, slots[0].startsAt);
  const customer = await h.register('expert');
  expect((await request(h.app).get('/api/v1/admin/payouts/eligible').auth(customer.accessToken, { type: 'bearer' }).query({ expertId: target.expert.user.id })).status).toBe(401);
  expect((await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(422);
  expect((await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, { type: 'bearer' }).query({ expertId: one.customer.user.id })).status).toBe(404);
  const eligible = await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, { type: 'bearer' }).query({ expertId: target.expert.user.id });
  expect(eligible.status).toBe(200);
  expect(eligible.body.data.expertId).toBe(target.expert.user.id);
  expect(eligible.body.data.bookings.map((b: { id: string }) => b.id)).toContain(one.booking.id);
  expect(eligible.body.data.bookings.find((b: { id: string }) => b.id === one.booking.id)).toMatchObject({
    status: 'completed', totalAmount: one.booking.totalAmount, expertEarning: one.booking.expertEarning, currency: 'EGP',
  });
  const created = await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' })
    .send({ expertId: target.expert.user.id, bookingIds: [one.booking.id] });
  expect(created.status).toBe(201);
  const drained = await request(h.app).get('/api/v1/admin/payouts/eligible').auth(h.admin.accessToken, { type: 'bearer' }).query({ expertId: target.expert.user.id });
  expect(drained.body.data.bookings.map((b: { id: string }) => b.id)).not.toContain(one.booking.id);
});
