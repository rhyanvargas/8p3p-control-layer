/**
 * Capture Approve + Reject decision review screenshots.
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-approve-reject.mjs
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
  const skeletons = page.locator('[data-slot="skeleton"]');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await skeletons.count()) === 0) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
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

async function openAttentionReviewSheet(page) {
  await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(/awaiting|Showing|in queue|No decisions/i).first().waitFor({ timeout: 45_000 });
  await page.locator('[data-slot="skeleton"]').first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

  const attnRow = page
    .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
    .filter({ hasText: /Intervene|Pause|High/i })
    .first();
  await attnRow.waitFor({ timeout: 45_000 });
  await attnRow.click();

  const sheet = page.getByRole('dialog').or(page.locator('[data-slot="sheet-content"]'));
  await sheet.first().waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor({ timeout: 15_000 });
  return sheet.first();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await login(page);

    // ── 20a — Approve decision (Attention review sheet with Approve/Reject) ─
    await openAttentionReviewSheet(page);
    await page.getByText(/AI explanation|Why this decision|Needs stronger|Intervene/i).first().waitFor({
      timeout: 15_000,
    });
    await shot(page, '20a-decision-approve.png');

    // Submit Approve so Recently reviewed shows Approved chip
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page
      .getByText(/Approved ·|Recently reviewed/i)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, '20b-decision-approved-result.png');

    // ── 20c — Reject decision reason step (Attention sheet) ────────────────
    await openAttentionReviewSheet(page);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: 'Submit rejection', exact: true }).waitFor({ timeout: 10_000 });
    await page.getByText(/Why are you rejecting/i).waitFor({ timeout: 10_000 });
    await shot(page, '20c-decision-reject.png');

    // Complete reject with a reason so Recently reviewed shows Rejected chip
    await page.getByRole('button', { name: 'Not at risk', exact: true }).click();
    await page.getByRole('button', { name: 'Submit rejection', exact: true }).click();
    await page
      .getByText(/Rejected ·|Recently reviewed/i)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, '20d-decision-rejected-result.png');

    // Also refresh Overview reject step (canonical pair with approve actions)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    const insights = page.locator('#educator-insights-title');
    await insights.waitFor({ timeout: 30_000 });
    await page.getByText(/Act now|Also watching|Nothing needs attention/i).first().waitFor({ timeout: 30_000 });

    const rejectBtn = page.getByRole('button', { name: 'Reject decision review' });
    if (await rejectBtn.isVisible().catch(() => false)) {
      await rejectBtn.click();
      await page.getByRole('button', { name: 'Submit rejection' }).waitFor({ timeout: 10_000 });
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, '15c-ai-overview-reject-step.png');
      await page.getByRole('button', { name: 'Cancel rejection' }).click().catch(() => {});
    }

    // Overview approve-ready state (Approve + Reject visible, not in reject step)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    await insights.waitFor({ timeout: 30_000 });
    const approveBtn = page.getByRole('button', { name: 'Approve decision review' });
    if (await approveBtn.isVisible().catch(() => false)) {
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, '15f-ai-overview-approve-actions.png');
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
