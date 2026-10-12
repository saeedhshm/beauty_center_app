import { AppError } from '../../shared/app-error.js';
import { moneyToCents } from '../../shared/money.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { NOTIFICATION_TYPES, type NotificationType } from '../notifications/notification.content.js';
import type { Notifier } from '../notifications/notifier.js';
import { demoTokenHash, equalDemoToken, newDemoCallbackToken, newDemoProviderRef } from './payment.crypto.js';
import { PaymentRepository } from './payment.repository.js';
import type { DemoWebhookInput, Page, PaymentListQuery } from './payment.validation.js';

const PROVIDER = 'demo';
const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');

const paymentDto = (row: {
  id: string; bookingId: string; amount: string; currency: string; status: string;
  provider: string; providerRef: string | null; failureReason: string | null;
  refundedAmount: string; paidAt: Date | null; refundedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}) => ({
  id: row.id, bookingId: row.bookingId, amount: row.amount, currency: row.currency,
  status: row.status, provider: row.provider, providerRef: row.providerRef,
  failureReason: row.failureReason, refundedAmount: row.refundedAmount,
  paidAt: row.paidAt?.toISOString() ?? null, refundedAt: row.refundedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

const paginate = <T>(rows: T[], page: Page) => ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });

export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly notifier: Notifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Store the money event for the affected party; delivery happens after commit. */
  private async announce(
    repo: PaymentRepository,
    input: { userId: string; type: NotificationType; audience: 'customer' | 'expert'; bookingId: string },
  ) {
    await this.notifier.enqueue(repo.connection, input);
  }

  /**
   * Expiry helper with the same atomicity contract as bookings: persist
   * state + history + notification in a committed transaction, never
   * write-then-throw. Ownership is verified by the caller afterwards.
   */
  private async expireBookingIfDue(bookingId: string, customerId: string) {
    await this.repo.transaction(async (repo) => {
      const booking = await repo.booking(bookingId);
      if (!booking || booking.customerId !== customerId) return;
      if (booking.status !== 'pending' && booking.status !== 'accepted') return;
      if (!booking.expiresAt || booking.expiresAt.getTime() > this.now().getTime()) return;
      const expired = await repo.expireBookingIfDue(bookingId, this.now());
      if (!expired) return;
      await repo.addBookingHistory(bookingId, 'expired', null);
      await this.announce(repo, {
        userId: booking.status === 'pending' ? booking.expertId : booking.customerId,
        type: NOTIFICATION_TYPES.bookingExpired,
        audience: booking.status === 'pending' ? 'expert' : 'customer',
        bookingId,
      });
    });
  }

  /** Start (or reuse) a demo intent for an accepted booking. Amounts always come from the server. */
  async initiate(actor: AuthenticatedUser, bookingId: string) {
    if (actor.role !== 'customer') throw new AppError(403, 'FORBIDDEN', 'بدء الدفع متاح للعميلة صاحبة الحجز فقط');
    await this.expireBookingIfDue(bookingId, actor.id);
    return this.repo.transaction(async (repo) => {
      const customer = await repo.lockCustomer(actor.id);
      if (!customer || customer.role !== 'customer' || !customer.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
      const booking = await repo.booking(bookingId);
      if (!booking || booking.customerId !== actor.id) throw notFound();
      if (booking.status === 'expired') throw new AppError(409, 'BOOKING_EXPIRED', 'انتهت مهلة الحجز');
      if (booking.status === 'pending') throw new AppError(409, 'INVALID_TRANSITION', 'الدفع متاح بعد قبول الخبيرة للحجز');
      if (booking.status !== 'accepted') throw new AppError(409, 'INVALID_TRANSITION', `الدفع غير متاح والحجز بحالة ${booking.status}`);
      if (await repo.settledPayment(bookingId)) throw new AppError(409, 'PAYMENT_ALREADY_SETTLED', 'يوجد دفع مسجل لهذا الحجز، حدّثي حالة الحجز');
      const token = newDemoCallbackToken();
      const existing = await repo.latestPending(bookingId);
      if (existing) {
        const rotated = await repo.rotateToken(existing.id, demoTokenHash(token));
        return { payment: paymentDto(rotated), callbackToken: token, reused: true as const };
      }
      const payment = await repo.insertPayment({
        bookingId, amount: booking.totalAmount, currency: booking.currency,
        status: 'pending', provider: PROVIDER, providerRef: newDemoProviderRef(),
        callbackTokenHash: demoTokenHash(token),
      });
      return { payment: paymentDto(payment), callbackToken: token, reused: false as const };
    });
  }

  async listMine(actor: AuthenticatedUser, bookingId: string) {
    if (actor.role !== 'customer' && actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const booking = await this.repo.booking(bookingId);
    if (!booking) throw notFound();
    if (actor.role === 'customer' && booking.customerId !== actor.id) throw notFound();
    if (actor.role === 'expert' && booking.expertId !== actor.id) throw notFound();
    return (await this.repo.byBooking(bookingId)).map(paymentDto);
  }
  async adminList(actor: AuthenticatedUser, query: PaymentListQuery) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    return paginate(await this.repo.adminList(query, { page: query.page, limit: query.limit }), { page: query.page, limit: query.limit });
  }

  async adminLate(actor: AuthenticatedUser, page: Page) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const rows = await this.repo.latePayments(page);
    return {
      items: rows.slice(0, page.limit).map((row) => ({ ...paymentDto(row), bookingStatus: row.bookingStatus })),
      pagination: { ...page, hasNext: rows.length > page.limit },
    };
  }

  async adminDetail(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const payment = await this.repo.payment(id);
    if (!payment) throw notFound();
    const booking = await this.repo.booking(payment.bookingId);
    return { ...paymentDto(payment), booking };
  }

  /**
   * Verify a demo provider callback and apply it exactly once. The opaque
   * callback token is this adapter's verification; a real provider verifies
   * signatures instead. Success never confirms an expired or cancelled
   * booking: the money fact is recorded, the booking is left untouched.
   */
  async webhook(input: DemoWebhookInput) {
    const stored = await this.repo.payment(input.paymentId);
    if (!stored || stored.provider !== PROVIDER) throw notFound();
    if (!equalDemoToken(input.token, stored.callbackTokenHash)) {
      throw new AppError(401, 'INVALID_PROVIDER_TOKEN', 'حدث بوابة الدفع غير موثوق');
    }
    if (moneyToCents(input.amount) !== moneyToCents(stored.amount) || input.currency !== stored.currency) {
      await this.repo.transaction(async (repo) => {
        const event = await repo.recordEvent(PROVIDER, input.eventId, stored.id, input.outcome);
        if (!event) return;
        const current = await repo.lockPayment(stored.id);
        if (current && current.status === 'pending') {
          await repo.updatePayment(stored.id, { status: 'failed', failureReason: 'AMOUNT_MISMATCH' });
        }
      });
      throw new AppError(409, 'AMOUNT_MISMATCH', 'مبلغ الحدث لا يطابق مبلغ الدفع المسجل');
    }
    return this.repo.transaction(async (repo) => {
      const event = await repo.recordEvent(PROVIDER, input.eventId, stored.id, input.outcome);
      const payment = await repo.lockPayment(stored.id);
      if (!payment) throw notFound();
      // `confirmed` always mirrors the booking row, never the payment row: a
      // replayed late success must read false while the booking stays expired.
      const bookingConfirmed = async () => (await repo.booking(payment.bookingId))?.status === 'confirmed';
      if (!event) return { payment: paymentDto(payment), confirmed: await bookingConfirmed(), deduped: true as const };
      if (payment.status === 'paid' || payment.status === 'refunded') {
        return { payment: paymentDto(payment), confirmed: await bookingConfirmed(), deduped: false as const };
      }
      if (input.outcome === 'failed') {
        if (payment.status !== 'failed') {
          const updated = await repo.updatePayment(payment.id, { status: 'failed', failureReason: input.failureReason ?? 'PROVIDER_DECLINED' });
          const booking = await repo.booking(payment.bookingId);
          if (booking) {
            await this.announce(repo, {
              userId: booking.customerId, type: NOTIFICATION_TYPES.paymentFailed, audience: 'customer', bookingId: booking.id,
            });
          }
          return { payment: paymentDto(updated), confirmed: false, deduped: false as const };
        }
        return { payment: paymentDto(payment), confirmed: false, deduped: false as const };
      }
      // Outcome paid: record the money fact first, then confirm only an accepted booking.
      const paid = await repo.updatePayment(payment.id, { status: 'paid', failureReason: null, paidAt: this.now() });
      const booking = await repo.booking(paid.bookingId);
      if (!booking) return { payment: paymentDto(paid), confirmed: false, deduped: false as const, note: 'BOOKING_MISSING' as const };
      if (booking.status === 'accepted' && booking.expiresAt && booking.expiresAt.getTime() <= this.now().getTime()) {
        const expired = await repo.expireBookingIfDue(booking.id, this.now());
        if (expired) {
          await repo.addBookingHistory(booking.id, 'expired', null);
          await this.announce(repo, {
            userId: booking.customerId, type: NOTIFICATION_TYPES.bookingExpired, audience: 'customer', bookingId: booking.id,
          });
        }
        return { payment: paymentDto(paid), confirmed: false, deduped: false as const, note: 'BOOKING_EXPIRED' as const };
      }
      if (booking.status !== 'accepted') {
        return { payment: paymentDto(paid), confirmed: false, deduped: false as const, note: 'BOOKING_NOT_CONFIRMABLE' as const };
      }
      const confirmed = await repo.transitionBooking(booking.id, ['accepted'], { status: 'confirmed' });
      if (!confirmed) {
        const current = await repo.booking(booking.id);
        if (current?.status === 'confirmed') return { payment: paymentDto(paid), confirmed: true, deduped: false as const };
        return { payment: paymentDto(paid), confirmed: false, deduped: false as const, note: 'BOOKING_NOT_CONFIRMABLE' as const };
      }
      await repo.addBookingHistory(booking.id, 'confirmed', null);
      await this.announce(repo, {
        userId: booking.expertId, type: NOTIFICATION_TYPES.bookingConfirmed, audience: 'expert', bookingId: booking.id,
      });
      await this.announce(repo, {
        userId: booking.customerId, type: NOTIFICATION_TYPES.bookingConfirmed, audience: 'customer', bookingId: booking.id,
      });
      return { payment: paymentDto(paid), confirmed: true, deduped: false as const };
    });
  }

  /**
   * Operations-only full refund of a settled payment. A confirmed booking is
   * cancelled in the same transaction; a completed one is rejected so service
   * already delivered is never silently refunded. Proposed default pending
   * product approval of the refund scope.
   */
  async refund(actor: AuthenticatedUser, paymentId: string, reason?: string | null) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'الاسترجاع متاح للإدارة فقط');
    return this.repo.transaction(async (repo) => {
      const payment = await repo.lockPayment(paymentId);
      if (!payment) throw notFound();
      if (payment.status === 'refunded') return paymentDto(payment);
      if (payment.status !== 'paid') throw new AppError(409, 'INVALID_TRANSITION', `الاسترجاع غير متاح والدفع بحالة ${payment.status}`);
      const now = this.now();
      const refunded = await repo.updatePayment(payment.id, { status: 'refunded', refundedAmount: payment.amount, refundedAt: now });
      const booking = await repo.booking(payment.bookingId);
      if (booking?.payoutId) throw new AppError(409, 'BOOKING_IN_PAYOUT', 'الحجز مربوط بتحويل مسجل؛ عالجي التحويل تشغيليًا أولًا');
      if (booking?.status === 'confirmed') {
        const cancelled = await repo.transitionBooking(booking.id, ['confirmed'], {
          status: 'cancelled', cancelledBy: actor.id, cancellationReason: reason ?? 'refund', cancelledAt: now,
        });
        if (cancelled) await repo.addBookingHistory(booking.id, 'cancelled', actor.id);
      } else if (booking?.status === 'completed') {
        throw new AppError(409, 'INVALID_TRANSITION', 'لا استرجاع بعد اكتمال الخدمة دون سياسة معتمدة');
      }
      if (booking) {
        await this.announce(repo, {
          userId: booking.customerId, type: NOTIFICATION_TYPES.paymentRefunded, audience: 'customer', bookingId: booking.id,
        });
        await this.announce(repo, {
          userId: booking.expertId, type: NOTIFICATION_TYPES.paymentRefunded, audience: 'expert', bookingId: booking.id,
        });
      }
      await repo.audit(actor.id, 'payment.refunded', 'payment', payment.id, {
        bookingId: payment.bookingId, amount: payment.amount, currency: payment.currency,
        bookingStatus: booking?.status ?? null, reason: reason ?? null,
      });
      return paymentDto(refunded);
    });
  }
}
