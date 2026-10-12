import { AppError } from '../../shared/app-error.js';
import { centsToMoney, moneyToCents } from '../../shared/money.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { PayoutRepository } from './payout.repository.js';
import type { Page, PayoutListQuery } from './payout.validation.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');

const payoutDto = (row: {
  id: string; expertId: string; amount: string; currency: string;
  transferRef: string | null; transferredAt: Date | null;
  createdAt: Date; updatedAt: Date;
}) => ({
  ...row,
  transferredAt: row.transferredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

const paginate = <T>(rows: T[], page: Page) => ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });

const sumByCurrency = (rows: Array<{ amount?: string; expertEarning?: string; currency: string | null }>) => {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const cents = moneyToCents(row.amount ?? row.expertEarning ?? '0.00');
    totals.set(row.currency ?? 'EGP', (totals.get(row.currency ?? 'EGP') ?? 0n) + cents);
  }
  return [...totals.entries()].map(([currency, cents]) => ({ currency, amount: centsToMoney(cents) }));
};

export class PayoutService {
  constructor(private readonly repo: PayoutRepository, private readonly now: () => Date = () => new Date()) {}

  /**
   * Record a payout for completed, paid, unlinked bookings of one expert.
   * Amount is always Σ expertEarning in a single currency, computed here.
   * Locked rows serialize concurrent creators; the loser sees linked rows.
   */
  async create(actor: AuthenticatedUser, expertId: string, bookingIds: string[]) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'التحويلات متاحة للإدارة فقط');
    return this.repo.transaction(async (repo) => {
      const expert = await repo.lockExpertUser(expertId);
      if (!expert || expert.role !== 'expert') throw notFound();
      const rows = await repo.lockBookings(bookingIds);
      if (rows.length !== bookingIds.length) throw notFound();
      for (const row of rows) {
        if (row.expertId !== expertId) throw new AppError(409, 'INVALID_TRANSITION', 'كل الحجوزات يجب أن تخص الخبيرة نفسها');
        if (row.payoutId) throw new AppError(409, 'BOOKING_ALREADY_PAID_OUT', 'أحد الحجوزات مربوط بتحويل سابق');
        if (row.status !== 'completed') throw new AppError(409, 'INVALID_TRANSITION', 'الصرف متاح للحجوزات المكتملة فقط');
        if (!await repo.paidPaymentFor(row.id)) throw new AppError(409, 'INVALID_TRANSITION', 'الصرف يتطلب دفعًا مسجلًا غير مسترجع');
      }
      const currencies = new Set(rows.map((row) => row.currency));
      if (currencies.size !== 1) throw new AppError(409, 'INVALID_TRANSITION', 'عملة الحجوزات في التحويل الواحد يجب أن تكون واحدة');
      const currency = rows[0]!.currency;
      const amount = centsToMoney(rows.reduce((sum, row) => sum + moneyToCents(row.expertEarning), 0n));
      const payout = await repo.insertPayout({ expertId, amount, currency });
      await repo.linkBookings(payout.id, bookingIds);
      await repo.audit(actor.id, 'payout.created', payout.id, { expertId, bookingIds, amount, currency });
      return { ...payoutDto(payout), bookings: bookingIds };
    });
  }

  /**
   * Record the manual transfer of funds. This only documents an operations
   * transfer with its reference; it is never an automatic bank transfer.
   * Replays return the stored record unchanged.
   */
  async transfer(actor: AuthenticatedUser, id: string, transferRef: string) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'تسجيل التحويل متاح للإدارة فقط');
    return this.repo.transaction(async (repo) => {
      const payout = await repo.lockPayout(id);
      if (!payout) throw notFound();
      if (payout.transferredAt) return payoutDto(payout);
      const updated = await repo.markTransferred(id, transferRef, this.now());
      await repo.audit(actor.id, 'payout.transferred', id, { transferRef });
      return payoutDto(updated);
    });
  }

  async adminDetail(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const payout = await this.repo.payout(id);
    if (!payout) throw notFound();
    return { ...payoutDto(payout), bookings: await this.repo.payoutBookings(id) };
  }

  async adminEligible(actor: AuthenticatedUser, expertId: string) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    // Read-only gate; creation re-validates the same predicate under row locks.
    const expert = await this.repo.lockExpertUser(expertId);
    if (!expert || expert.role !== 'expert') throw notFound();
    const bookings = await this.repo.eligibleBookingRows(expertId);
    return { expertId, bookings };
  }

  async adminList(actor: AuthenticatedUser, query: PayoutListQuery) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    return paginate(await this.repo.list(query, { page: query.page, limit: query.limit }), { page: query.page, limit: query.limit });
  }

  async ownPayouts(actor: AuthenticatedUser, query: PayoutListQuery) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    return paginate(
      await this.repo.list({ ...query, expertId: undefined }, { page: query.page, limit: query.limit }, { expertId: actor.id }),
      { page: query.page, limit: query.limit },
    );
  }

  async ownPayout(actor: AuthenticatedUser, id: string) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const payout = await this.repo.payout(id);
    if (!payout || payout.expertId !== actor.id) throw notFound();
    return { ...payoutDto(payout), bookings: await this.repo.payoutBookings(id) };
  }

  /** Server-computed earnings split: eligible now, recorded, and transferred. */
  async ownEarnings(actor: AuthenticatedUser) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const [eligible, recorded, transferred] = await Promise.all([
      this.repo.eligibleBookings(actor.id),
      this.repo.recordedPayouts(actor.id),
      this.repo.transferredPayouts(actor.id),
    ]);
    return {
      eligible: sumByCurrency(eligible),
      recorded: sumByCurrency(recorded),
      transferred: sumByCurrency(transferred),
    };
  }
}
