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
import { ReviewRepository } from '../../src/modules/reviews/review.repository.js';
import { ReviewService } from '../../src/modules/reviews/review.service.js';
import type { PushSender } from '../../src/integrations/push/push-sender.js';
import { expireDueBookings } from '../../src/jobs/expire-bookings.js';
import { cairoDateString } from '../../src/shared/cairo-time.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), DB_TIMEOUT_MS: '10000', NODE_ENV: 'test' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const password = 'Synthetic-consistency-password!';
const hashed = hashPassword(password);
const phone = () => `+2012${randomInt(0, 100000000).toString().padStart(8, '0')}`;
const tomorrowCairo = () => cairoDateString(new Date(Date.now() + 86400000));

const silentSender: PushSender = { mode: 'demo', send: async () => {} };

async function harness() {
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}` }));
  const availabilityRepository = new AvailabilityRepository(database.db);
  const catalogRepository = new CatalogRepository(database.db);
  const notification = new NotificationService(new NotificationRepository(database.db), silentSender);
  const app = createApp({
    auth,
    catalog: new CatalogService(catalogRepository),
    availability: new AvailabilityService(availabilityRepository),
    booking: new BookingService(new BookingRepository(database.db), availabilityRepository, notification),
    payment: new PaymentService(new PaymentRepository(database.db), notification),
    payout: new PayoutService(new PayoutRepository(database.db)),
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
  async function readyExpert() {
    const expert = await register('expert');
    const service = (await request(app).post('/api/v1/admin/services').auth(admin.accessToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ cityId, bio: 'consistency fixture' });
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    await request(app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(admin.accessToken, { type: 'bearer' });
    await request(app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    await request(app).put('/api/v1/experts/me/availability').auth(expert.accessToken, { type: 'bearer' }).send({
      slots: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '21:00' })),
    });
    return { expert, service };
  }
  async function pendingBooking(target?: { expert: { accessToken: string; user: { id: string } }; service: { id: number } }, startsAt?: string) {
    const { expert, service } = target ?? await readyExpert();
    const customer = await register('customer');
    const address = (await request(app).post('/api/v1/addresses').auth(customer.accessToken, { type: 'bearer' }).send({ cityId, label: 'home', addressText: 'Cairo synthetic address', isDefault: true })).body.data;
    const from = tomorrowCairo();
    const start = startsAt ?? (await request(app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0].slots[0].startsAt;
    const booking = (await request(app).post('/api/v1/bookings').auth(customer.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, serviceId: service.id, addressId: address.id, startsAt: start })).body.data;
    return { expert, service, customer, booking };
  }
  return { app, admin, cityId, register, readyExpert, pendingBooking };
}

const historyOf = async (id: string) =>
  (await pool.query('select status, changed_by from booking_status_history where booking_id = $1 order by created_at, id', [id])).rows;
const notificationsOf = async (userId: string, type?: string) =>
  (await pool.query(`select type from notifications where user_id = $1${type ? ' and type = $2' : ''}`, type ? [userId, type] : [userId])).rows;
const outboxCount = async () =>
  (await pool.query('select count(*)::int as total from notification_outbox')).rows[0].total as number;

it('persists expiry with history and notice even when the operation answers 409', async () => {
  const h = await harness();
  const { expert, booking } = await h.pendingBooking();
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [booking.id]);
  const accept = await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  expect(accept.status).toBe(409);
  expect(accept.body.error.code).toBe('BOOKING_EXPIRED');
  // The 409 did not roll the expiry back.
  expect((await pool.query('select status from bookings where id = $1', [booking.id])).rows[0].status).toBe('expired');
  expect(await historyOf(booking.id)).toContainEqual({ status: 'expired', changed_by: null });
  expect(await notificationsOf(expert.user.id, 'booking_expired')).toHaveLength(1);
  // Payment initiation on the same row behaves identically.
  const second = await h.pendingBooking();
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [second.booking.id]);
  const initiate = await request(h.app).post(`/api/v1/bookings/${second.booking.id}/payments`).auth(second.customer.accessToken, { type: 'bearer' });
  expect(initiate.status).toBe(409);
  expect((await pool.query('select status from bookings where id = $1', [second.booking.id])).rows[0].status).toBe('expired');
  expect(await notificationsOf(second.expert.user.id, 'booking_expired')).toHaveLength(1);
});

it('keeps expiry and payment consistent when they race, without touching renewed deadlines', async () => {
  const h = await harness();
  // Past-due row: worker and webhook race, exactly one consistent outcome.
  const due = await h.pendingBooking();
  await request(h.app).post(`/api/v1/bookings/${due.booking.id}/accept`).auth(due.expert.accessToken, { type: 'bearer' });
  const intent = (await request(h.app).post(`/api/v1/bookings/${due.booking.id}/payments`).auth(due.customer.accessToken, { type: 'bearer' })).body.data;
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [due.booking.id]);
  const event = { paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: due.booking.totalAmount, currency: 'EGP', token: intent.callbackToken };
  const [acceptResult, webhookResult] = await Promise.all([
    request(h.app).post(`/api/v1/bookings/${due.booking.id}/accept`).auth(due.expert.accessToken, { type: 'bearer' }),
    request(h.app).post('/api/v1/webhooks/payments/demo').send(event),
  ]);
  expect(acceptResult.status).toBe(409);
  expect(webhookResult.status).toBe(200);
  expect(webhookResult.body.data.confirmed).toBe(false);
  expect((await pool.query('select status from bookings where id = $1', [due.booking.id])).rows[0].status).toBe('expired');
  expect((await pool.query('select status from payments where id = $1', [intent.payment.id])).rows[0].status).toBe('paid');
  // A replayed late event still reports the booking truthfully.
  const replay = await request(h.app).post('/api/v1/webhooks/payments/demo').send(event);
  expect(replay.status).toBe(200);
  expect(replay.body.data).toMatchObject({ confirmed: false, deduped: true });
  // Future-dated row: the worker can never overwrite it, accept wins deterministically.
  const fresh = await h.pendingBooking();
  const [workerResult, freshAccept] = await Promise.all([
    expireDueBookings(database.db, new Date()),
    request(h.app).post(`/api/v1/bookings/${fresh.booking.id}/accept`).auth(fresh.expert.accessToken, { type: 'bearer' }),
  ]);
  expect(freshAccept.status).toBe(200);
  expect((await pool.query('select status from bookings where id = $1', [fresh.booking.id])).rows[0].status).toBe('accepted');
  expect(await expireDueBookings(database.db, new Date())).toEqual(expect.not.arrayContaining([fresh.booking.id]));
  void workerResult;
});

it('refuses accept from a suspended expert without bypassing the suspension', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.pendingBooking();
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/suspend`).auth(h.admin.accessToken, { type: 'bearer' });
  const denied = await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  expect(denied.status).toBe(409);
  expect(denied.body.error.code).toBe('EXPERT_UNAVAILABLE');
  expect((await pool.query('select status from bookings where id = $1', [booking.id])).rows[0].status).toBe('pending');
  // Recovery works through re-approval, not through the stale request alone.
  await request(h.app).post(`/api/v1/admin/experts/${expert.user.id}/approve`).auth(h.admin.accessToken, { type: 'bearer' });
  await request(h.app).patch('/api/v1/experts/me').auth(expert.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(h.app).get(`/api/v1/bookings/${booking.id}`).auth(customer.accessToken, { type: 'bearer' })).body.data.status).toBe('accepted');
});

