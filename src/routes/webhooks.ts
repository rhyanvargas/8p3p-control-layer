/**
 * Webhook Routes — POST /webhooks/:source_system
 *
 * Registered under /v1 scope (tenant API key auth, not admin).
 * @see docs/specs/webhook-adapters.md
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { handleWebhookCore } from '../ingestion/webhook-handler-core.js';

interface WebhookParams {
  source_system: string;
}

export function registerWebhookRoutes(app: FastifyInstance): void {
  const bodyLimit = parseInt(process.env.WEBHOOK_BODY_LIMIT ?? '1048576', 10);

  app.post<{ Params: WebhookParams }>(
    '/webhooks/:source_system',
    { bodyLimit },
    async (request: FastifyRequest<{ Params: WebhookParams }>, reply: FastifyReply) => {
      const { source_system } = request.params;
      const orgId = process.env.API_KEY_ORG_ID ?? '';

      const result = await handleWebhookCore({
        orgId,
        sourceSystem: source_system,
        body: request.body,
        log: request.log,
      });

      if (result.statusCode === 204) {
        return reply.status(204).send();
      }

      return reply.status(result.statusCode).send(result.body);
    },
  );
}
