/**
 * Signal Ingestion Handler — thin Fastify wrapper
 *
 * Delegates to handleSignalIngestionCore (framework-agnostic).
 * Behavior is unchanged; only the framework coupling is removed.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SignalIngestResult } from '../shared/types.js';
import { handleSignalIngestionCore } from './handler-core.js';

export async function handleSignalIngestion(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SignalIngestResult> {
  const result = await handleSignalIngestionCore(request.body, request.log ?? {});
  reply.status(result.statusCode);
  return result.body;
}
