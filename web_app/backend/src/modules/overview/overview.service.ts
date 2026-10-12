import { AppError } from '../../shared/app-error.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { OverviewRepository } from './overview.repository.js';
import type { OverviewQuery } from './overview.validation.js';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

const asMoney = (value: string | null) => value ?? '0.00';

/**
 * Metric definitions (also documented for the dashboard):
 * - bookings: counts by status of bookings created in range.
 * - payments: sums and counts by (status, currency) of attempts created in range.
 * - payouts: sums and counts split into recorded vs transferred, grouped by
 *   currency, for payouts created in range.
 * - reviews: count and mean rating of reviews created in range.
 * - users: counts by role of accounts created in range.
 * - outbox: CURRENT totals by delivery status across all time (operational now-state).
 * - worker: last successful worker tick, or null when no tick has ever run.
 * Money arrives as decimal strings from PostgreSQL and is never recomputed here.
 */
export class OverviewService {
  constructor(private readonly repo: OverviewRepository, private readonly now: () => Date = () => new Date()) {}

  async summary(actor: AuthenticatedUser, query: OverviewQuery) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const now = this.now();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - THIRTY_DAYS_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppError(422, 'VALIDATION_ERROR', 'تحققي من البيانات المدخلة');
    }
    const range = { from, to };
    const [bookings, payments, payouts, reviews, users, outbox, heartbeat] = await Promise.all([
      this.repo.bookingsByStatus(range),
      this.repo.paymentsByStatus(range),
      this.repo.payoutsSplit(range),
      this.repo.reviewsSummary(range),
      this.repo.usersByRole(range),
      this.repo.outboxByStatus(),
      this.repo.heartbeat(),
    ]);
    const reviewRow = reviews[0];
    return {
      range: { from: from.toISOString(), to: to.toISOString(), timeZone: 'Africa/Cairo' },
      bookings: bookings.map((row) => ({ status: row.status, count: Number(row.total) })),
      payments: payments.map((row) => ({
        status: row.status, currency: row.currency, total: asMoney(row.total), count: Number(row.count),
      })),
      payouts: payouts.map((row) => ({
        transferred: row.transferred, currency: row.currency, total: asMoney(row.total), count: Number(row.count),
      })),
      reviews: {
        count: Number(reviewRow?.count ?? 0),
        average: reviewRow?.average === null || reviewRow?.average === undefined ? null : String(reviewRow.average),
      },
      users: users.map((row) => ({ role: row.role, count: Number(row.total) })),
      outbox: outbox.map((row) => ({ status: row.status, count: Number(row.total) })),
      worker: heartbeat ? {
        tickAt: heartbeat.tickAt.toISOString(),
        expired: heartbeat.expired,
        claimed: heartbeat.claimed,
        sent: heartbeat.sent,
        retried: heartbeat.retried,
        cleaned: heartbeat.cleaned,
      } : null,
    };
  }
}
