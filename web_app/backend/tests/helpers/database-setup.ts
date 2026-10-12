import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext { databaseUrl: string }
}

// Only the local Compose test server. Never read DATABASE_URL or delete an existing database.
export default async function setup(project: TestProject) {
  const admin = new Pool({
    connectionString: 'postgresql://lamsa_test:lamsa_test@127.0.0.1:55433/lamsa_test',
    connectionTimeoutMillis: 3000,
  });
  const name = `lamsa_it_${randomUUID().replaceAll('-', '')}`;
  const url = `postgresql://lamsa_test:lamsa_test@127.0.0.1:55433/${name}`;
  let created = false;
  const cleanup = async () => {
    try {
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally { await admin.end(); }
  };
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const pool = new Pool({ connectionString: url });
    try {
      await migrate(drizzle(pool), {
        migrationsFolder: fileURLToPath(new URL('../../src/db/migrations/', import.meta.url)),
      });
    } finally { await pool.end(); }
    project.provide('databaseUrl', url);
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
