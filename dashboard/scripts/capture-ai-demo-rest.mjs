/**
 * Capture remaining AI surfaces after overview redesign shots.
 * Usage: PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-ai-demo-rest.mjs
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
  style.textContent = [
    'nextjs-portal',
    '[data-nextjs-toast]',
    '[data-nextjs-dev-overlay]',
    'button[aria-label="Open Next.js Dev Tools"]',
    'button[aria-label="Close Next.js Dev Tools"]',
    'button[aria-label="Open issues overlay"]',
    'button[aria-label="Collapse issues badge"]',
  ].join(',') + '{display:none!important;visibility:hidden!important;pointer-events:none!important}';
  if (!style.parentNode) document.head.appendChild(style);
})();
`;

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(HIDE_OVERLAYS);
}

async function shot(page, name) {
  await settle(page);
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await login(page);

    // Overview recent summaries + peek
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    await page.locator('#educator-insights-title').waitFor({ timeout: 30_000 });
    const recent = page
      .getByRole('heading', { name: 'Recent decisions' })
      .or(page.getByText(/Last 20 decisions/i));
    await recent.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, '15d-ai-overview-recent-summaries.png');

    const recentRow = page
      .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
      .filter({ hasText: /Advance|Intervene|Reinforce|Pause/i })
      .first();
    await recentRow.waitFor({ timeout: 15_000 });
    await recentRow.click();
    await page.getByText(/AI explanation|Status/i).first().waitFor({ timeout: 10_000 });
    await shot(page, '15e-ai-overview-decision-peek.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Attention — wait for queue data (can be slow after overview review mutations)
    await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText(/awaiting|Showing|in queue|No decisions/i).first().waitFor({ timeout: 45_000 });
    // Prefer opening a queue row; fall back to any Approve control
    const attnApprove = page.getByRole('button', { name: /Approve decision for|^Approve$/i }).first();
    await attnApprove.waitFor({ timeout: 45_000 });
    const attnRow = page
      .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
      .filter({ hasText: /Intervene|Pause|High|staff-|stu-/i })
      .first();
    if (await attnRow.isVisible().catch(() => false)) {
      await attnRow.click();
    } else {
      // Click learner cell area via first High urgency row button
      await page.getByRole('button', { name: /High .* Intervene/i }).first().click();
    }
    await page.getByText(/AI explanation|Why this decision/i).first().waitFor({ timeout: 15_000 });
    await page
      .getByText(/less confident|noisy|reinforcement|check-in|pausing|Needs stronger/i)
      .first()
      .waitFor({ timeout: 15_000 });
    await shot(page, '16-ai-attention-explanation.png');
    await page.keyboard.press('Escape');

    // Decisions peek
    await page.goto(`${BASE}/decisions`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Decisions', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText(/Advance|Intervene|Reinforce|Pause/i).first().waitFor({ timeout: 30_000 });
    const dRow = page
      .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
      .filter({ hasText: /Advance|Intervene|Reinforce|Pause/i })
      .first();
    await dRow.waitFor({ timeout: 30_000 });
    await dRow.click();
    await page.getByText('AI explanation').waitFor({ timeout: 15_000 });
    await shot(page, '17-ai-decision-peek.png');

    // Trace
    await page
      .getByRole('link', { name: /Open trace/i })
      .or(page.getByRole('button', { name: /Open trace/i }))
      .first()
      .click();
    await page.getByRole('heading', { name: /Decision trace/i }).waitFor({ timeout: 30_000 });
    await page.getByText('AI explanation').waitFor({ timeout: 15_000 });
    await shot(page, '18-ai-decision-trace.png');

    // Learner — wait for overview tab content, then AI narrative in Summary column
    await page.goto(`${BASE}/learners/stu-10042`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'stu-10042', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole('tab', { name: /Overview/i }).waitFor({ timeout: 15_000 });
    await page.getByText(/Recent decisions|Mastery|Focus skill|Level/i).first().waitFor({ timeout: 30_000 });
    await page.locator('[data-slot="skeleton"]').first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await page
      .getByText(/less confident|reinforcement|ready to move|check-in|Needs stronger|Confidence and mastery|Ready to move on/i)
      .first()
      .waitFor({ timeout: 45_000 });
    await shot(page, '19-ai-learner-summaries.png');

    const struggles = page.getByRole('tab', { name: /Struggles/i });
    if (await struggles.isVisible().catch(() => false)) {
      await struggles.click();
      await page.getByText(/help with|stability|Reading|progress|ACTION REQUIRED/i).first().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(400);
      await shot(page, '19b-ai-learner-struggles.png');
    }

    console.log('done →', OUT);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
