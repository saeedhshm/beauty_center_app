import { apiRequest } from './client';
import type { PageEnvelope } from './types';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

export interface OutboxRow {
  id: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  userId: string;
  type: string;
}

export interface OutboxFilters {
  page?: number;
  limit?: number;
  status?: OutboxStatus | 'all';
}

export function listOutbox(filters: OutboxFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<PageEnvelope<OutboxRow>>(`/api/v1/admin/notifications/outbox${query ? `?${query}` : ''}`);
}

export function retryOutbox(id: string) {
  return apiRequest<{ id: string; status: 'pending' }>(`/api/v1/admin/notifications/outbox/${id}/retry`, { method: 'POST' });
}

export interface LatePayment {
  id: string;
  bookingId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  refundedAmount: string;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bookingStatus: string;
}

export function listLatePayments(page = 1, limit = 20) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest<PageEnvelope<LatePayment>>(`/api/v1/admin/payments/late?${params.toString()}`);
}
