import type { createDatabase } from '../db/client.js';
import { AvailabilityRepository } from '../modules/availability/availability.repository.js';
import { BookingRepository } from '../modules/bookings/booking.repository.js';
import { BookingService } from '../modules/bookings/booking.service.js';
import { DemoPushSender } from '../integrations/push/push-sender.js';
import { NotificationRepository } from '../modules/notifications/notification.repository.js';
import { NotificationService } from '../modules/notifications/notification.service.js';

/**
 * Expire bookings whose acceptance/payment deadline passed.
 * Idempotent and safe for concurrent workers: only rows still holding an
 * expirable status match the conditional update, and each expiry writes its
 * history row in the same transaction. Not yet wired to a scheduler; run it
 * from the operations setup in docs/bookings.md when the Worker is adopted.
 */
export async function expireDueBookings(
  db: ReturnType<typeof createDatabase>['db'],
  now = new Date(),
): Promise<string[]> {
  const service = new BookingService(
    new BookingRepository(db),
    new AvailabilityRepository(db),
    new NotificationService(new NotificationRepository(db), new DemoPushSender(), () => now),
    () => now,
  );
  return service.expireDue(now);
}
