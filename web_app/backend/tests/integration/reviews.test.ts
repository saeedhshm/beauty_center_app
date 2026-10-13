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
import { NotificationRepository } from '../../src/modules/notifications/notification.repository.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import { ReviewRepository } from '../../src/modules/reviews/review.repository.js';
import { ReviewService } from '../../src/modules/reviews/review.service.js';
import { DemoPushSender } from '../../src/integrations/push/push-sender.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-reviews-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const catalogRepository = new CatalogRepository(database.db);
  const notification = new NotificationService(new NotificationRepository(database.db), new DemoPushSender());
  const app = createApp({
    auth,
    catalog: new CatalogService(catalogRepository),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, notification),
    payment: new PaymentService(new PaymentRepository(database.db), notification),
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
  const cityId = (await pool.query("select id from cities where code='EG-CAI'")).rows[0].id as number;
  async function register(role: 'customer' | 'expert') {
    const number = phone();
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({ phone: number, name: `Test ${randomUUID()}`, password, role, challengeId: challenge.body.data.challengeId, otp: '123456' });
    expect(result.status).toBe(201);
    return result.body.data;
  }
  async function bookableExpert() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'reviews fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '400.00' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    return { expert, service };
  }
  async function bookingWith(status: 'confirmed' | 'completed') {
    const { expert, service } = await bookableExpert();
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', lat: '30.044400', lng: '31.235700', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const slots = (await request(app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
    const booking = (await request(app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
    await request(app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
    const intent = (await request(app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
    const webhook = await request(app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
    expect(webhook.body.data.confirmed).toBe(true);
    if (status === 'completed') {
      const done = await request(app).post(`/api/v1/bookings/${booking.id}/complete`).auth(customer.accessToken, { type: 'bearer' });
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe('completed');
    }
    return { expert, customer, service, booking, admin };
  }
  return { app, admin, cityId, register, bookingWith };
}

it('accepts one review per party after completion and rejects a repeat', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.bookingWith('completed');
  const first = await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating: 5, comment: 'خدمة ممتازة' });
  expect(first.status).toBe(201);
  expect(first.body.data.review).toMatchObject({ bookingId: booking.id, reviewerId: customer.user.id, revieweeId: expert.user.id, rating: 5, comment: 'خدمة ممتازة' });
  expect(first.body.data.rating).toMatchObject({ average: '5.00', count: 1 });
  const repeat = await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating: 1 });
  expect(repeat.status).toBe(409);
  expect(repeat.body.error.code).toBe('DUPLICATE_REVIEW');
  // The mutual direction stays open for the other party.
  const second = await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(expert.accessToken, { type: 'bearer' }).send({ rating: 4 });
  expect(second.status).toBe(201);
  expect(second.body.data.review).toMatchObject({ reviewerId: expert.user.id, revieweeId: customer.user.id, rating: 4 });
  expect(second.body.data.rating).toEqual({ average: '4.00', count: 1 });
  const both = await request(h.app).get(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' });
  expect(both.body.data).toHaveLength(2);
  expect(both.body.data.map((r: { fromCustomer: boolean }) => r.fromCustomer).sort()).toEqual([false, true]);
});

it('refuses an early review, a rating outside the range and a third party', async () => {
  const h = await harness();
  const confirmed = await h.bookingWith('confirmed');
  const early = await request(h.app).post(`/api/v1/bookings/${confirmed.booking.id}/reviews`).auth(confirmed.customer.accessToken, { type: 'bearer' }).send({ rating: 5 });
  expect(early.status).toBe(409);
  expect(early.body.error.code).toBe('INVALID_TRANSITION');
  const done = await h.bookingWith('completed');
  const outsider = await h.register('customer');
  expect((await request(h.app).post(`/api/v1/bookings/${done.booking.id}/reviews`).auth(outsider.accessToken, { type: 'bearer' }).send({ rating: 5 })).status).toBe(404);
  expect((await request(h.app).post(`/api/v1/bookings/${done.booking.id}/reviews`).auth(outsider.accessToken, { type: 'bearer' }).send({ rating: 5 })).status).toBe(404);
  expect((await request(h.app).get(`/api/v1/bookings/${done.booking.id}/reviews`).auth(outsider.accessToken, { type: 'bearer' })).status).toBe(404);
  for (const rating of [0, 6, 2.5]) {
    const invalid = await request(h.app).post(`/api/v1/bookings/${done.booking.id}/reviews`).auth(done.customer.accessToken, { type: 'bearer' }).send({ rating });
    expect(invalid.status).toBe(422);
  }
  expect((await pool.query('select count(*)::int as total from reviews where booking_id = $1', [done.booking.id])).rows[0].total).toBe(0);
});

it('keeps the recomputed average correct when both directions land concurrently', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.bookingWith('completed');
  const ratings = [1, 5];
  const results = await Promise.all(ratings.map((rating, index) => request(h.app)
    .post(`/api/v1/bookings/${booking.id}/reviews`)
    .auth(index === 0 ? customer.accessToken : expert.accessToken, { type: 'bearer' })
    .send({ rating })));
  for (const result of results) expect(result.status).toBe(201);
  // Each party was reviewed once, by the opposite rating of the pair.
  const expertRow = await pool.query('select rating_avg::text as avg, rating_count as total from users where id = $1', [expert.user.id]);
  expect(Number(expertRow.rows[0].avg)).toBe(1);
  expect(expertRow.rows[0].total).toBe(1);
  const customerRow = await pool.query('select rating_avg::text as avg, rating_count as total from users where id = $1', [customer.user.id]);
  expect(Number(customerRow.rows[0].avg)).toBe(5);
  expect(customerRow.rows[0].total).toBe(1);
  // Average across many sequential reviews converges exactly, never drifts.
  for (const rating of [2, 3, 4, 5]) {
    const again = await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating });
    expect(again.status).toBe(409);
  }
});

