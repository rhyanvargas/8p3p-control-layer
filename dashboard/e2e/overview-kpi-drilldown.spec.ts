import { expect, test } from '@playwright/test';

const KPI_ROUTES = [
  { label: /Needs attention: \d+/, url: /\/attention$/ },
  { label: /Rejected signals today: \d+/, url: /\/signals$/ },
  { label: /Pending decisions: \d+/, url: /\/decisions\?status=pending$/ },
  { label: /Improving learners: \d+/, url: /\/learners\?trend=improving$/ },
] as const;

test.describe('KPI-004: all KPI cards navigate to drill targets', () => {
  test('each overview KPI card links to its route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    for (const { label, url } of KPI_ROUTES) {
      const link = page.getByRole('link', { name: label }).first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(url);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
