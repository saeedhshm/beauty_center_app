import { ApiError, apiRequest } from './client';
import { currentAccessToken } from '../auth/session-store';
import type { AdminExpert, AdminExpertDetail, ApprovalStatus, PageEnvelope } from './types';

export interface ExpertFilters {
  page?: number;
  limit?: number;
  approvalStatus?: ApprovalStatus | 'all';
}

export function listExperts(filters: ExpertFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.approvalStatus && filters.approvalStatus !== 'all') params.set('approvalStatus', filters.approvalStatus);
  const query = params.toString();
  return apiRequest<PageEnvelope<AdminExpert>>(`/api/v1/admin/experts${query ? `?${query}` : ''}`);
}

export function getExpert(id: string) {
  return apiRequest<AdminExpertDetail>(`/api/v1/admin/experts/${id}`);
}

export function approveExpert(id: string) {
  return apiRequest<unknown>(`/api/v1/admin/experts/${id}/approve`, { method: 'POST' });
}

export function suspendExpert(id: string) {
  return apiRequest<unknown>(`/api/v1/admin/experts/${id}/suspend`, { method: 'POST' });
}

export async function downloadIdentityDocument(id: string): Promise<{ blobUrl: string; contentType: string }> {
  const token = currentAccessToken();
  const response = await fetch(`/api/v1/admin/experts/${id}/identity-document/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string }; requestId?: string } | undefined;
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? 'تعذر تنزيل الوثيقة', body?.requestId);
  }
  const blob = await response.blob();
  return { blobUrl: URL.createObjectURL(blob), contentType: response.headers.get('content-type') ?? 'application/octet-stream' };
}
