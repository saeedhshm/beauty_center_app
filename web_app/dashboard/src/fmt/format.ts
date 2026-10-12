import type { ApprovalStatus, BookingStatus } from '../api/types';
import type { PaymentStatus } from '../api/payments';

const egp = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' });

/** Amounts arrive as decimal strings from the server and are never recomputed here. */
export function formatMoney(amount: string, currency: string): string {
  if (currency !== 'EGP') return `${amount} ${currency}`;
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  return egp.format(numeric);
}

export function formatCommissionRate(rate: string): string {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) return rate;
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(numeric) + '٪';
}

const cairoDateTime = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

const cairoDate = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeZone: 'Africa/Cairo',
});

/** Stored instants are rendered in Africa/Cairo regardless of device settings. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return cairoDateTime.format(new Date(time));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return cairoDate.format(new Date(time));
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'بانتظار الخبيرة',
  accepted: 'مقبول بانتظار الدفع',
  confirmed: 'مؤكد مدفوع',
  completed: 'مكتمل',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
  expired: 'منتهي المهلة',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  suspended: 'معلقة',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'بانتظار الدفع',
  paid: 'مدفوعة',
  failed: 'فاشلة',
  refunded: 'مستردة',
};

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
  switch (code) {
    case 'BOOKING_EXPIRED':
      return 'انتهت مهلة الحجز. أعيدي تحميل التفاصيل لعرض الحالة الحالية.';
    case 'BOOKING_ALREADY_PAID_OUT':
      return 'أحد الحجوزات مربوط بتحويل سابق. أعيدي التحميل لعرض الحالة الحالية.';
    case 'BOOKING_IN_PAYOUT':
      return 'الحجز مربوط بتحويل مسجل. عالجي التحويل تشغيليًا أولًا.';
    case 'AMOUNT_MISMATCH':
      return 'مبلغ حدث الدفع لا يطابق السجل. راجعي التفاصيل قبل أي إجراء.';
    case 'INVALID_TRANSITION':
      return 'تغيرت الحالة قبل تنفيذ الأمر. أعيدي التحميل ثم حاولي مجددًا.';
    case 'SLOT_TAKEN':
      return 'أصبح الموعد مشغولًا. أعيدي التحميل لعرض الحالة الحالية.';
    case 'EXPERT_NOT_APPROVED':
      return 'الخبيرة غير معتمدة حاليًا. راجعي حالة الاعتماد أولًا.';
    case 'PAYMENT_ALREADY_SETTLED':
      return 'سُجل دفع لهذا الحجز مسبقًا. أعيدي التحميل لعرض الحالة الحالية.';
    default:
      return fallback;
  }
}
