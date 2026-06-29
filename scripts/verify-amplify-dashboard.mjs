#!/usr/bin/env node
/**
 * Post-deploy smoke for Amplify-hosted Decision Panel (passphrase gate + proxy readiness).
 *
 * Usage:
 *   DASHBOARD_URL=https://main.dxxxx.amplifyapp.com \
 *   DASHBOARD_ACCESS_CODE=your-passphrase \
 *   npm run amplify:verify-dashboard
 *
 * @see docs/guides/operators/aws-pilot-runbook.md § 4.2
 * @see docs/guides/operators/pilot-readiness-gates.md § Decision Panel
 */
const dashboardUrl = process.env.DASHBOARD_URL?.trim().replace(/\/$/, '');
const accessCode = process.env.DASHBOARD_ACCESS_CODE?.trim();

function fail(message) {
  console.error(`verify-amplify-dashboard: FAIL — ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify-amplify-dashboard: PASS — ${message}`);
}

if (!dashboardUrl) {
  fail('Set DASHBOARD_URL (Amplify default domain, no trailing slash).');
}
if (!accessCode) {
  fail('Set DASHBOARD_ACCESS_CODE (same value as Amplify env var).');
}

/** @param {string} path */
function url(path) {
  return `${dashboardUrl}${path}`;
}

/** @param {Response} response */
function cookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().join('; ');
  }
  return response.headers.get('set-cookie') ?? '';
}

/** @param {string} setCookie */
function extractSessionCookie(setCookie) {
  const hostMatch = setCookie.match(/__Host-dp_session=([^;]+)/);
  if (hostMatch) {
    return `__Host-dp_session=${hostMatch[1]}`;
  }
  const legacyMatch = setCookie.match(/dp_session=([^;]+)/);
  if (legacyMatch) {
    return `dp_session=${legacyMatch[1]}`;
  }
  return '';
}

async function main() {
  // Gate: unauthenticated root → /login
  const rootResponse = await fetch(url('/'), { redirect: 'manual' });
  if (rootResponse.status !== 302) {
    fail(`GET / expected 302 redirect, got ${rootResponse.status}`);
  }
  const location = rootResponse.headers.get('location') ?? '';
  if (!location.includes('/login')) {
    fail(`GET / redirect location expected /login, got ${location}`);
  }
  pass('Unauthenticated GET / redirects to /login');

  // Login page reachable
  const loginGet = await fetch(url('/login'));
  if (loginGet.status !== 200) {
    fail(`GET /login expected 200, got ${loginGet.status}`);
  }
  const loginHtml = await loginGet.text();
  if (!loginHtml.includes('Access Code')) {
    fail('GET /login body missing Access Code field');
  }
  pass('GET /login returns login form');

  // Wrong passphrase → no session cookie
  const badLogin = await fetch(url('/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase: 'definitely-wrong-code' }),
    redirect: 'manual',
  });
  if (badLogin.status !== 200) {
    fail(`POST /login (bad passphrase) expected 200, got ${badLogin.status}`);
  }
  if (cookieHeader(badLogin).includes('dp_session')) {
    fail('POST /login (bad passphrase) must not set dp_session');
  }
  pass('Invalid passphrase does not mint session cookie');

  // Valid passphrase → Overview
  const goodLogin = await fetch(url('/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase: accessCode }),
    redirect: 'manual',
  });
  if (goodLogin.status !== 303 && goodLogin.status !== 302) {
    fail(`POST /login (valid) expected 303/302, got ${goodLogin.status}`);
  }
  const setCookie = cookieHeader(goodLogin);
  const sessionCookie = extractSessionCookie(setCookie);
  if (!sessionCookie) {
    fail('POST /login (valid) missing dp_session / __Host-dp_session Set-Cookie');
  }
  pass('Valid passphrase mints session cookie');

  const redirectLoc = goodLogin.headers.get('location') ?? '';
  if (!redirectLoc.endsWith('/') && !redirectLoc.endsWith(dashboardUrl)) {
    fail(`POST /login redirect expected dashboard root, got ${redirectLoc}`);
  }

  const overview = await fetch(url('/'), {
    headers: { cookie: sessionCookie },
    redirect: 'manual',
  });
  if (overview.status !== 200) {
    fail(`GET / with session expected 200, got ${overview.status}`);
  }
  pass('Authenticated GET / lands on Overview (200)');

  // Proxy route gated (no cookie → redirect)
  const proxyNoAuth = await fetch(url('/api/control/v1/state/list'), { redirect: 'manual' });
  if (proxyNoAuth.status !== 302) {
    fail(`GET /api/control/* without cookie expected 302, got ${proxyNoAuth.status}`);
  }
  pass('Unauthenticated proxy request is gated');

  console.log('');
  console.log('All dashboard gate checks passed.');
  console.log('Manual follow-up: confirm Overview/Attention render live data in browser.');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
