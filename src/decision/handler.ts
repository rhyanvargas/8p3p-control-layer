/**
 * Decision Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetDecisionsResponse, RejectionReason } from '../shared/types.js';
import { handleGetDecisionsCore } from './handler-core.js';

interface DecisionErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

export async function handleGetDecisions(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<GetDecisionsResponse | DecisionErrorResponse> {
  const result = await handleGetDecisionsCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}
