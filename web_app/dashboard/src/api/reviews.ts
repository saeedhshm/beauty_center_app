import { apiRequest } from './client';
import type { PageEnvelope, Review } from './types';

export interface ReviewFilters {
  page?: number;
  limit?: number;
  bookingId?: string;
  revieweeId?: string;
  rating?: number | 'all';
}

export function listReviews(filters: ReviewFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.bookingId) params.set('bookingId', filters.bookingId);
  if (filters.revieweeId) params.set('revieweeId', filters.revieweeId);
  if (filters.rating !== undefined && filters.rating !== 'all') params.set('rating', String(filters.rating));
  const query = params.toString();
  return apiRequest<PageEnvelope<Review>>(`/api/v1/admin/reviews${query ? `?${query}` : ''}`);
}
