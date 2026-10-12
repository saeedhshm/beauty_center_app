import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { RouterShell } from '../test/harness';
import { json } from '../test/http-stub';
import { LOCALE_STORAGE_KEY } from '../i18n/i18n';

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
    expect(screen.getByText(/تُحفظ مهلة القبول والعمولة كلقطتين عند إنشاء الحجز/)).toBeInTheDocument();
    expect(screen.getByText(/مهلة الدفع الحالية هي التي تبدأ عندما يُقبل حجز pending/)).toBeInTheDocument();
  });

    it('edits timeouts and commission behind confirmation and refetches the snapshot', async () => {
    let policy = settingsBody.data.bookingPolicy;
    stubFetch(async (path, init) => {
      if (path === '/api/v1/admin/settings' && (init?.method ?? 'GET') === 'GET') {
        return json({ data: { ...settingsBody.data, bookingPolicy: policy }, requestId: 'r' });
      }
      if (path === '/api/v1/admin/settings' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { acceptanceTimeoutMinutes: number; paymentTimeoutMinutes: number; commissionRate: string };
        policy = { ...body };
        return json({ data: policy, requestId: 'f' });
      }
      if (path === '/api/v1/admin/cities') return json({ data: [activeCity], requestId: 'r' });
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/settings">
        <Routes><Route path="/settings" element={<SettingsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('لقطة السياسة الحالية')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعديل المهل والعمولة' }));
    const acceptance = screen.getByLabelText('مهلة القبول (دقيقة)');
    await user.clear(acceptance);
    await user.type(acceptance, '45');
    await user.click(screen.getByRole('button', { name: 'مراجعة وحفظ' }));
    expect(await screen.findByText(/ستُحفظ مهلة القبول 45 دقيقة/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد الحفظ' }));
    await waitFor(() => expect(screen.getByText(/45 دقيقة/)).toBeInTheDocument());
  });

  it('blocks out-of-range policy values before sending anything', async () => {
    let patches = 0;
    stubFetch(async (path, init) => {
      if (path === '/api/v1/admin/settings') return json(settingsBody);
      if (path === '/api/v1/admin/cities') return json({ data: [activeCity], requestId: 'r' });
      if (init?.method === 'PATCH') patches += 1;
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(
      <RouterShell initialPath="/settings">
        <Routes><Route path="/settings" element={<SettingsPage />} /></Routes>
      </RouterShell>,
    );
    expect(await screen.findByText('لقطة السياسة الحالية')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعديل المهل والعمولة' }));
    const commission = screen.getByLabelText('العمولة (%)');
    await user.clear(commission);
    await user.type(commission, '150');
    await user.click(screen.getByRole('button', { name: 'مراجعة وحفظ' }));
    expect(await screen.findByText('نسبة بين 0 و100 بأربع منازل عشرية كحد أقصى.')).toBeInTheDocument();
    expect(patches).toBe(0);
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
    expect(await screen.findByText(/سيتوقف الاستخدام الجديد لمدينة القاهرة/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(screen.getByText('معطلة')).toBeInTheDocument());
  });

  it('creates a city and preserves the no-delete historical guidance', async () => {
    let cities = [activeCity];
    let posted: unknown;
    stubFetch(async (path, init) => {
      if (path === '/api/v1/admin/settings') return json(settingsBody);
      if (path === '/api/v1/admin/cities' && (init?.method ?? 'GET') === 'GET') return json({ data: cities, requestId: 'r' });
      if (path === '/api/v1/admin/cities' && init?.method === 'POST') {
        posted = JSON.parse(String(init.body));
        cities = [...cities, { id: 8, name: 'الجيزة', code: 'EG-GIZ', isActive: true }];
        return json({ data: cities[1], requestId: 'c' }, 201);
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(<RouterShell initialPath="/settings"><Routes><Route path="/settings" element={<SettingsPage />} /></Routes></RouterShell>);
    await user.click(await screen.findByRole('button', { name: 'مدينة جديدة' }));
    await user.type(screen.getByLabelText('اسم المدينة'), 'الجيزة');
    await user.type(screen.getByLabelText('رمز المدينة'), 'eg-giz');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));
    expect(await screen.findByText('الجيزة')).toBeInTheDocument();
    expect(posted).toEqual({ name: 'الجيزة', code: 'EG-GIZ' });
    expect(screen.getByText(/لا يوجد حذف للمدن/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /حذف/ })).not.toBeInTheDocument();
  });

  it('changes market currency only after the FX and repricing warning is confirmed', async () => {
    let currency = 'EGP';
    let patch: unknown;
    stubFetch(async (path, init) => {
      if (path === '/api/v1/admin/settings' && (init?.method ?? 'GET') === 'GET') {
        return json({ data: { ...settingsBody.data, currency }, requestId: 'r' });
      }
      if (path === '/api/v1/admin/settings/currency' && init?.method === 'PATCH') {
        patch = JSON.parse(String(init.body));
        currency = (patch as { currency: string }).currency;
        return json({ data: { currency }, requestId: 'u' });
      }
      if (path === '/api/v1/admin/cities') return json({ data: [activeCity], requestId: 'r' });
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    const user = userEvent.setup();
    render(<RouterShell initialPath="/settings"><Routes><Route path="/settings" element={<SettingsPage />} /></Routes></RouterShell>);
    const selector = await screen.findByRole('combobox', { name: 'العملة' });
    await user.click(selector);
    await user.click(screen.getByRole('option', { name: 'SAR' }));
    await user.click(screen.getByRole('button', { name: 'تغيير عملة السوق' }));
    expect(screen.getByText(/لا ينفذ أي تحويل عملات \(FX\)/)).toBeInTheDocument();
    expect(screen.getByText(/عروض الخبيرات بالعملة القديمة غير متاحة/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد تغيير العملة' }));
    await waitFor(() => expect(patch).toEqual({ currency: 'SAR' }));
  });

  it('switches the real settings interface and restores the browser-local language', async () => {
    stubFetch(async (path) => {
      if (path === '/api/v1/admin/settings') return json(settingsBody);
      if (path === '/api/v1/admin/cities') return json({ data: [activeCity], requestId: 'r' });
      throw new Error(`unexpected GET ${path}`);
    });
    const user = userEvent.setup();
    const view = render(<RouterShell initialPath="/settings"><Routes><Route path="/settings" element={<SettingsPage />} /></Routes></RouterShell>);
    await user.click(await screen.findByRole('combobox', { name: 'اللغة' }));
    await user.click(screen.getByRole('option', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Current policy snapshot' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cities' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');

    view.unmount();
    render(<RouterShell initialPath="/settings"><Routes><Route path="/settings" element={<SettingsPage />} /></Routes></RouterShell>);
    expect(await screen.findByRole('heading', { name: 'Current policy snapshot' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('English');
  });
});
