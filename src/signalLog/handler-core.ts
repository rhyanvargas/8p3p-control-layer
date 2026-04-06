/**
 * Signal Log Handler Core — framework-agnostic
 */

import type { SignalLogReadResponse, RejectionReason, HandlerResult } from '../shared/types.js';
import { validateSignalLogQuery } from './validator.js';
import { querySignals, encodePageToken } from './store.js';

interface SignalLogErrorResponse {
  error: string;
  code: string;
  field_path?: string;
  details?: RejectionReason[];
}

export async function handleSignalLogQueryCore(
  params: Record<string, unknown>
): Promise<HandlerResult<SignalLogReadResponse | SignalLogErrorResponse>> {
  const validation = validateSignalLogQuery(params);

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

  const queryResult = querySignals(validation.parsed!);

  return {
    statusCode: 200,
    body: {
      org_id: validation.parsed!.org_id,
      learner_reference: validation.parsed!.learner_reference,
      signals: queryResult.signals,
      next_page_token: queryResult.hasMore && queryResult.nextCursor
        ? encodePageToken(queryResult.nextCursor)
        : null,
    },
  };
}
