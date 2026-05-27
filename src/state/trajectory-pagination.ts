/**
 * Trajectory page_token encode/decode helpers.
 * Mirrors the pattern in src/signalLog/store.ts but returns null on
 * malformed tokens so the handler can emit invalid_page_token 400.
 */

export function encodeTrajectoryPageToken(cursorVersion: number): string {
  return Buffer.from(`v1:${cursorVersion}`).toString('base64url');
}

export function decodeTrajectoryPageToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    if (!decoded.startsWith('v1:')) return null;
    const n = parseInt(decoded.substring(3), 10);
    if (isNaN(n) || n < 0) return null;
    return n;
  } catch {
    return null;
  }
}
