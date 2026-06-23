import { expect, test } from '@playwright/test';

import {
  assertCoreNavVisible,
  assertNoExpandedRawJson,
  clickDataTableRow,
  clickSidebarNav,
  E2E_DECISION_ID,
  E2E_LEARNER_REF,
  expectDetailSheetVisible,
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
    await expect(page.getByRole('heading', { name: 'Who needs help now' })).toBeVisible();

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

    await page.getByRole('link', { name: 'Open full view' }).click();
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

    await page.getByRole('link', { name: 'Open trace' }).click();
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
