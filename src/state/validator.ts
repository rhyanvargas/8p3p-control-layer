/**
 * STATE Engine Validator
 * Validates ApplySignalsRequest and state objects per state-engine spec
 */

import type { ValidationResult, RejectionReason } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { detectForbiddenKeys } from '../ingestion/forbidden-keys.js';

/**
 * Validate ApplySignalsRequest
 * Requires org_id (non-blank), learner_reference (non-blank), signal_ids (non-empty array of strings).
 *
 * @param request - Raw request (e.g. from ingestion or tests)
 * @returns Validation result; errors use org_scope_required, missing_required_field with optional field_path
 */
export function validateApplySignalsRequest(request: unknown): ValidationResult {
  const errors: RejectionReason[] = [];

  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'Request must be an object with org_id, learner_reference, and signal_ids',
      field_path: undefined,
    });
    return { valid: false, errors };
  }

  const req = request as Record<string, unknown>;

  // org_id: required, non-blank
  if (!req.org_id || typeof req.org_id !== 'string' || req.org_id.trim() === '') {
    errors.push({
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  }

  // learner_reference: required, non-blank
  if (
    !req.learner_reference ||
    typeof req.learner_reference !== 'string' ||
    req.learner_reference.trim() === ''
  ) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'learner_reference is required and must be non-empty',
      field_path: 'learner_reference',
    });
  }

  // signal_ids: required, non-empty array of strings
  if (req.signal_ids === undefined || req.signal_ids === null) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'signal_ids is required',
      field_path: 'signal_ids',
    });
  } else if (!Array.isArray(req.signal_ids)) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'signal_ids must be a non-empty array of strings',
      field_path: 'signal_ids',
    });
  } else if (req.signal_ids.length === 0) {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'signal_ids must not be empty',
      field_path: 'signal_ids',
    });
  } else {
    for (let i = 0; i < req.signal_ids.length; i++) {
      const item = req.signal_ids[i];
      if (typeof item !== 'string') {
        errors.push({
          code: ErrorCodes.INVALID_TYPE,
          message: 'signal_ids must contain only strings',
          field_path: `signal_ids[${i}]`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate state object for forbidden keys and type.
 * State must be a plain object (not array, not null); same forbidden-key rules as ingestion with basePath 'state'.
 *
 * @param state - Computed state (e.g. from computeNewState) or any value to validate
 * @returns Validation result; errors use state_payload_not_object or forbidden_semantic_key_detected with field_path
 */
export function validateStateObject(state: unknown): ValidationResult {
  // Not an object (array, null, primitive) → state_payload_not_object
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.STATE_PAYLOAD_NOT_OBJECT,
          message: 'State must be a JSON object',
          field_path: 'state',
        },
      ],
    };
  }

  const forbidden = detectForbiddenKeys(state, 'state');
  if (forbidden) {
    return {
      valid: false,
      errors: [
        {
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
          message: `Forbidden semantic key in state: ${forbidden.key}`,
          field_path: forbidden.path,
        },
      ],
    };
  }

  return { valid: true, errors: [] };
}
