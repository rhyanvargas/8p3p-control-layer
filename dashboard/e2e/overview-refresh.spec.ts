import { expect, test } from '@playwright/test';

test.describe('FRSH-003: refresh updates Overview freshness', () => {
  test('header refresh shows Updated chip and remains visible after click', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/^Updated /)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Refresh data' }).click();
    await expect(page.getByText('Overview data refreshed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Needs attention:/ })).toBeVisible();
  });
});