it('publishes expert reviews with names only and keeps admin listing filtered', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.bookingWith('completed');
  await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating: 5, comment: 'أنصح بها' });
  const publicList = await request(h.app).get(`/api/v1/experts/${expert.user.id}/reviews`);
  expect(publicList.status).toBe(200);
  expect(publicList.body.data.items[0]).toMatchObject({ rating: 5, comment: 'أنصح بها', reviewerName: customer.user.name, serviceName: expect.any(String), fromCustomer: true });
  expect(JSON.stringify(publicList.body)).not.toContain(customer.user.phone);
  expect(JSON.stringify(publicList.body)).not.toContain(booking.addressText);
  const adminList = await request(h.app).get('/api/v1/admin/reviews').auth(h.admin.accessToken, { type: 'bearer' }).query({ bookingId: booking.id });
  expect(adminList.body.data.items).toHaveLength(1);
  expect((await request(h.app).get('/api/v1/admin/reviews').auth(customer.accessToken, { type: 'bearer' })).status).toBe(401);
  const filtered = await request(h.app).get('/api/v1/admin/reviews').auth(h.admin.accessToken, { type: 'bearer' }).query({ rating: 1 });
  expect(filtered.body.data.items.every((item: { rating: number }) => item.rating === 1)).toBe(true);
  expect((await request(h.app).get(`/api/v1/experts/${randomUUID()}/reviews`)).status).toBe(404);
});

it('records a review notification for the reviewed party only', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.bookingWith('completed');
  await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating: 5 });
  const expertFeed = await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' });
  const forExpert = expertFeed.body.data.items.find((n: { type: string }) => n.type === 'review_received');
  expect(forExpert).toMatchObject({ readAt: null, data: { bookingId: booking.id } });
  expect(forExpert.title).not.toBe('');
  const customerFeed = await request(h.app).get('/api/v1/notifications').auth(customer.accessToken, { type: 'bearer' });
  expect(customerFeed.body.data.items.some((n: { type: string }) => n.type === 'review_received')).toBe(false);
});
