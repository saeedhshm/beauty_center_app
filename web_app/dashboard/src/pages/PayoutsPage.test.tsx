import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { PayoutCreatePage } from './PayoutCreatePage';
import { PayoutDetailPage } from './PayoutDetailPage';
import { PayoutsPage } from './PayoutsPage';
import { RouterShell } from '../test/harness';
import { json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const expertId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const payoutId = '44444444-5555-6666-7777-888888888888';
const eligibleRow = {
  id: 'dddddddd-eeee-ffff-0000-111111111111',
  status: 'completed',
  startsAt: '2026-10-20T10:00:00.000Z',
  endsAt: '2026-10-20T11:00:00.000Z',
  totalAmount: '300.50',
  expertEarning: '240.40',
  currency: 'EGP',
};
const recordedPayout = {
  id: payoutId,
  expertId,
  amount: '240.40',
  currency: 'EGP',
  transferRef: null,
  transferredAt: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
  bookings: [eligibleRow],
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Payouts operations flow (mocked API responses, labeled)', () => {
  it('creates a payout from eligible bookings without entering any amount', async () => {
    const calls: string[] = [];
    let created = false;
    stubFetch(async (path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path.startsWith('/api/v1/admin/payouts/eligible')) {
        return json({ data: { expertId, bookings: created ? [] : [eligibleRow] }, requestId: 'e' });
      }
      if (path === '/api/v1/admin/payouts' && (init?.method ?? 'GET') === 'POST') {
        created = true;
        const body = JSON.parse(String(init?.body ?? '{}')) as { bookingIds?: string[] };
        expect(body.bookingIds).toEqual([eligibleRow.id]);
        expect(body).not.toHaveProperty('amount');
        return json({ data: recordedPayout, requestId: 'c' }, 201);
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/payouts/new">
        <Routes><Route path="/payouts/new" element={<PayoutCreatePage />} /></Routes>
      </RouterShell>,
    );
    await user.type(screen.getByLabelText('معرف الخبيرة'), expertId);
    await user.click(screen.getByRole('button', { name: 'عرض المؤهلة' }));
    const row = await screen.findByRole('row', { name: /#ddddd/ });
    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'إنشاء التحويل بالمحدد' }));
    await waitFor(() => expect(calls.some((call) => call === 'POST /api/v1/admin/payouts')).toBe(true));
  });

  it('blocks double payout with conflict guidance and records manual transfer once', async () => {
    let transferred: string | null = null;
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/payouts/${payoutId}`) {
        return json({ data: { ...recordedPayout, transferRef: transferred, transferredAt: transferred ? '2026-10-12T10:00:00.000Z' : null }, requestId: 'r' });
      }
      if (path === `/api/v1/admin/payouts/${payoutId}/transfer`) {
        if (transferred) return json({ data: { ...recordedPayout, transferRef: transferred, transferredAt: '2026-10-12T10:00:00.000Z' }, requestId: 't2' });
        transferred = 'bank-ops-7';
        return json({ data: { ...recordedPayout, transferRef: 'bank-ops-7', transferredAt: '2026-10-12T10:00:00.000Z' }, requestId: 't' });
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/payouts/${payoutId}`}>
        <Routes><Route path="/payouts/:id" element={<PayoutDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مسجلة')).toBeInTheDocument();
    expect(screen.getByText(/ليس تحويلًا مصرفيًا آليًا/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تسجيل التحويل اليدوي' }));
    await user.type(screen.getByLabelText('المرجع التشغيلي'), 'bank-ops-7');
    await user.click(screen.getByRole('button', { name: 'تسجيل' }));
    await waitFor(() => expect(screen.getByText('محوّلة')).toBeInTheDocument());
    expect(await screen.findByText(/bank-ops-7/)).toBeInTheDocument();
  });

  it('lists payouts from the server and surfaces late-success context', async () => {
    stubFetch(async () => json({
      data: { items: [recordedPayout], pagination: { page: 1, limit: 20, hasNext: false } },
      requestId: 'r',
    }));
    render(
      <RouterShell initialPath="/payouts">
        <Routes>
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/payouts/:id" element={<PayoutDetailPage />} />
        </Routes>
      </RouterShell>,
    );
    expect(await screen.findByText(/٢٤٠٫٤٠/)).toBeInTheDocument();
    expect(screen.getByText('مسجلة')).toBeInTheDocument();
    expect(screen.queryByText(/ربح/)).not.toBeInTheDocument();
  });
});
