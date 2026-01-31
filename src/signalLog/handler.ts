/**
 * Signal Log Handler
 * Handles GET /signals requests for querying the signal log
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SignalLogReadResponse, RejectionReason } from '../shared/types.js';
import { validateSignalLogQuery } from './validator.js';
import { querySignals, encodePageToken } from './store.js';

/**
 * Error response structure for Signal Log queries
 */
interface SignalLogErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

/**
 * Handle GET /signals request
 * 
 * Query flow:
 * 1. Parse query parameters
 * 2. Validate with validator
 * 3. If invalid, return 400 with error
 * 4. Query store with validated params
 * 5. Transform result to SignalLogReadResponse
 * 6. Return 200 with response
 */
export async function handleSignalLogQuery(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SignalLogReadResponse | SignalLogErrorResponse> {
  // Parse query parameters
  const params = request.query as Record<string, unknown>;
  
  // Validate query parameters
  const validation = validateSignalLogQuery(params);
  
  if (!validation.valid || validation.errors.length > 0) {
    const firstError = validation.errors[0]!;
    
    const errorResponse: SignalLogErrorResponse = {
      error: firstError.message,
      code: firstError.code,
      field_path: firstError.field_path,
      details: validation.errors.length > 1 ? validation.errors : undefined,
    };
    
    reply.status(400);
    return errorResponse;
  }
  
  // Query the signal log store
  const queryResult = querySignals(validation.parsed!);
  
  // Build response
  const response: SignalLogReadResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    signals: queryResult.signals,
    next_page_token: queryResult.hasMore && queryResult.nextCursor 
      ? encodePageToken(queryResult.nextCursor)
      : null,
  };
  
  reply.status(200);
  return response;
}
