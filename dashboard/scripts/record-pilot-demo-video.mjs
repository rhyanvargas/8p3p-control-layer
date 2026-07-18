/**
 * Local rehearsal screencast for docs/guides/pilot-demo-video-checklist.md.
 *
 * Records Video A (educator) and Video B (compliance) against a local stack —
 * NOT a TASK-020 exit substitute (checklist requires hosted Amplify URL).
 *
 * Prerequisites:
 *   - API on :3000 with Springs seed (npm run seed:springs-demo)
 *   - Dashboard on :3001 with dual persona codes
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=0 node scripts/record-pilot-demo-video.mjs
 *
 * Env:
 *   E2E_BASE_URL                 default http://localhost:3001
 *   DASHBOARD_ACCESS_CODE_EDUCATOR / _COMPLIANCE
 *   DEMO_VIDEO_OUT               output dir (default /opt/cursor/artifacts/pilot-demo-videos)
 *   DEMO_VIDEO_WHICH             a | b | both (default both)
 */
import { chromium } from '@playwright/test';
import { mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const EDUCATOR = process.env.DASHBOARD_ACCESS_CODE_EDUCATOR ?? 'demo-educator';
const COMPLIANCE = process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE ?? 'demo-compliance';
const OUT = process.env.DEMO_VIDEO_OUT ?? '/opt/cursor/artifacts/pilot-demo-videos';
const WHICH = (process.env.DEMO_VIDEO_WHICH ?? 'both').toLowerCase();
const DATE = new Date().toISOString().slice(0, 10);
const UPLOAD_FIXTURE = path.resolve(__dirname, '../e2e/fixtures/upload-signals.json');

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

async function hold(page, ms = 2200) {
  await page.waitForTimeout(ms);
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const skeletons = page.locator('[data-slot="skeleton"]');
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if ((await skeletons.count()) === 0) break;
    await page.waitForTimeout(200);
  }
  await page.evaluate(HIDE_OVERLAYS);
  await page.waitForTimeout(400);
}

async function login(page, code) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Access Code').fill(code);
  await hold(page, 900);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
  await settle(page);
}

async function sidebarNav(page, label) {
  await page
    .locator('[data-sidebar="sidebar"]')
    .getByRole('link', { name: label, exact: true })
    .click();
  await settle(page);
}

function tableRow(page, pattern) {
  return page.locator('[data-slot="table-row"]').filter({ hasText: pattern }).first();
}

