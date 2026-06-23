import { expect, type Page } from '@playwright/test';

/** Track browser-originated requests that include x-api-key (NXMIG-002). */
export function trackClientApiKey(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (req) => {
    if (req.headers()['x-api-key']) {
      hits.push(req.url());
    }
  });
  return hits;
}

/** Track non-GET HTTP methods from the page (NXMIG-016). */
export function trackMutationRequests(page: Page): { method: string; url: string }[] {
  const mutations: { method: string; url: string }[] = [];
  page.on('request', (req) => {
    const method = req.method().toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      mutations.push({ method, url: req.url() });
    }
  });
  return mutations;
}

/** Design §2.1: no expanded raw JSON at L0/L1 (JsonViewer stays collapsed). */
export async function assertNoExpandedRawJson(page: Page): Promise<void> {
  const openJsonContent = page.locator('[data-slot="collapsible-content"]:visible pre');
  await expect(openJsonContent).toHaveCount(0);
}

export async function assertCoreNavVisible(page: Page): Promise<void> {
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Attention', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Learners', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Decisions', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Signals', exact: true })).toBeVisible();
}

/** Navigate via sidebar primary nav (avoids breadcrumb/KPI link collisions). */
export async function clickSidebarNav(page: Page, label: string): Promise<void> {
  await page
    .locator('[data-sidebar="sidebar"]')
    .getByRole('link', { name: label, exact: true })
    .click();
}

/** DataTable rows expose role="button" for row click handlers. */
export async function clickDataTableRow(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole('button', { name }).click();
}

export async function waitForDataTableRow(page: Page, name: RegExp | string): Promise<void> {
  await expect(page.getByLabel('Loading table')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name })).toBeVisible({ timeout: 30_000 });
}

export async function expectDetailSheetVisible(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 10_000 });
}

export const E2E_ORG_ID = 'e2e-org';
export const E2E_LEARNER_REF = 'learner-1';
export const E2E_DECISION_ID = 'decision-001';
