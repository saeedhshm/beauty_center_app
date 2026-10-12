import { expect, it } from 'vitest';
import { loginSchema, phoneSchema, registrationSchema } from '../../src/modules/auth/auth.validation.js';
import { DEMO_AUTH_SECRET, parseAuthConfig } from '../../src/modules/auth/auth.config.js';

it('normalizes Egyptian mobile numbers and preserves legacy Saudi login without allowing new Saudi registration', () => {
  expect(phoneSchema.parse(' 01000000000 ')).toBe('+201000000000');
  expect(phoneSchema.parse('+201000000000')).toBe('+201000000000');
  expect(phoneSchema.safeParse('+12025550123').success).toBe(false);
  expect(phoneSchema.safeParse('01300000000').success).toBe(false);
  expect(phoneSchema.safeParse('+966500000000').success).toBe(false);
  expect(loginSchema.parse({ phone: '0500000000', password: 'legacy-password' }).phone).toBe('+966500000000');
});

it('does not accept public admin registration or caller-supplied verification state', () => {
  const body = { phone: '01000000000', challengeId: '75727951-3f28-4a21-ad39-56c17f72d603', otp: '123456', name: 'Test', password: 'test-password-long', role: 'customer' };
  expect(registrationSchema.safeParse({ ...body, role: 'admin' }).success).toBe(false);
  expect(registrationSchema.safeParse({ ...body, phoneVerifiedAt: new Date().toISOString() }).success).toBe(false);
  expect(registrationSchema.safeParse({ ...body, password: 'short' }).success).toBe(false);
});

it('requires a private auth secret outside demo mode and reports only invalid configuration field names', () => {
  expect(() => parseAuthConfig({ AUTH_OTP_MODE: 'disabled' })).toThrow('AUTH_SECRET');
  expect(() => parseAuthConfig({ NODE_ENV: 'production' })).toThrow('AUTH_SECRET');
  expect(() => parseAuthConfig({ AUTH_SECRET: 'short-private-value' })).toThrow('Invalid auth configuration: AUTH_SECRET');
});

it('provides public demo defaults and preserves an explicit secret', () => {
  expect(parseAuthConfig({})).toMatchObject({ AUTH_OTP_MODE: 'demo', AUTH_SECRET: DEMO_AUTH_SECRET });
  expect(parseAuthConfig({ AUTH_SECRET: '' }).AUTH_SECRET).toBe(DEMO_AUTH_SECRET);
  const custom = 'test-only-custom-auth-secret-at-least-32-characters';
  expect(parseAuthConfig({ AUTH_SECRET: custom }).AUTH_SECRET).toBe(custom);
  expect(() => parseAuthConfig({ AUTH_OTP_MODE: 'unknown' })).toThrow('AUTH_OTP_MODE');
});
