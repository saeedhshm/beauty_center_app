import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { cities, expertAvailability, expertAvailabilityExceptions, expertProfiles, expertServices, services, settings, users } from '../../db/schema/core.js';
import { bookings } from '../../db/schema/bookings.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type AvailabilityRow = typeof expertAvailability.$inferSelect;
export type AvailabilityExceptionRow = typeof expertAvailabilityExceptions.$inferSelect;

export class AvailabilityRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: AvailabilityRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new AvailabilityRepository(tx)));
  }

  async lockExpert(id: string) {
    const [row] = await this.db.select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users).where(eq(users.id, id)).for('update');
    return row;
  }

  async service(id: number) {
    const [row] = await this.db.select().from(services).where(eq(services.id, id));
    return row;
  }

  async expertPrice(expertId: string, serviceId: number) {
    const [row] = await this.db.select().from(expertServices)
      .where(and(eq(expertServices.expertId, expertId), eq(expertServices.serviceId, serviceId)));
    return row;
  }

  async market(lock: 'share' | false = false) {
    const q = this.db.select().from(settings).where(eq(settings.key, 'market'));
    const [row] = await (lock ? q.for(lock) : q);
    return row;
  }

  async isPublished(expertId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: users.id }).from(users)
      .innerJoin(expertProfiles, eq(users.id, expertProfiles.userId))
      .innerJoin(cities, eq(users.cityId, cities.id))
      .where(and(
        eq(users.id, expertId), eq(users.role, 'expert'), eq(users.isActive, true),
        eq(expertProfiles.approvalStatus, 'approved'), eq(expertProfiles.isAcceptingBookings, true),
        eq(cities.isActive, true),
      )).limit(1);
    return !!row;
  }

  weekly(expertId: string): Promise<AvailabilityRow[]> {
    return this.db.select().from(expertAvailability)
      .where(eq(expertAvailability.expertId, expertId))
      .orderBy(asc(expertAvailability.dayOfWeek), asc(expertAvailability.startTime));
  }

  async replaceWeekly(expertId: string, slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) {
    await this.db.delete(expertAvailability).where(eq(expertAvailability.expertId, expertId));
    if (slots.length) await this.db.insert(expertAvailability).values(slots.map((slot) => ({ ...slot, expertId })));
    return this.weekly(expertId);
  }

  exceptions(expertId: string, from?: string, to?: string): Promise<AvailabilityExceptionRow[]> {
    return this.db.select().from(expertAvailabilityExceptions)
      .where(and(
        eq(expertAvailabilityExceptions.expertId, expertId),
        from ? gte(expertAvailabilityExceptions.date, from) : undefined,
        to ? lte(expertAvailabilityExceptions.date, to) : undefined,
      ))
      .orderBy(asc(expertAvailabilityExceptions.date), asc(expertAvailabilityExceptions.startTime));
  }

  async addException(values: typeof expertAvailabilityExceptions.$inferInsert) {
    const [row] = await this.db.insert(expertAvailabilityExceptions).values(values).returning();
    return row!;
  }

  async deleteException(expertId: string, id: string) {
    const result = await this.db.delete(expertAvailabilityExceptions)
      .where(and(eq(expertAvailabilityExceptions.expertId, expertId), eq(expertAvailabilityExceptions.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  /** Periods that occupy the expert's calendar; advisory only, the exclusion constraint decides. */
  blockingBookings(expertId: string, fromUtc: Date, toUtc: Date): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
    return this.db.select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt }).from(bookings)
      .where(and(
        eq(bookings.expertId, expertId),
        inArray(bookings.status, ['accepted', 'confirmed', 'completed']),
        sql`tstzrange(${bookings.startsAt}, ${bookings.endsAt}, '[)') && tstzrange(${fromUtc}, ${toUtc}, '[)')`,
      ));
  }
}
