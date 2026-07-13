import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertDashboardAuthConfig,
  isGateEnabled,
  resetAuthConfigWarningsForTests,
  resolvePersonaFromPassphrase,
} from '@/lib/auth-gate';

const ENV_KEYS = [
  'DASHBOARD_ACCESS_CODE_EDUCATOR',
  'DASHBOARD_ACCESS_CODE_COMPLIANCE',
  'DASHBOARD_ACCESS_CODE',
  'COOKIE_SECRET',
] as const;

function clearPassphraseEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  resetAuthConfigWarningsForTests();
}

describe('resolvePersonaFromPassphrase', () => {
  afterEach(() => {
    clearPassphraseEnv();
  });

  it('maps educator and compliance codes in dual-code mode', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';

    expect(resolvePersonaFromPassphrase('teacher-secret')).toBe('educator');
    expect(resolvePersonaFromPassphrase('admin-secret')).toBe('compliance');
    expect(resolvePersonaFromPassphrase('wrong-code')).toBeNull();
  });

  it('accepts legacy code as compliance alias when dual-code mode is active', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';

    expect(resolvePersonaFromPassphrase('legacy-shared')).toBe('compliance');
  });

  it('prefers dual codes over legacy when values collide', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'shared-code';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    process.env.DASHBOARD_ACCESS_CODE = 'shared-code';

    expect(resolvePersonaFromPassphrase('shared-code')).toBe('educator');
  });

  it('grants compliance persona for legacy single-code mode', () => {
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';

    expect(resolvePersonaFromPassphrase('legacy-shared')).toBe('compliance');
    expect(resolvePersonaFromPassphrase('teacher-secret')).toBeNull();
  });
});

describe('assertDashboardAuthConfig', () => {
  afterEach(() => {
    clearPassphraseEnv();
    vi.restoreAllMocks();
  });

  it('warns once when dual-code mode and legacy code are both set', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';
    process.env.COOKIE_SECRET = 'a'.repeat(32);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertDashboardAuthConfig();
    assertDashboardAuthConfig();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/DASHBOARD_ACCESS_CODE is treated as a compliance alias/i);
  });

  it('does not warn when only dual codes are set', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    process.env.COOKIE_SECRET = 'a'.repeat(32);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertDashboardAuthConfig();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('isGateEnabled', () => {
  afterEach(() => {
    clearPassphraseEnv();
  });

  it('is enabled in dual-code mode without legacy code', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    expect(isGateEnabled()).toBe(true);
  });

  it('is enabled with legacy single code only', () => {
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';
    expect(isGateEnabled()).toBe(true);
  });

  it('is disabled when no passphrases are configured', () => {
    expect(isGateEnabled()).toBe(false);
  });
});
