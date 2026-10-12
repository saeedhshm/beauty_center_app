import { and, asc, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { deviceTokens, notificationOutbox, notifications } from '../../db/schema/engagement.js';
import type { Page } from './notification.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** A repository handle usable both standalone and inside a caller's business transaction. */
export type NotificationConnection = Database | Transaction;

const notificationFields = {
  id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body,
  data: notifications.data, readAt: notifications.readAt, createdAt: notifications.createdAt,
};

const deviceFields = {
  id: deviceTokens.id, createdAt: deviceTokens.createdAt, updatedAt: deviceTokens.updatedAt,
};

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string> | null;
}

export interface ClaimedDelivery {
  id: string;
  notification_id: string;
  user_id: string;
  attempts: number;
}

export class NotificationRepository {
  constructor(private readonly db: NotificationConnection) {}

  /**
   * Store the notification and its pending delivery in the caller's connection,
   * so the row commits with the business event or not at all.
   */
  async insert(input: NotificationInput) {
    const [row] = await this.db.insert(notifications).values({
      userId: input.userId, type: input.type, title: input.title, body: input.body, data: input.data ?? null,
    }).returning(notificationFields);
    await this.db.insert(notificationOutbox).values({ notificationId: row!.id, userId: input.userId });
    return row!;
  }

  devices(userId: string) {
    return this.db.select(deviceFields).from(deviceTokens).where(eq(deviceTokens.userId, userId))
      .orderBy(asc(deviceTokens.createdAt));
  }

  async device(userId: string, id: string) {
    const [row] = await this.db.select(deviceFields).from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.id, id)));
    return row;
  }

  /** Re-registering the same token moves it to the current session owner. */
  async upsertDevice(userId: string, token: string) {
    const [row] = await this.db.insert(deviceTokens).values({ userId, token })
      .onConflictDoUpdate({ target: deviceTokens.token, set: { userId, updatedAt: new Date() } })
      .returning(deviceFields);
    return row!;
  }

  async deleteDevice(userId: string, id: string) {
    const rows = await this.db.delete(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.id, id))).returning({ id: deviceTokens.id });
    return rows.length > 0;
  }

  tokens(userId: string) {
    return this.db.select({ token: deviceTokens.token }).from(deviceTokens).where(eq(deviceTokens.userId, userId));
  }

  async notification(id: string) {
    const [row] = await this.db.select(notificationFields).from(notifications).where(eq(notifications.id, id));
    return row;
  }

  async ownedNotification(userId: string, id: string) {
    const [row] = await this.db.select(notificationFields).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
    return row;
  }

  list(userId: string, page: Page, unreadOnly: boolean) {
    return this.db.select(notificationFields).from(notifications)
      .where(and(eq(notifications.userId, userId), unreadOnly ? isNull(notifications.readAt) : undefined))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }

  async unreadCount(userId: string) {
    const [row] = await this.db.select({ value: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.value ?? 0;
  }

  /** Scoped by owner: another user's notification id matches nothing. */
  async markRead(userId: string, id: string, now: Date) {
    const [row] = await this.db.update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id), isNull(notifications.readAt)))
      .returning(notificationFields);
    return row;
  }

  async markAllRead(userId: string, now: Date) {
    const rows = await this.db.update(notifications).set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).returning({ id: notifications.id });
    return rows.length;
  }

  /**
   * Claim due deliveries without blocking other workers: the sub-select takes
   * row locks with SKIP LOCKED and the update releases them immediately, while
   * `next_attempt_at` moves forward as a lease so a crashed worker cannot
   * strand a row. Delivery happens after this statement, never inside it.
   */
  async claimDue(now: Date, leaseUntil: Date, batchSize: number): Promise<ClaimedDelivery[]> {
    const result = await this.db.execute(sql`
      update ${notificationOutbox} as o
         set attempts = o.attempts + 1, next_attempt_at = ${leaseUntil}, updated_at = ${now}
       where o.id in (
         select d.id from ${notificationOutbox} d
          where d.status = 'pending' and d.next_attempt_at <= ${now}
          order by d.next_attempt_at
          for update skip locked
          limit ${batchSize}
       )
      returning o.id, o.notification_id as notification_id, o.user_id as user_id, o.attempts
    `);
    return result.rows.map((row) => ({
      id: String(row.id),
      notification_id: String(row.notification_id),
      user_id: String(row.user_id),
      attempts: Number(row.attempts),
    }));
  }

  /** No-op once another worker already finished the row. */
  async markSent(id: string, now: Date) {
    const rows = await this.db.update(notificationOutbox)
      .set({ status: 'sent', deliveredAt: now, lastError: null, updatedAt: now })
      .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, 'pending')))
      .returning({ id: notificationOutbox.id });
    return rows.length > 0;
  }

  /** Give up after the attempt budget; otherwise schedule the next retry. */
  async markAttemptFailed(id: string, nextAttemptAt: Date, error: string, maxAttempts: number, now: Date) {
    const rows = await this.db.update(notificationOutbox)
      .set({
        status: sql`case when ${notificationOutbox.attempts} >= ${maxAttempts} then 'failed' else 'pending' end`,
        nextAttemptAt, lastError: error.slice(0, 500), updatedAt: now,
      })
      .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, 'pending')))
      .returning({ id: notificationOutbox.id, status: notificationOutbox.status });
    return rows[0];
  }

  async outboxRow(id: string) {
    const [row] = await this.db.select({
      id: notificationOutbox.id, status: notificationOutbox.status, attempts: notificationOutbox.attempts,
      nextAttemptAt: notificationOutbox.nextAttemptAt, lastError: notificationOutbox.lastError,
    }).from(notificationOutbox).where(eq(notificationOutbox.id, id));
    return row;
  }

  adminOutbox(status: string | undefined, page: number, limit: number) {
    return this.db.select({
      id: notificationOutbox.id,
      status: notificationOutbox.status,
      attempts: notificationOutbox.attempts,
      nextAttemptAt: notificationOutbox.nextAttemptAt,
      lastError: notificationOutbox.lastError,
      createdAt: notificationOutbox.createdAt,
      userId: notificationOutbox.userId,
      type: notifications.type,
    }).from(notificationOutbox)
      .innerJoin(notifications, eq(notifications.id, notificationOutbox.notificationId))
      .where(status ? eq(notificationOutbox.status, status) : undefined)
      .orderBy(desc(notificationOutbox.createdAt), asc(notificationOutbox.id))
      .limit(limit + 1).offset((page - 1) * limit);
  }

  /** Requeue one failed row with a fresh attempt budget; only failed rows qualify. */
  async retryOutbox(id: string, now: Date) {
    const [row] = await this.db.update(notificationOutbox)
      .set({ status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null, updatedAt: now })
      .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, 'failed')))
      .returning({ id: notificationOutbox.id, status: notificationOutbox.status });
    return row;
  }

  async pendingBefore(moment: Date) {
    const [row] = await this.db.select({ value: count() }).from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, 'pending'), lt(notificationOutbox.nextAttemptAt, moment)));
    return row?.value ?? 0;
  }

  async audit(actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType, resourceId, details });
  }
}
