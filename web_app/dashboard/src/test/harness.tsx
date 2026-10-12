import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider, type Locale } from '../i18n/i18n';

export function RouterShell({ children, initialPath, locale }: { children: ReactNode; initialPath: string; locale?: Locale }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <I18nProvider {...(locale ? { initialLocale: locale } : {})}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
