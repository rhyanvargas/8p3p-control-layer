import { NextResponse, type NextRequest } from 'next/server';

import { isGateEnabled } from '@/lib/auth-gate';
import {
  buildSetCookieAttributes,
  FB_SESSION_COOKIE_NAME,
  getSessionCookieName,
  HOST_SESSION_COOKIE_NAME,
  isSecureCookieContext,
  SESSION_COOKIE_NAME,
} from '@/lib/session-cookie-edge';

function clearSessionCookies(response: NextResponse, secure: boolean): void {
  const attrs = buildSetCookieAttributes({ maxAgeSeconds: 0, secure });
  const clearOpts = {
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite as 'strict',
    path: attrs.path,
    maxAge: 0,
  };

  response.cookies.set({ name: getSessionCookieName(secure), value: '', ...clearOpts });
  response.cookies.set({ name: FB_SESSION_COOKIE_NAME, value: '', ...clearOpts });

  // Clear alternate cookie names that may exist from prior sessions.
  if (secure) {
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', ...clearOpts });
  } else {
    response.cookies.set({ name: HOST_SESSION_COOKIE_NAME, value: '', ...clearOpts });
  }
}

async function handleLogout(request: NextRequest) {
  const secure = isSecureCookieContext();
  const destination = isGateEnabled() ? '/login' : '/';
  const response = NextResponse.redirect(new URL(destination, request.url), 302);
  clearSessionCookies(response, secure);
  return response;
}

export async function GET(request: NextRequest) {
  return handleLogout(request);
}

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
