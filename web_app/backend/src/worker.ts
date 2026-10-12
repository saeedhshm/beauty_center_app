import { parseEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './shared/logger.js';
import { deliverPendingNotifications } from './jobs/deliver-notifications.js';
import { expireDueBookings } from './jobs/expire-bookings.js';
import { cleanupExpiredRecords } from './jobs/cleanup.js';
import { OverviewRepository } from './modules/overview/overview.repository.js';

/**
 * Standalone background worker. Each tick expires due bookings first, then
 * delivers pending notifications, then prunes expired technical rows. A tick
 * never overlaps the previous one; a crash between ticks loses nothing because
 * all three jobs resume from durable database state (conditional expiry, SKIP
 * LOCKED claims with leases, cutoff-based deletes).
 * Notification delivery stays at-least-once by contract.
 *
 * Run: `npm run worker` (dev) or build then `npm run worker:start`.
 * Compose: `docker compose --profile worker up worker`.
 */
const env = parseEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = createDatabase(env, () => logger.error('Idle database connection failed'));

let stopping = false;
let running = false;

async function tick() {
  if (stopping || running) return;
  running = true;
  try {
    const expired = await expireDueBookings(database.db, new Date());
    const delivered = await deliverPendingNotifications(database.db, {
      mode: env.PUSH_MODE === 'demo' ? 'demo' : 'disabled',
      batchSize: env.WORKER_BATCH_SIZE,
    });
    const cleaned = await cleanupExpiredRecords(database.db, new Date());
    await new OverviewRepository(database.db).recordHeartbeat({
      tickAt: new Date(),
      expired: expired.length,
      claimed: delivered.claimed,
      sent: delivered.sent,
      retried: delivered.retried,
      cleaned: cleaned.challenges + cleaned.sessions + cleaned.refreshTokens + cleaned.rateLimits + cleaned.idempotencyKeys + cleaned.outbox,
    });
    // Counts only; payloads, phones and tokens never reach the logs.
    logger.info(
      { expired: expired.length, claimed: delivered.claimed, sent: delivered.sent, retried: delivered.retried, cleaned },
      'Worker tick completed',
    );
  } catch (error) {
    logger.error('Worker tick failed; next tick will retry from database state');
    void error;
  } finally {
    running = false;
  }
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Stopping worker');
  if (timer) clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  const wait = () => {
    if (!running) {
      void database.close().then(() => process.exit(0)).catch(() => process.exit(1));
    } else {
      setTimeout(wait, 100);
    }
  };
  wait();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

logger.info(
  { intervalMs: env.WORKER_INTERVAL_MS, batchSize: env.WORKER_BATCH_SIZE, pushMode: env.PUSH_MODE },
  'Worker listening',
);
void tick();
const timer = setInterval(() => void tick(), env.WORKER_INTERVAL_MS);
