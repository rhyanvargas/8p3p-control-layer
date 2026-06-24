import path from 'node:path';

import { expect, test } from '@playwright/test';

test.describe('UPL-E2E-001: signal upload wizard', () => {
  test('upload JSON through map validate commit to done', async ({ page }) => {
    const fixturePath = path.join(
      process.cwd(),
      'e2e',
      'fixtures',
      'upload-signals.json'
    );

    await page.goto('/signals/upload');
    await expect(page.getByRole('heading', { name: 'Upload signals', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await expect(page.getByText('Step 2 of 5: Map')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Default source system').fill('lms-demo');
    await page.getByRole('button', { name: 'Next: Validate' }).click();
    await expect(page.getByText('Step 3 of 5: Validate')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Next: Review' }).click();

    await expect(page.getByText('Step 4 of 5: Review')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Commit 1 signal/ }).click();

    await expect(page.getByRole('heading', { name: 'Upload complete' })).toBeVisible({
      timeout: 30_000,
    });

    const outcomeCounts = page.locator('dl.grid').getByRole('definition');
    await expect(outcomeCounts.nth(0)).toHaveText('1');
    await expect(outcomeCounts.nth(1)).toHaveText('0');
    await expect(outcomeCounts.nth(2)).toHaveText('0');

    await expect(page.getByRole('link', { name: 'View ingestion log' })).toBeVisible();
    await expect(page.getByText('1 signal processed')).toBeVisible();
  });
});
