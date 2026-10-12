import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import type { ReactNode } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider, useI18n } from '../i18n/i18n';
import { createAppTheme } from './theme';

const rtlCache = createCache({ key: 'lamsa-rtl', stylisPlugins: [prefixer, rtlPlugin] });
const ltrCache = createCache({ key: 'lamsa-ltr', stylisPlugins: [prefixer] });
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function DirectionProviders({ children }: { children: ReactNode }) {
  const { direction } = useI18n();
  const theme = createAppTheme(direction);
  return (
    <CacheProvider value={direction === 'rtl' ? rtlCache : ltrCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <I18nProvider><DirectionProviders>{children}</DirectionProviders></I18nProvider>;
}
