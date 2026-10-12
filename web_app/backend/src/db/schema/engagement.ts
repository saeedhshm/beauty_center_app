import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps, users } from './core.js';
import { bookings } from './bookings.js';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'restrict' }),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  revieweeId: uuid('reviewee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('reviews_booking_reviewer_unique').on(t.bookingId, t.reviewerId),
  check('reviews_rating_valid', sql`${t.rating} between 1 and 5`),
  check('reviews_parties_distinct', sql`${t.reviewerId} <> ${t.revieweeId}`),
  index('reviews_reviewee_idx').on(t.revieweeId),
]);

export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  token: text('token').notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('device_tokens_token_unique').on(t.token),
  index('device_tokens_user_idx').on(t.userId),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)]);

/**
 * Durable delivery queue for notifications. Rows are written in the same
 * transaction as the business event and delivered outside it, so a push
 * failure never rolls back a saved booking. `next_attempt_at` doubles as the
 * worker lease: claiming a row pushes it forward, so a crashed worker releases
 * its rows instead of stranding them. Delivery is at-least-once.
 */
export const notificationOutbox = pgTable('notification_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationId: uuid('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  lastError: text('last_error'),
  ...timestamps(),
}, (t) => [
  check('notification_outbox_status_valid', sql`${t.status} in ('pending', 'sent', 'failed')`),
  check('notification_outbox_attempts_valid', sql`${t.attempts} between 0 and 20`),
  index('notification_outbox_pending_idx').on(t.nextAttemptAt),
  index('notification_outbox_user_idx').on(t.userId),
]);
