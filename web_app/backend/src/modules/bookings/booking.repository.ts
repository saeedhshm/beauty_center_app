import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import {
  cities, customerAddresses, expertProfiles, expertServices, services, settings, users,
} from '../../db/schema/core.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { bookingStatusHistory, bookings, idempotencyKeys } from '../../db/schema/bookings.js';
import type { BookingListQuery, Page } from './booking.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type BookingRow = typeof bookings.$inferSelect;
export const BLOCKING_STATUSES = ['accepted', 'confirmed', 'completed'] as const;

const bookingFields = {
  id: bookings.id, customerId: bookings.customerId, expertId: bookings.expertId, serviceId: bookings.serviceId,
  status: bookings.status, startsAt: bookings.startsAt, endsAt: bookings.endsAt, timeZone: bookings.timeZone,
  expiresAt: bookings.expiresAt, addressText: bookings.addressText, cityId: bookings.cityId,
  lat: bookings.lat, lng: bookings.lng, price: bookings.price, commissionRate: bookings.commissionRate,
  commissionAmount: bookings.commissionAmount, expertEarning: bookings.expertEarning, vatRate: bookings.vatRate,
  vatAmount: bookings.vatAmount, totalAmount: bookings.totalAmount, currency: bookings.currency,
  notes: bookings.notes, cancelledBy: bookings.cancelledBy, cancellationReason: bookings.cancellationReason,
  cancelledAt: bookings.cancelledAt, createdAt: bookings.createdAt, updatedAt: bookings.updatedAt,
};

