import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DASHBOARD_');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.DASHBOARD_API_TARGET || 'http://127.0.0.1:3000',
        '/health': env.DASHBOARD_API_TARGET || 'http://127.0.0.1:3000',
      },
    },
    preview: { port: 4173 },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      clearMocks: true,
    },
  };
});
