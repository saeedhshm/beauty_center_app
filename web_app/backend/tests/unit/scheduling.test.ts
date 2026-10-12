import { describe, expect, it, vi } from 'vitest';
import { cairoDateString, cairoWallToUtc, cairoWeekday } from '../../src/shared/cairo-time.js';
import { centsToMoney, moneyToCents, rateToUnits, splitCommission } from '../../src/shared/money.js';
import { workingIntervals } from '../../src/modules/availability/availability.service.js';
import { BookingService } from '../../src/modules/bookings/booking.service.js';

describe('Cairo wall-clock helpers', () => {
  it('round-trips wall times across the DST boundary without a fixed offset', () => {
    // Egypt re-enters DST in late April: wall 12:00 maps to different UTC instants.
    const winter = cairoWallToUtc(2026, 1, 15, 12, 0);
    const summer = cairoWallToUtc(2026, 7, 15, 12, 0);
    expect(winter.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(cairoDateString(winter)).toBe('2026-01-15');
    expect(cairoWeekday(2026, 10, 12)).toBe(1);
  });
});

describe('money splits', () => {
  it('computes the approved 20% example with half-up rounding', () => {
    expect(splitCommission('300.00', '20.0000')).toEqual({ commissionAmount: '60.00', expertEarning: '240.00' });
    expect(splitCommission('300.50', '20.0000')).toEqual({ commissionAmount: '60.10', expertEarning: '240.40' });
    expect(splitCommission('0.05', '20.0000')).toEqual({ commissionAmount: '0.01', expertEarning: '0.04' });
    expect(moneyToCents('250.00')).toBe(25000n);
    expect(centsToMoney(60n * 100n + 10n)).toBe('60.10');
    expect(rateToUnits('20.0000')).toBe(200000n);
  });
});

describe('working intervals', () => {
  const weekly = [
    { dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00' },
    { dayOfWeek: 1, startTime: '18:00:00', endTime: '20:00:00' },
  ];
  it('merges weekly intervals and clips to the daytime window', () => {
    expect(workingIntervals(1, weekly, [])).toEqual([[540, 1020], [1080, 1200]]);
    expect(workingIntervals(2, weekly, [])).toEqual([]);
  });
  it('applies unavailable cuts and available extras with unavailable winning overlaps', () => {
    const cut = workingIntervals(1, weekly, [{ startTime: '10:00:00', endTime: '12:00:00', type: 'unavailable' }]);
    expect(cut).toEqual([[540, 600], [720, 1020], [1080, 1200]]);
    const extra = workingIntervals(2, weekly, [{ startTime: '10:00:00', endTime: '12:00:00', type: 'available' }]);
    expect(extra).toEqual([[600, 720]]);
    const blocked = workingIntervals(1, weekly, [{ startTime: null, endTime: null, type: 'unavailable' }]);
    expect(blocked).toEqual([]);
    const partialOverlap = workingIntervals(1, weekly, [
      { startTime: '10:00:00', endTime: '11:00:00', type: 'unavailable' },
      { startTime: '10:15:00', endTime: '10:45:00', type: 'available' },
    ]);
    expect(partialOverlap).toEqual([[540, 600], [660, 1020], [1080, 1200]]);
    const explicitExtra = workingIntervals(1, weekly, [
      { startTime: null, endTime: null, type: 'unavailable' },
      { startTime: '10:00:00', endTime: '12:00:00', type: 'available' },
    ]);
    expect(explicitExtra).toEqual([]);
  });
});

describe('expiry job', () => {
  it('expires due bookings transactionally and announces each one', async () => {
    const now = new Date('2026-10-11T10:00:00.000Z');
    const due = [{ id: 'booking-1', customerId: 'customer-1', expertId: 'expert-1', status: 'pending' }];
    const expireDue = vi.fn(async (at: Date) => (at === now ? ['booking-1'] : []));
    const enqueue = vi.fn(async () => {});
    const txRepo = {
      connection: {},
      dueForExpiry: async () => due,
      expireDue,
    };
    const repo = {
      connection: {},
      transaction: async <T>(work: (r: unknown) => Promise<T>) => work(txRepo),
    };
    const service = new BookingService(
      repo as never,
      {} as never,
      { enqueue } as never,
      () => now,
    );
    await expect(service.expireDue()).resolves.toEqual(['booking-1']);
    expect(expireDue).toHaveBeenCalledTimes(1);
    expect(expireDue).toHaveBeenCalledWith(now);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 'expert-1', bookingId: 'booking-1' }));
  });
});
