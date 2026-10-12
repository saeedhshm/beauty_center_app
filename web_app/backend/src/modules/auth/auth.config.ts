import { z } from 'zod';

// Public demo fixture, not a private credential. Used only when demo mode is selected.
export const DEMO_AUTH_SECRET = 'lamsa-demo-only-auth-secret-not-for-real-users';

const schema = z.object({
  AUTH_OTP_MODE: z.enum(['demo', 'disabled']),
  AUTH_SECRET: z.string().min(32),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(3600).max(7776000).default(2592000),
  AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(300),
});

export type AuthConfig = z.infer<typeof schema>;
export function parseAuthConfig(input: NodeJS.ProcessEnv): AuthConfig {
  const mode = input.AUTH_OTP_MODE ?? (input.NODE_ENV === 'production' ? 'disabled' : 'demo');
  const secret = mode === 'demo' && !input.AUTH_SECRET ? DEMO_AUTH_SECRET : input.AUTH_SECRET;
  const result = schema.safeParse({ ...input, AUTH_OTP_MODE: mode, AUTH_SECRET: secret });
  if (!result.success) {
    throw new Error(`Invalid auth configuration: ${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}`);
  }
  return result.data;
}
