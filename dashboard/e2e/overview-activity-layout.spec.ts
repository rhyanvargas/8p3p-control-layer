import { expect, test } from '@playwright/test';

import {
  clearOverviewSyncToggle,
  disableOverviewSync,
  gotoOverviewReady,
  trackV1ApiRequests,
} from './fixtures';

test.describe('OVACT-012: period change without refetch when sync OFF', () => {
  test.beforeEach(async ({ page }) => {
    await clearOverviewSyncToggle(page);
  });

  test('clicking 30d updates the period label with zero new /v1/ requests', async ({ page }) => {
    const v1Requests = trackV1ApiRequests(page);
    await gotoOverviewReady(page);
    await disableOverviewSync(page);

    const periodLabel = page.locator('text=/\\w{3} \\d{1,2} – \\w{3} \\d{1,2}/').first();
    await expect(periodLabel).toBeVisible();
    const labelBefore = (await periodLabel.textContent()) ?? '';

    v1Requests.length = 0;

    await page.getByRole('button', { name: '30d', exact: true }).click();

    await expect(page.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    await expect(periodLabel).not.toHaveText(labelBefore);
    expect(v1Requests).toHaveLength(0);
  });
});

test.describe('OVACT-013: Export CSV download', () => {
  test.beforeEach(async ({ page }) => {
    await clearOverviewSyncToggle(page);
  });

  test('downloads overview-activity CSV with expected filename pattern', async ({ page }) => {
    await gotoOverviewReady(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^overview-activity-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/
    );
  });
});
