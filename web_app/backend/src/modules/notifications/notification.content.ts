/**
 * Notification vocabulary for booking and payment events. Copy lives here so a
 * business module names an event instead of inventing wording, and so the same
 * event reads naturally for each audience. Bodies never carry an address, a
 * phone number or an amount: `data` holds the booking id only, and booking
 * detail stays behind the session and ownership check.
 */
export const NOTIFICATION_TYPES = {
  bookingRequested: 'booking_requested',
  bookingAccepted: 'booking_accepted',
  bookingRejected: 'booking_rejected',
  bookingCancelled: 'booking_cancelled',
  bookingConfirmed: 'booking_confirmed',
  bookingCompleted: 'booking_completed',
  bookingExpired: 'booking_expired',
  paymentRefunded: 'payment_refunded',
  paymentFailed: 'payment_failed',
  reviewReceived: 'review_received',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
export type NotificationAudience = 'customer' | 'expert';

const CONTENT: Record<NotificationType, Record<NotificationAudience, { title: string; body: string }>> = {
  booking_requested: {
    expert: { title: 'طلب حجز جديد', body: 'وصلتك طلبات حجز جديدة، راجعيها وردّي عليها.' },
    customer: { title: 'طلب حجز جديد', body: 'تم إرسال طلب الحجز إلى الخبيرة.' },
  },
  booking_accepted: {
    expert: { title: 'تم قبول الحجز', body: 'قبلتِ الحجز، بانتظار الدفع من العميلة.' },
    customer: { title: 'تم قبول حجزك', body: 'قبلت الخيرة موعدك، أكملي الدفع لتأكيد الحجز.' },
  },
  booking_rejected: {
    expert: { title: 'تم رفض الحجز', body: 'رفضتِ طلب الحجز.' },
    customer: { title: 'لم يتم قبول الحجز', body: 'لم تقبل الخيرة طلب الحجز، اختاري موعدًا آخر.' },
  },
  booking_cancelled: {
    expert: { title: 'تم إلغاء الحجز', body: 'أُلغي أحد حجوزاتك.' },
    customer: { title: 'تم إلغاء الحجز', body: 'أُلغي أحد حجوزاتك.' },
  },
  booking_confirmed: {
    expert: { title: 'تم تأكيد الحجز', body: 'تم دفع الحجز وتأكيده.' },
    customer: { title: 'تم تأكيد حجزك', body: 'تم تأكيد حجزك بعد الدفع.' },
  },
  booking_completed: {
    expert: { title: 'تم إكمال الخدمة', body: 'اكتمل أحد حجوزاتك، يمكنك تقييم العميلة.' },
    customer: { title: 'تم إكمال الخدمة', body: 'اكتمل حجزك، يمكنك تقييم الخبيرة الآن.' },
  },
  booking_expired: {
    expert: { title: 'انتهت مهلة الطلب', body: 'انتهت مهلة الرد على أحد طلبات الحجز وانتهى تلقائيًا.' },
    customer: { title: 'انتهت مهلة الدفع', body: 'انتهت مهلة الدفع لهذا الحجز ولم يتم تأكيده.' },
  },
  payment_refunded: {
    expert: { title: 'تم استرجاع الدفع', body: 'تم استرجاع دفعة مرتبطة بحجزك.' },
    customer: { title: 'تم استرجاع الدفع', body: 'تم استرجاع دفعة حجزك.' },
  },
  payment_failed: {
    expert: { title: 'لم يتم الدفع', body: 'لم تكتمل دفعة أحد حجوزاتك.' },
    customer: { title: 'لم يكتمل الدفع', body: 'لم تكتمل دفعة حجزك، يمكنك إعادة المحاولة قبل انتهاء المهلة.' },
  },
  review_received: {
    expert: { title: 'تقييم جديد', body: 'وصل تقييم جديد على أحد خدماتك.' },
    customer: { title: 'تقييم جديد', body: 'وصل تقييم جديد على أحد حجوزاتك.' },
  },
};

export function notificationContent(type: NotificationType, audience: NotificationAudience) {
  return CONTENT[type][audience];
}
