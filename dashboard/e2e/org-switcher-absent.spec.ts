import { expect, test } from '@playwright/test';

test.describe('ORG-001: org switcher absent when single-org-pinned', () => {
  test('header has no organization select', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('combobox', { name: /organization/i })).toHaveCount(0);
    await expect(page.getByText('All organizations')).toHaveCount(0);
  });
});
