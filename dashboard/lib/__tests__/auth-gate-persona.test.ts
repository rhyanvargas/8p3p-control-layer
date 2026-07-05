import { afterEach, describe, expect, it } from 'vitest';

import { isGateEnabled, resolvePersonaFromPassphrase } from '@/lib/auth-gate';

const ENV_KEYS = [
  'DASHBOARD_ACCESS_CODE_EDUCATOR',
  'DASHBOARD_ACCESS_CODE_COMPLIANCE',
  'DASHBOARD_ACCESS_CODE',
] as const;

function clearPassphraseEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
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

  it('ignores legacy code when dual-code mode is active', () => {
    process.env.DASHBOARD_ACCESS_CODE_EDUCATOR = 'teacher-secret';
    process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE = 'admin-secret';
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';

    expect(resolvePersonaFromPassphrase('legacy-shared')).toBeNull();
  });

  it('grants compliance persona for legacy single-code mode', () => {
    process.env.DASHBOARD_ACCESS_CODE = 'legacy-shared';

    expect(resolvePersonaFromPassphrase('legacy-shared')).toBe('compliance');
    expect(resolvePersonaFromPassphrase('teacher-secret')).toBeNull();
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
