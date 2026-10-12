import type { PushSender } from '../../integrations/push/push-sender.js';
import { AppError } from '../../shared/app-error.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { notificationContent } from './notification.content.js';
import { NotificationRepository, type NotificationConnection } from './notification.repository.js';
import type { NotificationEnqueueInput, Notifier } from './notifier.js';
import type { NotificationListQuery, RegisterDeviceInput } from './notification.validation.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');

/** Attempt budget before a delivery is parked as failed for manual review. */
export const MAX_DELIVERY_ATTEMPTS = 8;
/** How long one worker may hold a claimed row before another may retry it. */
export const DELIVERY_LEASE_MS = 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 3_600_000;

export const retryDelayMs = (attempts: number) =>
  Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);

const notificationDto = (row: {
  id: string; type: string; title: string; body: string; data: unknown;
  readAt: Date | null; createdAt: Date;
}) => ({
  id: row.id, type: row.type, title: row.title, body: row.body, data: row.data,
  readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
});

const paginate = <T>(rows: T[], page: { page: number; limit: number }) =>
  ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });

export class NotificationService implements Notifier {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly sender: PushSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Store a notification and its pending delivery inside the caller's transaction. */
  async enqueue(connection: NotificationConnection, input: NotificationEnqueueInput) {
    const { title, body } = notificationContent(input.type, input.audience);
    await new NotificationRepository(connection).insert({
      userId: input.userId, type: input.type, title, body,
      data: input.bookingId ? { bookingId: input.bookingId } : null,
    });
  }

  async registerDevice(actorId: string, input: RegisterDeviceInput) {
    return this.repo.upsertDevice(actorId, input.token);
  }

  async devices(actorId: string) {
    return this.repo.devices(actorId);
  }

  async removeDevice(actorId: string, id: string) {
    if (!await this.repo.deleteDevice(actorId, id)) throw notFound();
  }

  async list(actorId: string, query: NotificationListQuery) {
    const page = { page: query.page, limit: query.limit };
    return paginate((await this.repo.list(actorId, page, query.unreadOnly === 'true')).map(notificationDto), page);
  }

  async unreadCount(actorId: string) {
    return { unread: await this.repo.unreadCount(actorId) };
  }

  async markRead(actorId: string, id: string) {
    const row = await this.repo.markRead(actorId, id, this.now());
    if (row) return { id: row.id, read: true as const, readAt: row.readAt!.toISOString() };
    // Idempotent when it was already read; 404 without revealing another owner's row.
    if (!await this.repo.ownedNotification(actorId, id)) throw notFound();
    return { id, read: true as const };
  }

  async markAllRead(actorId: string) {
    return { markedRead: await this.repo.markAllRead(actorId, this.now()) };
  }

  async adminOutbox(actor: AuthenticatedUser, status: string | undefined, page: number, limit: number) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const rows = await this.repo.adminOutbox(status, page, limit);
    return {
      items: rows.slice(0, limit).map((row) => ({
        ...row,
        nextAttemptAt: row.nextAttemptAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: { page, limit, hasNext: rows.length > limit },
    };
  }

  async adminOutboxRetry(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const now = this.now();
    const row = await this.repo.retryOutbox(id, now);
    if (!row) {
      const current = await this.repo.outboxRow(id);
      if (!current) throw notFound();
      throw new AppError(409, 'INVALID_TRANSITION', 'إعادة المحاولة متاحة للصفوف الفاشلة فقط');
    }
    await this.repo.audit(actor.id, 'outbox.retried', 'notification_outbox', id, {});
    return { id: row.id, status: row.status };
  }

  /**
   * Claim due deliveries, push them outside any database transaction, then record
   * the outcome. A failed push schedules a bounded retry instead of touching the
   * business event, and a delivery may repeat when a worker dies mid-send.
   */
  async deliverDue(batchSize = 50) {
    const now = this.now();
    const claimed = await this.repo.claimDue(now, new Date(now.getTime() + DELIVERY_LEASE_MS), batchSize);
    let sent = 0;
    let retried = 0;
    for (const row of claimed) {
      const notification = await this.repo.notification(row.notification_id);
      const tokens = (await this.repo.tokens(row.user_id)).map((device) => device.token);
      // No stored device means no channel to push on; the row stays readable in-app.
      if (!notification || tokens.length === 0) {
        if (await this.repo.markSent(row.id, now)) sent += 1;
        continue;
      }
      const data = notification.data && typeof notification.data === 'object' ? notification.data as Record<string, string> : undefined;
      try {
        await this.sender.send({ tokens, title: notification.title, body: notification.body, ...(data ? { data } : {}) });
        if (await this.repo.markSent(row.id, now)) sent += 1;
      } catch (error) {
        const reason = error instanceof AppError ? error.message : 'PUSH_DELIVERY_FAILED';
        await this.repo.markAttemptFailed(
          row.id, new Date(now.getTime() + retryDelayMs(row.attempts)), reason, MAX_DELIVERY_ATTEMPTS, now,
        );
        retried += 1;
      }
    }
    return { claimed: claimed.length, sent, retried };
  }
}
