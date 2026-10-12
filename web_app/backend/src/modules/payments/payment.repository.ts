import { and, asc, desc, eq, inArray, lte, ne } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { users } from '../../db/schema/core.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { bookingStatusHistory, bookings, paymentProviderEvents, payments } from '../../db/schema/bookings.js';
import type { PaymentListQuery, Page } from './payment.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type PaymentRow = typeof payments.$inferSelect;

const paymentFields = {
  id: payments.id, bookingId: payments.bookingId, amount: payments.amount, currency: payments.currency,
  status: payments.status, provider: payments.provider, providerRef: payments.providerRef,
  failureReason: payments.failureReason, refundedAmount: payments.refundedAmount,
  paidAt: payments.paidAt, refundedAt: payments.refundedAt,
  createdAt: payments.createdAt, updatedAt: payments.updatedAt,
};

const bookingRefFields = {
  id: bookings.id, customerId: bookings.customerId, expertId: bookings.expertId,
  status: bookings.status, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
  totalAmount: bookings.totalAmount, currency: bookings.currency, expiresAt: bookings.expiresAt,
  payoutId: bookings.payoutId,
};

export class PaymentRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: PaymentRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new PaymentRepository(tx)));
  }

  /** Same transaction connection, for writes that must commit with this payment change. */
  get connection(): Database | Transaction { return this.db; }

  async lockCustomer(id: string) {
    const [row] = await this.db.select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users).where(eq(users.id, id)).for('update');
    return row;
  }

  async booking(id: string) {
    const [row] = await this.db.select(bookingRefFields).from(bookings).where(eq(bookings.id, id));
    return row;
  }

  async payment(id: string) {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id));
    return row;
  }

  async lockPayment(id: string) {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id)).for('update');
    return row;
  }

  async settledPayment(bookingId: string) {
    const [row] = await this.db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['paid', 'refunded']))).limit(1);
    return row;
  }

  async latestPending(bookingId: string) {
    const [row] = await this.db.select().from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'pending')))
      .orderBy(desc(payments.createdAt), desc(payments.id)).limit(1);
    return row;
  }

  async insertPayment(values: typeof payments.$inferInsert) {
    const [row] = await this.db.insert(payments).values(values).returning();
    return row!;
  }

  async rotateToken(id: string, callbackTokenHash: string) {
    const [row] = await this.db.update(payments).set({ callbackTokenHash, updatedAt: new Date() })
      .where(eq(payments.id, id)).returning();
    return row!;
  }

  async updatePayment(id: string, values: Partial<typeof payments.$inferInsert>) {
    const [row] = await this.db.update(payments).set({ ...values, updatedAt: new Date() })
      .where(eq(payments.id, id)).returning();
    return row!;
  }

  async audit(actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType, resourceId, details });
  }

  /** Insert-once event log; a duplicate (provider, event_id) is a no-op returning null. */
  async recordEvent(provider: string, eventId: string, paymentId: string, outcome: string) {
    const [row] = await this.db.insert(paymentProviderEvents).values({ provider, eventId, paymentId, outcome })
      .onConflictDoNothing({ target: [paymentProviderEvents.provider, paymentProviderEvents.eventId] })
      .returning({ id: paymentProviderEvents.id });
    return row ?? null;
  }

  async transitionBooking(id: string, from: string[], values: Partial<typeof bookings.$inferInsert>) {
    const [row] = await this.db.update(bookings)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(bookings.id, id), inArray(bookings.status, [...from])))
      .returning(bookingRefFields);
    return row;
  }

  /**
   * Same atomic expiry contract as bookings: the deadline check lives in the
   * UPDATE, so a concurrently renewed deadline is never overwritten.
   */
  async expireBookingIfDue(id: string, now: Date) {
    const [row] = await this.db.update(bookings)
      .set({ status: 'expired', updatedAt: now })
      .where(and(
        eq(bookings.id, id),
        inArray(bookings.status, ['pending', 'accepted']),
        lte(bookings.expiresAt, now),
      ))
      .returning(bookingRefFields);
    return row;
  }

  async addBookingHistory(bookingId: string, status: string, changedBy: string | null) {
    await this.db.insert(bookingStatusHistory).values({ bookingId, status, changedBy });
  }

  byBooking(bookingId: string) {
    return this.db.select(paymentFields).from(payments)
      .where(eq(payments.bookingId, bookingId))
      .orderBy(asc(payments.createdAt), asc(payments.id));
  }

  adminList(query: PaymentListQuery, page: Page) {
    return this.db.select(paymentFields).from(payments)
      .where(and(
        query.status ? eq(payments.status, query.status) : undefined,
        query.bookingId ? eq(payments.bookingId, query.bookingId) : undefined,
      ))
      .orderBy(desc(payments.createdAt), asc(payments.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }

  /** Paid attempts whose booking never confirmed: review queue, never auto-settled. */
  latePayments(page: Page) {
    return this.db.select({ ...paymentFields, bookingStatus: bookings.status }).from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(and(eq(payments.status, 'paid'), ne(bookings.status, 'confirmed')))
      .orderBy(desc(payments.createdAt), asc(payments.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }
}
