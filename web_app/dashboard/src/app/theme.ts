import { createTheme } from '@mui/material/styles';
import type { Direction } from '../i18n/i18n';

export function createAppTheme(direction: Direction) {
  return createTheme({
  direction,
  palette: {
    mode: 'light',
    primary: { main: '#7b315f', dark: '#53203f', light: '#b86592', contrastText: '#fffaf6' },
    secondary: { main: '#d58a52', dark: '#9f6035', light: '#efbd91' },
    background: { default: '#f6f1eb', paper: '#fffaf6' },
    text: { primary: '#241d2d', secondary: '#726777' },
    divider: 'rgba(83, 32, 63, 0.13)',
    error: { main: '#b43b4b' },
    success: { main: '#28735a' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Tahoma, Arial, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.035em' },
    h2: { fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontWeight: 750 },
    button: { fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, borderRadius: 12, textTransform: 'none' } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true },
    },
  },
  });
}
