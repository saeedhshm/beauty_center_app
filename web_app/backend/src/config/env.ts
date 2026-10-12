import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(3000),
  // Demo records pending deliveries without sending; disabled keeps the 503 path
  // until a real push provider adapter is approved and configured.
  PUSH_MODE: z.enum(['demo', 'disabled']).default('disabled'),
  WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(3600000).default(30000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  // Local-disk media root for the demo storage adapter. Never a public web
  // root: bytes are served only through authenticated API routes.
  STORAGE_DIR: z.string().min(1).default('./var/storage'),
  STORAGE_MAX_FILE_BYTES: z.coerce.number().int().min(1024).max(50_000_000).default(5_242_880),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): Environment {
  const result = envSchema.safeParse({
    ...input,
    PUSH_MODE: input.PUSH_MODE ?? (input.NODE_ENV === 'production' ? 'disabled' : 'demo'),
  });
  if (!result.success) {
    // Report names only: validation input and database URLs may contain secrets.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment variables: ${fields.join(', ')}`);
  }
  return result.data;
}
