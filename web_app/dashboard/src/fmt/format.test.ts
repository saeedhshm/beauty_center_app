import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  describeApiError,
  formatCommissionRate,
  formatDateTime,
  formatMoney,
  isConflictCode,
} from './format';

describe('operations formatting (display only, never recomputed money)', () => {
  it('renders stored EGP strings with the Cairo currency label', () => {
    expect(formatMoney('300.50', 'EGP')).toContain('ج.م');
    expect(formatMoney('300.50', 'EGP')).toContain('٣٠٠');
    expect(formatMoney('300.50', 'EGP')).not.toBe('300.50');
    expect(formatMoney('12.00', 'SAR')).toContain('١٢');
    expect(formatMoney('12.00', 'SAR')).not.toContain('EGP');
  });

  it('renders commission snapshots without inventing a tax model', () => {
    expect(formatCommissionRate('20.0000')).toContain('٪');
    expect(formatCommissionRate('20.0000')).not.toBe('20.0000');
    expect(formatCommissionRate('not-a-rate')).toBe('not-a-rate');
  });

  it('renders stored instants in Africa/Cairo regardless of device zone', () => {
    const rendered = formatDateTime('2026-10-12T10:00:00.000Z');
    expect(rendered).not.toBe('—');
    expect(rendered).not.toBe('2026-10-12T10:00:00.000Z');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('broken')).toBe('broken');
  });

  it('labels every booking and approval state in Arabic without color-only meaning', () => {
    expect(Object.keys(BOOKING_STATUS_LABELS)).toHaveLength(7);
    expect(BOOKING_STATUS_LABELS.confirmed).toBe('مؤكد مدفوع');
    expect('paid' in BOOKING_STATUS_LABELS).toBe(false);
    expect(APPROVAL_STATUS_LABELS.suspended).toBe('معلقة');
    expect(bookingStatusTone('expired')).not.toBe(bookingStatusTone('cancelled'));
  });

  it('maps conflict codes to refresh-first Arabic guidance', () => {
    expect(isConflictCode('INVALID_TRANSITION')).toBe(true);
    expect(isConflictCode('BOOKING_EXPIRED')).toBe(true);
    expect(isConflictCode('VALIDATION_ERROR')).toBe(false);
    expect(isConflictCode(undefined)).toBe(false);
    expect(describeApiError('BOOKING_EXPIRED', 'expired')).toContain('أعيدي تحميل');
    expect(describeApiError('UNKNOWN_CODE', 'server says')).toBe('server says');
  });
});
