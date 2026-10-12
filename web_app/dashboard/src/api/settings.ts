import { apiRequest } from './client';

export interface AdminCity {
  id: number;
  name: string;
  code: string;
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

export function setCityActive(id: number, isActive: boolean) {
  return apiRequest<AdminCity>(`/api/v1/admin/cities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}