export class BookingRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: BookingRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new BookingRepository(tx)));
  }

  /** Same transaction connection, for writes that must commit with this booking change. */
  get connection(): Database | Transaction { return this.db; }

  async lockUser(id: string) {
    const [row] = await this.db.select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users).where(eq(users.id, id)).for('update');
    return row;
  }

  // Idempotency-key claim for safe retries. Insert wins exactly once per
  // (user, scope, key); a conflicting retry reads the existing row instead.
  async claimIdempotencyKey(userId: string, scope: string, key: string, expiresAt: Date) {
    const [row] = await this.db.insert(idempotencyKeys)
      .values({ userId, scope, key, status: 'in_progress', expiresAt })
      .onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.scope, idempotencyKeys.key] })
      .returning({ id: idempotencyKeys.id });
    return row;
  }

  async idempotencyKey(userId: string, scope: string, key: string) {
    const [row] = await this.db.select().from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    return row;
  }

  async completeIdempotencyKey(id: string, responseStatus: number, responseBody: unknown) {
    await this.db.update(idempotencyKeys).set({ status: 'completed', responseStatus, responseBody }).where(eq(idempotencyKeys.id, id));
  }

  async deleteIdempotencyKey(id: string) {
    await this.db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
  }

  async deleteExpiredIdempotencyKeys(now: Date) {
    return this.db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, now));
  }

  async policy() {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, 'booking_policy'));
    return row;
  }

  async market(lock: 'share' | false = false) {
    const q = this.db.select().from(settings).where(eq(settings.key, 'market'));
    const [row] = await (lock ? q.for(lock) : q);
    return row;
  }

  async address(customerId: string, id: string) {
    const [row] = await this.db.select().from(customerAddresses)
      .where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.id, id)));
    return row;
  }

  async activeCity(id: number) {
    const [row] = await this.db.select().from(cities).where(eq(cities.id, id));
    return row && row.isActive ? row : undefined;
  }

  async service(id: number) {
    const [row] = await this.db.select().from(services).where(eq(services.id, id));
    return row;
  }

  async expertOffer(expertId: string, serviceId: number) {
    const [row] = await this.db.select().from(expertServices)
      .where(and(eq(expertServices.expertId, expertId), eq(expertServices.serviceId, serviceId)));
    return row;
  }

  /** Expert must be visible in the active city selected by the booking address. */
  async bookableExpert(expertId: string, cityId: number) {
    const [row] = await this.db.select({ id: users.id }).from(users)
      .innerJoin(expertProfiles, eq(users.id, expertProfiles.userId))
      .innerJoin(cities, eq(users.cityId, cities.id))
      .where(and(
        eq(users.id, expertId), eq(users.role, 'expert'), eq(users.isActive, true),
        eq(expertProfiles.approvalStatus, 'approved'), eq(expertProfiles.isAcceptingBookings, true),
        eq(cities.id, cityId), eq(cities.isActive, true),
      )).limit(1);
    return row;
  }

  /**
   * Same eligibility check under row locks, for accept-time revalidation.
   * Serializes against a concurrent admin suspend: whoever commits first wins,
   * and the loser sees the settled state instead of acting on a stale read.
   */
  async lockBookableExpert(expertId: string, cityId: number) {
    const [row] = await this.db.select({ id: users.id }).from(users)
      .innerJoin(expertProfiles, eq(users.id, expertProfiles.userId))
      .innerJoin(cities, eq(users.cityId, cities.id))
      .where(and(
        eq(users.id, expertId), eq(users.role, 'expert'), eq(users.isActive, true),
        eq(expertProfiles.approvalStatus, 'approved'), eq(expertProfiles.isAcceptingBookings, true),
        eq(cities.id, cityId), eq(cities.isActive, true),
      )).limit(1).for('update');
    return row;
  }

  async overlappingBlocking(expertId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const [row] = await this.db.select({ id: bookings.id }).from(bookings)
      .where(and(
        eq(bookings.expertId, expertId),
        inArray(bookings.status, [...BLOCKING_STATUSES]),
        sql`tstzrange(${bookings.startsAt}, ${bookings.endsAt}, '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')`,
      )).limit(1);
    return !!row;
  }

  async insertBooking(values: typeof bookings.$inferInsert) {
    const [row] = await this.db.insert(bookings).values(values).returning(bookingFields);
    return row!;
  }

  async history(bookingId: string) {
    return this.db.select({
      id: bookingStatusHistory.id, status: bookingStatusHistory.status,
      changedBy: bookingStatusHistory.changedBy, createdAt: bookingStatusHistory.createdAt,
    }).from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, bookingId))
      .orderBy(asc(bookingStatusHistory.createdAt), asc(bookingStatusHistory.id));
  }

  async addHistory(bookingId: string, status: string, changedBy: string | null) {
    await this.db.insert(bookingStatusHistory).values({ bookingId, status, changedBy });
  }

  async audit(actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType, resourceId, details });
  }

  async booking(id: string) {
    const [row] = await this.db.select(bookingFields).from(bookings).where(eq(bookings.id, id));
    return row;
  }

  private listWhere(query: BookingListQuery, scope?: { customerId?: string; expertId?: string }) {
    return and(
      scope?.customerId ? eq(bookings.customerId, scope.customerId) : undefined,
      scope?.expertId ? eq(bookings.expertId, scope.expertId) : undefined,
      query.status ? eq(bookings.status, query.status) : undefined,
      query.customerId ? eq(bookings.customerId, query.customerId) : undefined,
      query.expertId ? eq(bookings.expertId, query.expertId) : undefined,
    );
  }

  list(query: BookingListQuery, page: Page, scope?: { customerId?: string; expertId?: string }) {
    return this.db.select(bookingFields).from(bookings)
      .where(this.listWhere(query, scope))
      .orderBy(desc(bookings.startsAt), asc(bookings.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }

  /** Conditional transition: succeeds only from one of the expected states. */
  async transition(id: string, from: string[], values: Partial<typeof bookings.$inferInsert>) {
    const [row] = await this.db.update(bookings)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(bookings.id, id), inArray(bookings.status, [...from])))
      .returning(bookingFields);
    return row;
  }

  /**
   * Expire one booking only if its deadline truly passed. The expiresAt check
   * lives in the UPDATE itself, so a concurrently renewed deadline (accept)
   * or a concurrent confirmation can never be overwritten by a stale read.
   */
  async expireIfDue(id: string, now: Date) {
    const [row] = await this.db.update(bookings)
      .set({ status: 'expired', updatedAt: now })
      .where(and(
        eq(bookings.id, id),
        inArray(bookings.status, ['pending', 'accepted']),
        lte(bookings.expiresAt, now),
      ))
      .returning(bookingFields);
    return row;
  }

  /** Parties of the rows about to expire, read before the update so each side is told why. */
  dueForExpiry(now: Date) {
    return this.db.select({ id: bookings.id, customerId: bookings.customerId, expertId: bookings.expertId, status: bookings.status })
      .from(bookings)
      .where(and(inArray(bookings.status, ['pending', 'accepted']), lte(bookings.expiresAt, now)));
  }

  /** Mark due pending/accepted bookings expired. Safe for concurrent workers: only expired rows match. */
  async expireDue(now: Date): Promise<string[]> {
    const rows = await this.db.update(bookings)
      .set({ status: 'expired', updatedAt: now })
      .where(and(inArray(bookings.status, ['pending', 'accepted']), lte(bookings.expiresAt, now)))
      .returning({ id: bookings.id });
    for (const row of rows) {
      await this.db.insert(bookingStatusHistory).values({ bookingId: row.id, status: 'expired', changedBy: null });
    }
    return rows.map((row) => row.id);
  }
}
