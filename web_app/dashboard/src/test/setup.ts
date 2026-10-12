import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearSession } from '../auth/session-store';

afterEach(() => {
  cleanup();
  clearSession();
  window.sessionStorage.clear();
  window.localStorage.clear();
});
