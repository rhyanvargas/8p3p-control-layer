import { afterEach, describe, expect, it } from 'vitest';

import { getNavMainItemsForPersona, NAV_MAIN_ITEMS } from '@/lib/navigation';
import {
  isDualCodeMode,
  isEducatorRouteAllowed,
  isNavMainItemAllowedForPersona,
  normalizePersona,
} from '@/lib/persona';

const ENV_KEYS = [
  'DASHBOARD_ACCESS_CODE_EDUCATOR',
  'DASHBOARD_ACCESS_CODE_COMPLIANCE',
  'DASHBOARD_ACCESS_CODE',
] as const;

function clearPersonaEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('normalizePersona', () => {
  it('returns educator only for the educator literal', () => {
    expect(normalizePersona('educator')).toBe('educator');
  });

  it('defaults absent or unknown values to compliance', () => {
    expect(normalizePersona(undefined)).toBe('compliance');
    expect(normalizePersona(null)).toBe('compliance');
    expect(normalizePersona('compliance')).toBe('compliance');
    expect(normalizePersona('admin')).toBe('compliance');
  });
});

describe('isDualCodeMode', () => {
  afterEach(() => {
    clearPersonaEnv();
  });

  it('is active when both dual-code env vars are non-empty', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-code';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-code';
    expect(isDualCodeMode()).toBe(true);
  });

  it('is inactive when either dual-code var is missing or empty', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-code';
    expect(isDualCodeMode()).toBe(false);

    clearPersonaEnv();
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-code';
    expect(isDualCodeMode()).toBe(false);

    clearPersonaEnv();
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = '   ';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-code';
    expect(isDualCodeMode()).toBe(false);
  });
});

describe('isEducatorRouteAllowed', () => {
  it('allows educator surface routes and proxy paths', () => {
    expect(isEducatorRouteAllowed('/')).toBe(true);
    expect(isEducatorRouteAllowed('/attention')).toBe(true);
    expect(isEducatorRouteAllowed('/learners')).toBe(true);
    expect(isEducatorRouteAllowed('/learners/learner-1')).toBe(true);
    expect(isEducatorRouteAllowed('/settings')).toBe(true);
    expect(isEducatorRouteAllowed('/api/control/v1/decisions')).toBe(true);
  });

  it('blocks compliance-only routes', () => {
    expect(isEducatorRouteAllowed('/decisions')).toBe(false);
    expect(isEducatorRouteAllowed('/signals')).toBe(false);
    expect(isEducatorRouteAllowed('/signals/upload')).toBe(false);
    expect(isEducatorRouteAllowed('/reports')).toBe(false);
    expect(isEducatorRouteAllowed('/policies/builder')).toBe(false);
  });
});

describe('isNavMainItemAllowedForPersona', () => {
  it('allows all main nav items for compliance', () => {
    for (const item of NAV_MAIN_ITEMS) {
      expect(isNavMainItemAllowedForPersona(item.href, 'compliance')).toBe(true);
    }
  });

  it('allows only Overview, Attention, and Learners for educator', () => {
    expect(isNavMainItemAllowedForPersona('/', 'educator')).toBe(true);
    expect(isNavMainItemAllowedForPersona('/attention', 'educator')).toBe(true);
    expect(isNavMainItemAllowedForPersona('/learners', 'educator')).toBe(true);
    expect(isNavMainItemAllowedForPersona('/decisions', 'educator')).toBe(false);
    expect(isNavMainItemAllowedForPersona('/signals', 'educator')).toBe(false);
    expect(isNavMainItemAllowedForPersona('/reports', 'educator')).toBe(false);
  });
});

describe('getNavMainItemsForPersona', () => {
  it('returns three educator nav items', () => {
    const items = getNavMainItemsForPersona('educator');
    expect(items.map((item) => item.title)).toEqual(['Overview', 'Attention', 'Learners']);
  });

  it('returns full nav for compliance', () => {
    const items = getNavMainItemsForPersona('compliance');
    expect(items.map((item) => item.title)).toEqual([
      'Overview',
      'Attention',
      'Learners',
      'Decisions',
      'Signals',
      'Reports',
    ]);
  });
});
