/**
 * NXMIG-006/007/008/010 — passphrase gate (Next middleware + login routes)
 * @see docs/specs/nextjs-amplify-dashboard-migration.md § Contract Tests
 */
/* global Headers */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { _resetForTest } from '@/lib/login-rate-limiter';
import {
  signSession as signDashboardSession,
} from '@/lib/session-cookie';

const SECRET = '01234567890123456789012345678901';
const PASSPHRASE = 'correct-access-code';

let savedEnv: Record<string, string | undefined>;

function setGateEnv(enabled: boolean): void {
  if (enabled) {
    process.env.DASHBOARD_ACCESS_CODE = PASSPHRASE;
    process.env.COOKIE_SECRET = SECRET;
  } else {
    delete process.env.DASHBOARD_ACCESS_CODE;
    delete process.env.COOKIE_SECRET;
  }
}

async function loadLoginHandlers() {
  vi.resetModules();
  const mod = await import('../../dashboard/app/(auth)/login/route.ts');
  return mod;
}

async function loadMiddleware() {
  vi.resetModules();
  const mod = await import('../../dashboard/middleware.ts');
  return mod.middleware;
}

function nextRequest(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): NextRequest {
  const headers = new Headers(init?.headers);
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  });
}

describe('dashboard passphrase gate (NXMIG-006…010)', () => {
  beforeEach(() => {
    savedEnv = { ...process.env };
    _resetForTest();
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = savedEnv;
    _resetForTest();
    vi.restoreAllMocks();
  });

  it('NXMIG-006: gate on without cookie redirects to /login', async () => {
    setGateEnv(true);
    const middleware = await loadMiddleware();
    const response = await middleware(nextRequest('http://dashboard.test/'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://dashboard.test/login');
  });

  it('NXMIG-007: valid passphrase POST sets dp_session and redirects to /', async () => {
    setGateEnv(true);
    const { POST } = await loadLoginHandlers();

    const response = await POST(
      nextRequest('http://dashboard.test/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `passphrase=${encodeURIComponent(PASSPHRASE)}`,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://dashboard.test/');

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/dp_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
  });

  it('NXMIG-008: invalid passphrase returns 200 with error and no cookie', async () => {
    setGateEnv(true);
    const { POST } = await loadLoginHandlers();

    const response = await POST(
      nextRequest('http://dashboard.test/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'passphrase=wrong-code',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Invalid access code');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('NXMIG-010: gate disabled serves dashboard without redirect', async () => {
    setGateEnv(false);
    const middleware = await loadMiddleware();
    const response = await middleware(nextRequest('http://dashboard.test/'));

    expect(response.status).not.toBe(302);
    expect(response.headers.get('location')).toBeNull();
  });

  it('NXMIG-006: valid session cookie passes middleware', async () => {
    setGateEnv(true);
    const signed = signDashboardSession(SECRET, 3600);
    const middleware = await loadMiddleware();
    const response = await middleware(
      nextRequest('http://dashboard.test/learners', {
        headers: { cookie: `dp_session=${signed}` },
      }),
    );

    expect(response.status).not.toBe(302);
  });
});
