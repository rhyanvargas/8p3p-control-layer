/**
 * Decision Handler
 * Handles GET /decisions requests for querying persisted decisions.
 * Follows src/signalLog/handler.ts pattern.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetDecisionsResponse, RejectionReason } from '../shared/types.js';
import { validateGetDecisionsRequest } from './validator.js';
import { getDecisions, encodePageToken } from './store.js';

/**
 * Error response structure for Decision queries
 */
interface DecisionErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

/**
 * Handle GET /decisions request
 *
 * Query flow:
 * 1. Parse query parameters
 * 2. Validate with validator
 * 3. If invalid, return 400 with error
 * 4. Query store with validated params
 * 5. Transform result to GetDecisionsResponse
 * 6. Return 200 with response
 */
export async function handleGetDecisions(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<GetDecisionsResponse | DecisionErrorResponse> {
  // Parse query parameters
  const params = request.query as Record<string, unknown>;

  // Validate query parameters
  const validation = validateGetDecisionsRequest(params);

  if (!validation.valid || validation.errors.length > 0) {
    const firstError = validation.errors[0]!;

    const errorResponse: DecisionErrorResponse = {
      error: firstError.message,
      code: firstError.code,
      field_path: firstError.field_path,
      details: validation.errors.length > 1 ? validation.errors : undefined,
    };

    reply.status(400);
    return errorResponse;
  }

  // Query the decision store
  const queryResult = getDecisions(validation.parsed!);

  // Build response
  const response: GetDecisionsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    decisions: queryResult.decisions,
    next_page_token: queryResult.hasMore && queryResult.nextCursor
      ? encodePageToken(queryResult.nextCursor)
      : null,
  };

  reply.status(200);
  return response;
}
