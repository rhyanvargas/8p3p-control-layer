/**
 * Capture feature-tour screenshots into dashboard/screenshots/feature-tour/.
 * Usage: node scripts/capture-feature-tour.mjs
 * Requires dashboard on http://localhost:3001
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function assertNoIssues(page, label) {
  const issue = page.locator('button[aria-label*="Open issues"], button[aria-label*="issue" i]');
  if (await issue.count()) {
    const visible = await issue.first().isVisible().catch(() => false);
    if (visible) {
      throw new Error(`Runtime issue badge visible on ${label}`);
    }
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // Wait out loading skeletons before capture (all of them).
  const skeletons = page.locator('[data-slot="skeleton"]');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const count = await skeletons.count();
    if (count === 0) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  await page.evaluate(HIDE_OVERLAYS);
}

async function shot(page, name) {
  await settle(page);
  await assertNoIssues(page, name);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await login(page);

  // 01 Overview
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
  await shot(page, '01-overview.png');

  // 02 Attention queue
  await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(/awaiting/i).first().waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /Approve decision for/i }).first().waitFor({ timeout: 30_000 });
  await shot(page, '02-attention-queue.png');

  // 03 Learners roster
  await page.goto(`${BASE}/learners`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Learners', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(/stu-|staff-/).first().waitFor({ timeout: 30_000 });
  await shot(page, '03-learners-roster.png');

  // 04 Learner detail (overview tab)
  await page.goto(`${BASE}/learners/stu-10042`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'stu-10042', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(/Latest decision|What should I do|Mastery|Ready to move on|Needs more/i).first().waitFor({ timeout: 30_000 });
  await shot(page, '04-learner-detail.png');

  // 14 Learner state tab
  await page.getByRole('tab', { name: /State/i }).click();
  await page.getByText(/State ID|Canonical fields|historical state/i).first().waitFor({ timeout: 30_000 });
  await shot(page, '14-learner-state.png');

  // 05 Learner trajectory tab
  await page.getByRole('tab', { name: /Trajectory/i }).click();
  await page.getByText(/How did they get here|Trajectory|decision history/i).first().waitFor({ timeout: 30_000 });
  await shot(page, '05-learner-trajectory.png');

  // 13 Learner struggles tab
  await page.getByRole('tab', { name: /Struggles/i }).click();
  await page.getByText(/What do they need help with|Struggles|progress/i).first().waitFor({ timeout: 30_000 });
  await shot(page, '13-learner-struggles.png');

  // 06 Decisions stream
  await page.goto(`${BASE}/decisions`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Decisions', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel('Loading table').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await shot(page, '06-decisions-stream.png');

  // 07 Decision peek (sheet)
  const firstRow = page.locator('[data-slot="table-row"]').filter({ hasText: /stu-|staff-/ }).first();
  await firstRow.waitFor({ timeout: 30_000 });
  await firstRow.click();
  await page.getByRole('button', { name: /Open trace/i }).waitFor({ timeout: 15_000 });
  await shot(page, '07-decision-peek.png');

  // 08 Decision trace
  await page.getByRole('button', { name: /Open trace/i }).click();
  await page.getByRole('heading', { name: /Decision trace/i }).waitFor({ timeout: 30_000 });
  await shot(page, '08-decision-trace.png');

  // 09 Signals ingestion
  await page.goto(`${BASE}/signals`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Signals', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(/Accepted|Rejected|No signals|canvas|absorb|Upload signals/i).first().waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /Upload signals/i }).waitFor({ timeout: 30_000 });
  // Prefer a real outcome chip over skeletons.
  await page.getByText(/Accepted|Rejected/i).first().waitFor({ timeout: 30_000 }).catch(() => {});
  await shot(page, '09-signals-ingestion.png');

  // 10 Signals upload
  await page.goto(`${BASE}/signals/upload`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Upload signals/i }).waitFor({ timeout: 30_000 });
  await shot(page, '10-signals-upload.png');

  // 12 Settings (Reports omitted — program-metrics API not implemented)
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ timeout: 30_000 });
  await shot(page, '12-settings.png');

  await browser.close();
  console.log('done →', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
