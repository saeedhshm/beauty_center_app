import { apiRequest } from './client';
import type { Booking, BookingDetail, BookingStatus, PageEnvelope } from './types';

export interface BookingFilters {
  page?: number;
  limit?: number;
  status?: BookingStatus | 'all';
}

export function listBookings(filters: BookingFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<PageEnvelope<Booking>>(`/api/v1/admin/bookings${query ? `?${query}` : ''}`);
}

export function getBooking(id: string) {
  return apiRequest<BookingDetail>(`/api/v1/admin/bookings/${id}`);
}

export function cancelBooking(id: string, reason?: string) {
  return apiRequest<BookingDetail>(`/api/v1/admin/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}
