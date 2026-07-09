/**
 * Capture AI educator-explanation demo screenshots (redesigned Overview insights).
 * Requires NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true on the dashboard.
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-ai-demo.mjs
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
      nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-overlay],
      button[aria-label="Open Next.js Dev Tools"],
      button[aria-label="Close Next.js Dev Tools"],
      button[aria-label="Open issues overlay"],
      button[aria-label="Collapse issues badge"] {
        display: none !important; visibility: hidden !important; pointer-events: none !important;
      }
    \`;
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
  await page.waitForTimeout(500);
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

    // ── Overview: redesigned AI educator insights ──────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    // CardTitle is not a heading role — locate by id / visible copy.
    const insights = page.locator('#educator-insights-title');
    await insights.waitFor({ timeout: 30_000 });
    await page.getByText(/Act now|Also watching|Nothing needs attention/i).first().waitFor({ timeout: 30_000 });
    await page.getByText(/less confident|reinforcement|ready to move|check-in|noisy|pausing/i).first().waitFor({ timeout: 30_000 });

    // Scroll insights into a clean frame
    await insights.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, '15-ai-overview-insights.png');

    // 15a — Featured narrative expanded (Read more)
    const readMore = page.getByRole('button', { name: 'Read more' });
    if (await readMore.isVisible().catch(() => false)) {
      await readMore.click();
      await page.getByRole('button', { name: 'Show less' }).waitFor({ timeout: 5_000 });
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, '15a-ai-overview-read-more.png');
      await page.getByRole('button', { name: 'Show less' }).click().catch(() => {});
    }

    // 15b — Watch-list item expanded (Why)
    const whyBtn = page.getByRole('button', { name: /Why/i }).first();
    if (await whyBtn.isVisible().catch(() => false)) {
      await whyBtn.click();
      await page.getByText(/View learner|less confident|Stability|reinforcement|check-in/i).first().waitFor({ timeout: 10_000 });
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, '15b-ai-overview-watch-why.png');
    }

    // 15c — Reject reason step on featured action
    const rejectBtn = page.getByRole('button', { name: 'Reject decision review' });
    if (await rejectBtn.isVisible().catch(() => false)) {
      await rejectBtn.click();
      await page.getByRole('button', { name: 'Submit rejection' }).waitFor({ timeout: 10_000 });
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, '15c-ai-overview-reject-step.png');
      // Cancel so we don't mutate review state for later shots
      await page.getByRole('button', { name: 'Cancel rejection' }).click().catch(() => {});
    }

    // 15d — Recent decisions table with AI narrative summaries
    const recent = page
      .getByRole('heading', { name: 'Recent decisions' })
      .or(page.getByText('Recent decisions', { exact: true }))
      .or(page.getByText(/Last 20 decisions/i));
    await recent.first().waitFor({ timeout: 15_000 }).catch(() => {});
    if (await recent.first().isVisible().catch(() => false)) {
      await recent.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot(page, '15d-ai-overview-recent-summaries.png');

      // Open a recent-decision peek from overview
      const recentRow = page
        .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
        .filter({ hasText: /Advance|Intervene|Reinforce|Pause/i })
        .first();
      if (await recentRow.isVisible().catch(() => false)) {
        await recentRow.click();
        await page.getByText(/AI explanation|Educator summary/i).first().waitFor({ timeout: 10_000 });
        await page.waitForTimeout(300);
        await shot(page, '15e-ai-overview-decision-peek.png');
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    // ── Attention review sheet AI explanation ──────────────────────────────
    await page.goto(`${BASE}/attention`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText(/awaiting|in queue|Intervene|Approve/i).first().waitFor({ timeout: 30_000 });
    await page.locator('[data-slot="skeleton"]').first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    const attnRow = page
      .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
      .filter({ hasText: /Intervene|Pause|High/i })
      .first();
    await attnRow.waitFor({ timeout: 30_000 });
    await attnRow.click();
    await page.getByText(/AI explanation|Why this decision/i).first().waitFor({ timeout: 15_000 });
    await page.getByText(/less confident|noisy|reinforcement|check-in|pausing|Needs stronger/i).first().waitFor({ timeout: 15_000 });
    await shot(page, '16-ai-attention-explanation.png');
    await page.keyboard.press('Escape').catch(() => {});

    // ── Decision peek with AI explanation ──────────────────────────────────
    await page.goto(`${BASE}/decisions`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Decisions', exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText(/Advance|Intervene|Reinforce|Pause/i).first().waitFor({ timeout: 30_000 });
    const decisionRow = page
      .locator('[data-slot="table-row"], tr[role="button"], tbody tr')
      .filter({ hasText: /Advance|Intervene|Reinforce|Pause/i })
      .first();
    await decisionRow.waitFor({ timeout: 30_000 });
    await decisionRow.click();
    await page.getByText('AI explanation').waitFor({ timeout: 15_000 });
    await shot(page, '17-ai-decision-peek.png');

    // ── Decision trace with AI explanation ─────────────────────────────────
    await page
      .getByRole('link', { name: /Open trace/i })
      .or(page.getByRole('button', { name: /Open trace/i }))
      .first()
      .click();
    await page.getByRole('heading', { name: /Decision trace/i }).waitFor({ timeout: 30_000 });
    await page.getByText('AI explanation').waitFor({ timeout: 15_000 });
    await shot(page, '18-ai-decision-trace.png');

    // ── Learner overview AI summaries ──────────────────────────────────────
    await page.goto(`${BASE}/learners/stu-10042`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'stu-10042', exact: true }).waitFor({ timeout: 30_000 });
    await page
      .getByText(/less confident|reinforcement|ready to move|check-in|Needs stronger|Confidence and mastery/i)
      .first()
      .waitFor({ timeout: 30_000 });
    await shot(page, '19-ai-learner-summaries.png');

    // Learner struggles tab (AI / stability narrative)
    const strugglesTab = page.getByRole('tab', { name: /Struggles/i });
    if (await strugglesTab.isVisible().catch(() => false)) {
      await strugglesTab.click();
      await page.getByText(/help with|stability|Reading|progress/i).first().waitFor({ timeout: 15_000 });
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
