import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { saveSession } from '../auth/session-store';
import type { AdminSession } from './types';

const oldSession: AdminSession = {
  user: { id: '92db8e98-7f27-45ca-9908-953423c26798', name: 'مدير العرض', phone: '+201000000001', role: 'admin', phoneVerified: true },
  tokenType: 'Bearer',
  accessToken: 'la_old',
  refreshToken: 'lr_old',
  accessExpiresAt: '2026-10-12T10:00:00.000Z',
  refreshExpiresAt: '2026-11-12T10:00:00.000Z',
};

const newSession: AdminSession = {
  ...oldSession,
  accessToken: 'la_new',
  refreshToken: 'lr_new',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('API session rotation', () => {
  it('shares one refresh across concurrent unauthorized requests and retries both', async () => {
    saveSession(oldSession);
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const headers = new Headers(init?.headers);
      if (path === '/api/v1/admin/auth/refresh') {
        refreshCalls += 1;
        await Promise.resolve();
        return json({ data: newSession, requestId: 'refresh-request' });
      }
      if (headers.get('authorization') === 'Bearer la_old') {
        return json({ error: { code: 'INVALID_SESSION', message: 'انتهت الجلسة' }, requestId: 'old-request' }, 401);
      }
      return json({ data: { ok: true }, requestId: 'retried-request' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      apiRequest<{ ok: boolean }>('/api/v1/admin/settings'),
      apiRequest<{ ok: boolean }>('/api/v1/admin/bookings'),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(window.sessionStorage.getItem('lamsa.admin.refresh-token')).toBe('lr_new');
  });

  it('does not retry an unauthorized request without a refresh token', async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: 'INVALID_SESSION', message: 'انتهت الجلسة' }, requestId: 'request-id' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/v1/admin/settings')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_SESSION',
      requestId: 'request-id',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
