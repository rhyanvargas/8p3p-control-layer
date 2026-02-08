/**
 * Unit tests for Decision Validator
 * validateEvaluateRequest, validateDecisionContext, validateDecisionType, validateGetDecisionsRequest
 */

import { describe, it, expect } from 'vitest';
import {
  validateEvaluateRequest,
  validateDecisionContext,
  validateDecisionType,
  validateGetDecisionsRequest,
} from '../../src/decision/validator.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// validateEvaluateRequest
// ---------------------------------------------------------------------------

describe('Decision Validator', () => {
  describe('validateEvaluateRequest', () => {
    const validRequest = {
      org_id: 'org-1',
      learner_reference: 'learner-1',
      state_id: 'org-1:learner-1:v1',
      state_version: 1,
      requested_at: '2026-02-07T10:00:00Z',
    };

    it('should pass for a valid request', () => {
      const result = validateEvaluateRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with org_scope_required when org_id is missing', () => {
      const { org_id: _org_id, ...rest } = validRequest;
      const result = validateEvaluateRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.ORG_SCOPE_REQUIRED,
          field_path: 'org_id',
        })
      );
    });

    it('should fail with org_scope_required when org_id is blank', () => {
      const result = validateEvaluateRequest({ ...validRequest, org_id: '  ' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.ORG_SCOPE_REQUIRED,
          field_path: 'org_id',
        })
      );
    });

    it('should fail with missing_required_field when learner_reference is missing', () => {
      const { learner_reference: _learner_reference, ...rest } = validRequest;
      const result = validateEvaluateRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'learner_reference',
        })
      );
    });

    it('should fail with missing_required_field when learner_reference is blank', () => {
      const result = validateEvaluateRequest({ ...validRequest, learner_reference: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'learner_reference',
        })
      );
    });

    it('should fail with missing_required_field when state_id is missing', () => {
      const { state_id: _state_id, ...rest } = validRequest;
      const result = validateEvaluateRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'state_id',
        })
      );
    });

    it('should fail with missing_required_field when state_version is missing', () => {
      const { state_version: _state_version, ...rest } = validRequest;
      const result = validateEvaluateRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'state_version',
        })
      );
    });

    it('should fail with missing_required_field when state_version is not a number', () => {
      const result = validateEvaluateRequest({ ...validRequest, state_version: 'one' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'state_version',
        })
      );
    });

    it('should fail when request is null or not an object', () => {
      expect(validateEvaluateRequest(null).valid).toBe(false);
      expect(validateEvaluateRequest(42).valid).toBe(false);
      expect(validateEvaluateRequest('string').valid).toBe(false);
      expect(validateEvaluateRequest([]).valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // validateDecisionContext
  // -----------------------------------------------------------------------
  describe('validateDecisionContext', () => {
    it('should pass for a valid empty object', () => {
      const result = validateDecisionContext({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for a valid object with data', () => {
      const result = validateDecisionContext({ reason: 'low score' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with decision_context_not_object when context is an array', () => {
      const result = validateDecisionContext([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.DECISION_CONTEXT_NOT_OBJECT,
          field_path: 'decision_context',
        })
      );
    });

    it('should fail with decision_context_not_object when context is null', () => {
      const result = validateDecisionContext(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.DECISION_CONTEXT_NOT_OBJECT,
        })
      );
    });

    it('should fail with decision_context_not_object when context is a primitive', () => {
      expect(validateDecisionContext(42).valid).toBe(false);
      expect(validateDecisionContext('string').valid).toBe(false);
      expect(validateDecisionContext(true).valid).toBe(false);
    });

    it('should fail with forbidden_semantic_key_detected when context has forbidden key', () => {
      const result = validateDecisionContext({ task: { assignee: 'bob' } });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
        })
      );
    });

    it('should fail with forbidden_semantic_key_detected for nested forbidden key', () => {
      const result = validateDecisionContext({ data: { workflow: 'step-1' } });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateDecisionType
  // -----------------------------------------------------------------------
  describe('validateDecisionType', () => {
    const validTypes = ['reinforce', 'advance', 'intervene', 'pause', 'escalate', 'recommend', 'reroute'];

    it.each(validTypes)('should pass for valid decision type: %s', (type) => {
      const result = validateDecisionType(type);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with invalid_decision_type for unknown type', () => {
      const result = validateDecisionType('promote');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_DECISION_TYPE,
          field_path: 'decision_type',
        })
      );
    });

    it('should fail with invalid_decision_type for empty string', () => {
      const result = validateDecisionType('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_DECISION_TYPE,
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateGetDecisionsRequest
  // -----------------------------------------------------------------------
  describe('validateGetDecisionsRequest', () => {
    const validParams = {
      org_id: 'org-1',
      learner_reference: 'learner-1',
      from_time: '2026-01-01T00:00:00Z',
      to_time: '2026-12-31T23:59:59Z',
    };

    it('should pass for valid request and return parsed', () => {
      const result = validateGetDecisionsRequest(validParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsed).toBeDefined();
      expect(result.parsed!.org_id).toBe('org-1');
      expect(result.parsed!.learner_reference).toBe('learner-1');
    });

    it('should fail with org_scope_required when org_id is missing', () => {
      const { org_id: _org_id, ...rest } = validParams;
      const result = validateGetDecisionsRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.ORG_SCOPE_REQUIRED,
        })
      );
    });

    it('should fail with missing_required_field when learner_reference is missing', () => {
      const { learner_reference: _learner_reference, ...rest } = validParams;
      const result = validateGetDecisionsRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'learner_reference',
        })
      );
    });

    it('should fail when from_time is missing', () => {
      const { from_time: _from_time, ...rest } = validParams;
      const result = validateGetDecisionsRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'from_time',
        })
      );
    });

    it('should fail when to_time is missing', () => {
      const { to_time: _to_time, ...rest } = validParams;
      const result = validateGetDecisionsRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'to_time',
        })
      );
    });

    it('should fail with invalid_timestamp when from_time is not RFC3339', () => {
      const result = validateGetDecisionsRequest({ ...validParams, from_time: 'not-a-date' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_TIMESTAMP,
          field_path: 'from_time',
        })
      );
    });

    it('should fail with invalid_time_range when from_time > to_time', () => {
      const result = validateGetDecisionsRequest({
        ...validParams,
        from_time: '2026-12-31T23:59:59Z',
        to_time: '2026-01-01T00:00:00Z',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_TIME_RANGE,
        })
      );
    });

    it('should fail with page_size_out_of_range when page_size < 1', () => {
      const result = validateGetDecisionsRequest({ ...validParams, page_size: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE,
        })
      );
    });

    it('should fail with page_size_out_of_range when page_size > 1000', () => {
      const result = validateGetDecisionsRequest({ ...validParams, page_size: 1001 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE,
        })
      );
    });

    it('should accept valid page_size within range', () => {
      const result = validateGetDecisionsRequest({ ...validParams, page_size: 50 });
      expect(result.valid).toBe(true);
      expect(result.parsed!.page_size).toBe(50);
    });

    it('should fail with invalid_page_token when token is malformed', () => {
      const result = validateGetDecisionsRequest({
        ...validParams,
        page_token: 'not-base64-cursor',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_PAGE_TOKEN,
          field_path: 'page_token',
        })
      );
    });

    it('should accept valid page_token', () => {
      // Valid: base64 of "v1:42"
      const validToken = Buffer.from('v1:42').toString('base64');
      const result = validateGetDecisionsRequest({ ...validParams, page_token: validToken });
      expect(result.valid).toBe(true);
      expect(result.parsed!.page_token).toBe(validToken);
    });

    it('should fail when params is null or not an object', () => {
      expect(validateGetDecisionsRequest(null).valid).toBe(false);
      expect(validateGetDecisionsRequest([]).valid).toBe(false);
      expect(validateGetDecisionsRequest(42).valid).toBe(false);
    });
  });
});
