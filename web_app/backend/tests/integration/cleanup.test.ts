import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, inject, it } from 'vitest';
import { Pool } from 'pg';
import { createDatabase } from '../../src/db/client.js';
import { parseEnv } from '../../src/config/env.js';
import { cleanupExpiredRecords } from '../../src/jobs/cleanup.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), NODE_ENV: 'test', DB_TIMEOUT_MS: '10000' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
afterAll(async () => { await database.close(); await pool.end(); });
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;

it('prunes only expired technical rows and preserves business and account history', async () => {
  const cleanupAt = new Date();
  // auth_rate_limits is shared across files in one run and other files leave 60s-window
  // rows that may expire before this file runs: baseline them BEFORE inserting fixtures.
  const baselineExpiredRateLimits = (await pool.query('select count(*)::int as total from auth_rate_limits where resets_at < $1', [cleanupAt])).rows[0].total as number;
  const userId = randomUUID();
  await pool.query("insert into users (id, name, phone, role) values ($1, 'Cleanup fixture', $2, 'customer')", [userId, phone()]);
  // Expired OTP challenge (past the 24h grace) and a fresh one.
  await pool.query("insert into auth_otp_challenges (id, phone, code_hash, expires_at) values ($1, $2, 'hash', now() - interval '25 hours')", [randomUUID(), phone()]);
  const freshChallenge = randomUUID();
  await pool.query("insert into auth_otp_challenges (id, phone, code_hash, expires_at) values ($1, $2, 'hash', now() + interval '5 minutes')", [freshChallenge, phone()]);
  // Dead session (past the 7d grace) with its refresh token, plus a live one.
  const deadSession = randomUUID();
  await pool.query("insert into auth_sessions (id, user_id, audience, access_hash, access_expires_at, expires_at) values ($1, $2, 'mobile', $3, now() - interval '8 days', now() - interval '8 days')", [deadSession, userId, `ah-${randomUUID()}`]);
  await pool.query('insert into auth_refresh_tokens (hash, session_id) values ($1, $2)', [`rh-${randomUUID()}`, deadSession]);
  const liveSession = randomUUID();
  await pool.query("insert into auth_sessions (id, user_id, audience, access_hash, access_expires_at, expires_at) values ($1, $2, 'mobile', $3, now() + interval '1 hour', now() + interval '1 day')", [liveSession, userId, `ah-${randomUUID()}`]);
  // Stale rate-limit window and an active one.
  await pool.query("insert into auth_rate_limits (key, hits, resets_at) values ($1, 3, now() - interval '1 minute')", [`cleanup-stale-${randomUUID()}`]);
  const liveCounter = `cleanup-live-${randomUUID()}`;
  await pool.query('insert into auth_rate_limits (key, hits, resets_at) values ($1, 1, now() + interval \'1 hour\')', [liveCounter]);
  // Expired idempotency key and a live one.
  await pool.query("insert into idempotency_keys (user_id, scope, key, status, expires_at) values ($1, 'booking.create', $2, 'completed', now() - interval '1 minute')", [userId, randomUUID()]);
  const liveKey = randomUUID();
  await pool.query("insert into idempotency_keys (user_id, scope, key, status, expires_at) values ($1, 'booking.create', $2, 'completed', now() + interval '1 hour')", [userId, liveKey]);
  // Terminal outbox rows past retention and a fresh pending one.
  const noteId = randomUUID();
  await pool.query("insert into notifications (id, user_id, type, title, body) values ($1, $2, 'booking_expired', 't', 'b')", [noteId, userId]);
  await pool.query("insert into notification_outbox (notification_id, user_id, status, created_at) values ($1, $2, 'sent', now() - interval '31 days')", [noteId, userId]);
  const noteId2 = randomUUID();
  await pool.query("insert into notifications (id, user_id, type, title, body) values ($1, $2, 'booking_expired', 't', 'b')", [noteId2, userId]);
  await pool.query("insert into notification_outbox (notification_id, user_id, status) values ($1, $2, 'pending')", [noteId2, userId]);

  const counts = await cleanupExpiredRecords(database.db, cleanupAt);
  expect(counts).toMatchObject({ challenges: 1, sessions: 1, refreshTokens: 1, idempotencyKeys: 1, outbox: 1 });
  expect(counts.rateLimits).toBe(baselineExpiredRateLimits + 1);

  // Survivors: fresh challenge, live session, active counter, live key, live user, both notifications, pending outbox.
  expect((await pool.query('select count(*)::int as total from auth_otp_challenges where id = $1', [freshChallenge])).rows[0].total).toBe(1);
  expect((await pool.query('select count(*)::int as total from auth_sessions where id = $1', [liveSession])).rows[0].total).toBe(1);
  expect((await pool.query('select count(*)::int as total from auth_rate_limits where key = $1', [liveCounter])).rows[0].total).toBe(1);
  expect((await pool.query('select count(*)::int as total from auth_rate_limits where key like \'cleanup-stale-%\'')).rows[0].total).toBe(0);
  expect((await pool.query('select count(*)::int as total from idempotency_keys where key = $1', [liveKey])).rows[0].total).toBe(1);
  expect((await pool.query('select count(*)::int as total from users where id = $1', [userId])).rows[0].total).toBe(1);
  expect((await pool.query('select count(*)::int as total from notifications where user_id = $1', [userId])).rows[0].total).toBe(2);
  expect((await pool.query("select count(*)::int as total from notification_outbox where status = 'pending' and user_id = $1", [userId])).rows[0].total).toBe(1);
  // Second run is a no-op: retention is by cutoff, not by age drift within a tick.
  const again = await cleanupExpiredRecords(database.db, cleanupAt);
  expect(again).toMatchObject({ challenges: 0, sessions: 0, refreshTokens: 0, idempotencyKeys: 0, outbox: 0 });
  expect(again.rateLimits).toBe(0);
});
