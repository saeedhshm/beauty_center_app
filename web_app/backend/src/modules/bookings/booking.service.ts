import { MARKET_TIME_ZONE } from '../../config/scheduling.js';
import { AppError } from '../../shared/app-error.js';
import { cairoDateString, cairoWeekday, parseLocalDate } from '../../shared/cairo-time.js';
import { splitCommission } from '../../shared/money.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { bookingPolicySchema } from '../catalog/catalog.validation.js';
import { AvailabilityRepository } from '../availability/availability.repository.js';
import { workingIntervals } from '../availability/availability.service.js';
import { NOTIFICATION_TYPES, type NotificationType } from '../notifications/notification.content.js';
import type { Notifier } from '../notifications/notifier.js';
import { BookingRepository } from './booking.repository.js';
import type { BookingCreateInput, BookingListQuery, Page } from './booking.validation.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
const slotTaken = () => new AppError(409, 'SLOT_TAKEN', 'الموعد أصبح مشغولًا، اختاري موعدًا آخر');
const invalidTransition = (status: string) => new AppError(409, 'INVALID_TRANSITION', `العملية غير متاحة والحجز بحالة ${status}`);

function isExclusionViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code
    ?? ((error as { cause?: { code?: string } })?.cause?.code);
  return code === '23P01';
}

const bookingDto = (row: {
  id: string; customerId: string; expertId: string; serviceId: number; status: string;
  startsAt: Date; endsAt: Date; timeZone: string; expiresAt: Date | null;
  addressText: string; cityId: number; lat: string | null; lng: string | null;
  price: string; commissionRate: string; commissionAmount: string; expertEarning: string;
  vatRate: string; vatAmount: string; totalAmount: string; currency: string;
  notes: string | null; cancelledBy: string | null; cancellationReason: string | null;
  cancelledAt: Date | null; createdAt: Date; updatedAt: Date;
}) => ({
  ...row,
  startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

const paginate = <T>(rows: T[], page: Page) => ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });

