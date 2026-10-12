import { expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

it('rejects missing database configuration and invalid ports without leaking values', () => {
  expect(() => parseEnv({})).toThrow('DATABASE_URL');
  expect(() => parseEnv({ DATABASE_URL: 'secret-password', PORT: '99999' })).toThrow('PORT');
  try { parseEnv({ DATABASE_URL: 'secret-password' }); } catch (error) {
    expect(String(error)).not.toContain('secret-password');
  }
});

it('accepts PostgreSQL configuration and applies bounded defaults', () => {
  const env = parseEnv({ DATABASE_URL: 'postgresql://local:local@localhost/test' });
  expect(env.PORT).toBe(3000);
  expect(env.DB_TIMEOUT_MS).toBe(3000);
  expect(() => parseEnv({ DATABASE_URL: 'https://example.com' })).toThrow('DATABASE_URL');
});
