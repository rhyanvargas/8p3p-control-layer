/**
 * Contract Tests for STATE Engine (STATE-001 through STATE-008)
 * Tests applySignals behavior against the state-engine spec contract.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  getState,
} from '../../src/state/store.js';
import { applySignals } from '../../src/state/engine.js';
import { validateStateObject } from '../../src/state/validator.js';
import type { SignalEnvelope } from '../../src/shared/types.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

describe('STATE Engine Contract Tests', () => {
  beforeAll(() => {
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
  });

  afterAll(() => {
    closeSignalLogStore();
    closeStateStore();
  });

  beforeEach(() => {
    clearSignalLogStore();
    clearStateStore();
  });

  /** Create and append a signal to the log; returns the signal_id and accepted_at */
  function appendTestSignal(
    overrides: Partial<SignalEnvelope> & { payload?: Record<string, unknown> } = {}
  ): { signal_id: string; accepted_at: string; envelope: SignalEnvelope } {
    const signal_id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const accepted_at = new Date().toISOString();
    const envelope: SignalEnvelope = {
      org_id: 'org-A',
      signal_id,
      source_system: 'test',
      learner_reference: 'learner-1',
      timestamp: accepted_at,
      schema_version: 'v1',
      payload: { skill: 'math', level: 1 },
      ...overrides,
    };
    if (overrides.payload !== undefined) {
      envelope.payload = overrides.payload;
    }
    appendSignal(envelope, accepted_at);
    return { signal_id, accepted_at, envelope };
  }

  describe('STATE-001: ApplySignals happy path', () => {
    it('should return ApplySignalsResult with new_state_version >= prior_state_version and applied_signal_ids match', () => {
      const { signal_id, accepted_at } = appendTestSignal();

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const result = outcome.result;
      expect(result.org_id).toBe('org-A');
      expect(result.learner_reference).toBe('learner-1');
      expect(result.prior_state_version).toBe(0);
      expect(result.new_state_version).toBeGreaterThanOrEqual(result.prior_state_version);
      expect(result.applied_signal_ids).toEqual([signal_id]);
      expect(result.state_id).toBe('org-A:learner-1:v1');
      expect(result.updated_at).toBeDefined();
    });

    it('should persist state so getState returns it', () => {
      const { signal_id, accepted_at } = appendTestSignal({ payload: { skill: 'math', level: 2 } });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(true);
      const state = getState('org-A', 'learner-1');
      expect(state).not.toBeNull();
      expect(state!.state).toEqual({ skill: 'math', level: 2 });
      expect(state!.state_version).toBe(1);
    });
  });

  describe('STATE-002: Unknown signal ID', () => {
    it('should reject with unknown_signal_id when signal_ids include unknown id', () => {
      appendTestSignal(); // ensure org/learner exist if needed; we won't use this id
      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: ['non-existent-signal-id'],
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.UNKNOWN_SIGNAL_ID);
    });
  });

  describe('STATE-003: Cross-org signal', () => {
    it('should reject with signals_not_in_org_scope when request org differs from signal org', () => {
      const { signal_id, accepted_at } = appendTestSignal({ org_id: 'org-B' });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.SIGNALS_NOT_IN_ORG_SCOPE);
    });
  });

  describe('STATE-004: State not object', () => {
    it('should reject with state_payload_not_object when state is not a JSON object', () => {
      const validation = validateStateObject([]);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].code).toBe(ErrorCodes.STATE_PAYLOAD_NOT_OBJECT);
    });

    it('should reject when state is null', () => {
      const validation = validateStateObject(null);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0].code).toBe(ErrorCodes.STATE_PAYLOAD_NOT_OBJECT);
    });
  });

  describe('STATE-005: Forbidden key in state', () => {
    it('should reject with forbidden_semantic_key_detected when signal payload has forbidden key (e.g. course)', () => {
      const { signal_id, accepted_at } = appendTestSignal({
        payload: { course: 'math-101' },
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED);
      expect(outcome.errors[0].field_path).toContain('course');
    });
  });

  describe('STATE-006: Monotonic state_version', () => {
    it('should have second applySignals new_state_version > first', () => {
      const one = appendTestSignal({ payload: { a: 1 } });
      const two = appendTestSignal({ payload: { b: 2 } });

      const outcome1 = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [one.signal_id],
        requested_at: one.accepted_at,
      });
      expect(outcome1.ok).toBe(true);
      const version1 = outcome1.ok ? outcome1.result.new_state_version : 0;

      const outcome2 = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [two.signal_id],
        requested_at: two.accepted_at,
      });
      expect(outcome2.ok).toBe(true);
      const version2 = outcome2.ok ? outcome2.result.new_state_version : 0;

      expect(version2).toBeGreaterThan(version1);
    });
  });

  describe('STATE-007: Idempotency', () => {
    it('should return same result when same signal_ids applied twice with same prior state', () => {
      const { signal_id, accepted_at } = appendTestSignal({ payload: { x: 1 } });

      const request = {
        org_id: 'org-A' as const,
        learner_reference: 'learner-1' as const,
        signal_ids: [signal_id],
        requested_at: accepted_at,
      };

      const outcome1 = applySignals(request);
      expect(outcome1.ok).toBe(true);
      const result1 = outcome1.ok ? outcome1.result : null;

      const outcome2 = applySignals(request);
      expect(outcome2.ok).toBe(true);
      const result2 = outcome2.ok ? outcome2.result : null;

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result2!.state_id).toBe(result1!.state_id);
      expect(result2!.new_state_version).toBe(result1!.new_state_version);
      expect(result2!.prior_state_version).toBe(result1!.new_state_version);
      expect(result2!.applied_signal_ids).toEqual([]);
    });
  });

  describe('STATE-008: Deterministic conflict resolution', () => {
    it('should yield same final state for same signals applied in different call orders', () => {
      const s1 = appendTestSignal({ payload: { a: 1, label: 'first' } });
      const s2 = appendTestSignal({ payload: { b: 2, label: 'second' } });

      const outcomeSingle = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [s1.signal_id, s2.signal_id],
        requested_at: s1.accepted_at,
      });
      expect(outcomeSingle.ok).toBe(true);
      const stateAfterSingle = getState('org-A', 'learner-1');
      expect(stateAfterSingle).not.toBeNull();
      const stateSnapshotSingle = JSON.stringify(stateAfterSingle!.state);

      clearStateStore();

      const outcome1 = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [s1.signal_id],
        requested_at: s1.accepted_at,
      });
      expect(outcome1.ok).toBe(true);
      const outcome2 = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [s2.signal_id],
        requested_at: s2.accepted_at,
      });
      expect(outcome2.ok).toBe(true);

      const finalState = getState('org-A', 'learner-1');
      expect(finalState).not.toBeNull();
      expect(JSON.stringify(finalState!.state)).toBe(stateSnapshotSingle);
    });
  });
});
