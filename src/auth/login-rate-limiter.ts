const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Entry = { count: number; windowStart: number };

const failures = new Map<string, Entry>();

/**
 * Record a failed login attempt for `ip`. Returns whether the IP is blocked and optional Retry-After seconds.
 */
export function recordFailure(ip: string, now: number = Date.now()): {
  blocked: boolean;
  retryAfterSeconds?: number;
} {
  let entry = failures.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    failures.set(ip, entry);
  }

  entry.count += 1;
  if (entry.count > MAX_FAILURES) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { blocked: true, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }
  return { blocked: false };
}

/** Clears failure count for `ip` (e.g. after successful login). */
export function clearFailures(ip: string): void {
  failures.delete(ip);
}

/** @internal Clears all rate-limit state (integration tests). */
export function _resetForTest(): void {
  failures.clear();
}
