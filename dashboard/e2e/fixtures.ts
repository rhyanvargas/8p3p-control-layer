import { expect, type Page } from '@playwright/test';

/** Track browser-originated requests that include x-api-key (NXMIG-002). */
export function trackClientApiKey(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (req) => {
    if (req.headers()['x-api-key']) {
      hits.push(req.url());
    }
  });
  return hits;
}

/** Track non-GET HTTP methods from the page (NXMIG-016). */
export function trackMutationRequests(page: Page): { method: string; url: string }[] {
  const mutations: { method: string; url: string }[] = [];
  page.on('request', (req) => {
    const method = req.method().toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      mutations.push({ method, url: req.url() });
    }
  });
  return mutations;
}

/** Design §2.1: no expanded raw JSON at L0/L1 (JsonViewer stays collapsed). */
export async function assertNoExpandedRawJson(page: Page): Promise<void> {
  const openJsonContent = page.locator('[data-slot="collapsible-content"]:visible pre');
  await expect(openJsonContent).toHaveCount(0);
}

export async function assertCoreNavVisible(page: Page): Promise<void> {
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Attention', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Learners', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Decisions', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Signals', exact: true })).toBeVisible();
}

/** Navigate via sidebar primary nav (avoids breadcrumb/KPI link collisions). */
export async function clickSidebarNav(page: Page, label: string): Promise<void> {
  await page
    .locator('[data-sidebar="sidebar"]')
    .getByRole('link', { name: label, exact: true })
    .click();
}

/** DataTable rows expose role="button" on `<tr>`; scope to table rows to avoid action-button collisions. */
function attentionQueueTableRow(page: Page, name: RegExp | string) {
  const pattern = typeof name === 'string' ? new RegExp(name) : name;
  return page.locator('[data-slot="table-row"]').filter({ hasText: pattern }).first();
}

/** DataTable rows expose role="button" for row click handlers. */
export async function clickDataTableRow(page: Page, name: RegExp | string): Promise<void> {
  await attentionQueueTableRow(page, name).click();
}

export async function waitForDataTableRow(page: Page, name: RegExp | string): Promise<void> {
  await expect(page.getByLabel('Loading table')).toBeHidden({ timeout: 30_000 });
  await expect(attentionQueueTableRow(page, name)).toBeVisible({ timeout: 30_000 });
}

export async function expectDataTableRowHidden(page: Page, name: RegExp | string): Promise<void> {
  await expect(attentionQueueTableRow(page, name)).toBeHidden({ timeout: 10_000 });
}

export async function clickTableReviewAction(
  page: Page,
  learnerRef: string,
  action: 'approve' | 'reject'
): Promise<void> {
  const actionLabel = action === 'approve' ? 'Approve' : 'Reject';
  await page
    .getByRole('button', { name: `${actionLabel} decision for ${learnerRef}`, exact: true })
    .click();
}

export async function clickSheetLearnerProfile(page: Page): Promise<void> {
  await page
    .locator('[data-slot="sheet-footer"] a[href*="/learners/"]')
    .filter({ hasText: 'View learner profile' })
    .click();
}

/** DrillDownLink renders as a button (Link-as-Button), not role=link. */
export async function clickSheetDrillDown(page: Page, label: string): Promise<void> {
  await page
    .locator('[data-slot="sheet-footer"]')
    .getByRole('button', { name: label, exact: true })
    .click();
}

export async function expectDetailSheetVisible(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 10_000 });
}

/** Footer controls must stay inside the sheet panel (no horizontal clip). */
export async function expectSheetFooterFits(page: Page): Promise<void> {
  const sheet = page.locator('[data-slot="sheet-content"]');
  const footer = page.locator('[data-slot="sheet-footer"]');
  await expect(sheet).toBeVisible();
  await expect(footer).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  if (!sheetBox || !footerBox) return;

  expect(footerBox.x).toBeGreaterThanOrEqual(sheetBox.x - 1);
  expect(footerBox.x + footerBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
}

export const E2E_ORG_ID = 'e2e-org';
export const E2E_LEARNER_REF = 'learner-1';
export const E2E_DECISION_ID = 'decision-001';
export const E2E_LEARNER_REF_2 = 'learner-2';
export const E2E_DECISION_ID_2 = 'decision-002';

const OVERVIEW_SYNC_TOGGLE_KEY = 'overview:sync-filters:v1';

/** Reset overview cross-filter toggle persistence (XFILTER e2e baseline). */
export async function clearOverviewSyncToggle(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Incognito or disabled storage — ignore.
    }
  }, OVERVIEW_SYNC_TOGGLE_KEY);
}

/** Track browser-originated `/v1/` requests (proxy or upstream paths). */
export function trackV1ApiRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (req) => {
    if (/\/v1\//.test(req.url())) {
      hits.push(req.url());
    }
  });
  return hits;
}

export async function gotoOverviewReady(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: /Needs attention: \d+/ })).toBeVisible({
    timeout: 15_000,
  });
}

export async function enableOverviewSync(page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: /Sync filters/i });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await page.locator('#overview-sync-filters-label').click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

export async function disableOverviewSync(page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: /Sync filters/i });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'false') {
    await page.locator('#overview-sync-filters-label').click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  }
}

