import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps, users } from './core.js';

export const authOtpChallenges = pgTable('auth_otp_challenges', {
  id: uuid('id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('auth_otp_attempts_nonnegative', sql`${t.attempts} >= 0`),
  uniqueIndex('auth_otp_one_active_phone').on(t.phone).where(sql`${t.consumedAt} is null`),
  index('auth_otp_expires_idx').on(t.expiresAt),
]);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  audience: text('audience').notNull().default('mobile'),
  accessHash: text('access_hash').notNull(),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  uniqueIndex('auth_sessions_access_hash_unique').on(t.accessHash),
  check('auth_sessions_audience_valid', sql`${t.audience} in ('mobile', 'admin')`),
  index('auth_sessions_user_idx').on(t.userId),
  index('auth_sessions_expires_idx').on(t.expiresAt),
]);

export const authRefreshTokens = pgTable('auth_refresh_tokens', {
  hash: text('hash').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => authSessions.id, { onDelete: 'restrict' }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('auth_refresh_session_idx').on(t.sessionId)]);

export const authRateLimits = pgTable('auth_rate_limits', {
  key: text('key').primaryKey(),
  hits: integer('hits').notNull(),
  resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
}, (t) => [
  check('auth_rate_hits_positive', sql`${t.hits} > 0`),
  index('auth_rate_resets_idx').on(t.resetsAt),
]);
