import { defineConfig } from '@playwright/test';

const MOCK_UPSTREAM_PORT = 9999;
const NEXT_PORT = 3000;
const host = '127.0.0.1';
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${NEXT_PORT}`;
const mockUpstreamUrl = `http://${host}:${MOCK_UPSTREAM_PORT}`;

const e2eEnv = {
  CONTROL_LAYER_API_BASE_URL:
    process.env.CONTROL_LAYER_API_BASE_URL ?? mockUpstreamUrl,
  CONTROL_LAYER_API_KEY: process.env.CONTROL_LAYER_API_KEY ?? 'ci-e2e-placeholder',
  CONTROL_LAYER_ORG_ID: process.env.CONTROL_LAYER_ORG_ID ?? 'e2e-org',
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? 'Decision Panel',
  /** `next start` sets NODE_ENV=production (Secure cookies); e2e uses plain HTTP. */
  DASHBOARD_COOKIE_SECURE: 'false',
};

/**
 * Default: mock upstream + `next start` (run `npm run build` first).
 * Set `E2E_BASE_URL` to target an already-running Next app.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node ./e2e/mock-upstream.mjs',
          url: `${mockUpstreamUrl}/health`,
          reuseExistingServer: false,
          env: {
            ...process.env,
            MOCK_UPSTREAM_PORT: String(MOCK_UPSTREAM_PORT),
          },
        },
        {
          command: `npm run start -- -p ${NEXT_PORT} -H ${host}`,
          url: `${baseURL}/`,
          reuseExistingServer: false,
          env: {
            ...process.env,
            ...e2eEnv,
          },
        },
      ],
});
