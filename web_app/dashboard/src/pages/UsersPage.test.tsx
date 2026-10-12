import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { UserDetailPage } from './UserDetailPage';
import { UsersPage } from './UsersPage';
import { RouterShell } from '../test/harness';
import { errorBody, json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const customerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const customerRow = {
  id: customerId,
  name: 'عميلة الاختبار',
  phone: '+201000000001',
  role: 'customer',
  cityId: 1,
  cityName: 'القاهرة',
  isActive: true,
  phoneVerified: true,
  ratingAvg: '0.00',
  ratingCount: 0,
  createdAt: '2026-10-12T09:00:00.000Z',
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Users directory flow (mocked API responses, labeled)', () => {
  it('filters server-side and deactivates behind confirmation, then refetches', async () => {
    let active = true;
    const calls: string[] = [];
    stubFetch(async (path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path.startsWith('/api/v1/admin/users/') && (init?.method ?? 'GET') === 'POST') {
        active = path.endsWith('/reactivate');
        return json({ data: { id: customerId, isActive: active }, requestId: 'm' });
      }
      if (path.startsWith('/api/v1/admin/users/')) {
        return json({ data: { ...customerRow, isActive: active }, requestId: 'r' });
      }
      return json({ data: { items: [{ ...customerRow, isActive: active }], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'l' });
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/users?role=customer">
        <Routes>
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:id" element={<UserDetailPage />} />
        </Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('عميلة الاختبار')).toBeInTheDocument();
    expect(calls.some((call) => call.includes('role=customer'))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'تعطيل' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(screen.getAllByText('معطّل').length).toBeGreaterThanOrEqual(1));
    expect(calls.some((call) => call === `POST /api/v1/admin/users/${customerId}/deactivate`)).toBe(true);
  });

  it('links an expert account to its review file and refuses admin deactivation', async () => {
    const expertId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    stubFetch(async (path) => {
      if (path === `/api/v1/admin/users/${expertId}`) {
        return json({ data: { ...customerRow, id: expertId, name: 'خبيرة الاختبار', role: 'expert' }, requestId: 'r' });
      }
      throw new Error(`unexpected GET ${path}`);
    });
    render(
      <RouterShell initialPath={`/users/${expertId}`}>
        <Routes><Route path="/users/:id" element={<UserDetailPage />} /></Routes>
      </RouterShell>,
    );
    const link = await screen.findByRole('link', { name: 'فتح ملف الخبيرة' });
    expect(link.getAttribute('href')).toBe(`/experts/${expertId}`);
  });

  it('renders the forbidden state for non-admin sessions', async () => {
    stubFetch(async () => errorBody('FORBIDDEN', 403));
    render(
      <RouterShell initialPath="/users">
        <Routes><Route path="/users" element={<UsersPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('ليس لديك صلاحية عرض هذا المورد.')).toBeInTheDocument();
  });
});
