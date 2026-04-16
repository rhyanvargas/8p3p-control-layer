import { createHmac, timingSafeEqual } from 'crypto';

/** Session cookie name (path-scoped to `/dashboard`). */
export const SESSION_COOKIE_NAME = 'dp_session';

const HMAC_ALGO = 'sha256';

function base64UrlEncodeUtf8(payloadJson: string): string {
  return Buffer.from(payloadJson, 'utf8').toString('base64url');
}

/**
 * Returns the cookie value: hex(HMAC-SHA256(secret, payloadJson)) + "." + base64url(payloadJson).
 * Payload is `JSON.stringify({ exp })` where `exp` is unix seconds.
 */
export function signSession(secret: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadJson = JSON.stringify({ exp });
  const sigHex = createHmac(HMAC_ALGO, secret).update(payloadJson, 'utf8').digest('hex');
  const payloadB64 = base64UrlEncodeUtf8(payloadJson);
  return `${sigHex}.${payloadB64}`;
}

export function verifySession(
  secret: string,
  value: string
): { valid: boolean; exp?: number } {
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) {
    return { valid: false };
  }
  const sigHex = value.slice(0, dot);
  const payloadB64 = value.slice(dot + 1);
  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return { valid: false };
  }

  let exp: number;
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('exp' in parsed)) {
      return { valid: false };
    }
    const rawExp = (parsed as { exp: unknown }).exp;
    if (typeof rawExp !== 'number' || !Number.isFinite(rawExp)) {
      return { valid: false };
    }
    exp = rawExp;
  } catch {
    return { valid: false };
  }

  const expectedSigHex = createHmac(HMAC_ALGO, secret).update(payloadJson, 'utf8').digest('hex');
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigHex, 'hex');
    expectedBuf = Buffer.from(expectedSigHex, 'hex');
  } catch {
    return { valid: false };
  }
  if (sigBuf.length !== expectedBuf.length) {
    return { valid: false };
  }
  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp <= nowSec) {
    return { valid: false };
  }

  return { valid: true, exp };
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
    path: '/dashboard',
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'strict',
    maxAge: opts.maxAgeSeconds,
  };
}
