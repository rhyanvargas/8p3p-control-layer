import { createHmac, timingSafeEqual } from 'crypto';

export {
  buildSetCookieAttributes,
  getSessionCookieName,
  HOST_SESSION_COOKIE_NAME,
  isSecureCookieContext,
  readSessionCookieValue,
  SESSION_COOKIE_NAME,
} from '@/lib/session-cookie-edge';

const HMAC_ALGO = 'sha256';

function base64UrlEncodeUtf8(payloadJson: string): string {
  return Buffer.from(payloadJson, 'utf8').toString('base64url');
}

function base64UrlDecodeUtf8(payloadB64: string): string {
  return Buffer.from(payloadB64, 'base64url').toString('utf8');
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

export function verifySession(
  secret: string,
  value: string,
): { valid: boolean; exp?: number } {
  const parts = splitSessionValue(value);
  if (!parts) {
    return { valid: false };
  }

  let payloadJson: string;
  try {
    payloadJson = base64UrlDecodeUtf8(parts.payloadB64);
  } catch {
    return { valid: false };
  }

  const parsed = parsePayloadJson(payloadJson);
  if (!parsed.ok) {
    return { valid: false };
  }

  const expectedSigHex = createHmac(HMAC_ALGO, secret).update(payloadJson, 'utf8').digest('hex');
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(parts.sigHex, 'hex');
    expectedBuf = Buffer.from(expectedSigHex, 'hex');
  } catch {
    return { valid: false };
  }
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (parsed.exp <= nowSec) {
    return { valid: false };
  }

  return { valid: true, exp: parsed.exp };
}