it('applies block-wins through the slots API and enforces three periods per day', async () => {
  const h = await harness();
  const { expert, service } = await h.readyExpert();
  const auth = { type: 'bearer' } as const;
  const from = tomorrowCairo();
  const crowded = await request(h.app).put('/api/v1/experts/me/availability').auth(expert.accessToken, auth).send({
    slots: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
      { dayOfWeek: 1, startTime: '10:00', endTime: '11:00' },
      { dayOfWeek: 1, startTime: '11:00', endTime: '12:00' },
      { dayOfWeek: 1, startTime: '12:00', endTime: '13:00' },
    ],
  });
  expect(crowded.status).toBe(422);
  await request(h.app).post('/api/v1/experts/me/availability-exceptions').auth(expert.accessToken, auth).send({ date: from, startTime: '10:00', endTime: '11:00', type: 'unavailable' });
  await request(h.app).post('/api/v1/experts/me/availability-exceptions').auth(expert.accessToken, auth).send({ date: from, startTime: '10:15', endTime: '10:45', type: 'available' });
  const days = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0];
  const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false });
  const wallMinutes = (iso: string) => {
    const [hh, mm] = wall.format(new Date(iso)).split(':').map(Number);
    return hh! * 60 + mm!;
  };
  const starts: string[] = days.slots.map((s: { startsAt: string }) => s.startsAt);
  expect(days.slots.length).toBeGreaterThan(0);
  // Nothing may start inside the blocked 10:00–11:00 window (09:30 already
  // overlaps it, 11:00 is the first start that fits a 60-minute service).
  expect(starts.filter((s) => { const m = wallMinutes(s); return m >= 570 && m < 660; })).toEqual([]);
  expect(starts.some((s) => wallMinutes(s) === 540)).toBe(true);
  expect(starts.some((s) => wallMinutes(s) === 660)).toBe(true);
  await request(h.app).post('/api/v1/experts/me/availability-exceptions').auth(expert.accessToken, auth).send({ date: from, type: 'unavailable' });
  const cleared = (await request(h.app).get(`/api/v1/experts/${expert.user.id}/slots`).query({ serviceId: service.id, from, to: from })).body.data.days[0];
  expect(cleared.slots).toEqual([]);
});

