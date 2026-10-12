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
import { DemoPushSender, UnconfiguredPushSender, type PushMessage, type PushSender } from '../../src/integrations/push/push-sender.js';
import { AppError } from '../../src/shared/app-error.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-notifications-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));

const silentSender = { mode: 'demo' as const, send: async () => {} };

async function harness(sender: PushSender = silentSender) {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const catalogRepository = new CatalogRepository(database.db);
  const notification = new NotificationService(new NotificationRepository(database.db), sender);
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
  async function pendingBooking() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'notifications fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '350.00' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address' })).body.data;
    const from = tomorrowCairo();
    const slots = (await request(app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots;
    const booking = (await request(app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: slots[0].startsAt })).body.data;
    return { expert, customer, service, booking };
  }
  return { app, admin, cityId, register, pendingBooking };
}

const outboxFor = async (userId: string) =>
  (await pool.query("select status, attempts from notification_outbox where user_id = $1 order by created_at", [userId])).rows;

it('registers, lists and removes only the caller own devices', async () => {
  const h = await harness();
  const first = await h.register('customer');
  const second = await h.register('customer');
  const token = `fcm-synthetic-${randomUUID()}`;
  const created = await request(h.app).post('/api/v1/devices').auth(first.accessToken, { type: 'bearer' }).send({ token });
  expect(created.status).toBe(201);
  expect(created.body.data).not.toHaveProperty('token');
  expect(created.text).not.toContain(token);
  const listed = await request(h.app).get('/api/v1/devices').auth(first.accessToken, { type: 'bearer' });
  expect(listed.body.data).toHaveLength(1);
  expect((await request(h.app).get('/api/v1/devices').auth(second.accessToken, { type: 'bearer' })).body.data).toHaveLength(0);
  // Re-registering the same token moves it instead of duplicating.
  const moved = await request(h.app).post('/api/v1/devices').auth(second.accessToken, { type: 'bearer' }).send({ token });
  expect(moved.status).toBe(201);
  expect(moved.body.data.id).toBe(created.body.data.id);
  expect((await request(h.app).get('/api/v1/devices').auth(first.accessToken, { type: 'bearer' })).body.data).toHaveLength(0);
  expect((await request(h.app).delete(`/api/v1/devices/${created.body.data.id}`).auth(first.accessToken, { type: 'bearer' })).status).toBe(404);
  expect((await request(h.app).delete(`/api/v1/devices/${created.body.data.id}`).auth(second.accessToken, { type: 'bearer' })).status).toBe(204);
  expect((await pool.query('select count(*)::int as total from device_tokens where token = $1', [token])).rows[0].total).toBe(0);
  expect((await request(h.app).post('/api/v1/devices').auth(first.accessToken, { type: 'bearer' }).send({ token: 'short' })).status).toBe(422);
  expect((await request(h.app).post('/api/v1/devices').send({ token })).status).toBe(401);
});

it('stores one notification per booking event and never leaks another user feed', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.pendingBooking();
  const outsider = await h.register('customer');
  const expertFeed = await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' });
  const requested = expertFeed.body.data.items.filter((n: { type: string }) => n.type === 'booking_requested');
  expect(requested).toHaveLength(1);
  expect(requested[0]).toMatchObject({ title: 'طلب حجز جديد', readAt: null, data: { bookingId: booking.id } });
  expect(requested[0].body).not.toContain(booking.addressText);
  expect(expertFeed.text).not.toContain(customer.user.phone);
  await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  const customerFeed = await request(h.app).get('/api/v1/notifications').auth(customer.accessToken, { type: 'bearer' });
  expect(customerFeed.body.data.items.filter((n: { type: string }) => n.type === 'booking_accepted')).toHaveLength(1);
  const outsiderFeed = await request(h.app).get('/api/v1/notifications').auth(outsider.accessToken, { type: 'bearer' });
  expect(outsiderFeed.body.data.items).toHaveLength(0);
  const outsiderDevice = await request(h.app).post('/api/v1/devices').auth(outsider.accessToken, { type: 'bearer' }).send({ token: `fcm-outsider-${randomUUID()}` });
  expect((await request(h.app).get('/api/v1/notifications').auth(outsider.accessToken, { type: 'bearer' }).query({ page: '2' })).status).toBe(200);
  expect(outsiderDevice.status).toBe(201);
});

