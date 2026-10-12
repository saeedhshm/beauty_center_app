import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { ServicesPage } from './ServicesPage';
import { RouterShell } from '../test/harness';
import { errorBody, json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const pageOne = {
  data: {
    items: [
      { id: 3, name: 'مكياج سهرة', description: null, durationMin: 60, isActive: true },
      { id: 2, name: 'تنظيف بشرة', description: 'قديم', durationMin: 45, isActive: false },
    ],
    pagination: { page: 1, limit: 20, hasNext: false },
  },
  requestId: 'list-request',
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('ServicesPage (mocked API responses, labeled)', () => {
  it('shows the empty state when the server returns no services', async () => {
    stubFetch(async () => json({ data: { items: [], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r' }));
    render(<RouterShell initialPath="/services"><ServicesPage /></RouterShell>);
    expect(await screen.findByText('لا توجد خدمات بعد')).toBeInTheDocument();
  });

  it('lists services with status chips and validates the create form before sending', async () => {
    const calls: string[] = [];
    stubFetch(async (path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if ((init?.method ?? 'GET') === 'POST') {
        return json({ data: { id: 9, name: 'صبغة', description: null, durationMin: 30, isActive: true }, requestId: 'c' }, 201);
      }
      return json(pageOne);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/services">
        <Routes><Route path="/services" element={<ServicesPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مكياج سهرة')).toBeInTheDocument();
    expect(screen.getByText('معطلة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'خدمة جديدة' }));
    await user.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(await screen.findByText('الاسم من حرفين على الأقل')).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith('POST')).length).toBe(0);
    await user.type(screen.getByLabelText('اسم الخدمة'), 'صبغة');
    await user.clear(screen.getByLabelText('المدة بالدقائق'));
    await user.type(screen.getByLabelText('المدة بالدقائق'), '30');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(calls.some((call) => call === 'POST /api/v1/admin/services')).toBe(true));
  });

  it('renders the forbidden state when the session is not an admin', async () => {
    stubFetch(async () => errorBody('FORBIDDEN', 403));
    render(<RouterShell initialPath="/services"><ServicesPage /></RouterShell>);
    expect(await screen.findByText('ليس لديك صلاحية عرض هذا المورد.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('keeps server pagination in the URL across pages', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      if (path.includes('page=2')) {
        return json({ data: { items: [], pagination: { page: 2, limit: 20, hasNext: false } }, requestId: 'p2' });
      }
      return json({ data: { ...pageOne.data, pagination: { page: 1, limit: 20, hasNext: true } }, requestId: 'p1' });
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/services">
        <Routes><Route path="/services" element={<ServicesPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مكياج سهرة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByText('لا توجد خدمات بعد')).toBeInTheDocument();
    expect(calls.some((call) => call.includes('page=2'))).toBe(true);
  });
});
