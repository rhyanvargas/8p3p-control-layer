/**
 * State Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LearnerState } from '../shared/types.js';
import { handleStateQueryCore, handleStateListQueryCore } from './handler-core.js';

interface StateErrorResponse { code: string; message: string; field_path?: string; }

export async function handleStateQuery(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<LearnerState | StateErrorResponse> {
  const result = await handleStateQueryCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}

export async function handleStateListQuery(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ org_id: string; learners: Array<{ learner_reference: string; state_version: number; updated_at: string }>; next_cursor: string | null } | StateErrorResponse> {
  const result = await handleStateListQueryCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}
