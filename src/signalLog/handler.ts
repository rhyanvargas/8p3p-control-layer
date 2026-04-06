/**
 * Signal Log Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SignalLogReadResponse, RejectionReason } from '../shared/types.js';
import { handleSignalLogQueryCore } from './handler-core.js';

interface SignalLogErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

export async function handleSignalLogQuery(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SignalLogReadResponse | SignalLogErrorResponse> {
  const result = await handleSignalLogQueryCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}