export class BookingService {
  constructor(
    private readonly repo: BookingRepository,
    private readonly availability: AvailabilityRepository,
    private readonly notifier: Notifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Store the event for the other party in the same transaction. Nothing is
   * pushed here: a delivery failure must never undo a saved booking.
   */
  private async announce(
    repo: BookingRepository,
    input: { userId: string; type: NotificationType; audience: 'customer' | 'expert'; bookingId: string },
  ) {
    await this.notifier.enqueue(repo.connection, input);
  }

  private async coverage(expertId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const day = cairoDateString(startsAt);
    if (cairoDateString(endsAt) !== day) return false;
    const parsed = parseLocalDate(day);
    if (!parsed) return false;
    const wall = new Intl.DateTimeFormat('en-GB', { timeZone: MARKET_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
    const [sh, sm] = wall.format(startsAt).split(':').map(Number);
    const [eh, em] = wall.format(endsAt).split(':').map(Number);
    const startMin = sh! * 60 + sm!;
    const endMin = eh! * 60 + em!;
    const [weekly, exceptions] = await Promise.all([
      this.availability.weekly(expertId),
      this.availability.exceptions(expertId, day, day),
    ]);
    return workingIntervals(cairoWeekday(parsed.year, parsed.month, parsed.day), weekly, exceptions)
      .some(([s, e]) => s <= startMin && endMin <= e);
  }

  // Idempotency keys stay reusable: rows live 24h, expired rows read as absent,
  // and the cleanup job deletes them afterwards.
  private static readonly idempotencyScope = 'booking.create';
  private static readonly idempotencyTtlMs = 24 * 3600 * 1000;

  async create(actor: AuthenticatedUser, input: BookingCreateInput, idempotencyKey?: string): Promise<{ status: number; body: unknown }> {
    if (actor.role !== 'customer') throw new AppError(403, 'FORBIDDEN', 'الحجز متاح لحساب العميلة فقط');
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new AppError(422, 'VALIDATION_ERROR', 'تحققي من البيانات المدخلة');
    const now = this.now();
    if (startsAt.getTime() <= now.getTime()) throw new AppError(422, 'VALIDATION_ERROR', 'اختاري موعدًا مستقبليًا');
    if (!idempotencyKey) {
      return { status: 201, body: await this.createBooking(actor, input, startsAt, now) };
    }
    // Claim first in its own transaction so a concurrent retry observes it.
    const claim = await this.repo.transaction(async (repo) => {
      await repo.deleteExpiredIdempotencyKeys(now);
      const inserted = await repo.claimIdempotencyKey(actor.id, BookingService.idempotencyScope, idempotencyKey, new Date(now.getTime() + BookingService.idempotencyTtlMs));
      if (inserted) return { claimed: true as const, id: inserted.id };
      return { claimed: false as const, existing: (await repo.idempotencyKey(actor.id, BookingService.idempotencyScope, idempotencyKey))! };
    });
    if (!claim.claimed) {
      if (claim.existing.status === 'completed') {
        return { status: claim.existing.responseStatus ?? 200, body: claim.existing.responseBody };
      }
      throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'الطلب السابق بنفس المفتاح ما زال قيد التنفيذ؛ أعيدي المحاولة لاحقًا');
    }
    try {
      const body = await this.createBooking(actor, input, startsAt, now);
      await this.repo.transaction(async (repo) => {
        await repo.completeIdempotencyKey(claim.id, 201, body);
      });
      return { status: 201, body };
    } catch (error) {
      // Release the claim so the client can retry cleanly with the same key.
      await this.repo.transaction(async (repo) => {
        await repo.deleteIdempotencyKey(claim.id);
      }).catch(() => {});
      throw error;
    }
  }

  private async createBooking(actor: AuthenticatedUser, input: BookingCreateInput, startsAt: Date, now: Date) {
    return this.repo.transaction(async (repo) => {
      const customer = await repo.lockUser(actor.id);
      if (!customer || customer.role !== 'customer' || !customer.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
      const address = await repo.address(actor.id, input.addressId);
      if (!address) throw notFound();
      if (!await repo.activeCity(address.cityId)) throw new AppError(409, 'CITY_UNAVAILABLE', 'الخدمة متاحة في القاهرة المفعّلة فقط');
      if (!await repo.bookableExpert(input.expertId)) throw new AppError(409, 'EXPERT_UNAVAILABLE', 'الخبيرة غير متاحة للحجز حاليًا');
      const service = await repo.service(input.serviceId);
      if (!service?.isActive) throw new AppError(409, 'SERVICE_UNAVAILABLE', 'الخدمة غير متاحة حاليًا');
      const offer = await repo.expertOffer(input.expertId, input.serviceId);
      if (!offer?.isActive || offer.currency !== 'EGP') throw new AppError(409, 'SERVICE_UNAVAILABLE', 'الخبيرة لا تقدم هذه الخدمة بالجنيه حاليًا');
      const endsAt = new Date(startsAt.getTime() + service.durationMin * 60000);
      if (!await this.coverage(input.expertId, startsAt, endsAt)) {
        throw new AppError(409, 'SLOT_UNAVAILABLE', 'الموعد خارج أوقات عمل الخبيرة، اختاري موعدًا من المواعيد المتاحة');
      }
      const policyRow = await repo.policy();
      if (!policyRow) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      const policy = bookingPolicySchema.parse(policyRow.value);
      const { commissionAmount, expertEarning } = splitCommission(offer.price, policy.commissionRate);
      const booking = await repo.insertBooking({
        customerId: actor.id, expertId: input.expertId, serviceId: input.serviceId,
        status: 'pending', startsAt, endsAt, timeZone: MARKET_TIME_ZONE,
        expiresAt: new Date(now.getTime() + policy.acceptanceTimeoutMinutes * 60000),
        addressText: address.addressText, cityId: address.cityId, lat: address.lat, lng: address.lng,
        price: offer.price, commissionRate: policy.commissionRate, commissionAmount, expertEarning,
        vatRate: '0.0000', vatAmount: '0.00', totalAmount: offer.price, currency: 'EGP',
        notes: input.notes ?? null,
      });
      await repo.addHistory(booking.id, 'pending', actor.id);
      await this.announce(repo, {
        userId: input.expertId, type: NOTIFICATION_TYPES.bookingRequested, audience: 'expert', bookingId: booking.id,
      });
      return bookingDto(booking);
    });
  }

  async list(actor: AuthenticatedUser, query: BookingListQuery) {
    const page: Page = { page: query.page, limit: query.limit };
    if (actor.role === 'admin') return paginate(await this.repo.list(query, page), page);
    if (actor.role !== 'customer' && actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const scope = actor.role === 'customer' ? { customerId: actor.id } : { expertId: actor.id };
    return paginate(await this.repo.list({ ...query, customerId: undefined, expertId: undefined }, page, scope), page);
  }

  async detail(actor: AuthenticatedUser, id: string) {
    const booking = await this.repo.booking(id);
    if (!booking) throw notFound();
    this.assertParty(actor, booking);
    const expired = await this.expireOne(booking.id);
    const current = expired ?? booking;
    return { ...bookingDto(current), statusHistory: await this.repo.history(id) };
  }

  async accept(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'القبول متاح للخبيرة صاحبة الحجز فقط');
    if (await this.expireIfDue(id)) throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
    try {
      return await this.repo.transaction(async (repo) => {
        const booking = await this.transitionGuard(repo, actor, id, 'expert');
        // Revalidate eligibility at accept time: a pending request must not
        // bypass a suspension that landed after creation. Locked read
        // serializes against a concurrent admin decision.
        if (!await repo.lockBookableExpert(booking.expertId)) {
          throw new AppError(409, 'EXPERT_UNAVAILABLE', 'الخبيرة غير متاحة للحجز حاليًا');
        }
        const endsAt = booking.endsAt;
        if (!await this.coverage(booking.expertId, booking.startsAt, endsAt)) throw new AppError(409, 'SLOT_UNAVAILABLE', 'الموعد خارج أوقات عمل الخبيرة الحالية');
        if (await repo.overlappingBlocking(booking.expertId, booking.startsAt, endsAt)) throw slotTaken();
        const policy = bookingPolicySchema.parse((await repo.policy())?.value);
        const updated = await repo.transition(id, ['pending'], {
          status: 'accepted', expiresAt: new Date(this.now().getTime() + policy.paymentTimeoutMinutes * 60000),
        });
        if (!updated) throw invalidTransition((await repo.booking(id))?.status ?? 'unknown');
        await repo.addHistory(id, 'accepted', actor.id);
        await this.announce(repo, {
          userId: booking.customerId, type: NOTIFICATION_TYPES.bookingAccepted, audience: 'customer', bookingId: id,
        });
        return bookingDto(updated);
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw slotTaken();
      throw error;
    }
  }

  async reject(actor: AuthenticatedUser, id: string, reason?: string | null) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'الرفض متاح للخبيرة صاحبة الحجز فقط');
    if (await this.expireIfDue(id)) throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
    return this.repo.transaction(async (repo) => {
      const booking = await this.transitionGuard(repo, actor, id, 'expert');
      const updated = await repo.transition(id, ['pending'], { status: 'rejected', cancellationReason: reason ?? null });
      if (!updated) throw invalidTransition((await repo.booking(id))?.status ?? 'unknown');
      await repo.addHistory(id, 'rejected', actor.id);
      await this.announce(repo, {
        userId: booking.customerId, type: NOTIFICATION_TYPES.bookingRejected, audience: 'customer', bookingId: id,
      });
      return bookingDto(updated);
    });
  }

  async cancel(actor: AuthenticatedUser, id: string, reason?: string | null) {
    if (await this.expireIfDue(id)) throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
    return this.repo.transaction(async (repo) => {
      const current = await this.guardCancelable(repo, actor, id);
      const updated = await repo.transition(id, ['pending', 'accepted'], {
        status: 'cancelled', cancelledBy: actor.id, cancellationReason: reason ?? null, cancelledAt: this.now(),
      });
      if (!updated) throw invalidTransition((await repo.booking(id))?.status ?? 'unknown');
      await repo.addHistory(id, 'cancelled', actor.id);
      const notified = actor.id === current.customerId ? current.expertId : current.customerId;
      await this.announce(repo, {
        userId: notified, type: NOTIFICATION_TYPES.bookingCancelled,
        audience: notified === current.expertId ? 'expert' : 'customer', bookingId: id,
      });
      if (actor.role === 'admin') {
        await repo.audit(actor.id, 'booking.cancelled', 'booking', id, {
          from: current.status, reason: reason ?? null,
        });
      }
      return bookingDto(updated);
    });
  }

  async complete(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'customer' && actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    if (await this.expireIfDue(id)) throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
    return this.repo.transaction(async (repo) => {
      const booking = await this.transitionGuard(repo, actor, id, actor.role as 'customer' | 'expert');
      if (booking.status === 'accepted') throw new AppError(409, 'INVALID_TRANSITION', 'الإكمال متاح بعد الدفع وتأكيد الحجز فقط');
      const updated = await repo.transition(id, ['confirmed'], { status: 'completed' });
      if (!updated) throw invalidTransition((await repo.booking(id))?.status ?? 'unknown');
      await repo.addHistory(id, 'completed', actor.id);
      const notified = actor.id === booking.customerId ? booking.expertId : booking.customerId;
      await this.announce(repo, {
        userId: notified, type: NOTIFICATION_TYPES.bookingCompleted,
        audience: notified === booking.expertId ? 'expert' : 'customer', bookingId: id,
      });
      return bookingDto(updated);
    });
  }

  /** System expiry for due bookings. Changed-by is NULL; safe under concurrent workers. */
  async expireDue(now = this.now()) {
    return this.repo.transaction(async (repo) => {
      const due = await repo.dueForExpiry(now);
      if (!due.length) return [];
      const expiredIds = await repo.expireDue(now);
      const expired = new Set(expiredIds);
      for (const row of due) {
        if (!expired.has(row.id)) continue;
        // A pending request lapsed for lack of an expert answer; an accepted one for lack of payment.
        const waitingExpert = row.status === 'pending';
        await this.announce(repo, {
          userId: waitingExpert ? row.expertId : row.customerId,
          type: NOTIFICATION_TYPES.bookingExpired,
          audience: waitingExpert ? 'expert' : 'customer',
          bookingId: row.id,
        });
      }
      return expiredIds;
    });
  }

  /**
   * Persist a due expiry in its own committed transaction (state + history +
   * notification), then let the caller fail with 409. Expiry is never written
   * and thrown away inside a larger transaction. Returns the expired row, or
   * null when nothing was due. The audience comes from a pre-write read while
   * the state change itself stays conditional, so a renewed deadline can never
   * be overwritten by a stale read.
   */
  private async expireIfDue(id: string) {
    return this.repo.transaction(async (repo) => {
      const booking = await repo.booking(id);
      if (!booking || (booking.status !== 'pending' && booking.status !== 'accepted')) return null;
      if (!booking.expiresAt || booking.expiresAt.getTime() > this.now().getTime()) return null;
      const updated = await repo.expireIfDue(id, this.now());
      if (!updated) return null;
      await repo.addHistory(id, 'expired', null);
      const waitingExpert = booking.status === 'pending';
      await this.announce(repo, {
        userId: waitingExpert ? booking.expertId : booking.customerId,
        type: NOTIFICATION_TYPES.bookingExpired,
        audience: waitingExpert ? 'expert' : 'customer',
        bookingId: id,
      });
      return updated;
    });
  }

  private async expireOne(id: string) {
    return this.expireIfDue(id);
  }

  private assertParty(actor: AuthenticatedUser, booking: { customerId: string; expertId: string }) {
    if (actor.role === 'admin') return;
    if (actor.role === 'customer' && booking.customerId === actor.id) return;
    if (actor.role === 'expert' && booking.expertId === actor.id) return;
    throw notFound();
  }

  /**
   * Read-only guard: ownership and terminal states only. Any due expiry is
   * persisted beforehand by expireIfDue in its own transaction, so this never
   * writes-then-throws inside the caller's transaction.
   */
  private async transitionGuard(
    repo: BookingRepository, actor: AuthenticatedUser, id: string, side: 'expert' | 'customer',
  ) {
    const booking = await repo.booking(id);
    if (!booking) throw notFound();
    if (side === 'expert' && booking.expertId !== actor.id) throw notFound();
    if (side === 'customer' && booking.customerId !== actor.id) throw notFound();
    if (booking.status === 'expired') throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
    return booking;
  }

  private async guardCancelable(repo: BookingRepository, actor: AuthenticatedUser, id: string) {
    const booking = await repo.booking(id);
    if (!booking) throw notFound();
    if (actor.role === 'admin') return booking;
    if (actor.role === 'customer' && booking.customerId === actor.id) return booking;
    if (actor.role === 'expert' && booking.expertId === actor.id) return booking;
    if (actor.role !== 'customer' && actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    throw notFound();
  }
}
