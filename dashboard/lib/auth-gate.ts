import type { NextRequest } from 'next/server';

import { passphrasesMatch } from '@/lib/auth-credentials';
import { isDualCodeMode, type DashboardPersona } from '@/lib/persona';

/** Paths exempt from the passphrase gate (Next standalone app routes). */
export const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set<string>(['/login', '/logout']);

export function isGateEnabled(): boolean {
  if (isDualCodeMode()) {
    return true;
  }
  const code = process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '';
  return code.length > 0;
}

export function assertDashboardAuthConfig(): void {
  if (!isGateEnabled()) {
    return;
  }
  const secret = process.env.COOKIE_SECRET ?? '';
  if (!secret || secret.length < 32) {
    throw new Error(
      'Dashboard access code is set but COOKIE_SECRET is missing or shorter than 32 characters. Generate with: openssl rand -hex 32',
    );
  }
}

/**
 * Resolves login persona from passphrase. Dual-code mode tries educator then compliance codes;
 * legacy single-code mode grants compliance. Returns null when no code matches.
 */
export function resolvePersonaFromPassphrase(provided: string): DashboardPersona | null {
  const educatorCode = process.env.DASHBOARD_ACCESS_CODE_EDUCATOR?.trim() ?? '';
  const complianceCode = process.env.DASHBOARD_ACCESS_CODE_COMPLIANCE?.trim() ?? '';
  const legacyCode = process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '';

  if (isDualCodeMode()) {
    if (passphrasesMatch(provided, educatorCode)) {
      return 'educator';
    }
    if (passphrasesMatch(provided, complianceCode)) {
      return 'compliance';
    }
    return null;
  }

  if (legacyCode.length > 0 && passphrasesMatch(provided, legacyCode)) {
    return 'compliance';
  }

  return null;
}

export function getCookieSecret(): string {
  return process.env.COOKIE_SECRET ?? '';
}

export function getSessionTtlSeconds(): number {
  const ttlHours = Number(process.env.DASHBOARD_SESSION_TTL_HOURS ?? 8);
  const ttlHoursSafe = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 8;
  return Math.floor(ttlHoursSafe * 3600);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }
  return '127.0.0.1';
}

export function pathnameOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function shouldGatePath(pathname: string): boolean {
  if (AUTH_EXEMPT_PATHS.has(pathname)) {
    return false;
  }
  if (pathname.startsWith('/api/control')) {
    return true;
  }
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return false;
  }
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)) {
    return false;
  }
  return true;
}
