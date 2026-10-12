import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { services, users } from '../../db/schema/core.js';
import { reviews } from '../../db/schema/engagement.js';
import { bookings } from '../../db/schema/bookings.js';
import type { AdminReviewQuery, Page } from './review.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ReviewRow = typeof reviews.$inferSelect;

const reviewFields = {
  id: reviews.id, bookingId: reviews.bookingId, reviewerId: reviews.reviewerId, revieweeId: reviews.revieweeId,
  rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt,
};

/** Public projection: names and service labels only, never account or contact data. */
const publicReviewFields = {
  id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt,
  reviewerName: users.name, serviceName: services.name,
  fromCustomer: sql<boolean>`${reviews.reviewerId} = ${bookings.customerId}`,
};

export class ReviewRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: ReviewRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new ReviewRepository(tx)));
  }

  /** Same transaction connection, for writes that must commit with this unit of work. */
  get connection(): Database | Transaction { return this.db; }

  async booking(id: string, lock = false) {
    const q = this.db.select({
      id: bookings.id, customerId: bookings.customerId, expertId: bookings.expertId,
      status: bookings.status, serviceId: bookings.serviceId,
    }).from(bookings).where(eq(bookings.id, id));
    const [row] = await (lock ? q.for('update') : q);
    return row;
  }

  /**
   * Serialises concurrent reviews of the same reviewee: the recomputed average
   * below then always observes every committed review, so no update is lost.
   */
  async lockReviewee(id: string) {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).for('update');
    return row;
  }

  /**
   * Returns null when the party already reviewed this booking: the named unique
   * index resolves the race between two simultaneous submissions without
   * relying on a driver error shape.
   */
  async insert(values: typeof reviews.$inferInsert) {
    const [row] = await this.db.insert(reviews).values(values)
      .onConflictDoNothing({ target: [reviews.bookingId, reviews.reviewerId] })
      .returning(reviewFields);
    return row ?? null;
  }

  /**
   * Recompute the stored rating from the reviews table itself. The aggregate is
   * uncorrelated, so it yields one row even with zero reviews and the counters
   * return to zero instead of drifting.
   */
  async recomputeRating(userId: string, now: Date) {
    await this.db.execute(sql`
      update ${users} as u
         set rating_avg = coalesce(s.avg_rating, 0),
             rating_count = coalesce(s.total, 0),
             updated_at = ${now}
        from (select avg(r.rating)::numeric(3, 2) as avg_rating, count(*)::int as total
                from ${reviews} r where r.reviewee_id = ${userId}) as s
       where u.id = ${userId}
    `);
    return this.rating(userId);
  }

  async rating(userId: string) {
    const [row] = await this.db.select({ ratingAvg: users.ratingAvg, ratingCount: users.ratingCount })
      .from(users).where(eq(users.id, userId));
    return row;
  }

  forReviewee(revieweeId: string, page: Page) {
    return this.db.select(publicReviewFields).from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .innerJoin(users, eq(users.id, reviews.reviewerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(eq(reviews.revieweeId, revieweeId))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }

  forBooking(bookingId: string) {
    return this.db.select(publicReviewFields).from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .innerJoin(users, eq(users.id, reviews.reviewerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(eq(reviews.bookingId, bookingId))
      .orderBy(asc(reviews.createdAt), asc(reviews.id));
  }

  private adminWhere(query: AdminReviewQuery): SQL | undefined {
    return and(
      query.bookingId ? eq(reviews.bookingId, query.bookingId) : undefined,
      query.revieweeId ? eq(reviews.revieweeId, query.revieweeId) : undefined,
      query.rating ? eq(reviews.rating, query.rating) : undefined,
    );
  }

  adminList(query: AdminReviewQuery, page: Page) {
    return this.db.select({
      ...reviewFields, reviewerName: users.name, revieweeName: sql<string>`coalesce((select name from ${users} where ${users}.id = ${reviews.revieweeId}), '')`,
      serviceName: services.name,
    }).from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .innerJoin(users, eq(users.id, reviews.reviewerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(this.adminWhere(query))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }
}
