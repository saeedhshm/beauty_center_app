import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { AuditPage } from './AuditPage';
import { ReviewsPage } from './ReviewsPage';
import { RouterShell } from '../test/harness';
import { json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

const reviewRow = {
  id: 'cccccccc-dddd-eeee-ffff-000000000000',
  bookingId: 'dddddddd-eeee-ffff-0000-111111111111',
  reviewerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  revieweeId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  rating: 5,
  comment: 'خدمة ممتازة',
  serviceName: 'مكياج',
  reviewerName: 'عميلة الاختبار',
  revieweeName: 'خبيرة الاختبار',
  createdAt: '2026-10-12T09:00:00.000Z',
};

describe('Reviews read-only flow (mocked API responses, labeled)', () => {
  it('filters by rating on the server and links each review to its booking', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return json({ data: { items: [reviewRow], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r' });
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/reviews">
        <Routes><Route path="/reviews" element={<ReviewsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('خدمة ممتازة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الحجز' }).getAttribute('href')).toBe(`/bookings/${reviewRow.bookingId}`);
    await user.click(screen.getByLabelText('الدرجة'));
    const options = await screen.findAllByRole('option');
    const fiveStar = options.find((option) => option.textContent === '5 نجوم');
    expect(fiveStar).toBeDefined();
    await user.click(fiveStar!);
    await screen.findByText('خدمة ممتازة');
    expect(calls.some((call) => call.includes('rating=5'))).toBe(true);
  });

  it('shows the empty state when no reviews match', async () => {
    stubFetch(async () => json({ data: { items: [], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r' }));
    render(
      <RouterShell initialPath="/reviews?rating=1">
        <Routes><Route path="/reviews" element={<ReviewsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('لا توجد تقييمات بهذه الفلاتر')).toBeInTheDocument();
  });
});

const auditRow = {
  id: 'eeeeeeee-ffff-0000-1111-222222222222',
  actorId: 'ffffffff-0000-1111-2222-333333333333',
  action: 'payment.refunded',
  resourceType: 'payment',
  resourceId: '99999999-0000-1111-2222-333333333333',
  details: { amount: '300.50' },
  createdAt: '2026-10-12T09:00:00.000Z',
};

const bookingAuditRow = {
  ...auditRow,
  id: 'aaaaaaaa-0000-1111-2222-333333333333',
  action: 'booking.cancelled',
  resourceType: 'booking',
  resourceId: 'dddddddd-eeee-ffff-0000-111111111111',
};

describe('Audit log flow (mocked API responses, labeled)', () => {
  it('filters server-side and links known resources without leaking details shape', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return json({ data: { items: [auditRow, bookingAuditRow], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r' });
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/audit">
        <Routes><Route path="/audit" element={<AuditPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('payment.refunded')).toBeInTheDocument();
    expect(screen.getByText('booking.cancelled')).toBeInTheDocument();
    // Unknown resource kinds render an id, never a guessed link.
    expect(screen.getAllByRole('link', { name: 'فتح المورد' })).toHaveLength(1);
    await user.click(screen.getByLabelText('نوع المورد'));
    const options = await screen.findAllByRole('option');
    const bookingOption = options.find((option) => option.textContent === 'booking');
    expect(bookingOption).toBeDefined();
    await user.click(bookingOption!);
    await screen.findByText('payment.refunded');
    expect(calls.some((call) => call.includes('resourceType=booking'))).toBe(true);
  });

  it('shows the empty state for unmatched filters', async () => {
    stubFetch(async () => json({ data: { items: [], pagination: { page: 1, limit: 20, hasNext: false } }, requestId: 'r' }));
    render(
      <RouterShell initialPath="/audit?action=no.such.action">
        <Routes><Route path="/audit" element={<AuditPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('لا توجد سجلات بهذه الفلاتر')).toBeInTheDocument();
  });
});
