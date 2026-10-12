const MONEY_PATTERN = /^\d{1,8}(?:\.\d{1,2})?$/;
const RATE_PATTERN = /^\d{1,3}(?:\.\d{1,4})?$/;

/** Parse a "300.50" money string into integer minor units (cents). */
export function moneyToCents(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new Error('Invalid money value');
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function centsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

/** Parse a "20.0000" percent rate into units of 1/10000 of a percent. */
export function rateToUnits(value: string): bigint {
  if (!RATE_PATTERN.test(value)) throw new Error('Invalid rate value');
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

/**
 * Split a price into platform commission and expert earning using integer
 * arithmetic with half-up rounding. VAT stays outside this split until the
 * tax model is approved; callers persist vatRate/vatAmount as zero snapshots.
 */
export function splitCommission(price: string, commissionRate: string) {
  const priceCents = moneyToCents(price);
  const rateUnits = rateToUnits(commissionRate);
  const commissionCents = (priceCents * rateUnits + 500000n) / 1000000n;
  return {
    commissionAmount: centsToMoney(commissionCents),
    expertEarning: centsToMoney(priceCents - commissionCents),
  };
}
