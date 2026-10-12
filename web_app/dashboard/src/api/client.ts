import { clearSession, currentAccessToken, currentRefreshToken, saveSession } from '../auth/session-store';
import type { AdminSession, ApiEnvelope, ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  retryUnauthorized?: boolean;
}

let refreshInFlight: Promise<AdminSession> | null = null;

async function responseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  return response.json();
}

async function toApiError(response: Response, body: unknown) {
  const value = body as ApiErrorBody | undefined;
  const retryAfter = response.headers.get('retry-after');
  const suffix = retryAfter ? ` حاولي مرة أخرى بعد ${retryAfter} ثانية.` : '';
  return new ApiError(
    response.status,
    value?.error?.code ?? 'REQUEST_FAILED',
    `${value?.error?.message ?? 'تعذر إكمال الطلب'}${suffix}`,
    value?.requestId,
    value?.error?.fields,
  );
}

async function send(path: string, options: RequestOptions, token: string | null) {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...options, headers });
}

async function refreshAdminSession() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = currentRefreshToken();
  if (!refreshToken) throw new ApiError(401, 'INVALID_SESSION', 'انتهت جلسة الإدارة');

  refreshInFlight = (async () => {
    const response = await send('/api/v1/admin/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      auth: false,
    }, null);
    const body = await responseBody(response);
    if (!response.ok) {
      clearSession();
      throw await toApiError(response, body);
    }
    const session = (body as ApiEnvelope<AdminSession>).data;
    saveSession(session);
    return session;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  const retryUnauthorized = options.retryUnauthorized ?? true;
  const sentToken = auth ? currentAccessToken() : null;
  let response = await send(path, options, sentToken);
  let body = await responseBody(response);

  if (response.status === 401 && auth && retryUnauthorized && currentRefreshToken()) {
    if (sentToken === currentAccessToken()) await refreshAdminSession();
    response = await send(path, { ...options, retryUnauthorized: false }, currentAccessToken());
    body = await responseBody(response);
  }

  if (!response.ok) {
    if (response.status === 401 && auth) clearSession();
    throw await toApiError(response, body);
  }
  if (response.status === 204) return undefined as T;
  return (body as ApiEnvelope<T>).data;
}

export async function loginAdmin(phone: string, password: string) {
  const session = await apiRequest<AdminSession>('/api/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
    auth: false,
    retryUnauthorized: false,
  });
  saveSession(session);
  return session;
}

export async function restoreAdminSession() {
  return refreshAdminSession();
}

export async function logoutAdmin() {
  const refreshToken = currentRefreshToken();
  clearSession();
  if (!refreshToken) return;
  try {
    await apiRequest<void>('/api/v1/admin/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      auth: false,
      retryUnauthorized: false,
    });
  } catch {
    // Local logout remains authoritative when the network is unavailable.
  }
}
