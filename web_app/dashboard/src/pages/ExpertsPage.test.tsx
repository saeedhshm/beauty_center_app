import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { ExpertDetailPage } from './ExpertDetailPage';
import { ExpertsPage } from './ExpertsPage';
import { RouterShell } from '../test/harness';
import { errorBody, json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const expertId = '11111111-2222-3333-4444-555555555555';
const pendingExpert = {
  id: expertId,
  name: 'خبيرة الاختبار',
  cityId: 1,
  cityName: 'القاهرة',
  bio: 'نبذة',
  ratingAvg: '4.50',
  ratingCount: 2,
  phone: '+201000000001',
  isActive: true,
  approvalStatus: 'pending',
  isAcceptingBookings: false,
  services: [{ serviceId: 3, name: 'مكياج', price: '300.50', currency: 'EGP', isActive: true, durationMin: 60 }],
  portfolio: [],
  identityDocument: { present: true },
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Experts review flow (mocked API responses, labeled)', () => {
  it('filters by approval status from the server and opens the review file', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return json({
        data: { items: [pendingExpert], pagination: { page: 1, limit: 20, hasNext: false } },
        requestId: 'r',
      });
    });
    render(
      <RouterShell initialPath="/experts?status=pending">
        <Routes>
          <Route path="/experts" element={<ExpertsPage />} />
          <Route path="/experts/:id" element={<ExpertDetailPage />} />
        </Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('خبيرة الاختبار')).toBeInTheDocument();
    expect(calls.some((call) => call.includes('approvalStatus=pending'))).toBe(true);
    expect(screen.getByText('+201000000001')).toBeInTheDocument();
  });

  it('approves a pending expert behind confirmation and refetches the file', async () => {
    let approved = false;
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/experts/${expertId}`) {
        return json({
          data: { ...pendingExpert, approvalStatus: approved ? 'approved' : 'pending' },
          requestId: 'r',
        });
      }
      if (path === `/api/v1/admin/experts/${expertId}/approve`) {
        approved = true;
        return json({ data: {}, requestId: 'a' });
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/experts/${expertId}`}>
        <Routes><Route path="/experts/:id" element={<ExpertDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('بانتظار الاعتماد')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'اعتماد' }));
    expect(await screen.findByText(/سيؤدي الاعتماد إلى إظهار الخبيرة/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(screen.getByText('معتمدة')).toBeInTheDocument());
  });

  it('shows conflict guidance when the expert changed before suspending', async () => {
    stubFetch(async (path, init) => {
      if ((init?.method ?? 'GET') === 'POST') return errorBody('INVALID_TRANSITION', 409);
      return json({ data: pendingExpert, requestId: 'r' });
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/experts/${expertId}`}>
        <Routes><Route path="/experts/:id" element={<ExpertDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('بانتظار الاعتماد')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعليق' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(await screen.findByText(/تغيرت الحالة قبل تنفيذ الأمر/)).toBeInTheDocument();
  });
});
