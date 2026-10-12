import { apiRequest } from './client';

export interface AdminCity {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
}

export interface BookingPolicySnapshot {
  acceptanceTimeoutMinutes: number;
  paymentTimeoutMinutes: number;
  commissionRate: string;
}

export interface AdminSettings {
  launchCity: AdminCity;
  currency: string;
  timeZone: string;
  paymentMode: string;
  daytimeOnly: boolean;
  bookingPolicy: BookingPolicySnapshot;
}

export function getSettings() {
  return apiRequest<AdminSettings>('/api/v1/admin/settings');
}

export function listCities() {
  return apiRequest<AdminCity[]>('/api/v1/admin/cities');
}

export function createCity(input: { name: string; code: string }) {
  return apiRequest<AdminCity>('/api/v1/admin/cities', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setCityActive(id: number, isActive: boolean) {
  return apiRequest<AdminCity>(`/api/v1/admin/cities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export function deleteCity(id: number) {
  return apiRequest<void>(`/api/v1/admin/cities/${id}`, { method: 'DELETE' });
}

export interface PolicyPatch {
  acceptanceTimeoutMinutes?: number;
  paymentTimeoutMinutes?: number;
  commissionRate?: string;
}

export function updatePolicy(patch: PolicyPatch) {
  return apiRequest<BookingPolicySnapshot>('/api/v1/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function updateCurrency(currency: 'EGP' | 'SAR') {
  return apiRequest<{ currency: 'EGP' | 'SAR' }>('/api/v1/admin/settings/currency', {
    method: 'PATCH',
    body: JSON.stringify({ currency }),
  });
}
