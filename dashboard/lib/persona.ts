/** Session persona for D5 route/nav allowlists — see docs/specs/dashboard-passphrase-gate.md */
export type DashboardPersona = 'educator' | 'compliance';

const EDUCATOR_MAIN_HREFS: ReadonlySet<string> = new Set(['/', '/attention', '/learners']);

/** Educator sessions without an explicit persona field default to compliance (backward compatible). */
export function normalizePersona(raw?: string | null): DashboardPersona {
  return raw === 'educator' ? 'educator' : 'compliance';
}

export function isDualCodeMode(): boolean {
  const educator = process.env.DASHBOARD_ACCESS_CODE_EDUCATOR?.trim() ?? '';
  const compliance = process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE?.trim() ?? '';
  return educator.length > 0 && compliance.length > 0;
}

/** Educator-allowed page routes (prefix match). See dashboard-passphrase-gate.md § Route allowlists. */
export function isEducatorRouteAllowed(pathname: string): boolean {
  if (pathname.startsWith('/api/control')) {
    return true;
  }
  if (pathname === '/' || pathname === '/attention' || pathname === '/settings') {
    return true;
  }
  if (pathname === '/learners' || pathname.startsWith('/learners/')) {
    return true;
  }
  return false;
}

export function isNavMainItemAllowedForPersona(href: string, persona: DashboardPersona): boolean {
  if (persona === 'compliance') {
    return true;
  }
  return EDUCATOR_MAIN_HREFS.has(href);
}
