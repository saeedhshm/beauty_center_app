import { apiRequest } from './client';
import type { PageEnvelope, Service, ServiceInput } from './types';

export interface ServiceFilters {
  page?: number;
  limit?: number;
}

export function listServices(filters: ServiceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiRequest<PageEnvelope<Service>>(`/api/v1/admin/services${query ? `?${query}` : ''}`);
}

export function createService(input: ServiceInput) {
  return apiRequest<Service>('/api/v1/admin/services', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateService(id: number, input: Partial<ServiceInput>) {
  return apiRequest<Service>(`/api/v1/admin/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
