import { NextResponse, type NextRequest } from 'next/server';

import { passphrasesMatch } from '@/lib/auth-credentials';
import {
  assertDashboardAuthConfig,
  getClientIp,
  getCookieSecret,
  getExpectedPassphrase,
  getSessionTtlSeconds,
  isGateEnabled,
} from '@/lib/auth-gate';
import { clearFailures, recordFailure } from '@/lib/login-rate-limiter';
import { RATE_LIMIT_HTML, renderLoginHtml } from '@/lib/login-page';
import {
  buildSetCookieAttributes,
  getSessionCookieName,
  isSecureCookieContext,
} from '@/lib/session-cookie-edge';
import { signSession } from '@/lib/session-cookie';

function gateDisabledResponse(): NextResponse {
  return new NextResponse('Not Found', { status: 404 });
}

function authConfigErrorResponse(): NextResponse {
  return new NextResponse('Invalid dashboard auth configuration', { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!isGateEnabled()) {
    return gateDisabledResponse();
  }

  try {
    assertDashboardAuthConfig();
  } catch {
    return authConfigErrorResponse();
  }

  const showError = request.nextUrl.searchParams.get('error');
  const html =
    showError === '1' || showError === 'true'
      ? renderLoginHtml('Invalid access code')
      : renderLoginHtml();

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  if (!isGateEnabled()) {
    return gateDisabledResponse();
  }

  try {
    assertDashboardAuthConfig();
  } catch {
    return authConfigErrorResponse();
  }

  const expected = getExpectedPassphrase();
  const ip = getClientIp(request);
  const formData = await request.formData();
  const rawPass = formData.get('passphrase');
  const provided = typeof rawPass === 'string' ? rawPass : '';

  if (!passphrasesMatch(provided, expected)) {
    const { blocked, retryAfterSeconds } = recordFailure(ip);
    if (blocked) {
      const headers: HeadersInit = { 'Content-Type': 'text/html; charset=utf-8' };
      if (retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(retryAfterSeconds);
      }
      return new NextResponse(RATE_LIMIT_HTML, { status: 429, headers });
    }
    return new NextResponse(renderLoginHtml('Invalid access code'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  clearFailures(ip);

  const cookieSecret = getCookieSecret();
  const maxAgeSeconds = getSessionTtlSeconds();
  const signed = signSession(cookieSecret, maxAgeSeconds);
  const secure = isSecureCookieContext();
  const cookieName = getSessionCookieName(secure);
  const attrs = buildSetCookieAttributes({ maxAgeSeconds, secure });

  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set({
    name: cookieName,
    value: signed,
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
  });

  return response;
}
