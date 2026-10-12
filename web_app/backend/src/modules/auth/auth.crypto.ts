import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$3'
    || !/^[a-f0-9]{32}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) return false;
  const actual = await derive(password, parts[4]!);
  return timingSafeEqual(actual, Buffer.from(parts[5]!, 'hex'));
}

let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  dummyHash ??= hashPassword('dummy-only-never-a-user-credential');
  return dummyHash;
}

export const newAccessToken = () => `la_${randomBytes(32).toString('base64url')}`;
export const newRefreshToken = () => `lr_${randomBytes(32).toString('base64url')}`;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const secretHash = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
export const otpHash = (secret: string, id: string, phone: string, code: string) => secretHash(secret, `otp:${id}:${phone}:${code}`);
export const equalHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
