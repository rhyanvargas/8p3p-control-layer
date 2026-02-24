/**
 * Receipts Handler
 * Handles GET /receipts requests — thin compliance/audit query over the decision log.
 * Reuses validateGetDecisionsRequest, getDecisions, encodePageToken; maps Decision → Receipt.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetReceiptsResponse, Receipt, RejectionReason } from '../shared/types.js';
import { validateGetDecisionsRequest } from './validator.js';
import { getDecisions, encodePageToken } from './store.js';

/**
 * Error response structure (same shape as decision handler)
 */
interface ReceiptErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

/**
 * Map Decision to Receipt (projection: decision_id, decision_type, decided_at, trace)
 */
function decisionToReceipt(decision: { decision_id: string; decision_type: string; decided_at: string; trace: Receipt['trace'] }): Receipt {
  return {
    decision_id: decision.decision_id,
    decision_type: decision.decision_type as Receipt['decision_type'],
    decided_at: decision.decided_at,
    trace: decision.trace,
  };
}

/**
 * Handle GET /receipts request
 *
 * Flow:
 * 1. Parse query parameters (same as GET /decisions)
 * 2. Validate with validateGetDecisionsRequest
 * 3. If invalid, return 400 with same error shape
 * 4. Query store via getDecisions
 * 5. Map each Decision to Receipt
 * 6. Return GetReceiptsResponse with same next_page_token semantics
 */
export async function handleGetReceipts(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<GetReceiptsResponse | ReceiptErrorResponse> {
  const params = request.query as Record<string, unknown>;

  const validation = validateGetDecisionsRequest(params);

  if (!validation.valid || validation.errors.length > 0) {
    const firstError = validation.errors[0]!;

    const errorResponse: ReceiptErrorResponse = {
      error: firstError.message,
      code: firstError.code,
      field_path: firstError.field_path,
      details: validation.errors.length > 1 ? validation.errors : undefined,
    };

    reply.status(400);
    return errorResponse;
  }

  const queryResult = getDecisions(validation.parsed!);

  const receipts: Receipt[] = queryResult.decisions.map(decisionToReceipt);

  const response: GetReceiptsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    receipts,
    next_page_token: queryResult.hasMore && queryResult.nextCursor
      ? encodePageToken(queryResult.nextCursor)
      : null,
  };

  reply.status(200);
  return response;
}
