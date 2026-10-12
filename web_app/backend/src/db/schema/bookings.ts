import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cities, expertProfiles, expertServices, timestamps, users } from './core.js';

// A payout record is not evidence of an automatic bank transfer. Eligibility/workflow is pending.
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => expertProfiles.userId, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('EGP'),
  transferRef: text('transfer_ref'),
  transferredAt: timestamp('transferred_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  unique('payouts_id_expert_unique').on(t.id, t.expertId),
  check('payouts_amount_nonnegative', sql`${t.amount} between 0 and 99999999.99`),
  check('payouts_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  index('payouts_expert_idx').on(t.expertId),
]);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  expertId: uuid('expert_id').notNull(),
  serviceId: smallint('service_id').notNull(),
  status: text('status').notNull().default('pending'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  timeZone: text('time_zone').notNull().default('Africa/Cairo'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // Independent snapshots, intentionally no FK to a mutable customer address.
  addressText: text('address_text').notNull(),
  cityId: smallint('city_id').notNull().references(() => cities.id, { onDelete: 'restrict' }),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  commissionRate: numeric('commission_rate', { precision: 7, scale: 4 }).notNull(),
  commissionAmount: numeric('commission_amount', { precision: 10, scale: 2 }).notNull(),
  expertEarning: numeric('expert_earning', { precision: 10, scale: 2 }).notNull(),
  vatRate: numeric('vat_rate', { precision: 7, scale: 4 }).notNull(),
  vatAmount: numeric('vat_amount', { precision: 10, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('EGP'),
  notes: text('notes'),
  cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'restrict' }),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  payoutId: uuid('payout_id'),
  ...timestamps(),
}, (t) => [
  foreignKey({ columns: [t.expertId, t.serviceId], foreignColumns: [expertServices.expertId, expertServices.serviceId] }).onDelete('restrict'),
  foreignKey({ columns: [t.payoutId, t.expertId], foreignColumns: [payouts.id, payouts.expertId] }).onDelete('restrict'),
  check('bookings_status_valid', sql`${t.status} in ('pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')`),
  check('bookings_time_order', sql`${t.endsAt} > ${t.startsAt}`),
  check('bookings_parties_distinct', sql`${t.customerId} <> ${t.expertId}`),
  check('bookings_coordinates_valid', sql`(${t.lat} is null and ${t.lng} is null) or (${t.lat} is not null and ${t.lng} is not null and ${t.lat} between -90 and 90 and ${t.lng} between -180 and 180)`),
  check('bookings_amounts_nonnegative', sql`${t.price} between 0 and 99999999.99 and ${t.commissionAmount} between 0 and 99999999.99 and ${t.expertEarning} between 0 and 99999999.99 and ${t.vatAmount} between 0 and 99999999.99 and ${t.totalAmount} between 0 and 99999999.99`),
  check('bookings_rates_valid', sql`${t.commissionRate} between 0 and 100 and ${t.vatRate} between 0 and 100`),
  check('bookings_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  index('bookings_expert_starts_idx').on(t.expertId, t.startsAt),
  index('bookings_customer_starts_idx').on(t.customerId, t.startsAt),
  index('bookings_status_expires_idx').on(t.status, t.expiresAt),
  // GiST exclusion is defined in the versioned custom migration: Drizzle lacks an exclusion builder.
]);

export const bookingStatusHistory = pgTable('booking_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'restrict' }),
  status: text('status').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'restrict' }),
  // NULL changed_by means a system event; a non-null value identifies its user actor.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('booking_status_history_status_valid', sql`${t.status} in ('pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')`),
  index('booking_status_history_booking_created_idx').on(t.bookingId, t.createdAt),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('EGP'),
  status: text('status').notNull().default('pending'),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  // SHA-256 of the demo callback token. The plain token is revealed once at
  // initiation; only the hash is stored. Real providers verify signatures instead.
  callbackTokenHash: text('callback_token_hash'),
  cardLast4: text('card_last4'),
  failureReason: text('failure_reason'),
  refundedAmount: numeric('refunded_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  check('payments_status_valid', sql`${t.status} in ('pending', 'paid', 'failed', 'refunded')`),
  check('payments_amounts_valid', sql`${t.amount} between 0 and 99999999.99 and ${t.refundedAmount} between 0 and ${t.amount}`),
  check('payments_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check('payments_card_last4_valid', sql`${t.cardLast4} is null or ${t.cardLast4} ~ '^[0-9]{4}$'`),
  uniqueIndex('payments_provider_ref_unique').on(t.provider, t.providerRef),
  index('payments_booking_idx').on(t.bookingId),
]);

// Durable provider-event log for webhook idempotency. The (provider, event_id)
// key makes redeliveries a no-op; concurrent duplicates race on this unique
// constraint and exactly one insert wins.
export const paymentProviderEvents = pgTable('payment_provider_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  outcome: text('outcome').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('payment_provider_events_provider_event_unique').on(t.provider, t.eventId),
  check('payment_provider_events_outcome_valid', sql`${t.outcome} in ('paid', 'failed')`),
  index('payment_provider_events_payment_idx').on(t.paymentId),
]);

// Client-supplied idempotency keys for safe retries (currently booking
// creation). A (user, scope, key) triple is unique; a completed row replays
// the stored response, an in-progress row rejects the duplicate retry, and
// expired rows are treated as absent so keys stay reusable after cleanup.
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  status: text('status').notNull().default('in_progress'),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  unique('idempotency_keys_user_scope_key_unique').on(t.userId, t.scope, t.key),
  check('idempotency_keys_status_valid', sql`${t.status} in ('in_progress', 'completed')`),
  index('idempotency_keys_expires_idx').on(t.expiresAt),
]);
