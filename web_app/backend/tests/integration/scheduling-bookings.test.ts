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
const password = 'Synthetic-scheduling-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));
const dayAfterCairo = () => cairoDateString(new Date(Date.now() + 2 * 86400000));

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
  async function readyExpert(durationMin = 60) {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'scheduling fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    const week = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' }));
    const schedule = await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({ slots: week });
    expect(schedule.status).toBe(200);
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', isDefault: true })).body.data;
    return { expert, customer, service, address };
  }
  return { app, admin, cityId, register, readyExpert };
}

it('validates weekly schedules and reflects exceptions in offered slots', async () => {
  const h = await harness();
  const { expert, service } = await h.readyExpert();
  const auth = { type: 'bearer' } as const;
  expect((await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, auth).send({ slots: [{ dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }, { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }] })).status).toBe(422);
  expect((await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, auth).send({ slots: [{ dayOfWeek: 1, startTime: '07:00', endTime: '08:00' }] })).status).toBe(422);
  expect((await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, auth).send({ slots: [{ dayOfWeek: 8, startTime: '10:00', endTime: '11:00' }] })).status).toBe(422);
  const from = tomorrowCairo();
  const to = dayAfterCairo();
  const open = await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to });
  expect(open.status).toBe(200);
  expect(open.body.data.timeZone).toBe('Africa/Cairo');
  expect(open.body.data.days).toHaveLength(2);
  for (const day of open.body.data.days) expect(day.slots.length).toBeGreaterThan(0);
  const blocked = await request(h.app).post('/api/v1/experts/me/availability-exceptions').auth(expert.accessToken, auth).send({ date: from, type: 'unavailable' });
  expect(blocked.status).toBe(201);
  const narrowed = await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to });
  expect(narrowed.body.data.days[0].slots).toEqual([]);
  expect(narrowed.body.data.days[1].slots.length).toBeGreaterThan(0);
  expect((await request(h.app).delete(`/api/v1/experts/me/availability-exceptions/${blocked.body.data.id}`).auth(expert.accessToken, auth)).status).toBe(204);
  const restored = await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to });
  expect(restored.body.data.days[0].slots.length).toBeGreaterThan(0);
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from: to, to: from })).status).toBe(422);
  expect((await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: '2030-01-01' })).status).toBe(422);
  expect((await request(h.app).get(`/api/v1/experts/${randomUUID()}/slots`).query({ serviceId: service.id, from, to })).status).toBe(404);
});

