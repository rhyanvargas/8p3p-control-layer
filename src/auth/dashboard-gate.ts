import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME, verifySession } from './session-cookie.js';

function isGateEnabled(): boolean {
  const code = process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '';
  return code.length > 0;
}

/**
 * Paths under `/dashboard` that bypass the session gate.
 *
 * Exported for integration-test assertions; see `tests/integration/dashboard-gate.test.ts`.
 * This is an implementation detail of the gate and not part of any public module surface —
 * consumers outside `src/auth/` should not import it.
 *
 * Spec reference: `docs/specs/dashboard-passphrase-gate.md` § Requirements (FR-7) and
 * § Implementation Notes ("Gate exempt paths").
 *
 * @internal
 */
export const DASHBOARD_LOGIN_EXEMPT_PATHS: ReadonlySet<string> = new Set<string>([
  '/dashboard/login',
  '/dashboard/logout',
]);

function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export async function dashboardGatePreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isGateEnabled()) {
    return;
  }

  const pathname = pathOnly(request.raw.url ?? request.url);
  if (DASHBOARD_LOGIN_EXEMPT_PATHS.has(pathname)) {
    return;
  }

  const secret = process.env.COOKIE_SECRET ?? '';
  if (!secret || secret.length < 32) {
    request.log.error('COOKIE_SECRET missing or too short while DASHBOARD_ACCESS_CODE is set');
    throw new Error('Invalid dashboard auth configuration');
  }

  const raw = request.cookies?.[SESSION_COOKIE_NAME];
  const value = typeof raw === 'string' ? raw : '';
  if (!value) {
    return reply.redirect('/dashboard/login', 302);
  }

  const { valid } = verifySession(secret, value);
  if (!valid) {
    return reply.redirect('/dashboard/login', 302);
  }
}
