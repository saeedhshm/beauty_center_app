import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Opaque demo callback token, revealed once at initiation like a session token. */
export const newDemoCallbackToken = () => `dpt_${randomBytes(32).toString('base64url')}`;
export const demoTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function equalDemoToken(presented: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const candidate = demoTokenHash(presented);
  return candidate.length === storedHash.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
}

export const newDemoProviderRef = () => `demo_${randomBytes(16).toString('hex')}`;
