import { NextResponse, type NextRequest } from 'next/server';

import {
  assertDashboardAuthConfig,
  getCookieSecret,
  isGateEnabled,
  pathnameOnly,
  shouldGatePath,
} from '@/lib/auth-gate';
import {
  isSecureCookieContext,
  readSessionCookieValue,
  verifySessionAsync,
} from '@/lib/session-cookie-edge';

export async function middleware(request: NextRequest) {
  if (!isGateEnabled()) {
    return NextResponse.next();
  }

  const pathname = pathnameOnly(request.nextUrl.pathname);
  if (!shouldGatePath(pathname)) {
    return NextResponse.next();
  }

  try {
    assertDashboardAuthConfig();
  } catch {
    return new NextResponse('Invalid dashboard auth configuration', { status: 500 });
  }

  const secret = getCookieSecret();
  const sessionValue = readSessionCookieValue(request.cookies, isSecureCookieContext());

  if (!sessionValue) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl, 302);
  }

  const { valid } = await verifySessionAsync(secret, sessionValue);
  if (!valid) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl, 302);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
