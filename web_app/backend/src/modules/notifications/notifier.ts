import type { NotificationAudience, NotificationType } from './notification.content.js';
import type { NotificationConnection } from './notification.repository.js';

export interface NotificationEnqueueInput {
  userId: string;
  type: NotificationType;
  audience: NotificationAudience;
  bookingId?: string;
}

/**
 * Narrow write side used by business services. A business module names the
 * event and its audience; the wording and the pending delivery belong to the
 * notifications module. Delivery is never awaited here, so a push failure can
 * not roll back the booking or payment that produced the event.
 */
export interface Notifier {
  enqueue(connection: NotificationConnection, input: NotificationEnqueueInput): Promise<void>;
}
