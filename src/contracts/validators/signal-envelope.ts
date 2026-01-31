/**
 * Ajv-based validator for SignalEnvelope
 * Compiles JSON Schema and provides validation with error mapping
 */

import Ajv from 'ajv';
import type { ValidationResult, RejectionReason } from '../../shared/types.js';
import { ErrorCodes } from '../../shared/error-codes.js';
import signalEnvelopeSchema from '../schemas/signal-envelope.json' with { type: 'json' };

// Initialize Ajv with strict mode
const AjvClass = Ajv.default ?? Ajv;
const ajv = new AjvClass({
  allErrors: true,
  strict: true,
  strictSchema: true,
});

// Compile the schema
const validate = ajv.compile(signalEnvelopeSchema);

/**
 * RFC3339 regex with REQUIRED timezone
 * Matches: 2026-01-30T10:00:00Z or 2026-01-30T10:00:00+05:00 or 2026-01-30T10:00:00-05:00
 * Rejects: 2026-01-30T10:00:00 (no timezone) or 2026-01-30 10:00:00 (space separator)
 */
const RFC3339_WITH_TIMEZONE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Map Ajv error keywords to spec error codes
 */
function mapAjvErrorToCode(error: { keyword: string; params?: Record<string, unknown>; instancePath?: string }): string {
  const { keyword, params, instancePath } = error;
  
  // Check for payload type error specifically
  if (instancePath === '/payload' && keyword === 'type') {
    return ErrorCodes.PAYLOAD_NOT_OBJECT;
  }
  
  switch (keyword) {
    case 'required':
      return ErrorCodes.MISSING_REQUIRED_FIELD;
    case 'type':
      return ErrorCodes.INVALID_TYPE;
    case 'pattern':
      // Differentiate between signal_id charset and schema_version pattern
      if (instancePath === '/signal_id') {
        return ErrorCodes.INVALID_CHARSET;
      }
      if (instancePath === '/schema_version') {
        return ErrorCodes.INVALID_SCHEMA_VERSION;
      }
      return ErrorCodes.INVALID_FORMAT;
    case 'minLength':
    case 'maxLength':
      // Empty org_id is a scope error
      if (instancePath === '/org_id' && params && (params as { limit?: number }).limit === 1) {
        return ErrorCodes.ORG_SCOPE_REQUIRED;
      }
      return ErrorCodes.INVALID_LENGTH;
    case 'additionalProperties':
      return ErrorCodes.INVALID_FORMAT;
    default:
      return ErrorCodes.INVALID_FORMAT;
  }
}

/**
 * Generate human-readable error message
 */
function getErrorMessage(error: { keyword: string; params?: Record<string, unknown>; instancePath?: string; message?: string }): string {
  const { keyword, params, instancePath, message } = error;
  const field = instancePath?.replace(/^\//, '') || 'unknown';
  
  switch (keyword) {
    case 'required':
      return `Missing required field: ${(params as { missingProperty?: string })?.missingProperty}`;
    case 'type':
      return `Field '${field}' has invalid type, expected ${(params as { type?: string })?.type}`;
    case 'pattern':
      if (instancePath === '/signal_id') {
        return `Field 'signal_id' contains invalid characters. Allowed: A-Z, a-z, 0-9, ., _, :, -`;
      }
      if (instancePath === '/schema_version') {
        return `Field 'schema_version' must match pattern ^v[0-9]+$ (e.g., v1, v2)`;
      }
      return `Field '${field}' format is invalid`;
    case 'minLength':
      return `Field '${field}' must not be empty`;
    case 'maxLength':
      return `Field '${field}' exceeds maximum length of ${(params as { limit?: number })?.limit}`;
    default:
      return message || `Validation error on field '${field}'`;
  }
}

/**
 * Convert Ajv error path to field_path format
 */
function getFieldPath(instancePath: string, params?: Record<string, unknown>): string {
  if (!instancePath && params && (params as { missingProperty?: string }).missingProperty) {
    return (params as { missingProperty: string }).missingProperty;
  }
  // Remove leading slash and convert to dot notation
  return instancePath.replace(/^\//, '').replace(/\//g, '.');
}

/**
 * Validate timestamp is RFC3339 with timezone
 */
function validateTimestamp(timestamp: unknown): RejectionReason | null {
  if (typeof timestamp !== 'string') {
    return null; // Type validation will catch this
  }
  
  if (!RFC3339_WITH_TIMEZONE_REGEX.test(timestamp)) {
    return {
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'Timestamp must be RFC3339 format with timezone (e.g., 2026-01-30T10:00:00Z)',
      field_path: 'timestamp',
    };
  }
  
  // Also validate it's a real date
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return {
      code: ErrorCodes.INVALID_TIMESTAMP,
      message: 'Timestamp is not a valid date',
      field_path: 'timestamp',
    };
  }
  
  return null;
}

/**
 * Validate a signal envelope against the JSON Schema
 * Returns validation result with mapped error codes
 */
export function validateSignalEnvelope(data: unknown): ValidationResult {
  const errors: RejectionReason[] = [];
  
  // Run Ajv validation
  const valid = validate(data);
  
  if (!valid && validate.errors) {
    for (const error of validate.errors) {
      errors.push({
        code: mapAjvErrorToCode(error),
        message: getErrorMessage(error),
        field_path: getFieldPath(error.instancePath, error.params as Record<string, unknown>),
      });
    }
  }
  
  // Additional timestamp validation (RFC3339 with timezone)
  if (errors.length === 0 && data && typeof data === 'object' && 'timestamp' in data) {
    const timestampError = validateTimestamp((data as { timestamp: unknown }).timestamp);
    if (timestampError) {
      errors.push(timestampError);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
