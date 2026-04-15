import { expect, test } from '@playwright/test';

test.describe('Decision Panel e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/');
  });

  test('DPU-001: all four panels render within 3s', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Who Needs Attention?' })).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByRole('heading', { name: 'Why Are They Stuck?' })).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByRole('heading', { name: 'What To Do?' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('heading', { name: 'Did It Work?' })).toBeVisible({ timeout: 3000 });
  });

  test('DPU-002: Who Needs Attention shows intervene decisions', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-003: Why Are They Stuck shows declining skills', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-004: What To Do shows decision with Approve/Reject', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-005: Did It Work shows improving skills', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-006: Approve button hides decision on next render', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-009: Refresh button triggers data reload', async ({ page }) => {
    test.skip(
      !process.env.E2E_WITH_API,
      'Requires E2E_WITH_API=1 and E2E_BASE_URL pointing at the control-layer API (same-origin /v1/decisions).'
    );
    const [request] = await Promise.all([
      page.waitForRequest((req) => /\/v1\/decisions/.test(req.url())),
      page.getByRole('button', { name: /refresh/i }).click(),
    ]);
    expect(request.url()).toContain('/v1/decisions');
  });
});
