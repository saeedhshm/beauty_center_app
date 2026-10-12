import { and, lt, sql } from 'drizzle-orm';
import type { createDatabase } from '../db/client.js';
import { authOtpChallenges, authRateLimits, authRefreshTokens, authSessions } from '../db/schema/auth.js';
import { idempotencyKeys } from '../db/schema/bookings.js';
import { notificationOutbox } from '../db/schema/engagement.js';

type Database = ReturnType<typeof createDatabase>['db'];

// Retention policy (documented in docs/operations.md):
// - OTP challenges: hashes only, deleted 24h after expiry.
// - Sessions: deleted 7d after absolute expiry so reuse detection keeps working
//   until then; their refresh tokens go first (restrict FK).
// - Rate-limit counters: deleted once their window has passed.
// - Idempotency keys: deleted at expiry; expired keys already read as absent.
// - Notification outbox: terminal rows (sent/failed) deleted after 30d.
// Never touched: users, bookings, payments, payouts, reviews, notifications,
// provider events, or audit logs — financial and account history is preserved.
const CHALLENGE_GRACE_MS = 24 * 3600 * 1000;
const SESSION_GRACE_MS = 7 * 24 * 3600 * 1000;
const OUTBOX_RETENTION_MS = 30 * 24 * 3600 * 1000;

export interface CleanupCounts {
  challenges: number;
  sessions: number;
  refreshTokens: number;
  rateLimits: number;
  idempotencyKeys: number;
  outbox: number;
}

export async function cleanupExpiredRecords(db: Database, now = new Date()): Promise<CleanupCounts> {
  const challengeCutoff = new Date(now.getTime() - CHALLENGE_GRACE_MS);
  const sessionCutoff = new Date(now.getTime() - SESSION_GRACE_MS);
  const outboxCutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);

  const challenges = await db.delete(authOtpChallenges).where(lt(authOtpChallenges.expiresAt, challengeCutoff)).returning({ id: authOtpChallenges.id });
  const refreshTokens = await db.delete(authRefreshTokens).where(sql`exists (
    select 1 from ${authSessions} where ${authSessions.id} = ${authRefreshTokens.sessionId}
    and ${authSessions.expiresAt} < ${sessionCutoff.toISOString()}::timestamptz
  )`).returning({ hash: authRefreshTokens.hash });
  const sessions = await db.delete(authSessions).where(lt(authSessions.expiresAt, sessionCutoff)).returning({ id: authSessions.id });
  const rateLimits = await db.delete(authRateLimits).where(lt(authRateLimits.resetsAt, now)).returning({ key: authRateLimits.key });
  const keys = await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now)).returning({ id: idempotencyKeys.id });
  const outbox = await db.delete(notificationOutbox).where(and(
    lt(notificationOutbox.createdAt, outboxCutoff),
    sql`${notificationOutbox.status} in ('sent', 'failed')`,
  )).returning({ id: notificationOutbox.id });

  return {
    challenges: challenges.length,
    sessions: sessions.length,
    refreshTokens: refreshTokens.length,
    rateLimits: rateLimits.length,
    idempotencyKeys: keys.length,
    outbox: outbox.length,
  };
}
