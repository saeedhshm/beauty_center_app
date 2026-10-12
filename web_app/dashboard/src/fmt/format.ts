import type { ApprovalStatus, BookingStatus } from '../api/types';
import type { PaymentStatus } from '../api/payments';
import { getActiveLocale, translate, type Locale } from '../i18n/i18n';

function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-GB';
}

/** Amounts arrive as decimal strings from the server and are never recomputed here. */
export function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(intlLocale(getActiveLocale()), { style: 'currency', currency }).format(numeric);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatCommissionRate(rate: string): string {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) return rate;
  return new Intl.NumberFormat(intlLocale(getActiveLocale()), { style: 'percent', maximumFractionDigits: 4 }).format(numeric / 100);
}

/** Stored instants are rendered in Africa/Cairo regardless of device settings. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat(intlLocale(getActiveLocale()), {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo',
  }).format(new Date(time));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat(intlLocale(getActiveLocale()), {
    dateStyle: 'medium', timeZone: 'Africa/Cairo',
  }).format(new Date(time));
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: 'بانتظار الخبيرة',
  accepted: 'مقبول بانتظار الدفع',
  confirmed: 'مؤكد مدفوع',
  completed: 'مكتمل',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
  expired: 'منتهي المهلة',
};

export const BOOKING_STATUS_LABELS = new Proxy(bookingStatusLabels, {
  get: (target, property: BookingStatus) => translate(getActiveLocale(), target[property]),
});

const approvalStatusLabels: Record<ApprovalStatus, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  suspended: 'معلقة',
};

export const APPROVAL_STATUS_LABELS = new Proxy(approvalStatusLabels, {
  get: (target, property: ApprovalStatus) => translate(getActiveLocale(), target[property]),
});

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'بانتظار الدفع',
  paid: 'مدفوعة',
  failed: 'فاشلة',
  refunded: 'مستردة',
};

export const PAYMENT_STATUS_LABELS = new Proxy(paymentStatusLabels, {
  get: (target, property: PaymentStatus) => translate(getActiveLocale(), target[property]),
});

export function paymentStatusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
    case 'refunded':
      return 'error';
  }
}

export type StatusTone = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';

export function bookingStatusTone(status: BookingStatus): StatusTone {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return 'success';
    case 'pending':
    case 'accepted':
      return 'warning';
    case 'expired':
      return 'info';
    case 'rejected':
    case 'cancelled':
      return 'error';
  }
}

export function approvalStatusTone(status: ApprovalStatus): StatusTone {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'suspended':
      return 'error';
  }
}

const CONFLICT_CODES = new Set([
  'SLOT_TAKEN',
  'INVALID_TRANSITION',
  'BOOKING_EXPIRED',
  'EXPERT_NOT_APPROVED',
  'CITY_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'PAYMENT_ALREADY_SETTLED',
  'BOOKING_ALREADY_PAID_OUT',
  'BOOKING_IN_PAYOUT',
  'AMOUNT_MISMATCH',
]);

export function isConflictCode(code: string | undefined): boolean {
  return code !== undefined && CONFLICT_CODES.has(code);
}

/** Friendly Arabic message for operational errors; falls back to the server message. */
export function describeApiError(code: string | undefined, fallback: string): string {
  const locale = getActiveLocale();
  switch (code) {
    case 'BOOKING_EXPIRED':
      return translate(locale, 'انتهت مهلة الحجز. أعيدي تحميل التفاصيل لعرض الحالة الحالية.');
    case 'BOOKING_ALREADY_PAID_OUT':
      return translate(locale, 'أحد الحجوزات مربوط بتحويل سابق. أعيدي التحميل لعرض الحالة الحالية.');
    case 'BOOKING_IN_PAYOUT':
      return translate(locale, 'الحجز مربوط بتحويل مسجل. عالجي التحويل تشغيليًا أولًا.');
    case 'AMOUNT_MISMATCH':
      return translate(locale, 'مبلغ حدث الدفع لا يطابق السجل. راجعي التفاصيل قبل أي إجراء.');
    case 'INVALID_TRANSITION':
      return translate(locale, 'تغيرت الحالة قبل تنفيذ الأمر. أعيدي التحميل ثم حاولي مجددًا.');
    case 'SLOT_TAKEN':
      return translate(locale, 'أصبح الموعد مشغولًا. أعيدي التحميل لعرض الحالة الحالية.');
    case 'EXPERT_NOT_APPROVED':
      return translate(locale, 'الخبيرة غير معتمدة حاليًا. راجعي حالة الاعتماد أولًا.');
    case 'PAYMENT_ALREADY_SETTLED':
      return translate(locale, 'سُجل دفع لهذا الحجز مسبقًا. أعيدي التحميل لعرض الحالة الحالية.');
    default:
      return fallback;
  }
}
