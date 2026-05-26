/**
 * Admin Ingestion Preflight Routes
 *
 * Registers POST /ingestion/preflight under the /v1/admin prefix.
 * Auth is enforced by adminApiKeyPreHandler at the admin scope (src/server.ts).
 *
 * @see docs/specs/ingestion-preflight.md
 */

import type { FastifyError, FastifyInstance } from 'fastify';
import { handlePreflightCore } from '../ingestion/preflight-handler-core.js';
import { ErrorCodes } from '../shared/error-codes.js';

const PREFLIGHT_BODY_LIMIT = parseInt(
  process.env.PREFLIGHT_MAX_BODY_BYTES ?? '32768',
  10,
);

export function registerAdminIngestionPreflightRoutes(
  app: FastifyInstance,
): void {
  app.register(async (preflightScope) => {
    preflightScope.setErrorHandler((error: FastifyError, _request, reply) => {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        return reply.status(413).send({
          error: {
            code: ErrorCodes.REQUEST_TOO_LARGE,
            message: 'Preflight body exceeds size limit',
          },
        });
      }
      throw error;
    });

    preflightScope.post('/ingestion/preflight', {
      bodyLimit: PREFLIGHT_BODY_LIMIT,
      handler: async (request, reply) => {
        const result = await handlePreflightCore(request.body, request.log);
        return reply.status(result.statusCode).send(result.body);
      },
    });
  });
}
