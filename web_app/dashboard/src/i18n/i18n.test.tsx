import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Typography, useTheme } from '@mui/material';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../app/AppProviders';
import { formatDateTime, formatMoney } from '../fmt/format';
import { hasEnglishTranslation, LOCALE_STORAGE_KEY, useI18n } from './i18n';

const interfaceSources = import.meta.glob('../{app,auth,components,layout,pages}/**/*.tsx', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

function Probe() {
  const { direction, locale, setLocale, t } = useI18n();
  const theme = useTheme();
  return (
    <div>
      <Typography>{t('الحجوزات')}</Typography>
      <Typography data-testid="state">{locale}|{direction}|{theme.direction}</Typography>
      <Typography data-testid="money">{formatMoney('300.50', 'EGP')}</Typography>
      <Typography data-testid="date">{formatDateTime('2026-10-12T10:00:00.000Z')}</Typography>
      <Button onClick={() => setLocale('en')}>English</Button>
    </div>
  );
}

describe('Dashboard locale', () => {
  it('has English entries for every static interface message passed to the translator', () => {
    const missing = Object.entries(interfaceSources).flatMap(([path, source]) =>
      [...source.matchAll(/\bt\('([^']+)'/g)]
        .map((match) => match[1]?.replace(/\\n/g, '\n'))
        .filter((message): message is string => message !== undefined)
        .filter((message) => !hasEnglishTranslation(message))
        .map((message) => `${path}: ${message}`));
    expect(missing).toEqual([]);
  });

  it('defaults to Arabic and switches the full direction, theme, labels, and formatting', async () => {
    const user = userEvent.setup();
    render(<AppProviders><Probe /></AppProviders>);

    expect(screen.getByText('الحجوزات')).toBeInTheDocument();
    expect(screen.getByTestId('state')).toHaveTextContent('ar|rtl|rtl');
    expect(screen.getByTestId('money')).toHaveTextContent('٣٠٠');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('Bookings')).toBeInTheDocument();
    expect(screen.getByTestId('state')).toHaveTextContent('en|ltr|ltr');
    expect(screen.getByTestId('money')).toHaveTextContent('EGP');
    expect(screen.getByTestId('money')).toHaveTextContent('300.50');
    expect(screen.getByTestId('date')).toHaveTextContent(/12 Oct 2026/);
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('restores the browser-local choice on a new provider mount', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(<AppProviders><Probe /></AppProviders>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('en|ltr|ltr'));
    expect(screen.getByText('Bookings')).toBeInTheDocument();
  });
});
