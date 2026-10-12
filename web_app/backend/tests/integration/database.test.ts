import request from 'supertest';
import { afterAll, expect, inject, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/client.js';
import { createLogger } from '../../src/shared/logger.js';

// Fresh database migrated by global setup on the isolated local Compose test server.
const env = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: inject('databaseUrl'),
});
const database = createDatabase(env, () => {});
afterAll(() => database.close());

it('serves readiness using a real PostgreSQL query through Drizzle', async () => {
  const app = createApp({ checkDatabase: database.check, logger: createLogger('silent') });
  const response = await request(app).get('/health/ready');
  expect(response.status).toBe(200);
  expect(response.body.data.status).toBe('ready');
});