export async function selectChartDecisionSeries(page: Page, label: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Decision series' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

export async function readOverviewKpiCounts(page: Page): Promise<{
  needsAttention: number;
  pendingDecisions: number;
  rejectedSignals: number;
  improvingLearners: number;
}> {
  const needsAttentionText =
    (await page.getByRole('link', { name: /Needs attention: \d+/ }).getAttribute('aria-label')) ?? '';
  const pendingText =
    (await page.getByRole('link', { name: /Pending decisions: \d+/ }).getAttribute('aria-label')) ??
    '';
  const rejectedText =
    (await page.getByRole('link', { name: /Rejected signals today:/ }).getAttribute('aria-label')) ??
    '';
  const improvingText =
    (await page.getByRole('link', { name: /Improving learners: \d+/ }).getAttribute('aria-label')) ??
    '';

  const parseCount = (text: string, label: string): number => {
    const match = text.match(new RegExp(`${label}: (\\d+)`));
    if (!match) {
      throw new Error(`Could not parse KPI count from aria-label: ${text}`);
    }
    return Number(match[1]);
  };

  return {
    needsAttention: parseCount(needsAttentionText, 'Needs attention'),
    pendingDecisions: parseCount(pendingText, 'Pending decisions'),
    rejectedSignals: parseCount(rejectedText, 'Rejected signals today'),
    improvingLearners: parseCount(improvingText, 'Improving learners'),
  };
}

export async function readRecentDecisionLearnerRefs(page: Page): Promise<string[]> {
  const section = page.locator('section[aria-label="Recent decisions"]');
  const rows = section.locator('[data-slot="table-row"]');
  const count = await rows.count();
  const refs: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const text = (await rows.nth(i).textContent()) ?? '';
    const match = text.match(/learner-\d+/);
    if (match) refs.push(match[0]);
  }
  return refs;
}

const REVIEW_LOG_KEY = '8p3p-review-log:v1';
const LEGACY_REVIEW_KEY = '8p3p-reviewed-decisions';

/** Clear client review store so attention queue starts with pending rows. */
export async function clearReviewStore(page: Page): Promise<void> {
  await page.evaluate(
    ([v1Key, legacyKey]) => {
      localStorage.removeItem(v1Key);
      localStorage.removeItem(legacyKey);
    },
    [REVIEW_LOG_KEY, LEGACY_REVIEW_KEY] as const
  );
}

/** Seed session review records for Phase 3 discoverability e2e. */
export async function seedReviewStore(
  page: Page,
  records: Array<{
    decisionId: string;
    action: 'approve' | 'reject';
    learnerReference: string;
    decisionType: 'intervene' | 'pause';
  }>
): Promise<void> {
  await page.evaluate(
    ([v1Key, entries]) => {
      const now = new Date().toISOString();
      localStorage.setItem(
        v1Key,
        JSON.stringify(
          entries.map((entry) => ({
            decisionId: entry.decisionId,
            action: entry.action,
            learnerReference: entry.learnerReference,
            decisionType: entry.decisionType,
            reviewedAt: now,
            source: 'local',
          }))
        )
      );
    },
    [REVIEW_LOG_KEY, records] as const
  );
}

export async function gotoAttentionQueue(page: Page): Promise<void> {
  await page.goto('/attention');
  await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

/** Clears in-memory feedback/view state on the mock upstream between e2e runs. */
export async function resetMockFeedbackState(): Promise<void> {
  const baseURL =
    process.env.CONTROL_LAYER_API_BASE_URL ?? 'http://127.0.0.1:9999';
  await fetch(`${baseURL}/__e2e__/reset-feedback`, { method: 'POST' });
}

/** Phase 2 feedback writes require a dashboard session cookie for proxy fb_session injection. */
export async function ensureFeedbackSession(page: Page): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
  const url = new URL(baseURL);
  await page.context().addCookies([
    {
      name: 'dp_session',
      value: 'e2e-feedback-session',
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
}

export async function clearFeedbackSession(page: Page): Promise<void> {
  await page.context().clearCookies();
}

export function isGateEnabledE2e(): boolean {
  return (process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '').length > 0;
}

/** Table reject opens the review sheet reason step (Phase 2). */
export async function rejectFromTableWithReason(
  page: Page,
  learnerRef: string,
  reasonLabel = 'Not at risk'
): Promise<void> {
  await clickTableReviewAction(page, learnerRef, 'reject');
  await expectDetailSheetVisible(page);

  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole('button', { name: reasonLabel, exact: true }).click();
  await sheet.getByRole('button', { name: 'Submit rejection', exact: true }).click();
}

/** Intercept feedback POST to simulate upstream failure for rollback e2e. */
export async function interceptFeedbackPostFailure(
  page: Page,
  options: { status: 401 | 502; error: string; requestId?: string }
): Promise<void> {
  await page.route('**/api/control/v1/decisions/*/feedback', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const requestId = options.requestId ?? 'e2e-req-fail';
    const body =
      options.status === 502
        ? { error: options.error, request_id: requestId }
        : { error: options.error };

    await route.fulfill({
      status: options.status,
      contentType: 'application/json',
      headers: { 'x-request-id': requestId },
      body: JSON.stringify(body),
    });
  });
}
