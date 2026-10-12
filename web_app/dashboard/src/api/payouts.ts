import { apiRequest } from './client';
import type { PageEnvelope } from './types';

export interface Payout {
  id: string;
  expertId: string;
  amount: string;
  currency: string;
  transferRef: string | null;
  transferredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutBooking {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalAmount: string;
  expertEarning: string;
  currency: string;
}

export interface PayoutDetail extends Payout {
  bookings: PayoutBooking[];
}

export interface PayoutFilters {
  page?: number;
  limit?: number;
  expertId?: string;
  transferred?: boolean | 'all';
}

export function listPayouts(filters: PayoutFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.expertId) params.set('expertId', filters.expertId);
  if (filters.transferred !== undefined && filters.transferred !== 'all') params.set('transferred', String(filters.transferred));
  const query = params.toString();
  return apiRequest<PageEnvelope<Payout>>(`/api/v1/admin/payouts${query ? `?${query}` : ''}`);
}

export function getPayout(id: string) {
  return apiRequest<PayoutDetail>(`/api/v1/admin/payouts/${id}`);
}

export function listEligibleBookings(expertId: string) {
  const params = new URLSearchParams({ expertId });
  return apiRequest<{ expertId: string; bookings: PayoutBooking[] }>(`/api/v1/admin/payouts/eligible?${params.toString()}`);
}

export function createPayout(expertId: string, bookingIds: string[]) {
  return apiRequest<Payout>(`/api/v1/admin/payouts`, {
    method: 'POST',
    body: JSON.stringify({ expertId, bookingIds }),
  });
}

export function recordTransfer(id: string, transferRef: string) {
  return apiRequest<Payout>(`/api/v1/admin/payouts/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ transferRef }),
  });
}
