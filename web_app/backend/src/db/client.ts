import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import type { Environment } from '../config/env.js';

export function createDatabase(env: Environment, onIdleError: () => void) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_TIMEOUT_MS,
    query_timeout: env.DB_TIMEOUT_MS,
    statement_timeout: env.DB_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    application_name: 'lamsa-api',
  });
  pool.on('error', onIdleError);
  const db = drizzle(pool);

  return {
    db,
    async check() { await db.execute(sql`select 1`); },
    async close() { await pool.end(); },
  };
}
