import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../auth/auth-context';
import { DashboardShell } from '../layout/DashboardShell';
import { OverviewPage } from './OverviewPage';
import { json } from '../test/http-stub';
import { I18nProvider } from '../i18n/i18n';

afterEach(() => vi.unstubAllGlobals());

// D6 accessibility: the shell exposes a skip link, named navigation, and a main
// landmark; content headings are never empty so screen readers can navigate.
describe('Dashboard landmarks (mocked API responses, labeled)', () => {
  it('exposes skip link, navigation landmark, and a labeled main region', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      data: {
        range: { from: '2026-09-12T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z', timeZone: 'Africa/Cairo' },
        bookings: [], payments: [], payouts: [],
        reviews: { count: 0, average: null }, users: [], outbox: [], worker: null,
      },
      requestId: 'r',
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale="ar">
        <AuthContext value={{
          status: 'authenticated',
          user: { id: 'admin', name: 'مديرة الاختبار', phone: '+201000000000', role: 'admin', phoneVerified: true },
          login: async () => {},
          logout: async () => {},
        }}>
          <MemoryRouter initialEntries={['/overview']}>
            <Routes>
              <Route element={<DashboardShell />}>
                <Route path="/overview" element={<OverviewPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext>,
        </I18nProvider>
      </QueryClientProvider>,
    );
    const skip = screen.getByRole('link', { name: 'تخطَّ إلى المحتوى الرئيسي' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(await within(main).findByText('الملخص التشغيلي')).toBeInTheDocument();
    for (const heading of within(main).getAllByRole('heading')) {
      expect(heading.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});
