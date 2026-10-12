import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { RouterShell } from '../test/harness';
import { json } from '../test/http-stub';

afterEach(() => vi.unstubAllGlobals());

const settingsBody = {
  data: {
    launchCity: { id: 7, name: 'القاهرة', code: 'EG-CAI', isActive: true },
    currency: 'EGP',
    timeZone: 'Africa/Cairo',
    paymentMode: 'demo',
    daytimeOnly: true,
    bookingPolicy: { acceptanceTimeoutMinutes: 30, paymentTimeoutMinutes: 20, commissionRate: '20.0000' },
  },
  requestId: 'r',
};
const activeCity = { id: 7, name: 'القاهرة', code: 'EG-CAI', isActive: true };

function stubFetch(handler: (path: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('Settings flow (mocked API responses, labeled)', () => {
  it('renders the read-only policy snapshot and the city list from the server', async () => {
    stubFetch(async (path) => {
      if (path === '/api/v1/admin/settings') return json(settingsBody);
      if (path === '/api/v1/admin/cities') return json({ data: [activeCity], requestId: 'r' });
      throw new Error(`unexpected GET ${path}`);
    });
    render(
      <RouterShell initialPath="/settings">
        <Routes><Route path="/settings" element={<SettingsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('لقطة السياسة الحالية')).toBeInTheDocument();
    expect(screen.getByText(/تجريبي \(Demo\)/)).toBeInTheDocument();
    expect(screen.getByText('القاهرة')).toBeInTheDocument();
    expect(screen.getByText('مفعلة')).toBeInTheDocument();
    expect(screen.getByText(/تعديل السياسة والضرائب يتم بقرار معتمد/)).toBeInTheDocument();
  });

  it('toggles a city behind confirmation and refetches without optimistic updates', async () => {
    let active = true;
    stubFetch(async (path, init) => {
      if (path === '/api/v1/admin/settings') return json(settingsBody);
      if (path === '/api/v1/admin/cities') {
        return json({ data: [{ ...activeCity, isActive: active }], requestId: 'r' });
      }
      if (path === '/api/v1/admin/cities/7' && (init?.method ?? 'GET') === 'PATCH') {
        active = JSON.parse(String(init?.body)).isActive as boolean;
        return json({ data: { ...activeCity, isActive: active }, requestId: 'f' });
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/settings">
        <Routes><Route path="/settings" element={<SettingsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('مفعلة')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعطيل' }));
    expect(await screen.findByText(/سيتوقف استقبال حجوزات جديدة/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد التعطيل' }));
    await waitFor(() => expect(screen.getByText('معطلة')).toBeInTheDocument());
  });
});
