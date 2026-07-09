/**
 * Capture investor-deck gap screenshots into dashboard/screenshots/feature-tour/.
 *
 * Shots:
 *   21  — Cross-LMS / within-subject learning gap (Attention review)
 *   22a — Send feedback sheet (open)
 *   22b — Send feedback success toast
 *   23a — Educator persona nav (Overview)
 *   23b — Compliance persona nav (Overview)
 *   24  — Pilot environment label (hosted framing)
 *
 * Prerequisites:
 *   - API on :3000, dashboard on :3001
 *   - Dual-code auth enabled on the dashboard process:
 *       DASHBOARD_ACCESS_CODE_EDUCATOR + DASHBOARD_ACCESS_CODE_COMPLIANCE
 *   - Optional Pilot chip: NEXT_PUBLIC_ENVIRONMENT_LABEL=Pilot (restart Next)
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=0 \
 *     DASHBOARD_ACCESS_CODE_EDUCATOR=demo-educator \
 *     DASHBOARD_ACCESS_CODE_COMPLIANCE=demo-compliance \
 *     node scripts/capture-investor-gaps.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../screenshots/feature-tour');
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const EDUCATOR_CODE =
  process.env.DASHBOARD_ACCESS_CODE_EDUCATOR ?? process.env.DASHBOARD_ACCESS_CODE ?? 'dev-local';
const COMPLIANCE_CODE =
  process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE ?? process.env.DASHBOARD_ACCESS_CODE ?? 'dev-local';
/** Learner with intervene + learning_gaps in Springs seed (Alex Rivera). */
const GAP_LEARNER = process.env.CAPTURE_GAP_LEARNER ?? 'stu-20891';

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

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const skeletons = page.locator('[data-slot="skeleton"]');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await skeletons.count()) === 0) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
  await page.evaluate(HIDE_OVERLAYS);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('wrote', name);
}

async function login(page, code) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Access Code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // ── Compliance path: learning gap + feedback + Pilot chip ─────────────
    await login(page, COMPLIANCE_CODE);

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole('link', { name: 'Decisions', exact: true })
      .waitFor({ timeout: 15_000 });
    await shot(page, '23b-persona-compliance-nav.png');
    await shot(page, '24-pilot-environment.png');

    // Learning gap: Attention review for learner with learning_gaps projection
    await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByLabel('Loading table').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    const preferred = page.locator('[data-slot="table-row"]').filter({ hasText: GAP_LEARNER }).first();
    const englishGap = page
      .locator('[data-slot="table-row"]')
      .filter({ hasText: /mastery \(English\)|Reading —|ELA-201 —/i })
      .first();
    const anyIntervene = page
      .locator('[data-slot="table-row"]')
      .filter({ hasText: /Intervene|Pause/i })
      .first();
    const gapRow = (await preferred.count()) > 0
      ? preferred
      : (await englishGap.count()) > 0
        ? englishGap
        : anyIntervene;
    await gapRow.waitFor({ timeout: 30_000 });
    await gapRow.click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await sheet.waitFor({ timeout: 15_000 });
    await sheet.getByText(/Struggling with/i).waitFor({ timeout: 15_000 });
    await sheet.getByText(/mastery|English|Reading|ELA/i).first().waitFor({ timeout: 15_000 });
    await shot(page, '21-learning-gap-attention.png');

    // Close attention sheet before feedback
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Send feedback — footer trigger (match e2e locator)
    await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    const feedbackTrigger = page.getByRole('button', { name: 'Send feedback' });
    await feedbackTrigger.scrollIntoViewIfNeeded();
    await feedbackTrigger.click();
    const feedbackSheet = page
      .locator('[data-slot="sheet-content"]')
      .filter({ hasText: 'Send feedback' });
    await feedbackSheet.waitFor({ timeout: 15_000 });
    await feedbackSheet.getByLabel('Message').fill(
      'Investor demo: love the Act now queue — would help to export a weekly principal digest.',
    );
    await shot(page, '22a-send-feedback-sheet.png');

    // Submit → success toast (scope to form submit; wait on network + toast)
    const submitResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/control/v1/feedback') &&
        res.request().method() === 'POST' &&
        res.status() === 201,
      { timeout: 20_000 },
    );
    await feedbackSheet.locator('form').getByRole('button', { name: 'Send feedback' }).click();
    await submitResponse;
    const successToast = page.locator('[data-sonner-toast]').filter({ hasText: /Feedback sent/i });
    await successToast.waitFor({ timeout: 10_000 });
    await page.evaluate(`
      (() => {
        const style = document.getElementById('hide-dev-overlays') || document.createElement('style');
        style.id = 'hide-dev-overlays';
        style.textContent = \`
          nextjs-portal,
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
    `);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '22b-send-feedback-success.png'), fullPage: false });
    console.log('wrote', '22b-send-feedback-success.png');

    // ── Educator path: restricted nav ─────────────────────────────────────
    await login(page, EDUCATOR_CODE);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await sidebar.getByRole('link', { name: 'Attention', exact: true }).waitFor({ timeout: 15_000 });
    await sidebar.getByRole('link', { name: 'Decisions', exact: true }).waitFor({ state: 'hidden', timeout: 10_000 });
    await shot(page, '23a-persona-educator-nav.png');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