async function webmToMp4(webmPath, mp4Path) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      webmPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      mp4Path,
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed:\n${r.stderr || r.stdout}`);
  }
}

async function withRecording(label, run) {
  const rawDir = path.join(OUT, `.raw-${label}`);
  await mkdir(rawDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  let videoPath;
  try {
    await run(page);
    videoPath = await page.video()?.path();
  } finally {
    await context.close();
    await browser.close();
  }
  if (!videoPath || !existsSync(videoPath)) {
    // Playwright writes after context close; pick newest webm in rawDir
    const files = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'));
    if (files.length === 0) throw new Error(`No webm recorded for ${label}`);
    files.sort();
    videoPath = path.join(rawDir, files[files.length - 1]);
  }
  return { webmPath: videoPath, rawDir };
}

async function recordVideoA() {
  console.log('Recording Video A — educator path…');
  const { webmPath, rawDir } = await withRecording('video-a', async (page) => {
    // Beat 1 — login → Overview
    await login(page, EDUCATOR);
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    await hold(page, 2800);

    // Beat 2 — Needs your action / Classroom activity
    const kpi = page.getByText(/Needs your action|Needs attention|Pending decisions/i).first();
    await kpi.waitFor({ timeout: 20_000 }).catch(() => {});
    await kpi.scrollIntoViewIfNeeded().catch(() => {});
    await hold(page, 3200);
    const insight = page.getByText(/Classroom activity|cumulative|7d|Last 7/i).first();
    if (await insight.isVisible().catch(() => false)) {
      await insight.scrollIntoViewIfNeeded();
      await hold(page, 2200);
    }

    // Beat 3 — Attention → open intervene row
    await sidebarNav(page, 'Attention');
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    const interveneRow = tableRow(page, /Intervene|High|Maya|Alex|stu-/i);
    await interveneRow.waitFor({ timeout: 30_000 });
    await hold(page, 1800);
    await interveneRow.click();
    await page.locator('[data-slot="sheet-content"]').waitFor({ timeout: 15_000 });
    await settle(page);
    await hold(page, 3200);

    // Beat 4 — Approve from review sheet
    const approve = page
      .locator('[data-slot="sheet-content"]')
      .getByRole('button', { name: 'Approve', exact: true });
    await approve.waitFor({ timeout: 10_000 });
    await approve.click();
    await hold(page, 2500);
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page);

    // Beat 5 — Learners → Open full view → Action required bar (if present)
    await sidebarNav(page, 'Learners');
    await page.getByRole('heading', { name: 'Learners', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    const learnerRow = tableRow(page, /Maya Kim|stu-10042|Alex Rivera|stu-20891/i);
    await learnerRow.waitFor({ timeout: 30_000 });
    await hold(page, 1500);
    await learnerRow.click();
    await page.locator('[data-slot="sheet-content"]').waitFor({ timeout: 15_000 });
    await hold(page, 1800);
    const openFull = page
      .locator('[data-slot="sheet-footer"]')
      .getByRole('button', { name: 'Open full view', exact: true });
    if (await openFull.isVisible().catch(() => false)) {
      await openFull.click();
    } else {
      // fallback: click learner link if present
      const link = page.getByRole('link', { name: /Open full view|View learner/i }).first();
      if (await link.isVisible().catch(() => false)) await link.click();
    }
    await page.waitForURL(/\/learners\//, { timeout: 20_000 });
    await settle(page);
    const reviewBar = page.getByRole('region', { name: 'Attention review actions' });
    if (await reviewBar.isVisible().catch(() => false)) {
      await hold(page, 2800);
      // Quick Approve clears sticky bar so shell actions (Send feedback) are clickable
      const barApprove = reviewBar.getByRole('button', { name: 'Approve', exact: true });
      if (await barApprove.isVisible().catch(() => false)) {
        await barApprove.click();
        await settle(page);
        await hold(page, 2000);
      }
    } else {
      await hold(page, 1800);
    }

    // Beat 6 — Struggles & progress (stay on / return to learner L2)
    if (!page.url().includes('/learners/')) {
      await sidebarNav(page, 'Learners');
      const again = tableRow(page, /Maya Kim|stu-10042/i);
      await again.waitFor({ timeout: 30_000 });
      await again.click();
      await page.locator('[data-slot="sheet-content"]').waitFor({ timeout: 15_000 });
      const openAgain = page
        .locator('[data-slot="sheet-footer"]')
        .getByRole('button', { name: 'Open full view', exact: true });
      if (await openAgain.isVisible().catch(() => false)) await openAgain.click();
      await page.waitForURL(/\/learners\//, { timeout: 20_000 });
      await settle(page);
    }
    const struggles = page.getByRole('tab', { name: /Struggles/i });
    if (await struggles.isVisible().catch(() => false)) {
      await struggles.click();
      await settle(page);
      await page
        .getByText(/help with|gap|less confident|progress|Reading|Math|stability/i)
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => {});
      await hold(page, 3500);
    }

    // Beat 7 — Send feedback (Overview shell — no sticky review bar)
    await sidebarNav(page, 'Overview');
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    // Dismiss any leftover review chrome that could intercept shell clicks
    await page.keyboard.press('Escape').catch(() => {});
    await hold(page, 800);
    const feedbackBtn = page.getByRole('button', { name: 'Send feedback' }).last();
    await feedbackBtn.waitFor({ timeout: 15_000 });
    await feedbackBtn.scrollIntoViewIfNeeded();
    await hold(page, 600);
    await feedbackBtn.click();
    const sheet = page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Send feedback' });
    if (!(await sheet.isVisible().catch(() => false))) {
      await feedbackBtn.click({ force: true });
    }
    await sheet.waitFor({ timeout: 15_000 });
    await hold(page, 1200);
    const ideaTab = sheet.getByRole('tab', { name: 'Idea' });
    if (await ideaTab.isVisible().catch(() => false)) {
      await ideaTab.click();
    }
    await sheet.locator('#product-feedback-message').fill(
      'Local demo rehearsal — educator path checklist beat 7 (Send feedback).'
    );
    await hold(page, 1500);
    await sheet.locator('button[type="submit"]').click();
    await page
      .getByText(/Feedback sent|thank you|Couldn't send/i)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await hold(page, 2800);
  });

  const mp4 = path.join(OUT, `pilot-demo-educator-local-${DATE}.mp4`);
  await webmToMp4(webmPath, mp4);
  await copyFile(webmPath, path.join(OUT, `pilot-demo-educator-local-${DATE}.webm`));
  // cleanup raw dir files
  for (const f of await readdir(rawDir)) {
    await unlink(path.join(rawDir, f)).catch(() => {});
  }
  console.log('wrote', mp4);
  return mp4;
}

async function recordVideoB() {
  console.log('Recording Video B — compliance / admin path…');
  const { webmPath, rawDir } = await withRecording('video-b', async (page) => {
    await login(page, COMPLIANCE);
    await hold(page, 1800);

    // Beat 1 — Upload wizard
    await page.goto(`${BASE}/signals/upload`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Upload signals', exact: true }).waitFor({
      timeout: 30_000,
    });
    await settle(page);
    await hold(page, 2000);
    if (!existsSync(UPLOAD_FIXTURE)) {
      throw new Error(`Missing upload fixture: ${UPLOAD_FIXTURE}`);
    }
    await page.locator('input[type="file"]').setInputFiles(UPLOAD_FIXTURE);
    await page.getByText('Step 2 of 5: Map').waitFor({ timeout: 15_000 });
    await settle(page);
    await hold(page, 2200);
    const source = page.getByLabel('Default source system');
    if (await source.isVisible().catch(() => false)) {
      await source.fill('lms-demo');
    }
    await page.getByRole('button', { name: 'Next: Validate' }).click();
    await page.getByText('Step 3 of 5: Validate').waitFor({ timeout: 15_000 });
    await settle(page);
    await hold(page, 2500);
    await page.getByRole('button', { name: 'Next: Review' }).click();
    await page.getByText('Step 4 of 5: Review').waitFor({ timeout: 15_000 });
    await settle(page);
    await hold(page, 2000);
    await page.getByRole('button', { name: /Commit \d+ signal/ }).click();
    await page.getByRole('heading', { name: 'Upload complete' }).waitFor({ timeout: 45_000 });
    await settle(page);
    await hold(page, 2800);

    // Beat 2 — Attention queue after upload
    await sidebarNav(page, 'Attention');
    await page.getByRole('heading', { name: 'Attention', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    await hold(page, 2800);

    // Beat 3 — Decisions → intervene → Export JSON
    await sidebarNav(page, 'Decisions');
    await page.getByRole('heading', { name: 'Decisions', exact: true }).waitFor({ timeout: 30_000 });
    await settle(page);
    const intervene = tableRow(page, /Intervene/i);
    await intervene.waitFor({ timeout: 30_000 });
    await hold(page, 1500);
    await intervene.click();
    await page.locator('[data-slot="sheet-content"]').waitFor({ timeout: 15_000 });
    await settle(page);
    await hold(page, 2200);
    const openTrace = page
      .getByRole('button', { name: /Open trace/i })
      .or(page.getByRole('link', { name: /Open trace/i }))
      .first();
    if (await openTrace.isVisible().catch(() => false)) {
      await openTrace.click();
      await page.getByRole('heading', { name: /Decision trace/i }).waitFor({ timeout: 30_000 });
      await settle(page);
      await hold(page, 2500);
      const exportBtn = page.getByRole('button', { name: /Export JSON/i });
      if (await exportBtn.isVisible().catch(() => false)) {
        // Prefer download without navigating away; still click for the beat
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
          exportBtn.click(),
        ]);
        if (download) await download.cancel().catch(() => {});
        await hold(page, 2000);
      }
    }

    // Beat 4 — Signals ingestion log
    await sidebarNav(page, 'Signals');
    await page.getByRole('heading', { name: /Signals|Ingestion/i }).first().waitFor({
      timeout: 30_000,
    });
    await settle(page);
    await hold(page, 3000);

    // Beat 5/6 — Settings mention (policies) if route exists; else Overview hold
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(page);
    const settingsHeading = page.getByRole('heading', { name: /Settings|Policies/i }).first();
    if (await settingsHeading.isVisible().catch(() => false)) {
      await hold(page, 2800);
    } else {
      await sidebarNav(page, 'Overview');
      await hold(page, 2000);
    }
  });

  const mp4 = path.join(OUT, `pilot-demo-admin-local-${DATE}.mp4`);
  await webmToMp4(webmPath, mp4);
  await copyFile(webmPath, path.join(OUT, `pilot-demo-admin-local-${DATE}.webm`));
  for (const f of await readdir(rawDir)) {
    await unlink(path.join(rawDir, f)).catch(() => {});
  }
  console.log('wrote', mp4);
  return mp4;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // quick readiness
  const health = await fetch(`${BASE}/login`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`Dashboard not reachable at ${BASE}/login`);
  }
  const written = [];
  if (WHICH === 'a' || WHICH === 'both') written.push(await recordVideoA());
  if (WHICH === 'b' || WHICH === 'both') written.push(await recordVideoB());
  console.log('\nDone (local rehearsal — not hosted TASK-020):');
  for (const f of written) console.log(' ', f);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
