import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../../src/auth/session-cookie.js';

const SECRET = '01234567890123456789012345678901';

describe('session cookie', () => {
  it('GATE-007: sign/verify round-trip returns valid session with future exp', () => {
    const signed = signSession(SECRET, 3600);
    const result = verifySession(SECRET, signed);
    expect(result.valid).toBe(true);
    expect(result.exp).toBeDefined();
    const now = Math.floor(Date.now() / 1000);
    expect(result.exp!).toBeGreaterThan(now + 3500);
    expect(result.exp!).toBeLessThanOrEqual(now + 3601);
  });

  it('GATE-008: expired cookie is rejected', () => {
    const signed = signSession(SECRET, -60);
    const result = verifySession(SECRET, signed);
    expect(result.valid).toBe(false);
  });

  it('GATE-009: tampered payload or wrong secret is rejected', () => {
    const signed = signSession(SECRET, 3600);
    const parts = signed.split('.');
    expect(parts.length).toBe(2);
    const payloadB64 = parts[1]!;
    const c0 = payloadB64[0] ?? '';
    const alt = c0 === 'A' ? 'B' : 'A';
    const flipped = `${alt}${payloadB64.slice(1)}`;
    const tampered = `${parts[0]}.${flipped}`;
    expect(verifySession(SECRET, tampered).valid).toBe(false);

    expect(verifySession('01234567890123456789012345678902', signed).valid).toBe(false);
  });
});
