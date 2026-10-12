import { apiRequest } from './client';
import type { AccountRole, ManagedUser, PageEnvelope } from './types';

export interface UserFilters {
  page?: number;
  limit?: number;
  role?: AccountRole | 'all';
  isActive?: boolean | 'all';
  q?: string;
  from?: string;
  to?: string;
}

export function listUsers(filters: UserFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.role && filters.role !== 'all') params.set('role', filters.role);
  if (filters.isActive !== undefined && filters.isActive !== 'all') params.set('isActive', String(filters.isActive));
  if (filters.q) params.set('q', filters.q);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return apiRequest<PageEnvelope<ManagedUser>>(`/api/v1/admin/users${query ? `?${query}` : ''}`);
}

export function getUser(id: string) {
  return apiRequest<ManagedUser>(`/api/v1/admin/users/${id}`);
}

export function deactivateUser(id: string) {
  return apiRequest<{ id: string; isActive: boolean }>(`/api/v1/admin/users/${id}/deactivate`, { method: 'POST' });
}

export function reactivateUser(id: string) {
  return apiRequest<{ id: string; isActive: boolean }>(`/api/v1/admin/users/${id}/reactivate`, { method: 'POST' });
}
