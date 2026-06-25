import { expect, test } from '@playwright/test';

import {
  assertCoreNavVisible,
  assertNoExpandedRawJson,
  clickDataTableRow,
  clickSidebarNav,
  clickTableReviewAction,
  clearReviewStore,
  clickSheetLearnerProfile,
  clickSheetDrillDown,
  E2E_DECISION_ID,
  E2E_DECISION_ID_2,
  E2E_LEARNER_REF,
  E2E_LEARNER_REF_2,
  ensureFeedbackSession,
  expectDetailSheetVisible,
  expectDataTableRowHidden,
  expectSheetFooterFits,
  gotoAttentionQueue,
  interceptFeedbackPostFailure,
  isGateEnabledE2e,
  rejectFromTableWithReason,
  resetMockFeedbackState,
  seedReviewStore,
  trackClientApiKey,
  trackMutationRequests,
  waitForDataTableRow,
} from './fixtures';

test.describe('NXMIG-001: core pages render with live data', () => {
  test('Overview, Attention, Learners, Decisions, and Signals load', async ({ page }) => {
    const apiKeyHits = trackClientApiKey(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await assertNoExpandedRawJson(page);
    await assertCoreNavVisible(page);

    await clickSidebarNav(page, 'Attention');
    await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await clickSidebarNav(page, 'Learners');
    await expect(page.getByRole('heading', { name: 'Learners', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('cell', { name: E2E_LEARNER_REF })).toBeVisible();

    await clickSidebarNav(page, 'Decisions');
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('cell', { name: E2E_LEARNER_REF })).toBeVisible();

    await clickSidebarNav(page, 'Signals');
    await expect(page.getByRole('heading', { name: 'Signals', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('cell', { name: 'lms-demo' }).first()).toBeVisible();

    expect(apiKeyHits).toEqual([]);
  });
});

test.describe('NXMIG-002: browser never sends x-api-key', () => {
  test('panel navigation issues no client x-api-key headers', async ({ page }) => {
    const apiKeyHits = trackClientApiKey(page);

    for (const path of ['/', '/attention', '/learners', '/decisions', '/signals']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(apiKeyHits).toEqual([]);
  });
});

test.describe('NXMIG-012: app shell and build parity smoke', () => {
  test('overview shell navigates without client x-api-key', async ({ page }) => {
    const apiKeyHits = trackClientApiKey(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: 'Signals' }).click();
    await expect(page.getByRole('heading', { name: 'Signals', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    expect(apiKeyHits).toEqual([]);
  });
});

test.describe('NXMIG-013: signals ingestion log', () => {
  test('rows render, outcome filter works, rejection expand, no L0 JSON', async ({ page }) => {
    const apiKeyHits = trackClientApiKey(page);

    await page.goto('/signals');
    await expect(page.getByRole('cell', { name: 'lms-demo' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await assertNoExpandedRawJson(page);

    await page.locator('#outcome-filter').click();
    await page.getByRole('option', { name: 'Rejected' }).click();
    await expect(page.getByText('Rejected', { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    const expandButton = page.getByRole('button', { name: /Expand rejection details/i }).first();
    await expandButton.click();
    await expect(page.getByText('INVALID_FIELD')).toBeVisible();
    await expect(page.getByText('payload.masteryScore')).toBeVisible();

    expect(apiKeyHits).toEqual([]);
  });
});

test.describe('NXMIG-014: learner state version drill-down', () => {
  test('L1 sheet → L2 route with version selector and L3 JSON collapsed', async ({ page }) => {
    await page.goto('/learners');
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await clickDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await expectDetailSheetVisible(page);
    await assertNoExpandedRawJson(page);

    await clickSheetDrillDown(page, 'Open full view');
    await expect(page).toHaveURL(new RegExp(`/learners/${E2E_LEARNER_REF}`));

    await page.getByRole('tab', { name: 'State' }).click();
    await expect(page.getByRole('button', { name: 'v1' })).toBeVisible();
    await page.getByRole('button', { name: 'v1' }).click();
    await expect(page.getByText('state-learner-1-v1')).toBeVisible({ timeout: 10_000 });
    await assertNoExpandedRawJson(page);

    await page.getByRole('button', { name: /Raw state payload/i }).click();
    await expect(page.locator('pre').filter({ hasText: '"masteryScore"' })).toBeVisible();
  });
});

test.describe('NXMIG-015/016: decision stream drill-down and read-only', () => {
  test('row → L1 sheet → L2 trace; GET-only; JSON at L3 only', async ({ page }) => {
    const mutations = trackMutationRequests(page);

    await page.goto('/decisions');
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await clickDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await expectDetailSheetVisible(page);
    await expect(page.getByText(/riskSignal/i)).toBeVisible();
    await assertNoExpandedRawJson(page);

    await clickSheetDrillDown(page, 'Open trace');
    await expect(page).toHaveURL(new RegExp(`/decisions/${E2E_DECISION_ID}`));
    await expect(page.getByRole('heading', { name: 'Decision trace' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evaluated thresholds' })).toBeVisible();
    await expect(page.getByText('riskSignal (0.72)')).toBeVisible();
    await assertNoExpandedRawJson(page);

    await page.getByRole('button', { name: /State snapshot \(at decision time\)/i }).click();
    await expect(page.locator('pre').filter({ hasText: '"masteryScore"' })).toBeVisible();

    const proxyMutations = mutations.filter(
      (m) => m.url.includes('/api/control/') && !['GET', 'HEAD'].includes(m.method),
    );
    expect(proxyMutations).toEqual([]);
  });
});

test.describe('Attention review sheet footer', () => {
  test('review actions fit inside the sheet without horizontal overflow', async ({ page }) => {
    await page.goto('/attention');
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await clickDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await expectDetailSheetVisible(page);
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View learner profile' })).toBeVisible();
    await expectSheetFooterFits(page);
  });

  test('learner profile link preserves review actions on L2', async ({ page }) => {
    await resetMockFeedbackState();
    await ensureFeedbackSession(page);
    await page.goto('/attention');
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await clickDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await expectDetailSheetVisible(page);

    await clickSheetLearnerProfile(page);
    await expect(page).toHaveURL(
      new RegExp(
        `/learners/${E2E_LEARNER_REF}\\?.*reviewDecision=${E2E_DECISION_ID}.*from=attention`
      )
    );

    const reviewBar = page.getByRole('region', { name: 'Attention review actions' });
    await expect(reviewBar).toBeVisible();
    await expect(reviewBar.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(reviewBar.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expect(reviewBar.getByRole('button', { name: 'Back to Attention' })).toBeHidden();

    const backLink = page.locator('a[href="/attention"]').filter({ hasText: 'Back to Attention' });
    await expect(backLink).toBeVisible();

    await reviewBar.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL('/attention');
    await expect(reviewBar).toBeHidden();
  });
});

test.describe('Attention review UX (REVIEW-UX-006 through 009)', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await ensureFeedbackSession(page);
    await gotoAttentionQueue(page);
    await clearReviewStore(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('REVIEW-UX-006: approve from table removes row, shows toast with Undo, undo restores row', async ({
    page,
  }) => {
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');

    await expectDataTableRowHidden(page, new RegExp(E2E_LEARNER_REF));
    await expect(page.getByText(`Approved · ${E2E_LEARNER_REF}`)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect(page.getByText(`Restored · ${E2E_LEARNER_REF}`)).toBeVisible({
      timeout: 5_000,
    });
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
  });

  test('REVIEW-UX-007: reject and approve show distinct action chips in Recently reviewed', async ({
    page,
  }) => {
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF_2));

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');
    await expect(page.getByText(`Approved · ${E2E_LEARNER_REF}`)).toBeVisible({
      timeout: 5_000,
    });

    await rejectFromTableWithReason(page, E2E_LEARNER_REF_2);
    await expect(page.getByText(`Rejected · ${E2E_LEARNER_REF_2}`)).toBeVisible({
      timeout: 5_000,
    });

    const history = page.getByRole('region', { name: 'Recently reviewed decisions' });
    await expect(history).toBeVisible();
    await expect(history.getByText('Approved', { exact: true })).toBeVisible();
    await expect(history.getByText('Rejected', { exact: true })).toBeVisible();
  });

  test('REVIEW-UX-008: approve from review sheet auto-opens next pending row', async ({
    page,
  }) => {
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await clickDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await expectDetailSheetVisible(page);
    await expect(page.getByText(E2E_LEARNER_REF, { exact: true }).first()).toBeVisible();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await sheet.getByRole('button', { name: 'Approve', exact: true }).click();

    await expectDetailSheetVisible(page);
    await expect(sheet.getByText(E2E_LEARNER_REF_2, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expectDataTableRowHidden(page, new RegExp(E2E_LEARNER_REF));
  });

  test('REVIEW-UX-009: empty state mentions review count after queue is cleared', async ({
    page,
  }) => {
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF_2));

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');
    await expect(page.getByText(`Approved · ${E2E_LEARNER_REF}`)).toBeVisible({
      timeout: 5_000,
    });

    await rejectFromTableWithReason(page, E2E_LEARNER_REF_2);
    await expect(page.getByText(`Rejected · ${E2E_LEARNER_REF_2}`)).toBeVisible({
      timeout: 5_000,
    });

    await expectDataTableRowHidden(page, new RegExp(E2E_LEARNER_REF));
    await expectDataTableRowHidden(page, new RegExp(E2E_LEARNER_REF_2));
    await expect(
      page.getByText('Queue clear — you reviewed 2 decisions today.')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('REVIEW-UX-010: header badges show awaiting and reviewed today counts', async ({
    page,
  }) => {
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF_2));

    await expect(page.getByText('2 awaiting · 0 reviewed today')).toBeVisible();

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');
    await expect(page.getByText(`Approved · ${E2E_LEARNER_REF}`)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText('1 awaiting · 1 reviewed today')).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe('Attention review UX Phase 2 (REVIEW-UX-014)', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await gotoAttentionQueue(page);
    await clearReviewStore(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('REVIEW-UX-014: API failure restores row and shows error toast', async ({ page }) => {
    await ensureFeedbackSession(page);
    await page.reload();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));

    await interceptFeedbackPostFailure(page, {
      status: 502,
      error: 'dashboard_upstream_unavailable',
      requestId: 'e2e-upstream-fail',
    });

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');

    await expect(page.getByText('Could not save review')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Could not reach the control layer/i)).toBeVisible();
    await expect(page.getByText(/e2e-upstream-fail/)).toBeVisible();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
  });

  test('REVIEW-UX-014: session_required restores row with sign-in copy', async ({ page }) => {
    await ensureFeedbackSession(page);
    await page.reload();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));

    await interceptFeedbackPostFailure(page, {
      status: 401,
      error: 'session_required',
    });

    await clickTableReviewAction(page, E2E_LEARNER_REF, 'approve');

    await expect(page.getByText('Could not save review')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Sign in again to save your review/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
  });
});

test.describe('Attention review UX Phase 2 (REVIEW-UX-015)', () => {
  test('REVIEW-UX-015: login mints dp_session and fb_session with matching values', async ({
    page,
  }) => {
    test.skip(!isGateEnabledE2e(), 'Passphrase gate disabled in e2e env');

    await page.goto('/login');
    await page.getByLabel('Access Code').fill(process.env.DASHBOARD_ACCESS_CODE ?? '');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL('/', { timeout: 15_000 });

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (cookie) => cookie.name === 'dp_session' || cookie.name === '__Host-dp_session'
    );
    const fbSession = cookies.find((cookie) => cookie.name === 'fb_session');

    expect(sessionCookie).toBeDefined();
    expect(fbSession).toBeDefined();
    expect(fbSession?.value).toBe(sessionCookie?.value);
    expect(fbSession?.value.length).toBeGreaterThan(0);
  });
});

test.describe('Overview decision drill-down (UX gate)', () => {
  test('recent decision row opens L1 sheet without raw JSON', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Recent decisions' })).toBeVisible({
      timeout: 15_000,
    });

    const decisionRow = page.getByRole('button', { name: new RegExp(E2E_LEARNER_REF) }).first();
    await expect(decisionRow).toBeVisible({ timeout: 15_000 });
    await decisionRow.click();
    await expectDetailSheetVisible(page);
    await assertNoExpandedRawJson(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slot="sheet-content"]')).toBeHidden();
  });
});

test.describe('Attention review UX Phase 3 (REVIEW-UX-016)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAttentionQueue(page);
    await clearReviewStore(page);
  });

  test('Review status "Reviewed by me" shows only session-reviewed rows', async ({ page }) => {
    await seedReviewStore(page, [
      {
        decisionId: E2E_DECISION_ID,
        action: 'approve',
        learnerReference: E2E_LEARNER_REF,
        decisionType: 'intervene',
      },
      {
        decisionId: E2E_DECISION_ID_2,
        action: 'reject',
        learnerReference: E2E_LEARNER_REF_2,
        decisionType: 'pause',
      },
    ]);

    await page.goto('/decisions?reviewed=session');
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole('cell', { name: E2E_LEARNER_REF })).toBeVisible();
    await expect(page.getByRole('cell', { name: E2E_LEARNER_REF_2 })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'learner-3' })).toBeHidden();
  });
});

test.describe('Attention review UX Phase 3 (REVIEW-UX-017)', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await gotoAttentionQueue(page);
    await clearReviewStore(page);
    await ensureFeedbackSession(page);
  });

  test('learner detail recent decisions show educator action chip', async ({ page }) => {
    await page.reload();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));
    await rejectFromTableWithReason(page, E2E_LEARNER_REF_2, 'Not at risk');

    await clickSidebarNav(page, 'Learners');
    await page.getByRole('button', { name: E2E_LEARNER_REF_2 }).click();
    await expect(page.getByRole('heading', { name: E2E_LEARNER_REF_2, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const overviewPanel = page.getByRole('tabpanel');
    await expect(overviewPanel.getByText('Rejected', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