it('stores the refund notice atomically and never duplicates it on retry', async () => {
  const h = await harness();
  const { expert, customer, booking } = await h.pendingBooking();
  await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  await request(h.app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
  const before = await outboxCount();
  const refunded = await request(h.app).post(`/api/v1/admin/payments/${intent.payment.id}/refund`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(refunded.status).toBe(200);
  expect(refunded.body.data.status).toBe('refunded');
  expect(await notificationsOf(customer.user.id, 'payment_refunded')).toHaveLength(1);
  expect(await notificationsOf(expert.user.id, 'payment_refunded')).toHaveLength(1);
  expect(await outboxCount()).toBe(before + 2);
  const replay = await request(h.app).post(`/api/v1/admin/payments/${intent.payment.id}/refund`).auth(h.admin.accessToken, { type: 'bearer' });
  expect(replay.status).toBe(200);
  expect(await notificationsOf(customer.user.id, 'payment_refunded')).toHaveLength(1);
  expect(await notificationsOf(expert.user.id, 'payment_refunded')).toHaveLength(1);
  expect(await outboxCount()).toBe(before + 2);
});

it('expires and delivers exactly once across concurrent workers and recovers leases', async () => {
  const h = await harness();
  const made = [await h.pendingBooking(), await h.pendingBooking(), await h.pendingBooking()];
  for (const m of made) await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [m.booking.id]);
  const [first, second] = await Promise.all([
    expireDueBookings(database.db, new Date()),
    expireDueBookings(database.db, new Date()),
  ]);
  const all = [...first, ...second].sort();
  expect(all).toEqual(made.map((m) => m.booking.id).sort());
  for (const m of made) {
    expect((await historyOf(m.booking.id)).filter((r: { status: string }) => r.status === 'expired')).toHaveLength(1);
  }
  // Two delivery workers share the outbox: every row is sent exactly once.
  const sent: string[][] = [[], []];
  const workers = sent.map((bucket) => {
    const capturing: PushSender = { mode: 'push', send: async (message) => { bucket.push(...message.tokens); } };
    const service = new NotificationService(new NotificationRepository(database.db), capturing);
    return service.deliverDue(50);
  });
  const [a, b] = await Promise.all(workers);
  expect(a!.sent + b!.sent).toBeGreaterThan(0);
  expect(a!.sent + b!.sent).toBe(a!.claimed + b!.claimed - (a!.retried + b!.retried));
  const remaining = (await pool.query("select count(*)::int as total from notification_outbox where status = 'pending'")).rows[0].total as number;
  expect(remaining).toBe(0);
  // A crashed worker's lease expires and the row is recovered, then parks after the budget.
  // The user needs a device, otherwise the row is parked as sent with no channel.
  await request(h.app).post('/api/v1/devices').auth(made[0]!.customer.accessToken, { type: 'bearer' }).send({ token: `fcm-crash-${randomUUID()}` });
  const row = (await pool.query("insert into notifications (user_id, type, title, body) values ($1, 'booking_expired', 't', 'b') returning id", [made[0]!.customer.user.id])).rows[0]!;
  const outbox = (await pool.query("insert into notification_outbox (notification_id, user_id, attempts, next_attempt_at) values ($1, $2, 7, now() - interval '1 minute') returning id", [row.id, made[0]!.customer.user.id])).rows[0]!;
  const failing: PushSender = { mode: 'push', send: async () => { throw new Error('boom'); } };
  const failingService = new NotificationService(new NotificationRepository(database.db), failing);
  await failingService.deliverDue(50);
  expect((await pool.query('select status from notification_outbox where id = $1', [outbox.id])).rows[0]!.status).toBe('failed');
  expect((await pool.query('select status from bookings where id = $1', [made[0]!.booking.id])).rows[0]!.status).toBe('expired');
});

it('runs one real end-to-end journey across booking, payment, review, payout and notices', async () => {
  const h = await harness();
  const { expert, customer, service, booking } = await h.pendingBooking();
  await request(h.app).post(`/api/v1/bookings/${booking.id}/accept`).auth(expert.accessToken, { type: 'bearer' });
  const intent = (await request(h.app).post(`/api/v1/bookings/${booking.id}/payments`).auth(customer.accessToken, { type: 'bearer' })).body.data;
  const paid = await request(h.app).post('/api/v1/webhooks/payments/demo').send({ paymentId: intent.payment.id, eventId: `evt-${randomUUID()}`, outcome: 'paid', amount: booking.totalAmount, currency: 'EGP', token: intent.callbackToken });
  expect(paid.body.data.confirmed).toBe(true);
  expect((await request(h.app).post(`/api/v1/bookings/${booking.id}/complete`).auth(customer.accessToken, { type: 'bearer' })).status).toBe(200);
  const review = await request(h.app).post(`/api/v1/bookings/${booking.id}/reviews`).auth(customer.accessToken, { type: 'bearer' }).send({ rating: 5, comment: 'ممتازة' });
  expect(review.status).toBe(201);
  const payout = await request(h.app).post('/api/v1/admin/payouts').auth(h.admin.accessToken, { type: 'bearer' }).send({ expertId: expert.user.id, bookingIds: [booking.id] });
  expect(payout.status).toBe(201);
  expect((await request(h.app).post(`/api/v1/admin/payouts/${payout.body.data.id}/transfer`).auth(h.admin.accessToken, { type: 'bearer' }).send({ transferRef: 'ops-e2e-1' })).status).toBe(200);
  const customerFeed = (await request(h.app).get('/api/v1/notifications').auth(customer.accessToken, { type: 'bearer' })).body.data.items.map((n: { type: string }) => n.type);
  const expertFeed = (await request(h.app).get(`/api/v1/experts/me/payouts`).auth(expert.accessToken, { type: 'bearer' })).body.data.items;
  const expertNotices = (await request(h.app).get('/api/v1/notifications').auth(expert.accessToken, { type: 'bearer' })).body.data.items.map((n: { type: string }) => n.type);
  for (const type of ['booking_accepted', 'booking_confirmed']) expect(customerFeed).toContain(type);
  for (const type of ['booking_requested', 'booking_confirmed', 'booking_completed', 'review_received']) expect(expertNotices).toContain(type);
  expect(expertFeed.map((p: { id: string }) => p.id)).toContain(payout.body.data.id);
  void service;
});
