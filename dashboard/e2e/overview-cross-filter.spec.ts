import { expect, test } from '@playwright/test';

import {
  clearOverviewSyncToggle,
  disableOverviewSync,
  E2E_LEARNER_REF,
  E2E_LEARNER_REF_2,
  enableOverviewSync,
  gotoOverviewReady,
  readOverviewKpiCounts,
  readRecentDecisionLearnerRefs,
  selectChartDecisionSeries,
  trackV1ApiRequests,
} from './fixtures';

test.describe('XFILTER-012: linked brushing with no network on interaction', () => {
  test.beforeEach(async ({ page }) => {
    await clearOverviewSyncToggle(page);
  });

  test('chart decision type filters table and decision-derived KPIs without refetch', async ({
    page,
  }) => {
    const v1Requests = trackV1ApiRequests(page);
    await gotoOverviewReady(page);

    const baseline = await readOverviewKpiCounts(page);
    expect(baseline.needsAttention).toBe(2);
    expect(baseline.pendingDecisions).toBe(2);
    expect(baseline.rejectedSignals).toBe(1);

    const baselineLearners = await readRecentDecisionLearnerRefs(page);
    expect(baselineLearners.sort()).toEqual([E2E_LEARNER_REF, E2E_LEARNER_REF_2].sort());

    v1Requests.length = 0;

    await enableOverviewSync(page);
    await selectChartDecisionSeries(page, 'Intervene');

    await expect(page.getByText('Filtered: Intervene')).toBeVisible();
    await expect(page.getByText('Matching decisions')).toBeVisible();

    const filtered = await readOverviewKpiCounts(page);
    expect(filtered.needsAttention).toBe(1);
    expect(filtered.pendingDecisions).toBe(1);
    expect(filtered.rejectedSignals).toBe(baseline.rejectedSignals);
    expect(filtered.improvingLearners).toBe(baseline.improvingLearners);

    const filteredLearners = await readRecentDecisionLearnerRefs(page);
    expect(filteredLearners).toEqual([E2E_LEARNER_REF]);
    expect(filteredLearners).not.toContain(E2E_LEARNER_REF_2);

    expect(v1Requests).toHaveLength(0);
  });
});

test.describe('XFILTER-013: toggle flip does not refetch', () => {
  test.beforeEach(async ({ page }) => {
    await clearOverviewSyncToggle(page);
  });

  test('sync ON/OFF keeps identical KPIs and table data with zero new requests', async ({
    page,
  }) => {
    const v1Requests = trackV1ApiRequests(page);
    await gotoOverviewReady(page);

    const offBaselineKpis = await readOverviewKpiCounts(page);
    const offBaselineLearners = await readRecentDecisionLearnerRefs(page);

    const toggle = page.getByRole('switch', { name: /Sync filters/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    v1Requests.length = 0;

    await enableOverviewSync(page);
    expect(await readOverviewKpiCounts(page)).toEqual(offBaselineKpis);
    expect(await readRecentDecisionLearnerRefs(page)).toEqual(offBaselineLearners);

    await disableOverviewSync(page);
    expect(await readOverviewKpiCounts(page)).toEqual(offBaselineKpis);
    expect(await readRecentDecisionLearnerRefs(page)).toEqual(offBaselineLearners);

    expect(v1Requests).toHaveLength(0);
  });
});
