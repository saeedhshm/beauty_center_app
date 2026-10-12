import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { PaymentDetailPage } from './PaymentDetailPage';
import { PaymentsPage } from './PaymentsPage';
import { RouterShell } from '../test/harness';
import { errorBody, json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const paymentId = '33333333-4444-5555-6666-777777777777';
const bookingId = 'dddddddd-eeee-ffff-0000-111111111111';
const pendingPayment = {
  id: paymentId,
  bookingId,
  amount: '300.50',
  currency: 'EGP',
  status: 'pending',
  provider: 'demo',
  providerRef: 'demo-abc123',
  failureReason: null,
  refundedAmount: '0.00',
  paidAt: null,
  refundedAt: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
};
const paidDetail = {
  ...pendingPayment,
  status: 'paid',
  paidAt: '2026-10-12T09:05:00.000Z',
  booking: {
    id: bookingId,
    customerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    expertId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    status: 'confirmed',
    startsAt: '2026-10-20T10:00:00.000Z',
    endsAt: '2026-10-20T11:00:00.000Z',
    totalAmount: '300.50',
    currency: 'EGP',
    expiresAt: null,
    payoutId: null,
  },
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Payments operations flow (mocked API responses, labeled)', () => {
  it('lists payments with Demo labeling and server snapshots only', async () => {
    stubFetch(async () => json({
      data: { items: [pendingPayment], pagination: { page: 1, limit: 20, hasNext: false } },
      requestId: 'r',
    }));
    render(
      <RouterShell initialPath="/payments">
        <Routes>
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/payments/:id" element={<PaymentDetailPage />} />
        </Routes>
      </RouterShell>,
    );
    expect(await screen.findByText(/وضع Demo للمحاكاة فقط/)).toBeInTheDocument();
    expect(await screen.findByText(/٣٠٠٫٥٠/)).toBeInTheDocument();
    expect(screen.getByText('بانتظار الدفع')).toBeInTheDocument();
  });

  it('refunds a paid payment behind confirmation and never claims success early', async () => {
    let status = 'paid';
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/payments/${paymentId}`) {
        return json({ data: status === 'paid' ? paidDetail : { ...paidDetail, status: 'refunded', refundedAmount: '300.50', refundedAt: '2026-10-12T09:10:00.000Z' }, requestId: 'r' });
      }
      if (path === `/api/v1/admin/payments/${paymentId}/refund`) {
        status = 'refunded';
        return json({ data: { ...paidDetail, status: 'refunded', refundedAmount: '300.50', refundedAt: '2026-10-12T09:10:00.000Z' }, requestId: 'f' });
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/payments/${paymentId}`}>
        <Routes><Route path="/payments/:id" element={<PaymentDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مدفوعة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'استرجاع كامل' }));
    expect(await screen.findByText(/سيُسجل الاسترجاع بعد تأكيد الخادم فقط/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد الاسترجاع' }));
    await waitFor(() => expect(screen.getByText('مستردة')).toBeInTheDocument());
  });

    it('shows conflict guidance when refund races a linked payout', async () => {

    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/payments/${paymentId}`) {
        return json({ data: paidDetail, requestId: 'r' });
      }
      if ((init?.method ?? 'GET') === 'POST') return errorBody('BOOKING_IN_PAYOUT', 409);
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/payments/${paymentId}`}>
        <Routes><Route path="/payments/:id" element={<PaymentDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مدفوعة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'استرجاع كامل' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد الاسترجاع' }));
    expect(await screen.findByText(/مربوط بتحويل مسجل/)).toBeInTheDocument();
    expect(screen.getByText('مدفوعة')).toBeInTheDocument();
  });

  it('never claims success when the network fails during refund confirmation', async () => {
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/payments/${paymentId}`) {
        return json({ data: paidDetail, requestId: 'r' });
      }
      if ((init?.method ?? 'GET') === 'POST') throw new TypeError('network down');
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/payments/${paymentId}`}>
        <Routes><Route path="/payments/:id" element={<PaymentDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مدفوعة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'استرجاع كامل' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد الاسترجاع' }));
    expect(await screen.findByText(/تعذر|فشل|خطأ/)).toBeInTheDocument();
    expect(screen.getByText('مدفوعة')).toBeInTheDocument();
    expect(screen.queryByText('مستردة')).not.toBeInTheDocument();
  });
});
