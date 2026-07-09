/**
 * Walk the signal upload wizard and screenshot every step.
 * Usage: PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-upload-wizard.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../screenshots/feature-tour');
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const ACCESS_CODE = process.env.DASHBOARD_ACCESS_CODE ?? 'dev-local';

const HIDE_OVERLAYS = `
  (() => {
    const style = document.getElementById('hide-dev-overlays') || document.createElement('style');
    style.id = 'hide-dev-overlays';
    style.textContent = \`
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dev-overlay],
      button[aria-label="Open Next.js Dev Tools"],
      button[aria-label="Close Next.js Dev Tools"],
      button[aria-label="Open issues overlay"],
      button[aria-label="Collapse issues badge"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    \`;
    if (!style.parentNode) document.head.appendChild(style);
  })();
`;

async function expectEnabled(locator) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await locator.page().waitForTimeout(200);
  }
  throw new Error('Timed out waiting for control to become enabled');
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const skeletons = page.locator('[data-slot="skeleton"]');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await skeletons.count()) === 0) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  await page.evaluate(HIDE_OVERLAYS);
}

async function shot(page, name) {
  await settle(page);
  const issue = page.locator('button[aria-label*="Open issues"]');
  if ((await issue.count()) > 0 && (await issue.first().isVisible().catch(() => false))) {
    throw new Error(`Runtime issue badge visible on ${name}`);
  }
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('wrote', name);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Access Code').fill(ACCESS_CODE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const signalId = `tour-shot-${Date.now()}`;
  const fixturePath = path.join(tmpdir(), `${signalId}.json`);
  await writeFile(
    fixturePath,
    JSON.stringify(
      [
        {
          signal_id: signalId,
          source_system: 'lms-demo',
          learner_reference: 'stu-10042',
          timestamp: new Date().toISOString(),
          schema_version: 'v1',
          masteryScore: 0.82,
          skill_id: 'MATH-301',
        },
      ],
      null,
      2
    ),
    'utf8'
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await login(page);

    // Step 1 — Upload (empty)
    await page.goto(`${BASE}/signals/upload`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Upload signals', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText('Step 1 of 5: Upload').waitFor({ timeout: 15_000 });
    await shot(page, '10a-upload-step-1-upload.png');

    // Upload file → auto-advances to Map
    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await page.getByText('Step 2 of 5: Map').waitFor({ timeout: 15_000 });
    await page.getByLabel('Default source system').fill('lms-demo');
    await shot(page, '10b-upload-step-2-map.png');

    // Step 3 — Validate
    await page.getByRole('button', { name: 'Next: Validate' }).click();
    await page.getByText('Step 3 of 5: Validate').waitFor({ timeout: 15_000 });
    await page.getByText(/Accepted|1 valid|valid row/i).first().waitFor({ timeout: 30_000 });
    // Wait until dry-run/preflight finishes and Next is enabled.
    await page.getByText(/Running dry-run|Running preflight|Validating/i).first().waitFor({ state: 'hidden', timeout: 45_000 }).catch(() => {});
    await page.getByRole('button', { name: 'Next: Review' }).waitFor({ state: 'visible', timeout: 45_000 });
    await expectEnabled(page.getByRole('button', { name: 'Next: Review' }));
    await shot(page, '10c-upload-step-3-validate.png');

    // Step 4 — Review
    await page.getByRole('button', { name: 'Next: Review' }).click();
    await page.getByText('Step 4 of 5: Review').waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: /Commit 1 signal/ }).waitFor({ timeout: 15_000 });
    await shot(page, '10d-upload-step-4-review.png');

    // Commit → Done
    await page.getByRole('button', { name: /Commit 1 signal/ }).click();
    await page.getByRole('heading', { name: 'Upload complete' }).waitFor({ timeout: 45_000 });
    await page.getByText(/signal processed|accepted|duplicate/i).first().waitFor({ timeout: 15_000 });
    await shot(page, '10e-upload-step-5-done.png');

    console.log('done →', OUT, `(signal_id=${signalId})`);
  } finally {
    await browser.close();
    await unlink(fixturePath).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
