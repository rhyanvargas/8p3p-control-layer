import { expect, test } from '@playwright/test';

import { E2E_LEARNER_REF, waitForDataTableRow } from './fixtures';

const KPI_ROUTES = [
  { label: /Needs attention: \d+/, url: /\/attention$/ },
  { label: /Rejected signals today: \d+/, url: /\/signals$/ },
  { label: /Pending decisions: \d+/, url: /\/attention\?from=pending$/ },
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

  test('Improving learners card filters the roster', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: /Improving learners: \d+/ }).click();
    await expect(page).toHaveURL(/\/learners\?trend=improving$/);
    await expect(page.getByRole('heading', { name: 'Learners', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Trend filter')).toHaveText(/Improving only/i);
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));

    await page.goto('/learners?trend=declining');
    await expect(page.getByLabel('Trend filter')).toHaveText(/Declining only/i);
    await expect(page.getByText('No learners match the current filters.')).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('KPI-005: pending decisions review loop', () => {
  test('Pending decisions card opens review queue with approve actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: /Pending decisions: \d+/ }).click();
    await expect(page).toHaveURL(/\/attention\?from=pending$/);
    await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('From: Pending decisions')).toBeVisible();
    await waitForDataTableRow(page, new RegExp(E2E_LEARNER_REF));

    const approveButton = page
      .getByRole('button', { name: new RegExp(`Approve decision for ${E2E_LEARNER_REF}`) })
      .first();
    await expect(approveButton).toBeVisible();
    await approveButton.click();
    await expect(approveButton).toBeHidden({ timeout: 10_000 });
  });

  test('legacy /decisions?status=pending redirects to review queue', async ({ page }) => {
    await page.goto('/decisions?status=pending');
    await expect(page).toHaveURL(/\/attention\?from=pending$/);
    await expect(page.getByRole('heading', { name: 'Attention', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
