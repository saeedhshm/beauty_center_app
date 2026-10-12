import { AppError } from '../../shared/app-error.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { CatalogRepository } from '../catalog/catalog.repository.js';
import { NOTIFICATION_TYPES } from '../notifications/notification.content.js';
import type { Notifier } from '../notifications/notifier.js';
import { ReviewRepository } from './review.repository.js';
import type { AdminReviewQuery, CreateReviewInput, Page } from './review.validation.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');

const reviewDto = (row: {
  id: string; bookingId?: string; rating: number; comment: string | null; createdAt: Date;
  reviewerName?: string; revieweeName?: string; serviceName?: string | null; fromCustomer?: boolean;
  reviewerId?: string; revieweeId?: string;
}) => ({
  ...(row.bookingId ? { bookingId: row.bookingId } : {}),
  id: row.id,
  rating: row.rating,
  comment: row.comment,
  serviceName: row.serviceName ?? null,
  ...(row.fromCustomer === undefined ? {} : { fromCustomer: row.fromCustomer }),
  ...(row.reviewerName === undefined ? {} : { reviewerName: row.reviewerName }),
  ...(row.revieweeName === undefined ? {} : { revieweeName: row.revieweeName }),
  createdAt: row.createdAt.toISOString(),
});

const paginate = <T>(rows: T[], page: Page) =>
  ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });

export class ReviewService {
  constructor(
    private readonly repo: ReviewRepository,
    private readonly catalog: CatalogRepository,
    private readonly notifier: Notifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * A review is mutual: only a booking party may write it, only after the booking
   * completed, once per party. The reviewer and reviewee are read from the
   * booking, never from the request body.
   */
  async submit(actor: AuthenticatedUser, bookingId: string, input: CreateReviewInput) {
    if (actor.role !== 'customer' && actor.role !== 'expert') {
      throw new AppError(403, 'FORBIDDEN', 'التقييم متاح لطرفي الحجز فقط');
    }
    const now = this.now();
    const result = await this.repo.transaction(async (repo) => {
      const booking = await repo.booking(bookingId, true);
      if (!booking) throw notFound();
      const revieweeId = actor.role === 'customer'
        ? (booking.customerId === actor.id ? booking.expertId : null)
        : (booking.expertId === actor.id ? booking.customerId : null);
      if (!revieweeId) throw notFound();
      if (booking.status !== 'completed') {
        throw new AppError(409, 'INVALID_TRANSITION', 'التقييم متاح بعد اكتمال الحجز فقط');
      }
      await repo.lockReviewee(revieweeId);
      const review = await repo.insert({
        bookingId: booking.id, reviewerId: actor.id, revieweeId,
        rating: input.rating, comment: input.comment ?? null,
      });
      if (!review) throw new AppError(409, 'DUPLICATE_REVIEW', 'سبق أن قيّمتِ هذا الحجز');
      const rating = await repo.recomputeRating(revieweeId, now);
      await this.notifier.enqueue(repo.connection, {
        userId: revieweeId,
        type: NOTIFICATION_TYPES.reviewReceived,
        audience: revieweeId === booking.expertId ? 'expert' : 'customer',
        bookingId: booking.id,
      });
      return { review, rating, revieweeId };
    });
    return {
      review: { ...reviewDto(result.review), reviewerId: actor.id, revieweeId: result.revieweeId },
      rating: { average: result.rating?.ratingAvg ?? '0', count: result.rating?.ratingCount ?? 0 },
    };
  }

  /** Both directions, readable only by the booking parties or an administrator. */
  async forBooking(actor: AuthenticatedUser, bookingId: string) {
    const booking = await this.repo.booking(bookingId);
    if (!booking) throw notFound();
    if (actor.role === 'admin') { /* administrators may review the record */ }
    else if (actor.role === 'customer' && booking.customerId === actor.id) { /* party */ }
    else if (actor.role === 'expert' && booking.expertId === actor.id) { /* party */ }
    else throw notFound();
    return (await this.repo.forBooking(bookingId)).map(reviewDto);
  }

  /** Public list for an expert the catalog already exposes. */
  async forExpert(expertId: string, query: Page) {
    if (!await this.catalog.publicExpert(expertId)) throw notFound();
    return paginate((await this.repo.forReviewee(expertId, query)).map(reviewDto), query);
  }

  async adminList(actor: AuthenticatedUser, query: AdminReviewQuery) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const page: Page = { page: query.page, limit: query.limit };
    return paginate((await this.repo.adminList(query, page)).map(reviewDto), page);
  }
}
