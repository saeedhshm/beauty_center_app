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
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { AvailabilityRepository } from '../../src/modules/availability/availability.repository.js';
import { AvailabilityService } from '../../src/modules/availability/availability.service.js';
import { BookingRepository } from '../../src/modules/bookings/booking.repository.js';
import { BookingService } from '../../src/modules/bookings/booking.service.js';
import type { Notifier } from '../../src/modules/notifications/notifier.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const stubNotifier: Notifier = { enqueue: async () => {} };

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), NODE_ENV: 'test', DB_TIMEOUT_MS: '10000' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-password-for-tests!';
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}`, AUTH_OTP_MODE: 'demo' }));  const availabilityRepository = new AvailabilityRepository(database.db);
  const app = createApp({
    checkDatabase: database.check,
    logger: createLogger('silent'),
    auth,
    catalog: new CatalogService(new CatalogRepository(database.db)),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, stubNotifier),
  });
  const adminPhone = phone();
  await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [randomUUID(), adminPhone, await hashPassword(password)]);
  const login = await request(app).post('/api/v1/admin/auth/login').send({ phone: adminPhone, password });
  expect(login.status).toBe(200);
  const admin = login.body.data;
  const cityId = (await pool.query("select id from cities where code='EG-CAI'")).rows[0]?.id as number;
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
  async function readyBooking() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.data.accessToken, { type: 'bearer' }).send({ cityId, bio: 'idempotency fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.data.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    await request(app).post(`/api/v1/admin/experts/${expert.data.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.data.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    const week = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' }));
    await request(app).put('/api/v1/experts/me/availability').auth(expert.data.accessToken, { type: 'bearer' }).send({ slots: week });
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.data.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const slots = (await request(app).get(`/api/v1/experts/${expert.data.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
    return { expert, customer, service, address, startsAt: slots[0].startsAt as string };
  }
  return { app, register, readyBooking };
}

it('replays the same booking for a repeated Idempotency-Key without duplicating', async () => {
  const h = await harness();
  const { expert, customer, service, address, startsAt } = await h.readyBooking();
  const key = randomUUID();
  const body = { expertId: expert.data.user.id, serviceId: service.id, addressId: address.id, startsAt };
  const first = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
  expect(first.status).toBe(201);
  const replay = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
  expect(replay.status).toBe(201);
  expect(replay.body.data).toEqual(first.body.data);
  const count = await pool.query('select count(*)::int as total from bookings where customer_id = $1', [customer.data.user.id]);
  expect(count.rows[0].total).toBe(1);
  const stored = await pool.query("select status, response_status from idempotency_keys where user_id = $1 and scope = 'booking.create' and key = $2", [customer.data.user.id, key]);
  expect(stored.rows[0]).toMatchObject({ status: 'completed', response_status: 201 });
});

it('rejects malformed keys and scopes keys per customer', async () => {
  const h = await harness();
  const { expert, customer, service, address, startsAt } = await h.readyBooking();
  const other = await h.register('customer');
  const body = { expertId: expert.data.user.id, serviceId: service.id, addressId: address.id, startsAt };
  expect((await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', 'not-a-uuid').send(body)).status).toBe(422);
  const key = randomUUID();
  const mine = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
  expect(mine.status).toBe(201);
  // Same key from another customer starts its own attempt instead of replaying mine.
  const otherAddress = (await request(h.app).post('/api/v1/addresses').auth(other.data.accessToken, { type: 'bearer' }).send({ cityId: address.cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
  const theirs = await request(h.app).post('/api/v1/bookings').auth(other.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
    .send({ expertId: expert.data.user.id, serviceId: service.id, addressId: otherAddress.id, startsAt });
  expect(theirs.status).toBe(201);
  expect(theirs.body.data.id).not.toBe(mine.body.data.id);
});

it('releases the key when creation fails so the client can retry cleanly', async () => {
  const h = await harness();
  const { expert, customer, service, address, startsAt } = await h.readyBooking();
  const key = randomUUID();
  const bad = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
    .send({ expertId: expert.data.user.id, serviceId: 32767, addressId: address.id, startsAt });
  expect(bad.status).toBe(409);
  const retry = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
    .send({ expertId: expert.data.user.id, serviceId: service.id, addressId: address.id, startsAt });
  expect(retry.status).toBe(201);
});

it('rejects a retry while a previous attempt with the same key is still running', async () => {
  const h = await harness();
  const { expert, customer, service, address, startsAt } = await h.readyBooking();
  const key = randomUUID();
  await pool.query(
    "insert into idempotency_keys (user_id, scope, key, status, expires_at) values ($1, 'booking.create', $2, 'in_progress', now() + interval '1 hour')",
    [customer.data.user.id, key],
  );
  const busy = await request(h.app).post('/api/v1/bookings').auth(customer.data.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
    .send({ expertId: expert.data.user.id, serviceId: service.id, addressId: address.id, startsAt });
  expect(busy.status).toBe(409);
  expect(busy.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
});
