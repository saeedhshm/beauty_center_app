import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { BookingDetailPage } from './BookingDetailPage';
import { BookingsPage } from './BookingsPage';
import { RouterShell } from '../test/harness';
import { errorBody, json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const bookingId = '22222222-3333-4444-5555-666666666666';
const acceptedBooking = {
  id: bookingId,
  customerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  expertId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  serviceId: 3,
  status: 'accepted',
  startsAt: '2026-10-20T10:00:00.000Z',
  endsAt: '2026-10-20T11:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: '2026-10-12T10:10:00.000Z',
  addressText: 'القاهرة، مدينة نصر',
  cityId: 1,
  lat: null,
  lng: null,
  price: '300.50',
  commissionRate: '20.0000',
  commissionAmount: '60.10',
  expertEarning: '240.40',
  vatRate: '0.0000',
  vatAmount: '0.00',
  totalAmount: '300.50',
  currency: 'EGP',
  notes: null,
  cancelledBy: null,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
  statusHistory: [
    { id: 'h1', status: 'pending', changedBy: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', createdAt: '2026-10-12T09:00:00.000Z' },
    { id: 'h2', status: 'accepted', changedBy: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', createdAt: '2026-10-12T09:05:00.000Z' },
  ],
};

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Bookings operations flow (mocked API responses, labeled)', () => {
  it('lists bookings with server snapshots and opens the detail file', async () => {
    stubFetch(async () => json({
      data: { items: [acceptedBooking], pagination: { page: 1, limit: 20, hasNext: false } },
      requestId: 'r',
    }));
    render(
      <RouterShell initialPath="/bookings?status=accepted">
        <Routes>
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
        </Routes>
      </RouterShell>,
    );
    expect(await screen.findByText(/٣٠٠٫٥٠/)).toBeInTheDocument();
    expect(screen.getAllByText('مقبول بانتظار الدفع').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/لقطات تاريخية من الخادم/)).toBeInTheDocument();
  });

  it('cancels an accepted booking behind confirmation and refetches the file', async () => {
    let status: string = 'accepted';
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/bookings/${bookingId}`) {
        return json({
          data: status === 'cancelled'
            ? { ...acceptedBooking, status, cancellationReason: 'اختبار', cancelledAt: '2026-10-12T09:10:00.000Z' }
            : { ...acceptedBooking, status },
          requestId: 'r',
        });
      }
      if (path === `/api/v1/admin/bookings/${bookingId}/cancel`) {
        status = 'cancelled';
        return json({
          data: { ...acceptedBooking, status: 'cancelled', cancellationReason: 'اختبار', cancelledAt: '2026-10-12T09:10:00.000Z' },
          requestId: 'c',
        });
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/bookings/${bookingId}`}>
        <Routes><Route path="/bookings/:id" element={<BookingDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect((await screen.findAllByText('مقبول بانتظار الدفع')).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: 'إلغاء الحجز' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    await waitFor(() => expect(screen.getByText('ملغي')).toBeInTheDocument());
    expect(screen.getByText(/اختبار/)).toBeInTheDocument();
  });

  it('shows conflict guidance and refetches when cancel races a state change', async () => {
    let status = 'accepted';
    stubFetch(async (path, init) => {
      if (path === `/api/v1/admin/bookings/${bookingId}`) {
        return json({
          data: status === 'cancelled'
            ? { ...acceptedBooking, status, cancellationReason: 'اختبار', cancelledAt: '2026-10-12T09:10:00.000Z' }
            : { ...acceptedBooking, status },
          requestId: 'r',
        });
      }
      if ((init?.method ?? 'GET') === 'POST') {
        status = 'cancelled';
        return errorBody('INVALID_TRANSITION', 409);
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath={`/bookings/${bookingId}`}>
        <Routes><Route path="/bookings/:id" element={<BookingDetailPage />} /></Routes>
      </RouterShell>,
    );
    expect((await screen.findAllByText('مقبول بانتظار الدفع')).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: 'إلغاء الحجز' }));
    await user.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    expect(await screen.findByText(/تغيرت الحالة قبل تنفيذ الأمر/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('ملغي')).toBeInTheDocument());
  });
});
