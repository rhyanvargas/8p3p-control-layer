/**
 * Signal Log Query Parameter Validator
 * Validates GET /signals query parameters
 */

import type { ValidationResult, RejectionReason, SignalLogReadRequest } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';

/**
 * RFC3339 timestamp regex
 * Matches: YYYY-MM-DDTHH:MM:SS with timezone (Z or +/-HH:MM)
 */
const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Validate a timestamp is RFC3339 format with timezone
 */
function isValidRFC3339(value: string): boolean {
  if (!RFC3339_REGEX.test(value)) {
    return false;
  }
  
  // Verify it's a valid date
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate Signal Log query parameters
 * 
 * @param params - Raw query parameters from request
 * @returns Validation result with parsed request or errors
 */
export function validateSignalLogQuery(
  params: Record<string, unknown>
): ValidationResult & { parsed?: SignalLogReadRequest } {
  const errors: RejectionReason[] = [];
  
  // Validate org_id (required, non-empty)
  if (!params.org_id || typeof params.org_id !== 'string' || params.org_id.trim() === '') {
    errors.push({
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  }
  
  // Validate learner_reference (required, non-empty)
  if (!params.learner_reference || typeof params.learner_reference !== 'string' || params.learner_reference.trim() === '') {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'learner_reference is required and must be non-empty',
      field_path: 'learner_reference',
    });
  }
  
  // Validate from_time (required, RFC3339)
  let fromTime: string | undefined;
  if (!params.from_time || typeof params.from_time !== 'string') {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'from_time is required',
      field_path: 'from_time',
    });
  } else if (!isValidRFC3339(params.from_time)) {
    errors.push({
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'from_time must be RFC3339 format with timezone',
      field_path: 'from_time',
    });
  } else {
    fromTime = params.from_time;
  }
  
  // Validate to_time (required, RFC3339)
  let toTime: string | undefined;
  if (!params.to_time || typeof params.to_time !== 'string') {
    errors.push({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'to_time is required',
      field_path: 'to_time',
    });
  } else if (!isValidRFC3339(params.to_time)) {
    errors.push({
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'to_time must be RFC3339 format with timezone',
      field_path: 'to_time',
    });
  } else {
    toTime = params.to_time;
  }
  
  // Validate time range (from_time must be <= to_time)
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
  
  // Validate page_size (optional, 1-1000)
  let pageSize: number | undefined;
  if (params.page_size !== undefined) {
    const pageSizeNum = typeof params.page_size === 'string' 
      ? parseInt(params.page_size, 10) 
      : params.page_size;
    
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
  
  // Validate page_token (optional, valid base64)
  let pageToken: string | undefined;
  if (params.page_token !== undefined && params.page_token !== '') {
    if (typeof params.page_token !== 'string') {
      errors.push({
        code: ErrorCodes.INVALID_TYPE,
        message: 'page_token must be a string',
        field_path: 'page_token',
      });
    } else {
      // Validate it's valid base64
      try {
        const decoded = Buffer.from(params.page_token, 'base64').toString('utf-8');
        if (!decoded.startsWith('v1:')) {
          errors.push({
            code: ErrorCodes.INVALID_PAGE_TOKEN,
            message: 'page_token is malformed or invalid',
            field_path: 'page_token',
          });
        } else {
          pageToken = params.page_token;
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
  
  // Return result
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Build parsed request
  const parsed: SignalLogReadRequest = {
    org_id: params.org_id as string,
    learner_reference: params.learner_reference as string,
    from_time: fromTime!,
    to_time: toTime!,
  };
  
  if (pageSize !== undefined) {
    parsed.page_size = pageSize;
  }
  
  if (pageToken !== undefined) {
    parsed.page_token = pageToken;
  }
  
  return { valid: true, errors: [], parsed };
}