it('creates pending bookings with server snapshots and accepts them through the expert', async () => {
  const h = await harness();
  const { expert, customer, service, address } = await h.readyExpert();
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  expect(slots.length).toBeGreaterThan(1);
  const created = await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt, notes: 'first visit' });
  expect(created.status).toBe(201);
  // Money snapshots are self-consistent whatever the live policy holds: no client input is trusted.
  const money = created.body.data;
  const toCents = (v: string) => BigInt(v.replace('.', ''));
  const rateUnits = BigInt(money.commissionRate.replace('.', ''));
  expect(money).toMatchObject({
    status: 'pending', currency: 'EGP', timeZone: 'Africa/Cairo',
    price: '300.50', vatRate: '0.0000', vatAmount: '0.00', totalAmount: '300.50',
  });
  expect(toCents(money.commissionAmount)).toBe((toCents(money.price) * rateUnits + 500000n) / 1000000n);
  expect(toCents(money.expertEarning)).toBe(toCents(money.price) - toCents(money.commissionAmount));
  expect(created.body.data.expiresAt).toEqual(expect.any(String));
  const id = created.body.data.id as string;
  const detail = await request(h.app).get(`/api/v1/bookings/${id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(detail.status).toBe(200);
  expect(detail.body.data.statusHistory.map((h: { status: string }) => h.status)).toEqual(['pending']);
  const accepted = await request(h.app).post(`/api/v1/bookings/${id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe('accepted');
  const after = await request(h.app).get(`/api/v1/bookings/${id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(after.body.data.statusHistory.map((h: { status: string }) => h.status)).toEqual(['pending', 'accepted']);
  const refreshed = await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from });
  expect(refreshed.body.data.days[0].slots.map((s: { startsAt: string }) => s.startsAt)).not.toContain(slots[0].startsAt);
  // Later price edits never rewrite the stored snapshot (policy writes stay in catalog tests to avoid shared-row races).
  await request(h.app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '500.00' });
  const frozen = await request(h.app).get(`/api/v1/bookings/${id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(frozen.body.data).toMatchObject({ price: '300.50', totalAmount: '300.50' });
  expect(toCents(frozen.body.data.commissionAmount) + toCents(frozen.body.data.expertEarning)).toBe(toCents('300.50'));
});

it('blocks concurrent accepts on the same period and keeps the loser pending', async () => {
  const h = await harness();
  const first = await h.readyExpert();
  const secondCustomer = await h.register('customer');
  const secondAddress = (await request(h.app).post('/api/v1/addresses').auth(secondCustomer.accessToken, { type: 'bearer' }).send({ cityId: h.cityId, label: 'home', addressText: 'Cairo synthetic address' })).body.data;
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${first.expert.user.id}/slots`).query({ serviceId: first.service.id, from, to: from })).body.data.days[0].slots;
  const startsAt = slots[0].startsAt as string;
  const one = (await request(h.app).post('/api/v1/bookings').auth(first.customer.accessToken, { type: 'bearer' }).send({ expertId: first.expert.user.id, serviceId: first.service.id, addressId: first.address.id, startsAt })).body.data;
  const two = (await request(h.app).post('/api/v1/bookings').auth(secondCustomer.accessToken, { type: 'bearer' }).send({ expertId: first.expert.user.id, serviceId: first.service.id, addressId: secondAddress.id, startsAt })).body.data;
  const results = await Promise.all([
    request(h.app).post(`/api/v1/bookings/${one.id}/accept`).auth(first.expert.accessToken, { type: 'bearer' }),
    request(h.app).post(`/api/v1/bookings/${two.id}/accept`).auth(first.expert.accessToken, { type: 'bearer' }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(results.find((r) => r.status === 409)!.body.error.code).toBe('SLOT_TAKEN');
  const statuses = await Promise.all(results.map((r, i) => request(h.app).get(`/api/v1/bookings/${i === 0 ? one.id : two.id}`).auth(first.expert.accessToken, { type: 'bearer' })));
  expect(statuses.map((r) => r.body.data.status).sort()).toEqual(['accepted', 'pending']);
});

it('enforces booking roles, ownership and the state machine', async () => {
  const h = await harness();
  const { expert, customer, service, address } = await h.readyExpert();
  const otherExpert = await h.register('expert');
  const otherCustomer = await h.register('customer');
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const created = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
  const id = created.id as string;
  expect((await request(h.app).post(`/api/v1/bookings/${id}/accept`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(h.app).post(`/api/v1/bookings/${id}/accept`).auth(otherExpert.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).get(`/api/v1/bookings/${id}`).auth(otherCustomer.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).get(`/api/v1/bookings/${id}`).auth(otherExpert.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).post(`/api/v1/bookings/${id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(409);
  expect((await request(h.app).post(`/api/v1/bookings/${id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).post(`/api/v1/bookings/${id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(409);
  const adminList = await request(h.app).get('/api/v1/admin/bookings').auth(h.admin.accessToken, { type: 'bearer' }).query({ expertId: expert.user.id, status: 'accepted' });
  expect(adminList.status).toBe(200);
  expect(adminList.body.data.items.map((b: { id: string }) => b.id)).toContain(id);
  expect((await request(h.app).get(`/api/v1/admin/bookings/${id}`).auth(h.admin.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).get('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' })).body.data.items[0].id).toBe(id);
  expect((await request(h.app).get('/api/v1/bookings').auth(otherCustomer.accessToken, { type: 'bearer' })).body.data.items).toEqual([]);
  const cancelled = await request(h.app).post(`/api/v1/bookings/${id}/cancel`).auth(customer.accessToken, { type: 'bearer' }).send({ reason: 'changed plans' });
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data).toMatchObject({ status: 'cancelled', cancellationReason: 'changed plans' });
  expect((await request(h.app).post(`/api/v1/bookings/${id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(409);
  const second = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[1].startsAt })).body.data;
  expect((await request(h.app).post(`/api/v1/bookings/${second.id}/reject`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).post(`/api/v1/bookings/${second.id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(409);
  const third = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[2].startsAt })).body.data;
  expect((await request(h.app).post(`/api/v1/bookings/${third.id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
  // Completion requires payment now: accepted alone is rejected.
  expect((await request(h.app).post(`/api/v1/bookings/${third.id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(409);
  const intent = (await request(h.app).post(`/api/v1/bookings/${third.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  const webhook = await request(h.app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: third.totalAmount, currency: 'EGP', token: intent.callbackToken });
  expect(webhook.body.data.confirmed).toBe(true);
  expect((await request(h.app).post(`/api/v1/bookings/${third.id}/complete`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
});

it('rejects bookings outside working hours and expires overdue bookings', async () => {
  const h = await harness();
  const { expert, customer, service, address } = await h.readyExpert();
  const night = new Date(`${tomorrowCairo()}T00:30:00+02:00`);
  const outside = await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: night.toISOString() });
  expect(outside.status).toBe(409);
  expect(outside.body.error.code).toBe('SLOT_UNAVAILABLE');
  const from = tomorrowCairo();
  const slots = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
  const created = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [created.id]);
  const late = await request(h.app).post(`/api/v1/bookings/${created.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  expect(late.status).toBe(409);
  expect(late.body.error.code).toBe('BOOKING_EXPIRED');
  const second = (await request(h.app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[1].startsAt })).body.data;
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [second.id]);
  // Lazy expiry on read is row-scoped; the global job is covered by a stubbed unit test
  // because the integration database is shared across test files running in parallel.
  const reread = await request(h.app).get(`/api/v1/bookings/${second.id}`).auth(customer.accessToken, { type: 'bearer' });
  expect(reread.body.data.status).toBe('expired');
  expect(reread.body.data.statusHistory.at(-1)).toMatchObject({ status: 'expired', changedBy: null });
});
