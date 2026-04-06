/**
 * Decision + Receipts Handler Cores — framework-agnostic
 */

import type { GetDecisionsResponse, GetReceiptsResponse, Receipt, RejectionReason, HandlerResult } from '../shared/types.js';
import { validateGetDecisionsRequest } from './validator.js';
import { getDecisions, encodePageToken } from './store.js';

interface DecisionErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

export async function handleGetDecisionsCore(
  params: Record<string, unknown>
): Promise<HandlerResult<GetDecisionsResponse | DecisionErrorResponse>> {
  const validation = validateGetDecisionsRequest(params);

  if (!validation.valid || validation.errors.length > 0) {
    const firstError = validation.errors[0]!;
    return {
      statusCode: 400,
      body: {
        error: firstError.message,
        code: firstError.code,
        field_path: firstError.field_path,
        details: validation.errors.length > 1 ? validation.errors : undefined,
      },
    };
  }

  const queryResult = getDecisions(validation.parsed!);

  return {
    statusCode: 200,
    body: {
      org_id: validation.parsed!.org_id,
      learner_reference: validation.parsed!.learner_reference,
      decisions: queryResult.decisions,
      next_page_token: queryResult.hasMore && queryResult.nextCursor
        ? encodePageToken(queryResult.nextCursor)
        : null,
    },
  };
}

function decisionToReceipt(decision: {
  decision_id: string;
  decision_type: string;
  decided_at: string;
  trace: Receipt['trace'];
}): Receipt {
  return {
    decision_id: decision.decision_id,
    decision_type: decision.decision_type as Receipt['decision_type'],
    decided_at: decision.decided_at,
    trace: decision.trace,
  };
}

export async function handleGetReceiptsCore(
  params: Record<string, unknown>
): Promise<HandlerResult<GetReceiptsResponse | DecisionErrorResponse>> {
  const validation = validateGetDecisionsRequest(params);

  if (!validation.valid || validation.errors.length > 0) {
    const firstError = validation.errors[0]!;
    return {
      statusCode: 400,
      body: {
        error: firstError.message,
        code: firstError.code,
        field_path: firstError.field_path,
        details: validation.errors.length > 1 ? validation.errors : undefined,
      },
    };
  }

  const queryResult = getDecisions(validation.parsed!);
  const receipts = queryResult.decisions.map(decisionToReceipt);

  return {
    statusCode: 200,
    body: {
      org_id: validation.parsed!.org_id,
      learner_reference: validation.parsed!.learner_reference,
      receipts,
      next_page_token: queryResult.hasMore && queryResult.nextCursor
        ? encodePageToken(queryResult.nextCursor)
        : null,
    },
  };
}
