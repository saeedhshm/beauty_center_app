import { parseEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { seedDemo } from './seeds/demo.js';

const env = parseEnv(process.env);
const target = new URL(env.DATABASE_URL);
if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55432' || target.pathname !== '/lamsa_dev') {
  throw new Error('Demo seeds target only the local Compose lamsa_dev database on port 55432.');
}
const database = createDatabase(env, () => {});
try {
  const result = await seedDemo(database.db);
  console.log('Local demo fixtures ready:', result);
} finally { await database.close(); }
