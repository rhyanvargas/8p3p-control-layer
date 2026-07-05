import { cookies } from 'next/headers';

import { getCookieSecret, isGateEnabled } from '@/lib/auth-gate';
import { normalizePersona, type DashboardPersona } from '@/lib/persona';
import {
  isSecureCookieContext,
  readSessionCookieValue,
  verifySessionAsync,
} from '@/lib/session-cookie-edge';

/** Reads the signed session persona for server components and route handlers. */
export async function getDashboardPersona(): Promise<DashboardPersona> {
  if (!isGateEnabled()) {
    return 'compliance';
  }

  const cookieStore = await cookies();
  const sessionValue = readSessionCookieValue(cookieStore, isSecureCookieContext());
  if (!sessionValue) {
    return 'compliance';
  }

  const secret = getCookieSecret();
  if (!secret) {
    return 'compliance';
  }

  const { valid, persona } = await verifySessionAsync(secret, sessionValue);
  if (!valid) {
    return 'compliance';
  }

  return normalizePersona(persona);
}
