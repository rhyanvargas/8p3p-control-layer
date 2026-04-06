/**
 * Ingestion Log Handler — thin Fastify wrapper
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IngestionLogResponse } from '../shared/types.js';
import { handleIngestionLogQueryCore } from './ingestion-log-handler-core.js';

interface IngestionErrorResponse { code: string; message: string; field_path?: string; }

export async function handleIngestionLogQuery(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<IngestionLogResponse | IngestionErrorResponse> {
  const result = await handleIngestionLogQueryCore(request.query as Record<string, unknown>);
  reply.status(result.statusCode);
  return result.body;
}
