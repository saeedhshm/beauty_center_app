import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { parseEnv } from './src/config/env.js';

const env = parseEnv(process.env);
if (env.NODE_ENV === 'production') {
  throw new Error('Production migrations require a separately reviewed deployment configuration.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
});
