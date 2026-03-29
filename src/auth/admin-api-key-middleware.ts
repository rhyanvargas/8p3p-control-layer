/**
 * Admin API Key Middleware (v1.1)
 *
 * Fastify preHandler that validates x-admin-api-key header on /v1/admin/* requests.
 * - When ADMIN_API_KEY env is set: rejects missing/invalid keys with 401.
 * - When ADMIN_API_KEY is unset: rejects all requests (fail-closed for admin routes).
 *   Override this for local dev by setting ADMIN_API_KEY in .env.local.
 *
 * A valid tenant x-api-key is NOT sufficient — this handler runs exclusively
 * for the /v1/admin scope and never checks the tenant API_KEY env var.
 *
 * @see docs/specs/policy-management-api.md §Auth
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sendUnauthorized(reply: FastifyReply): void {
  void reply.status(401).send({
    error: {
      code: ErrorCodes.ADMIN_KEY_REQUIRED,
      message: 'Admin API key required. Provide x-admin-api-key header.',
    },
  });
}

/**
 * Fastify preHandler: validate x-admin-api-key for /v1/admin routes.
 * Fail-closed: if ADMIN_API_KEY env is unset, all admin requests are rejected.
 */
export async function adminApiKeyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const adminKey = process.env.ADMIN_API_KEY;

  // Fail-closed: reject if ADMIN_API_KEY is not configured
  if (!adminKey || adminKey.trim() === '') {
    sendUnauthorized(reply);
    return;
  }

  const provided = request.headers['x-admin-api-key'];
  if (!provided) {
    sendUnauthorized(reply);
    return;
  }

  const keyStr = typeof provided === 'string' ? provided : (provided[0] ?? '');
  if (!keysMatch(keyStr, adminKey)) {
    sendUnauthorized(reply);
    return;
  }
}
