import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { OperationsPage } from './OperationsPage';
import { OverviewPage } from './OverviewPage';
import { RouterShell } from '../test/harness';
import { json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const overviewBody = {
  data: {
    range: { from: '2026-09-12T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z', timeZone: 'Africa/Cairo' },
    bookings: [{ status: 'confirmed', count: 4 }, { status: 'cancelled', count: 1 }],
    payments: [{ status: 'paid', currency: 'EGP', total: '601.00', count: 2 }],
    payouts: [{ transferred: true, currency: 'EGP', total: '511.00', count: 1 }],
    reviews: { count: 3, average: '4.67' },
    users: [{ role: 'customer', count: 10 }],
    outbox: [{ status: 'failed', count: 1 }],
    worker: { tickAt: '2026-10-12T05:00:00.000Z', expired: 1, claimed: 2, sent: 2, retried: 0, cleaned: 0 },
  },
  requestId: 'r',
};
const failedOutbox = {
  data: {
    items: [{
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      status: 'failed',
      attempts: 3,
      nextAttemptAt: '2026-10-12T06:00:00.000Z',
      lastError: 'boom: simulated send failure',
      createdAt: '2026-10-12T04:00:00.000Z',
      userId: 'cccccccc-dddd-eeee-ffff-000000000000',
      type: 'booking.accepted',
    }],
    pagination: { page: 1, limit: 20, hasNext: false },
  },
  requestId: 'r',
};
const latePayments = {
  data: {
    items: [{
      id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      bookingId: 'dddddddd-eeee-ffff-0000-111111111111',
      amount: '300.50',
      currency: 'EGP',
      status: 'paid',
      provider: 'demo',
      providerRef: 'demo-x',
      failureReason: null,
      refundedAmount: '0.00',
      paidAt: '2026-10-12T09:05:00.000Z',
      refundedAt: null,
      createdAt: '2026-10-12T09:00:00.000Z',
      updatedAt: '2026-10-12T09:05:00.000Z',
      bookingStatus: 'cancelled',
    }],
    pagination: { page: 1, limit: 20, hasNext: false },
  },
  requestId: 'r',
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Overview and operations flow (mocked API responses, labeled)', () => {
  it('renders server-computed aggregates and worker status, never page math', async () => {
    stubFetch(async (path) => {
      if (path.startsWith('/api/v1/admin/overview')) return json(overviewBody);
      throw new Error(`unexpected GET ${path}`);
    });
    render(
      <RouterShell initialPath="/overview">
        <Routes><Route path="/overview" element={<OverviewPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('الحجوزات حسب الحالة')).toBeInTheDocument();
    expect(screen.getByText('confirmed: 4')).toBeInTheDocument();
    expect(screen.getByText(/التحصيل المعروض إجمالي محصّل/)).toBeInTheDocument();
    expect(screen.getByText(/آخر دورة ناجحة/)).toBeInTheDocument();
  });

  it('lists failed deliveries and retries through the worker queue', async () => {
    let attempts = 3;
    stubFetch(async (path, init) => {
      if (path.startsWith('/api/v1/admin/notifications/outbox/') && (init?.method ?? 'GET') === 'POST') {
        attempts = 0;
        return json({ data: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'pending' }, requestId: 'f' });
      }
      if (path.startsWith('/api/v1/admin/notifications/outbox')) {
        return json(attempts === 0
          ? { data: { items: [], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r2' }
          : failedOutbox);
      }
      if (path.startsWith('/api/v1/admin/payments/late')) return json(latePayments);
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/operations">
        <Routes><Route path="/operations" element={<OperationsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('التسليمات الفاشلة')).toBeInTheDocument();
    expect(await screen.findByText('booking.accepted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(screen.getByText('لا توجد تسليمات فاشلة')).toBeInTheDocument());
    expect(screen.getByText('المدفوعات المتأخرة')).toBeInTheDocument();
    expect(await screen.findByText('cancelled')).toBeInTheDocument();
  });
});
