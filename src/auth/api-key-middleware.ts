/**
 * API Key Middleware (v1 pilot)
 *
 * Fastify preHandler that validates x-api-key header on /v1/* requests.
 * When API_KEY env is set: rejects missing/invalid keys with 401.
 * When API_KEY_ORG_ID is set: overrides request org_id with that value.
 * When API_KEY is unset: no-op (local dev, backward compatible).
 *
 * @see docs/specs/api-key-middleware.md
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';

/**
 * Constant-time comparison of API key. Returns true only if lengths match and
 * bytes are equal. Length mismatch is treated as invalid (prevents timing leak).
 */
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Fastify preHandler: validate x-api-key, optionally override org_id.
 * Register on /v1 scope. Exempt routes (/, /health, /docs) are outside that scope.
 */
export async function apiKeyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = process.env.API_KEY;
  const orgOverride = process.env.API_KEY_ORG_ID;

  if (!apiKey || apiKey.trim() === '') {
    return; // Auth disabled
  }

  const providedKey = request.headers['x-api-key'];
  if (providedKey === undefined || providedKey === null) {
    return reply.status(401).send({
      code: ErrorCodes.API_KEY_REQUIRED,
      message: 'API key required. Provide x-api-key header.',
    });
  }

  const keyStr = typeof providedKey === 'string' ? providedKey : providedKey[0] ?? '';
  if (!keysMatch(keyStr, apiKey)) {
    return reply.status(401).send({
      code: ErrorCodes.API_KEY_INVALID,
      message: 'Invalid API key.',
    });
  }

  // Valid key. Override org_id if configured.
  if (orgOverride && orgOverride.trim() !== '') {
    if (request.method === 'POST' && request.body && typeof request.body === 'object') {
      (request.body as Record<string, unknown>).org_id = orgOverride;
    } else if (request.method === 'GET' && request.query && typeof request.query === 'object') {
      (request.query as Record<string, unknown>).org_id = orgOverride;
    }
  }
}
