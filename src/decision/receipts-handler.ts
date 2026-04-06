/**
 * Receipts Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetReceiptsResponse, RejectionReason } from '../shared/types.js';
import { handleGetReceiptsCore } from './handler-core.js';

interface ReceiptErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

export async function handleGetReceipts(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<GetReceiptsResponse | ReceiptErrorResponse> {
  const result = await handleGetReceiptsCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}
