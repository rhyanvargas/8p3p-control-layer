/**
 * State Handler Cores — framework-agnostic
 * Covers GET /v1/state and GET /v1/state/list
 */

import type { LearnerState, RejectionReason, HandlerResult } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { getState, getStateByVersion, listLearners } from './store.js';

interface StateErrorResponse {
  code: string;
  message: string;
  field_path?: string;
}

function validateStateParams(params: Record<string, unknown>): {
  valid: boolean;
  errors: RejectionReason[];
  org_id?: string;
  learner_reference?: string;
  version?: number;
} {
  const errors: RejectionReason[] = [];

  if (!params.org_id || typeof params.org_id !== 'string' || params.org_id.trim() === '') {
    errors.push({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required and must be non-empty', field_path: 'org_id' });
  } else if (params.org_id.length > 128) {
    errors.push({ code: ErrorCodes.INVALID_LENGTH, message: 'org_id must be 1-128 characters', field_path: 'org_id' });
  }

  if (!params.learner_reference || typeof params.learner_reference !== 'string' || params.learner_reference.trim() === '') {
    errors.push({ code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'learner_reference is required and must be non-empty', field_path: 'learner_reference' });
  } else if (params.learner_reference.length > 256) {
    errors.push({ code: ErrorCodes.INVALID_LENGTH, message: 'learner_reference must be 1-256 characters', field_path: 'learner_reference' });
  }

  let version: number | undefined;
  if (params.version !== undefined && params.version !== '') {
    const versionNum = typeof params.version === 'string' ? parseInt(params.version, 10) : params.version;
    if (typeof versionNum !== 'number' || isNaN(versionNum) || versionNum < 1) {
      errors.push({ code: ErrorCodes.INVALID_TYPE, message: 'version must be a positive integer', field_path: 'version' });
    } else {
      version = versionNum;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], org_id: params.org_id as string, learner_reference: params.learner_reference as string, version };
}

function validateStateListParams(params: Record<string, unknown>): {
  valid: boolean;
  errors: RejectionReason[];
  org_id?: string;
  limit?: number;
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
    if (typeof limitNum !== 'number' || isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
      errors.push({ code: ErrorCodes.LIMIT_OUT_OF_RANGE, message: 'limit must be between 1 and 500', field_path: 'limit' });
    } else {
      limit = limitNum;
    }
  }

  const cursor = params.cursor !== undefined && typeof params.cursor === 'string' ? params.cursor : undefined;

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], org_id: params.org_id as string, limit: limit ?? 50, cursor };
}

export async function handleStateQueryCore(
  params: Record<string, unknown>
): Promise<HandlerResult<LearnerState | StateErrorResponse>> {
  const validation = validateStateParams(params);

  if (!validation.valid) {
    const first = validation.errors[0]!;
    return { statusCode: 400, body: { code: first.code, message: first.message, field_path: first.field_path } };
  }

  const orgId = validation.org_id!;
  const learnerRef = validation.learner_reference!;
  const version = validation.version;

  const state = version != null
    ? getStateByVersion(orgId, learnerRef, version)
    : getState(orgId, learnerRef);

  if (!state) {
    return {
      statusCode: 404,
      body: {
        code: version != null ? ErrorCodes.STATE_VERSION_NOT_FOUND : ErrorCodes.STATE_NOT_FOUND,
        message: version != null
          ? `State version ${version} not found for learner ${learnerRef}`
          : `No state found for learner ${learnerRef}`,
        field_path: version != null ? 'version' : undefined,
      },
    };
  }

  return { statusCode: 200, body: state };
}

export async function handleStateListQueryCore(
  params: Record<string, unknown>
): Promise<HandlerResult<{ org_id: string; learners: Array<{ learner_reference: string; state_version: number; updated_at: string }>; next_cursor: string | null } | StateErrorResponse>> {
  const validation = validateStateListParams(params);

  if (!validation.valid) {
    const first = validation.errors[0]!;
    return { statusCode: 400, body: { code: first.code, message: first.message, field_path: first.field_path } };
  }

  const { learners, nextCursor } = listLearners(validation.org_id!, validation.limit!, validation.cursor);

  return {
    statusCode: 200,
    body: {
      org_id: validation.org_id!,
      learners,
      next_cursor: nextCursor,
    },
  };
}
