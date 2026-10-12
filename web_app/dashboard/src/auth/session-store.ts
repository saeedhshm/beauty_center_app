import type { AdminSession } from '../api/types';

const refreshKey = 'lamsa.admin.refresh-token';
let accessToken: string | null = null;

function storageAvailable() {
  return typeof window !== 'undefined' && window.sessionStorage !== undefined;
}

export function currentAccessToken() {
  return accessToken;
}

export function currentRefreshToken() {
  return storageAvailable() ? window.sessionStorage.getItem(refreshKey) : null;
}

export function saveSession(session: AdminSession) {
  accessToken = session.accessToken;
  if (storageAvailable()) window.sessionStorage.setItem(refreshKey, session.refreshToken);
}

export function clearSession() {
  accessToken = null;
  if (storageAvailable()) window.sessionStorage.removeItem(refreshKey);
}
