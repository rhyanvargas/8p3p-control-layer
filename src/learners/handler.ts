/**
 * Learners Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { handleLearnerSummaryCore } from './summary-handler-core.js';

export async function handleLearnerSummary(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const { learner_reference } = request.params as { learner_reference: string };
  const params = {
    ...(request.query as Record<string, unknown>),
    learner_reference,
    logWarn: (message: string) => request.log.warn(message),
  };
  const result = await handleLearnerSummaryCore(params);
  reply.status(result.statusCode);
  return result.body;
}
