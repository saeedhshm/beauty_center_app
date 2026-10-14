import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { users } from '../../db/schema/core.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { bookings, payments, payouts } from '../../db/schema/bookings.js';
import type { Page, PayoutListQuery } from './payout.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type PayoutRow = typeof payouts.$inferSelect;

const payoutFields = {
  id: payouts.id, expertId: payouts.expertId, amount: payouts.amount, currency: payouts.currency,
  transferRef: payouts.transferRef, transferredAt: payouts.transferredAt,
  createdAt: payouts.createdAt, updatedAt: payouts.updatedAt,
};

const eligibleBookingFields = {
  id: bookings.id, expertId: bookings.expertId, status: bookings.status,
  expertEarning: bookings.expertEarning, currency: bookings.currency, payoutId: bookings.payoutId,
};

export class PayoutRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: PayoutRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new PayoutRepository(tx)));
  }

  async lockExpertUser(id: string) {
    const [row] = await this.db.select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users).where(eq(users.id, id)).for('update');
    return row;
  }

  /** Lock candidate bookings so concurrent payouts serialize on the row locks. */
  lockBookings(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.db.select(eligibleBookingFields).from(bookings)
      .where(inArray(bookings.id, [...ids])).for('update');
  }

  async paidPaymentFor(bookingId: string) {
    const [row] = await this.db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'paid'))).limit(1);
    return row;
  }

  async insertPayout(values: typeof payouts.$inferInsert) {
    const [row] = await this.db.insert(payouts).values(values).returning(payoutFields);
    return row!;
  }

  async payout(id: string) {
    const [row] = await this.db.select(payoutFields).from(payouts).where(eq(payouts.id, id));
    return row;
  }

  async lockPayout(id: string) {
    const [row] = await this.db.select(payoutFields).from(payouts).where(eq(payouts.id, id)).for('update');
    return row;
  }

  async markTransferred(id: string, transferRef: string, now: Date) {
    const [row] = await this.db.update(payouts)
      .set({ transferRef, transferredAt: now, updatedAt: now })
      .where(eq(payouts.id, id)).returning(payoutFields);
    return row!;
  }

  async linkBookings(payoutId: string, bookingIds: string[]) {
    await this.db.update(bookings).set({ payoutId, updatedAt: new Date() })
      .where(inArray(bookings.id, [...bookingIds]));
  }

  payoutBookings(payoutId: string) {
    return this.db.select({
      id: bookings.id, status: bookings.status, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
      timeZone: bookings.timeZone,
      totalAmount: bookings.totalAmount, expertEarning: bookings.expertEarning, currency: bookings.currency,
    }).from(bookings).where(eq(bookings.payoutId, payoutId)).orderBy(asc(bookings.startsAt), asc(bookings.id));
  }

  list(query: PayoutListQuery, page: Page, scope?: { expertId: string }) {
    return this.db.select(payoutFields).from(payouts)
      .where(and(
        scope?.expertId ? eq(payouts.expertId, scope.expertId) : undefined,
        query.expertId ? eq(payouts.expertId, query.expertId) : undefined,
        query.transferred === undefined ? undefined
          : query.transferred ? isNotNull(payouts.transferredAt) : isNull(payouts.transferredAt),
      ))
      .orderBy(desc(payouts.createdAt), asc(payouts.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }

  /** Bookings earning their expert money now: completed, paid, not yet linked. */
  eligibleBookings(expertId: string) {
    return this.db.select({ expertEarning: bookings.expertEarning, currency: bookings.currency })
      .from(bookings)
      .innerJoin(payments, and(eq(payments.bookingId, bookings.id), eq(payments.status, 'paid')))
      .where(and(eq(bookings.expertId, expertId), eq(bookings.status, 'completed'), isNull(bookings.payoutId)));
  }

  /** Selectable eligible rows for the admin payout screen; creation re-checks under row locks. */
  eligibleBookingRows(expertId: string) {
    return this.db.select({
      id: bookings.id, status: bookings.status, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
      totalAmount: bookings.totalAmount, expertEarning: bookings.expertEarning, currency: bookings.currency,
    })
      .from(bookings)
      .innerJoin(payments, and(eq(payments.bookingId, bookings.id), eq(payments.status, 'paid')))
      .where(and(eq(bookings.expertId, expertId), eq(bookings.status, 'completed'), isNull(bookings.payoutId)))
      .orderBy(asc(bookings.startsAt), asc(bookings.id));
  }

  recordedPayouts(expertId: string) {
    return this.db.select({ amount: payouts.amount, currency: payouts.currency })
      .from(payouts).where(and(eq(payouts.expertId, expertId), isNull(payouts.transferredAt)));
  }

  transferredPayouts(expertId: string) {
    return this.db.select({ amount: payouts.amount, currency: payouts.currency })
      .from(payouts).where(and(eq(payouts.expertId, expertId), isNotNull(payouts.transferredAt)));
  }

  async audit(actorId: string, action: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType: 'payout', resourceId, details });
  }
}
