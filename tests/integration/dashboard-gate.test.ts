import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDashboardLoginRoutes } from '../../src/auth/dashboard-login.js';
import { dashboardGatePreHandler } from '../../src/auth/dashboard-gate.js';
import { signSession } from '../../src/auth/session-cookie.js';
import { _resetForTest } from '../../src/auth/login-rate-limiter.js';

const SECRET = '01234567890123456789012345678901';

let savedAccess: string | undefined;
let savedCookieSecret: string | undefined;
let savedTtl: string | undefined;
let savedNodeEnv: string | undefined;

function saveEnv(): void {
  savedAccess = process.env.DASHBOARD_ACCESS_CODE;
  savedCookieSecret = process.env.COOKIE_SECRET;
  savedTtl = process.env.DASHBOARD_SESSION_TTL_HOURS;
  savedNodeEnv = process.env.NODE_ENV;
}

function restoreEnv(): void {
  if (savedAccess === undefined) {
    delete process.env.DASHBOARD_ACCESS_CODE;
  } else {
    process.env.DASHBOARD_ACCESS_CODE = savedAccess;
  }
  if (savedCookieSecret === undefined) {
    delete process.env.COOKIE_SECRET;
  } else {
    process.env.COOKIE_SECRET = savedCookieSecret;
  }
  if (savedTtl === undefined) {
    delete process.env.DASHBOARD_SESSION_TTL_HOURS;
  } else {
    process.env.DASHBOARD_SESSION_TTL_HOURS = savedTtl;
  }
  if (savedNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = savedNodeEnv;
  }
}

async function buildTestApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(formbody);
  registerDashboardLoginRoutes(app);
  app.get(
    '/dashboard',
    { preHandler: dashboardGatePreHandler },
    async (_req, reply) => reply.redirect('/dashboard/')
  );
  await app.register(async (scope) => {
    scope.addHook('preHandler', dashboardGatePreHandler);
    scope.get('/', async () => 'SPA');
    scope.get('/*', async () => 'SPA');
  }, { prefix: '/dashboard/' });
  await app.ready();
  return app;
}

describe('dashboard passphrase gate', () => {
  beforeEach(() => {
    saveEnv();
    _resetForTest();
  });

  afterEach(() => {
    restoreEnv();
    _resetForTest();
  });

  it('GATE-001: /dashboard/ without cookie returns 302 to /dashboard/login', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
    await app.close();
  });

  it('GATE-002: POST valid passphrase returns 302 to /dashboard with Set-Cookie', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    process.env.NODE_ENV = 'test';
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      payload: 'passphrase=correct',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(raw).toMatch(/dp_session=/);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/dashboard/i);
    await app.close();
  });

  it('GATE-003: POST invalid passphrase returns 200 with error and no Set-Cookie', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      payload: 'passphrase=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Invalid access code');
    expect(res.headers['set-cookie']).toBeUndefined();
    await app.close();
  });

  it('GATE-004: /dashboard/ with valid cookie returns SPA', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const signed = signSession(SECRET, 3600);
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/',
      headers: { cookie: `dp_session=${signed}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('SPA');
    await app.close();
  });

  it('GATE-005: expired cookie returns 302 to /dashboard/login', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const signed = signSession(SECRET, -60);
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/',
      headers: { cookie: `dp_session=${signed}` },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
    await app.close();
  });

  it('GATE-006: gate disabled returns 200 on /dashboard/', async () => {
    delete process.env.DASHBOARD_ACCESS_CODE;
    delete process.env.COOKIE_SECRET;
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('GATE-010: sixth failed login within window returns 429', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const app = await buildTestApp();
    for (let i = 0; i < 5; i += 1) {
      const r = await app.inject({
        method: 'POST',
        url: '/dashboard/login',
        payload: 'passphrase=wrong',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      expect(r.statusCode).toBe(200);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      payload: 'passphrase=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('GATE-011: GET /dashboard/logout clears cookie and redirects', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/logout' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(raw).toMatch(/dp_session=/i);
    expect(raw).toMatch(/Max-Age=0|Expires=/i);
    await app.close();
  });

  it('GATE-001b: GET /dashboard (no trailing slash) without cookie redirects straight to /dashboard/login', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
    await app.close();
  });

  it('GATE-001c: GET /dashboard (no trailing slash) with valid cookie normalizes to /dashboard/', async () => {
    process.env.DASHBOARD_ACCESS_CODE = 'correct';
    process.env.COOKIE_SECRET = SECRET;
    const signed = signSession(SECRET, 3600);
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { cookie: `dp_session=${signed}` },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/');
    await app.close();
  });

  it('GATE-011b: GET /dashboard/logout with gate disabled redirects to /dashboard/ (not to 404 login)', async () => {
    delete process.env.DASHBOARD_ACCESS_CODE;
    delete process.env.COOKIE_SECRET;
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/logout' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/');
    await app.close();
  });
});