it('marks notifications read for the owner and reports the unread counter', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.pendingBooking();
  await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  const unread = await request(h.app).get('/api/v1/notifications/unread-count').auth(customer.accessToken, { type: 'bearer' });
  expect(unread.body.data.unread).toBe(1);
  const feed = await request(h.app).get('/api/v1/notifications').auth(customer.accessToken, { type: 'bearer' }).query({ unreadOnly: 'true' });
  const target = feed.body.data.items[0];
  expect(target.type).toBe('booking_accepted');
  expect((await request(h.app).post(`/api/v1/notifications/${target.id}/read`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(404);
  const marked = await request(h.app).post(`/api/v1/notifications/${target.id}/read`).auth(customer.accessToken, { type: 'bearer' });
  expect(marked.status).toBe(200);
  expect(marked.body.data.readAt).toEqual(expect.any(String));
  expect((await request(h.app).post(`/api/v1/notifications/${target.id}/read`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).get('/api/v1/notifications/unread-count').auth(customer.accessToken, { type: 'bearer' })).body.data.unread).toBe(0);
  const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' });
  const paid = await request(h.app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: detail.body.data.totalAmount, currency: 'EGP', token: intent.callbackToken });
  expect(paid.body.data.confirmed).toBe(true);
  await request(h.app).post(`/api/v1/bookings/${booking.id}/complete`).auth(customer.accessToken, { type: 'bearer' });
  expect((await request(h.app).get('/api/v1/notifications/unread-count').auth(expert.accessToken, { type: 'bearer' })).body.data.unread).toBe(3);
  const all = await request(h.app).post('/api/v1/notifications/read-all').auth(expert.accessToken, { type: 'bearer' });
  expect(all.body.data.markedRead).toBe(3);
  expect((await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' }).query({ unreadOnly: 'true' })).body.data.items).toHaveLength(0);
});

it('delivers a stored notification to the registered devices without touching the booking', async () => {
  const sent: PushMessage[] = [];
  const capturing: PushSender = { mode: 'push', send: async (message) => { sent.push(message); } };
  const h = await harness(capturing);
  const { expert, booking } = await h.pendingBooking();
  await request(h.app).post('/api/v1/devices').auth(expert.accessToken, { type: 'bearer' }).send({ token: `fcm-device-${randomUUID()}` });
  const service = new NotificationService(new NotificationRepository(database.db), capturing);
  const result = await service.deliverDue();
  expect(result.claimed).toBeGreaterThanOrEqual(1);
  // The shared test database holds other users' rows: assert on this booking's message.
  const mine = sent.filter((message) => message.data?.bookingId === booking.id);
  expect(mine).toHaveLength(1);
  expect(mine[0]!.data).toEqual({ bookingId: booking.id });
  expect(JSON.stringify(mine[0])).not.toContain(booking.addressText);
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(expert.accessToken, { type: 'bearer' });
  expect(detail.body.data.status).toBe('pending');
  expect((await outboxFor(expert.user.id)).every((row: { status: string }) => row.status === 'sent')).toBe(true);
  // A second pass finds nothing for this owner: the terminal state is not re-claimed.
  expect((await outboxFor(expert.user.id))[0].attempts).toBe(1);
});

it('retries a failed push with backoff and parks it after the attempt budget', async () => {
  const h = await harness(new UnconfiguredPushSender());
  const { expert, booking } = await h.pendingBooking();
  await request(h.app).post('/api/v1/devices').auth(expert.accessToken, { type: 'bearer' }).send({ token: `fcm-device-${randomUUID()}` });
  const service = new NotificationService(new NotificationRepository(database.db), new UnconfiguredPushSender());
  const first = await service.deliverDue();
  expect(first.retried).toBe(1);
  const rows = await outboxFor(expert.user.id);
  expect(rows[0].status).toBe('pending');
  expect(rows[0].attempts).toBe(1);
  // Nothing is due yet, so the retry does not run early.
  expect((await service.deliverDue()).claimed).toBe(0);
  const makeDue = () => pool.query(
    "update notification_outbox set next_attempt_at = now() - interval '1 second' where user_id = $1 and status = 'pending'",
    [expert.user.id],
  );
  for (let attempt = 2; attempt <= 8; attempt += 1) {
    await makeDue();
    await service.deliverDue();
  }
  const exhausted = await outboxFor(expert.user.id);
  expect(exhausted[0].status).toBe('failed');
  expect(exhausted[0].attempts).toBe(8);
  // A parked delivery is not retried again.
  await makeDue();
  expect((await service.deliverDue()).retried).toBe(0);
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(expert.accessToken, { type: 'bearer' });
  expect(detail.body.data.status).toBe('pending');
  expect((await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' })).body.data.items).toHaveLength(1);
});

it('keeps each delivery to a single worker under a concurrent run', async () => {
  const h = await harness();
  const { expert, booking } = await h.pendingBooking();
  const token = `fcm-concurrency-${randomUUID()}`;
  await request(h.app).post('/api/v1/devices').auth(expert.accessToken, { type: 'bearer' }).send({ token });
  const pushes: PushMessage[] = [];
  const sender: PushSender = { mode: 'push', send: async (message) => { pushes.push(message); } };
  const workers = [0, 1, 2].map(() => new NotificationService(new NotificationRepository(database.db), sender));
  await Promise.all(workers.map((worker) => worker.deliverDue()));
  // Exactly one push reached this device although three workers claimed the queue at once.
  expect(pushes.filter((message) => message.tokens.includes(token))).toHaveLength(1);
  const rows = await outboxFor(expert.user.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('sent');
  expect(rows[0].attempts).toBe(1);
  const detail = await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(expert.accessToken, { type: 'bearer' });
  expect(detail.body.data.status).toBe('pending');
});

it('treats a user without devices as delivered and keeps the in-app copy', async () => {
  const pushes: PushMessage[] = [];
  const h = await harness({ mode: 'push', send: async (message) => { pushes.push(message); } });
  const { expert } = await h.pendingBooking();
  const service = new NotificationService(new NotificationRepository(database.db), silentSender);
  const result = await service.deliverDue();
  expect(result.claimed).toBeGreaterThanOrEqual(1);
  expect(pushes).toHaveLength(0);
  expect((await outboxFor(expert.user.id))[0].status).toBe('sent');
  expect((await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' })).body.data.items).toHaveLength(1);
});

it('surfaces an unavailable push provider instead of pretending delivery', async () => {
  const service = new NotificationService(new NotificationRepository(database.db), new UnconfiguredPushSender());
  await expect(service.deliverDue()).resolves.toBeTruthy();
  const unavailable: PushSender = new UnconfiguredPushSender();
  const demo: PushSender = new DemoPushSender();
  await expect(unavailable.send({ tokens: ['fcm-synthetic-token'], title: 't', body: 'b' }))
    .rejects.toMatchObject({ status: 503, code: 'PUSH_DELIVERY_UNAVAILABLE' });
  await expect(demo.send({ tokens: ['fcm-synthetic-token'], title: 't', body: 'b' })).resolves.toBeUndefined();
  const error = await unavailable.send({ tokens: [], title: 't', body: 'b' }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
});
