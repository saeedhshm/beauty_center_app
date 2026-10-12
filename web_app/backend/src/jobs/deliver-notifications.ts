import type { createDatabase } from '../db/client.js';
import { createPushSender, type PushMode } from '../integrations/push/push-sender.js';
import { NotificationRepository } from '../modules/notifications/notification.repository.js';
import { NotificationService } from '../modules/notifications/notification.service.js';

/**
 * Push notifications that were stored by a committed business event.
 *
 * Safe for concurrent workers: a due row is claimed with `FOR UPDATE SKIP
 * LOCKED` and `next_attempt_at` moves forward as a lease, so two workers never
 * take the same row and a crashed worker releases its rows. Delivery is
 * at-least-once: a worker that dies mid-send may repeat a message, which the
 * apps must tolerate. A failed attempt is retried with backoff until the
 * attempt budget is spent, and it never touches the booking or payment that
 * produced the notification.
 *
 * Not yet wired to a scheduler; run it alongside the booking expiry job from
 * the operations setup in docs/engagement.md when the Worker is adopted.
 */
export async function deliverPendingNotifications(
  db: ReturnType<typeof createDatabase>['db'],
  options: { now?: Date; mode?: PushMode; batchSize?: number } = {},
): Promise<{ claimed: number; sent: number; retried: number }> {
  const now = options.now ?? new Date();
  const service = new NotificationService(
    new NotificationRepository(db),
    createPushSender(options.mode ?? 'demo'),
    () => now,
  );
  return service.deliverDue(options.batchSize);
}
