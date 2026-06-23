/** Legacy cookie name (dev / non-secure contexts). */
export const SESSION_COOKIE_NAME = 'dp_session';

/** Production standalone-app cookie with __Host- prefix (Secure + Path=/, no Domain). */
export const HOST_SESSION_COOKIE_NAME = '__Host-dp_session';

export function isSecureCookieContext(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Resolves the session cookie name for the current deployment context. */
export function getSessionCookieName(secure: boolean = isSecureCookieContext()): string {
  return secure ? HOST_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
}

export function buildSetCookieAttributes(opts: {
  maxAgeSeconds: number;
  secure: boolean;
}): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
} {
  return {
    path: '/',
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'strict',
    maxAge: opts.maxAgeSeconds,
  };
}

export function readSessionCookieValue(
  cookieStore: { get: (name: string) => { value: string } | undefined },
  secure: boolean = isSecureCookieContext(),
): string {
  const primary = getSessionCookieName(secure);
  const primaryValue = cookieStore.get(primary)?.value;
  if (primaryValue) {
    return primaryValue;
  }
  if (secure) {
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? '';
  }
  return '';
}

function splitSessionValue(value: string): { sigHex: string; payloadB64: string } | null {
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) {
    return null;
  }
  return {
    sigHex: value.slice(0, dot),
    payloadB64: value.slice(dot + 1),
  };
}

function base64UrlDecodeUtf8Edge(payloadB64: string): string {
  const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parsePayloadJson(payloadJson: string): { ok: true; exp: number } | { ok: false } {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('exp' in parsed)) {
      return { ok: false };
    }
    const rawExp = (parsed as { exp: unknown }).exp;
    if (typeof rawExp !== 'number' || !Number.isFinite(rawExp)) {
      return { ok: false };
    }
    return { ok: true, exp: rawExp };
  } catch {
    return { ok: false };
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Edge-safe session verification for middleware. */
export async function verifySessionAsync(
  secret: string,
  value: string,
): Promise<{ valid: boolean; exp?: number }> {
  const parts = splitSessionValue(value);
  if (!parts) {
    return { valid: false };
  }

  let payloadJson: string;
  try {
    payloadJson = base64UrlDecodeUtf8Edge(parts.payloadB64);
  } catch {
    return { valid: false };
  }

  const parsed = parsePayloadJson(payloadJson);
  if (!parsed.ok) {
    return { valid: false };
  }

  const expectedSigHex = await hmacSha256Hex(secret, payloadJson);
  if (!timingSafeEqualHex(parts.sigHex, expectedSigHex)) {
    return { valid: false };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (parsed.exp <= nowSec) {
    return { valid: false };
  }

  return { valid: true, exp: parsed.exp };
}
