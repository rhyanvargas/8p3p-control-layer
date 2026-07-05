import { expect, test } from '@playwright/test';

import {
  clearCsatStorage,
  clearReviewStore,
  ensureFeedbackSession,
  isCsatE2eEnabled,
  resetMockFeedbackState,
  seedCsatFrequencyCap,
  seedCsatTaskThreshold,
} from './fixtures';

test.describe('PFEED-012: Send feedback sheet Esc/focus/page state', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await ensureFeedbackSession(page);
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Esc closes sheet, returns focus to trigger, page unchanged', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Send feedback' });
    await trigger.click();

    const sheet = page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Send feedback' });
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await sheet.getByLabel('Message').fill('Esc should preserve page state.');

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    await expect(page).toHaveURL(/\/decisions/);
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible();
    await expect(trigger).toBeFocused();
  });
});

test.describe('PFEED-013: CSAT frequency cap', () => {
  test.skip(!isCsatE2eEnabled(), 'NEXT_PUBLIC_FEEDBACK_CSAT must be true');

  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await ensureFeedbackSession(page);
    await page.goto('/');
    await clearCsatStorage(page);
    await clearReviewStore(page);
    await seedCsatTaskThreshold(page);
    await seedCsatFrequencyCap(page);
  });

  test('CSAT prompt not shown again within CSAT_MIN_INTERVAL_DAYS', async ({ page }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('How satisfied are you with this experience?')).toBeHidden();
  });
});

test.describe('PFEED-014: CSAT mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.skip(!isCsatE2eEnabled(), 'NEXT_PUBLIC_FEEDBACK_CSAT must be true');

  test.beforeEach(async ({ page }) => {
    await resetMockFeedbackState();
    await ensureFeedbackSession(page);
    await page.goto('/');
    await clearCsatStorage(page);
    await clearReviewStore(page);
    await seedCsatTaskThreshold(page);
  });

  test('all 5 CSAT options visible without horizontal scroll', async ({ page }) => {
    await page.goto('/decisions');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('How satisfied are you with this experience?')).toBeVisible();

    const radiogroup = page.getByRole('radiogroup');
    await expect(radiogroup).toBeVisible();

    for (let score = 1; score <= 5; score += 1) {
      await expect(radiogroup.getByRole('radio').nth(score - 1)).toBeVisible();
    }

    const layout = await page.evaluate(() => {
      const group = document.querySelector('[role="radiogroup"]');
      if (!group) return null;
      const buttons = group.querySelectorAll('[role="radio"]');
      let allVisible = buttons.length === 5;
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          allVisible = false;
        }
      }
      return {
        allVisible,
        noHorizontalScroll: group.scrollWidth <= group.clientWidth + 1,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.allVisible).toBe(true);
    expect(layout!.noHorizontalScroll).toBe(true);
  });
});
