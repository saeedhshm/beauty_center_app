import { and, avg, count, eq, gte, lte, sql, sum } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { workerHeartbeats } from '../../db/schema/admin.js';
import { bookings, payments, payouts } from '../../db/schema/bookings.js';
import { users } from '../../db/schema/core.js';
import { notificationOutbox, reviews } from '../../db/schema/engagement.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface OverviewRange {
  from: Date;
  to: Date;
}

export class OverviewRepository {
  constructor(private readonly db: Database | Transaction) {}

  bookingsByStatus(range: OverviewRange) {
    return this.db.select({ status: bookings.status, total: count() }).from(bookings)
      .where(and(gte(bookings.createdAt, range.from), lte(bookings.createdAt, range.to)))
      .groupBy(bookings.status);
  }

  paymentsByStatus(range: OverviewRange) {
    return this.db.select({
      status: payments.status, currency: payments.currency, total: sum(payments.amount), count: count(),
    }).from(payments)
      .where(and(gte(payments.createdAt, range.from), lte(payments.createdAt, range.to)))
      .groupBy(payments.status, payments.currency);
  }

  payoutsSplit(range: OverviewRange) {
    return this.db.select({
      transferred: sql<boolean>`${payouts.transferredAt} is not null`,
      currency: payouts.currency, total: sum(payouts.amount), count: count(),
    }).from(payouts)
      .where(and(gte(payouts.createdAt, range.from), lte(payouts.createdAt, range.to)))
      .groupBy(sql`${payouts.transferredAt} is not null`, payouts.currency);
  }

  reviewsSummary(range: OverviewRange) {
    return this.db.select({ count: count(), average: avg(reviews.rating) }).from(reviews)
      .where(and(gte(reviews.createdAt, range.from), lte(reviews.createdAt, range.to)));
  }

  usersByRole(range: OverviewRange) {
    return this.db.select({ role: users.role, total: count() }).from(users)
      .where(and(gte(users.createdAt, range.from), lte(users.createdAt, range.to)))
      .groupBy(users.role);
  }

  outboxByStatus() {
    return this.db.select({ status: notificationOutbox.status, total: count() }).from(notificationOutbox)
      .groupBy(notificationOutbox.status);
  }

  async heartbeat() {
    const [row] = await this.db.select().from(workerHeartbeats).where(eq(workerHeartbeats.key, 'operations-worker'));
    return row;
  }

  async recordHeartbeat(values: { tickAt: Date; expired: number; claimed: number; sent: number; retried: number; cleaned: number }) {
    await this.db.insert(workerHeartbeats).values({ key: 'operations-worker', ...values, updatedAt: values.tickAt })
      .onConflictDoUpdate({
        target: workerHeartbeats.key,
        set: { ...values, updatedAt: values.tickAt },
      });
  }
}
