/**
 * Learners Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  handleLearnerSummaryCore,
  learnerSummaryRequestLog,
} from './summary-handler-core.js';

export async function handleLearnerSummary(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const { learner_reference } = request.params as { learner_reference: string };
  const query = request.query as Record<string, unknown>;
  const params = {
    ...query,
    learner_reference,
    logWarn: (message: string) => request.log.warn(message),
  };
  const startedAt = Date.now();
  const result = await handleLearnerSummaryCore(params);
  request.log.info(
    learnerSummaryRequestLog({
      org_id: typeof query.org_id === 'string' ? query.org_id : '',
      learner_reference,
      duration_ms: Date.now() - startedAt,
      statusCode: result.statusCode,
    })
  );
  reply.status(result.statusCode);
  return result.body;
}
