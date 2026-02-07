/**
 * Unit tests for STATE validator
 * validateApplySignalsRequest and validateStateObject per state-engine spec
 */

import { describe, it, expect } from 'vitest';
import {
  validateApplySignalsRequest,
  validateStateObject,
} from '../../src/state/validator.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

describe('STATE Validator', () => {
  describe('validateApplySignalsRequest', () => {
    it('should pass for valid request with org_id, learner_reference, non-empty signal_ids', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: 'learner-1',
        signal_ids: ['sig-1', 'sig-2'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with org_scope_required when org_id is missing', () => {
      const request = {
        learner_reference: 'learner-1',
        signal_ids: ['sig-1'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.ORG_SCOPE_REQUIRED,
          field_path: 'org_id',
        })
      );
    });

    it('should fail with org_scope_required when org_id is blank', () => {
      const request = {
        org_id: '   ',
        learner_reference: 'learner-1',
        signal_ids: ['sig-1'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.ORG_SCOPE_REQUIRED,
          field_path: 'org_id',
        })
      );
    });

    it('should fail with missing_required_field when learner_reference is missing', () => {
      const request = {
        org_id: 'org-1',
        signal_ids: ['sig-1'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'learner_reference',
        })
      );
    });

    it('should fail with missing_required_field when learner_reference is blank', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: '',
        signal_ids: ['sig-1'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'learner_reference',
        })
      );
    });

    it('should fail with missing_required_field when signal_ids is missing', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: 'learner-1',
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'signal_ids',
        })
      );
    });

    it('should fail with missing_required_field when signal_ids is empty array', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: 'learner-1',
        signal_ids: [],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          message: expect.stringContaining('must not be empty'),
          field_path: 'signal_ids',
        })
      );
    });

    it('should fail when signal_ids is not an array', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: 'learner-1',
        signal_ids: 'sig-1',
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          field_path: 'signal_ids',
        })
      );
    });

    it('should fail when signal_ids contains non-string with field_path', () => {
      const request = {
        org_id: 'org-1',
        learner_reference: 'learner-1',
        signal_ids: ['sig-1', 42, 'sig-2'],
        requested_at: '2026-02-07T10:00:00Z',
      };
      const result = validateApplySignalsRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.INVALID_TYPE,
          field_path: 'signal_ids[1]',
        })
      );
    });

    it('should fail when request is null or not an object', () => {
      expect(validateApplySignalsRequest(null).valid).toBe(false);
      expect(validateApplySignalsRequest(42).valid).toBe(false);
      expect(validateApplySignalsRequest('string').valid).toBe(false);
      expect(validateApplySignalsRequest([]).valid).toBe(false);
    });
  });

  describe('validateStateObject', () => {
    it('should pass for plain object without forbidden keys', () => {
      const state = { skill: 'math', level: 5, data: { nested: true } };
      const result = validateStateObject(state);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for empty object', () => {
      const result = validateStateObject({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with state_payload_not_object when state is array', () => {
      const result = validateStateObject([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.STATE_PAYLOAD_NOT_OBJECT,
          field_path: 'state',
        })
      );
    });

    it('should fail with state_payload_not_object when state is null', () => {
      const result = validateStateObject(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.STATE_PAYLOAD_NOT_OBJECT,
          field_path: 'state',
        })
      );
    });

    it('should fail with state_payload_not_object when state is primitive', () => {
      expect(validateStateObject(42).valid).toBe(false);
      expect(validateStateObject('string').valid).toBe(false);
      expect(validateStateObject(true).valid).toBe(false);
    });

    it('should fail with forbidden_semantic_key_detected when state has forbidden key at top level', () => {
      const state = { course: 'math-101', level: 5 };
      const result = validateStateObject(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
          field_path: 'state.course',
        })
      );
    });

    it('should fail with forbidden_semantic_key_detected when state has forbidden key nested', () => {
      const state = { data: { workflow: 'step-1' } };
      const result = validateStateObject(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
          field_path: 'state.data.workflow',
        })
      );
    });

    it('should fail with forbidden_semantic_key_detected for other forbidden keys (ui, status)', () => {
      expect(validateStateObject({ ui: {} }).valid).toBe(false);
      expect(validateStateObject({ status: 'active' }).valid).toBe(false);
    });
  });
});
