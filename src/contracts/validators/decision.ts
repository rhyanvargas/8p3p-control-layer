/**
 * Ajv-based validator for Decision (canonical Decision object)
 * Compiles JSON Schema and provides validation with error mapping to canonical codes
 */

import Ajv from 'ajv';
import type { ValidationResult, RejectionReason } from '../../shared/types.js';
import { ErrorCodes } from '../../shared/error-codes.js';
import decisionSchema from '../schemas/decision.json' with { type: 'json' };

const AjvClass = Ajv.default ?? Ajv;
const ajv = new AjvClass({
  allErrors: true,
  strict: true,
  strictSchema: true,
});

const validate = ajv.compile(decisionSchema);

function mapAjvErrorToCode(error: {
  keyword: string;
  params?: Record<string, unknown>;
  instancePath?: string;
}): string {
  const { keyword, instancePath } = error;

  if (instancePath === '/decision_context' && keyword === 'type') {
    return ErrorCodes.DECISION_CONTEXT_NOT_OBJECT;
  }
  if (instancePath === '/decision_type' && (keyword === 'enum' || keyword === 'type')) {
    return ErrorCodes.INVALID_DECISION_TYPE;
  }
  if ((instancePath === '/trace' || (instancePath && instancePath.startsWith('/trace'))) && keyword === 'required') {
    return ErrorCodes.MISSING_TRACE;
  }
  if (instancePath === '/trace' && keyword === 'type') {
    return ErrorCodes.MISSING_TRACE;
  }

  switch (keyword) {
    case 'required':
      return (instancePath === '' || instancePath === '/trace') && (error.params as { missingProperty?: string })?.missingProperty
        ? ErrorCodes.MISSING_TRACE
        : ErrorCodes.MISSING_REQUIRED_FIELD;
    case 'type':
      return ErrorCodes.INVALID_TYPE;
    case 'enum':
      return ErrorCodes.INVALID_DECISION_TYPE;
    default:
      return ErrorCodes.INVALID_FORMAT;
  }
}

function getErrorMessage(error: {
  keyword: string;
  params?: Record<string, unknown>;
  instancePath?: string;
  message?: string;
}): string {
  const { params, instancePath, message } = error;
  const field = instancePath?.replace(/^\//, '').replace(/\//g, '.') || 'unknown';

  if (instancePath === '/trace' || (instancePath && instancePath.startsWith('/trace'))) {
    if (error.keyword === 'required') {
      return `Missing required trace field: ${(params as { missingProperty?: string })?.missingProperty}`;
    }
    return message || `Validation error on trace field '${field}'`;
  }
  switch (error.keyword) {
    case 'required':
      return `Missing required field: ${(params as { missingProperty?: string })?.missingProperty}`;
    case 'type':
      return `Field '${field}' has invalid type`;
    case 'enum':
      return `Field 'decision_type' must be one of: reinforce, advance, intervene, pause, escalate, recommend, reroute`;
    default:
      return message || `Validation error on field '${field}'`;
  }
}

function getFieldPath(instancePath: string, params?: Record<string, unknown>): string {
  if (!instancePath && params && (params as { missingProperty?: string }).missingProperty) {
    return (params as { missingProperty: string }).missingProperty;
  }
  return instancePath.replace(/^\//, '').replace(/\//g, '.');
}

/**
 * Validate a Decision against the JSON Schema.
 * Maps Ajv errors to canonical codes: invalid_decision_type, decision_context_not_object, missing_trace.
 *
 * @param data - Candidate Decision object
 * @returns Validation result with mapped error codes
 */
export function validateDecision(data: unknown): ValidationResult {
  const errors: RejectionReason[] = [];

  const valid = validate(data);

  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      errors.push({
        code: mapAjvErrorToCode(err),
        message: getErrorMessage(err),
        field_path: getFieldPath(err.instancePath ?? '', err.params as Record<string, unknown>),
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
