/**
 * Decision Engine Validator
 * Validates EvaluateStateForDecisionRequest, decision context, decision type, and GET /decisions query params
 */

import type {
  ValidationResult,
  RejectionReason,
  GetDecisionsRequest,
} from '../shared/types.js';
import { DECISION_TYPES } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { detectForbiddenKeys } from '../ingestion/forbidden-keys.js';

/**
 * RFC3339 timestamp regex with timezone
 */
const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidRFC3339(value: string): boolean {
  if (!RFC3339_REGEX.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate EvaluateStateForDecisionRequest.
 * Requires org_id (non-blank), learner_reference, state_id, state_version (number).
 *
 * @param request - Raw request (e.g. from engine or ingestion)
 * @returns Validation result; errors use org_scope_required, missing_required_field with optional field_path
 */
export function validateEvaluateRequest(request: unknown): ValidationResult {
  const errors: RejectionReason[] = [];

  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'Request must be an object with org_id, learner_reference, state_id, and state_version',
      field_path: undefined,
    });
    return { valid: false, errors };
  }

  const req = request as Record<string, unknown>;

  if (!req.org_id || typeof req.org_id !== 'string' || req.org_id.trim() === '') {
    errors.push({
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  }

  if (
    req.learner_reference === undefined ||
    req.learner_reference === null ||
    (typeof req.learner_reference === 'string' && req.learner_reference.trim() === '')
  ) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'learner_reference is required',
      field_path: 'learner_reference',
    });
  }

  if (req.state_id === undefined || req.state_id === null) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'state_id is required',
      field_path: 'state_id',
    });
  }

  if (req.state_version === undefined || req.state_version === null) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'state_version is required',
      field_path: 'state_version',
    });
  } else if (typeof req.state_version !== 'number' || !Number.isInteger(req.state_version)) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'state_version must be a number',
      field_path: 'state_version',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate decision_context: must be a non-null object (not array).
 * Runs detectForbiddenKeys with basePath 'decision_context'.
 *
 * @param context - decision_context value to validate
 * @returns Validation result; errors use decision_context_not_object or forbidden_semantic_key_detected
 */
export function validateDecisionContext(context: unknown): ValidationResult {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.DECISION_CONTEXT_NOT_OBJECT,
          message: 'decision_context must be a JSON object',
          field_path: 'decision_context',
        },
      ],
    };
  }

  const forbidden = detectForbiddenKeys(context, 'decision_context');
  if (forbidden) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
          message: `Forbidden semantic key in decision_context: ${forbidden.key}`,
          field_path: forbidden.path,
        },
      ],
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate decision type is in the closed set of 7 values.
 *
 * @param type - String to validate as DecisionType
 * @returns Validation result; errors use invalid_decision_type
 */
export function validateDecisionType(type: string): ValidationResult {
  if (!DECISION_TYPES.includes(type as (typeof DECISION_TYPES)[number])) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.INVALID_DECISION_TYPE,
          message: `decision_type must be one of: ${DECISION_TYPES.join(', ')}`,
          field_path: 'decision_type',
        },
      ],
    };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate GET /v1/decisions query parameters.
 * org_id, learner_reference, from_time, to_time (RFC3339, from_time <= to_time),
 * page_size (1-1000), page_token (optional, valid cursor format).
 *
 * @param params - Raw query params (e.g. from Fastify request.query)
 * @returns Validation result with parsed GetDecisionsRequest on success
 */
export function validateGetDecisionsRequest(
  params: unknown
): ValidationResult & { parsed?: GetDecisionsRequest } {
  const errors: RejectionReason[] = [];

  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          message: 'Query params must be an object',
          field_path: undefined,
        },
      ],
    };
  }

  const p = params as Record<string, unknown>;

  if (!p.org_id || typeof p.org_id !== 'string' || p.org_id.trim() === '') {
    errors.push({
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  }

  if (
    !p.learner_reference ||
    typeof p.learner_reference !== 'string' ||
    p.learner_reference.trim() === ''
  ) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'learner_reference is required and must be non-empty',
      field_path: 'learner_reference',
    });
  }

  let fromTime: string | undefined;
  if (!p.from_time || typeof p.from_time !== 'string') {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'from_time is required',
      field_path: 'from_time',
    });
  } else if (!isValidRFC3339(p.from_time)) {
    errors.push({
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'from_time must be RFC3339 format with timezone',
      field_path: 'from_time',
    });
  } else {
    fromTime = p.from_time;
  }

  let toTime: string | undefined;
  if (!p.to_time || typeof p.to_time !== 'string') {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'to_time is required',
      field_path: 'to_time',
    });
  } else if (!isValidRFC3339(p.to_time)) {
    errors.push({
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'to_time must be RFC3339 format with timezone',
      field_path: 'to_time',
    });
  } else {
    toTime = p.to_time;
  }

  if (fromTime && toTime) {
    const fromDate = new Date(fromTime);
    const toDate = new Date(toTime);
    if (fromDate > toDate) {
      errors.push({
        code: ErrorCodes.INVALID_TIME_RANGE,
        message: 'from_time must be less than or equal to to_time',
        field_path: 'from_time',
      });
    }
  }

  let pageSize: number | undefined;
  if (p.page_size !== undefined) {
    const pageSizeNum =
      typeof p.page_size === 'string' ? parseInt(p.page_size, 10) : p.page_size;
    if (typeof pageSizeNum !== 'number' || isNaN(pageSizeNum)) {
      errors.push({
        code: ErrorCodes.INVALID_TYPE,
        message: 'page_size must be a number',
        field_path: 'page_size',
      });
    } else if (pageSizeNum < 1 || pageSizeNum > 1000) {
      errors.push({
        code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE,
        message: 'page_size must be between 1 and 1000',
        field_path: 'page_size',
      });
    } else {
      pageSize = pageSizeNum;
    }
  }

  let pageToken: string | undefined;
  if (p.page_token !== undefined && p.page_token !== '') {
    if (typeof p.page_token !== 'string') {
      errors.push({
        code: ErrorCodes.INVALID_TYPE,
        message: 'page_token must be a string',
        field_path: 'page_token',
      });
    } else {
      try {
        const decoded = Buffer.from(p.page_token, 'base64').toString('utf-8');
        if (!decoded.startsWith('v1:')) {
          errors.push({
            code: ErrorCodes.INVALID_PAGE_TOKEN,
            message: 'page_token is malformed or invalid',
            field_path: 'page_token',
          });
        } else {
          pageToken = p.page_token;
        }
      } catch {
        errors.push({
          code: ErrorCodes.INVALID_PAGE_TOKEN,
          message: 'page_token is malformed or invalid',
          field_path: 'page_token',
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const parsed: GetDecisionsRequest = {
    org_id: p.org_id as string,
    learner_reference: p.learner_reference as string,
    from_time: fromTime!,
    to_time: toTime!,
  };
  if (pageSize !== undefined) parsed.page_size = pageSize;
  if (pageToken !== undefined) parsed.page_token = pageToken;

  return { valid: true, errors: [], parsed };
}
