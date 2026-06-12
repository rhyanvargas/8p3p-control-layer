import { expect, test } from '@playwright/test';

test.describe('Decision Panel e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/');
  });

  test('DPU-001: all four panels render within 3s', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Who Needs Help Now' })).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByRole('heading', { name: 'What Do They Need Help With' })).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByRole('heading', { name: 'What Should Happen Next' })).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByRole('heading', { name: 'Did the Support Work' })).toBeVisible({
      timeout: 3000,
    });
  });

  test('DPU-002: Who Needs Help Now shows intervene decisions', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-003: What Do They Need Help With shows declining skills', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-004: What Should Happen Next shows decision with Approve/Reject', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-005: Did the Support Work shows improving skills', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-006: Approve button hides decision on next render', async () => {
    test.skip(true, 'Requires live API with seeded data');
  });

  test('DPU-009: Refresh button triggers summary and state reload', async ({ page }) => {
    test.skip(
      !process.env.E2E_WITH_API,
      'Requires E2E_WITH_API=1 and E2E_BASE_URL pointing at the control-layer API (same-origin /v1/*).'
    );

    await page.goto('/dashboard/');
    await page.waitForResponse(
      (res) => res.url().includes('/v1/state/list') && res.status() === 200
    );
    await page.waitForResponse((res) => /\/v1\/learners\/[^/]+\/summary/.test(res.url()), {
      timeout: 15_000,
    });
    await page.waitForResponse(
      (res) =>
        /\/v1\/state/.test(res.url()) &&
        !res.url().includes('/v1/state/list') &&
        res.status() === 200,
      { timeout: 15_000 }
    );

    const summaryRequest = page.waitForRequest((req) => /\/v1\/learners\/[^/]+\/summary/.test(req.url()));
    const stateRequest = page.waitForRequest(
      (req) => /\/v1\/state/.test(req.url()) && !req.url().includes('/v1/state/list')
    );

    await page.getByRole('button', { name: /refresh/i }).click();

    const [summaryReq, stateReq] = await Promise.all([summaryRequest, stateRequest]);
    expect(summaryReq.url()).toMatch(/\/v1\/learners\/[^/]+\/summary/);
    expect(stateReq.url()).toContain('/v1/state');
    expect(stateReq.url()).toContain('learner_reference=');
  });
});
