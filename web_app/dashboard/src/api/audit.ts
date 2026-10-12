import { apiRequest } from './client';
import type { AuditLog, PageEnvelope } from './types';

export interface AuditFilters {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export function listAuditLogs(filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.action) params.set('action', filters.action);
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return apiRequest<PageEnvelope<AuditLog>>(`/api/v1/admin/audit-logs${query ? `?${query}` : ''}`);
}

export function auditResourcePath(resourceType: string, resourceId: string): string | null {
  switch (resourceType) {
    case 'booking':
      return `/bookings/${resourceId}`;
    case 'expert':
      return `/experts/${resourceId}`;
    case 'user':
      return `/users/${resourceId}`;
    case 'service':
      return '/services';
    default:
      return null;
  }
}
