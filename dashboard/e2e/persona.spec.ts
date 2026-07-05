import { expect, test } from '@playwright/test';

import {
  assertComplianceMainNavVisible,
  assertEducatorNavVisible,
  E2E_LEARNER_REF,
  E2E_PERSONA_COMPLIANCE_CODE,
  E2E_PERSONA_EDUCATOR_CODE,
  loginWithAccessCode,
} from './fixtures';

test.describe('PE-PERSONA: dual-code persona smoke', () => {
  test('PE-PERSONA-001: educator code login shows three nav items only', async ({ page }) => {
    await loginWithAccessCode(page, E2E_PERSONA_EDUCATOR_CODE);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await assertEducatorNavVisible(page);
    await expect(page.getByRole('link', { name: /Rejected signals today:/ })).toBeHidden();
  });

  test('PE-PERSONA-002: compliance code login shows full nav', async ({ page }) => {
    await loginWithAccessCode(page, E2E_PERSONA_COMPLIANCE_CODE);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await assertComplianceMainNavVisible(page);
    await expect(page.getByRole('link', { name: /Rejected signals today:/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('PE-PERSONA-003: educator direct URL /decisions redirects to Overview', async ({ page }) => {
    await loginWithAccessCode(page, E2E_PERSONA_EDUCATOR_CODE);
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeHidden();
  });

  test('PE-PERSONA-004: educator learner detail hides State and Trajectory tabs', async ({
    page,
  }) => {
    await loginWithAccessCode(page, E2E_PERSONA_EDUCATOR_CODE);
    await page.goto(`/learners/${E2E_LEARNER_REF}`);
    await expect(page.getByRole('heading', { name: E2E_LEARNER_REF, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Struggles & progress', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'State', exact: true })).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Trajectory', exact: true })).toBeHidden();
  });

  test('PE-PERSONA-005: educator learner Overview scrubs rule and policy identifiers', async ({
    page,
  }) => {
    await loginWithAccessCode(page, E2E_PERSONA_EDUCATOR_CODE);
    await page.goto(`/learners/${E2E_LEARNER_REF}`);
    await expect(page.getByRole('heading', { name: E2E_LEARNER_REF, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText('rule-risk-threshold')).toBeHidden();
    await expect(page.getByText('pilot-policy')).toBeHidden();
    await expect(page.getByText('State version', { exact: true })).toBeHidden();
    await expect(page.getByText('Active policy', { exact: true })).toBeHidden();
    await expect(page.getByRole('columnheader', { name: 'Rule', exact: true })).toBeHidden();
  });
});
