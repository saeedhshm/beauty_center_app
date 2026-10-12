import { describe, expect, it } from 'vitest';
import { demoTokenHash, equalDemoToken, newDemoCallbackToken, newDemoProviderRef } from '../../src/modules/payments/payment.crypto.js';

describe('demo payment tokens', () => {
  it('issues opaque tokens verified only by hash', () => {
    const token = newDemoCallbackToken();
    expect(token).toMatch(/^dpt_/);
    const hash = demoTokenHash(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(equalDemoToken(token, hash)).toBe(true);
    expect(equalDemoToken('dpt_wrong-value-1234567890', hash)).toBe(false);
    expect(equalDemoToken(token, null)).toBe(false);
    expect(newDemoProviderRef()).toMatch(/^demo_[a-f0-9]{32}$/);
  });
});
