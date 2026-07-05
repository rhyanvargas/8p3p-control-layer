import { defineConfig } from '@playwright/test';

/** Match webServer e2eEnv default so PFEED-013/014 skip guards see CSAT enabled. */
process.env.NEXT_PUBLIC_FEEDBACK_CSAT ??= 'true';

const MOCK_UPSTREAM_PORT = 9999;
const NEXT_PORT = 3000;
const PERSONA_NEXT_PORT = 3010;
const host = '127.0.0.1';
const personaHost = 'localhost';
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${NEXT_PORT}`;
const personaBaseURL =
  process.env.E2E_PERSONA_BASE_URL ?? `http://${personaHost}:${PERSONA_NEXT_PORT}`;
const mockUpstreamUrl = `http://${host}:${MOCK_UPSTREAM_PORT}`;

/** Persona e2e passphrases — mirrored in e2e/fixtures.ts for login helpers. */
const E2E_PERSONA_EDUCATOR_CODE =
  process.env.DASHBOARD_ACCESS_CODE_EDUCATOR ?? 'e2e-educator-code';
const E2E_PERSONA_COMPLIANCE_CODE =
  process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE ?? 'e2e-compliance-code';
const E2E_PERSONA_COOKIE_SECRET =
  process.env.COOKIE_SECRET ?? 'e2e-cookie-secret-32-chars-minimum!!';

process.env.DASHBOARD_ACCESS_CODE_EDUCATOR ??= E2E_PERSONA_EDUCATOR_CODE;
process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE ??= E2E_PERSONA_COMPLIANCE_CODE;

const e2eEnv = {
  CONTROL_LAYER_API_BASE_URL:
    process.env.CONTROL_LAYER_API_BASE_URL ?? mockUpstreamUrl,
  CONTROL_LAYER_API_KEY: process.env.CONTROL_LAYER_API_KEY ?? 'ci-e2e-placeholder',
  CONTROL_LAYER_ORG_ID: process.env.CONTROL_LAYER_ORG_ID ?? 'e2e-org',
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? 'Decision Panel',
  NEXT_PUBLIC_FEEDBACK_CSAT: process.env.NEXT_PUBLIC_FEEDBACK_CSAT ?? 'true',
  NEXT_PUBLIC_CSAT_MIN_INTERVAL_DAYS: process.env.NEXT_PUBLIC_CSAT_MIN_INTERVAL_DAYS ?? '7',
  NEXT_PUBLIC_FEEDBACK_TASK_DECISION_THRESHOLD:
    process.env.NEXT_PUBLIC_FEEDBACK_TASK_DECISION_THRESHOLD ?? '5',
  /** `next start` sets NODE_ENV=production (Secure cookies); e2e uses plain HTTP. */
  DASHBOARD_COOKIE_SECURE: 'false',
  /** Override .env.local so the default e2e server keeps the gate disabled. */
  DASHBOARD_ACCESS_CODE: '',
  DASHBOARD_ACCESS_CODE_EDUCATOR: '',
  DASHBOARD_ACCESS_CODE_COMPLIANCE: '',
};

const personaE2eEnv = {
  ...e2eEnv,
  DASHBOARD_ACCESS_CODE_EDUCATOR: E2E_PERSONA_EDUCATOR_CODE,
  DASHBOARD_ACCESS_CODE_COMPLIANCE: E2E_PERSONA_COMPLIANCE_CODE,
  COOKIE_SECRET: E2E_PERSONA_COOKIE_SECRET,
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
  projects: [
    {
      name: 'default',
      testIgnore: /persona\.spec\.ts/,
    },
    {
      name: 'persona',
      testMatch: /persona\.spec\.ts/,
      use: {
        baseURL: personaBaseURL,
      },
    },
  ],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node ./e2e/mock-upstream.mjs',
          url: `${mockUpstreamUrl}/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...process.env,
            MOCK_UPSTREAM_PORT: String(MOCK_UPSTREAM_PORT),
          },
        },
        {
          command: `npm run start -- -p ${NEXT_PORT} -H ${host}`,
          url: `${baseURL}/`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...process.env,
            ...e2eEnv,
          },
        },
        {
          command: `npm run start -- -p ${PERSONA_NEXT_PORT} -H ${personaHost}`,
          url: `${personaBaseURL}/login`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...process.env,
            ...personaE2eEnv,
          },
        },
      ],
});
