/**
 * Ingestion Log Handler Core — framework-agnostic
 */

import type { IngestionLogResponse, RejectionReason, HandlerResult } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { getIngestionOutcomes } from './ingestion-log-store.js';

const VALID_OUTCOMES = ['accepted', 'rejected', 'duplicate'] as const;

interface IngestionErrorResponse { code: string; message: string; field_path?: string; }

function validateParams(params: Record<string, unknown>): {
  valid: boolean;
  errors: RejectionReason[];
  org_id?: string;
  limit?: number;
  outcome?: (typeof VALID_OUTCOMES)[number];
  cursor?: string;
} {
  const errors: RejectionReason[] = [];

  if (!params.org_id || typeof params.org_id !== 'string' || params.org_id.trim() === '') {
    errors.push({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required and must be non-empty', field_path: 'org_id' });
  } else if (params.org_id.length > 128) {
    errors.push({ code: ErrorCodes.INVALID_LENGTH, message: 'org_id must be 1-128 characters', field_path: 'org_id' });
  }

  let limit: number | undefined;
  if (params.limit !== undefined) {
    const limitNum = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit;
    if (typeof limitNum !== 'number' || isNaN(limitNum)) {
      errors.push({ code: ErrorCodes.INVALID_TYPE, message: 'limit must be a number', field_path: 'limit' });
    } else if (limitNum < 1 || limitNum > 500) {
      errors.push({ code: ErrorCodes.LIMIT_OUT_OF_RANGE, message: 'limit must be between 1 and 500', field_path: 'limit' });
    } else {
      limit = limitNum;
    }
  }

  let outcome: (typeof VALID_OUTCOMES)[number] | undefined;
  if (params.outcome !== undefined && params.outcome !== '') {
    if (typeof params.outcome !== 'string' || !VALID_OUTCOMES.includes(params.outcome as (typeof VALID_OUTCOMES)[number])) {
      errors.push({ code: ErrorCodes.INVALID_OUTCOME_FILTER, message: 'outcome must be one of: accepted, rejected, duplicate', field_path: 'outcome' });
    } else {
      outcome = params.outcome as (typeof VALID_OUTCOMES)[number];
    }
  }

  const cursor = params.cursor !== undefined && typeof params.cursor === 'string' ? params.cursor : undefined;

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], org_id: params.org_id as string, limit, outcome, cursor };
}

export async function handleIngestionLogQueryCore(
  params: Record<string, unknown>
): Promise<HandlerResult<IngestionLogResponse | IngestionErrorResponse>> {
  const validation = validateParams(params);

  if (!validation.valid) {
    const first = validation.errors[0]!;
    return { statusCode: 400, body: { code: first.code, message: first.message, field_path: first.field_path } };
  }

  const { entries, nextCursor } = getIngestionOutcomes({
    org_id: validation.org_id!,
    limit: validation.limit ?? 50,
    outcome: validation.outcome,
    cursor: validation.cursor,
  });

  return {
    statusCode: 200,
    body: { org_id: validation.org_id!, entries, next_cursor: nextCursor },
  };
}
