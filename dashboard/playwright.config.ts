import { defineConfig } from '@playwright/test';

const previewPort = 4173;
const usePreview = !process.env.E2E_BASE_URL;

/**
 * Default: `vite preview` serves the built SPA so panel chrome tests run without the API.
 * Set `E2E_BASE_URL` (e.g. http://localhost:3000) to hit the Fastify server for API-backed tests.
 */
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${previewPort}`,
  },
  webServer: usePreview
    ? {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: `http://127.0.0.1:${previewPort}/dashboard/`,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
