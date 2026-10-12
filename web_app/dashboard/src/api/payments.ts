import { apiRequest } from './client';
import type { PageEnvelope } from './types';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  bookingId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  refundedAmount: string;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentBookingRef {
  id: string;
  customerId: string;
  expertId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalAmount: string;
  currency: string;
  expiresAt: string | null;
  payoutId: string | null;
}

export interface PaymentDetail extends Payment {
  booking: PaymentBookingRef | null;
}

export interface PaymentFilters {
  page?: number;
  limit?: number;
  status?: PaymentStatus | 'all';
  bookingId?: string;
}

export function listPayments(filters: PaymentFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.bookingId) params.set('bookingId', filters.bookingId);
  const query = params.toString();
  return apiRequest<PageEnvelope<Payment>>(`/api/v1/admin/payments${query ? `?${query}` : ''}`);
}

export function getPayment(id: string) {
  return apiRequest<PaymentDetail>(`/api/v1/admin/payments/${id}`);
}

export function refundPayment(id: string, reason?: string) {
  return apiRequest<Payment>(`/api/v1/admin/payments/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}
