import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/helpers/database-setup.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
    // One shared database per run (see tests/helpers/database-setup.ts): files must not
    // mutate shared rows such as the launch city or booking policy while another file reads them.
    maxWorkers: 1,
  },
});
