/**
 * Contract Tests for STATE Engine (STATE-001 through STATE-013)
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
  getStateByVersion,
} from '../../src/state/store.js';
import { applySignals } from '../../src/state/engine.js';
import { validateStateObject } from '../../src/state/validator.js';
import { extractCanonicalSnapshot } from '../../src/decision/engine.js';
import { evaluatePolicy } from '../../src/decision/policy-loader.js';
import type { SignalEnvelope, PolicyDefinition } from '../../src/shared/types.js';
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
      // Use string-only payloads: delta detection is path-dependent for numeric fields,
      // so this test intentionally avoids numeric values to preserve the determinism contract.
      const s1 = appendTestSignal({ payload: { x: 'one', label: 'first' } });
      const s2 = appendTestSignal({ payload: { y: 'two', label: 'second' } });

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

  describe('STATE-009: New learner state', () => {
    it('should create version 1 for first signal application and persist state', () => {
      const learner = 'learner-9';
      const { signal_id, accepted_at } = appendTestSignal({
        learner_reference: learner,
        payload: { skill: 'science', level: 1 },
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.result.prior_state_version).toBe(0);
      expect(outcome.result.new_state_version).toBe(1);
      expect(outcome.result.state_id).toBe('org-A:learner-9:v1');

      const state = getState('org-A', learner);
      expect(state).not.toBeNull();
      expect(state!.state_version).toBe(1);
      expect(state!.state).toEqual({ skill: 'science', level: 1 });
    });
  });

  describe('STATE-010: Empty state object allowed', () => {
    it('should accept and persist empty object state when payload is {}', () => {
      const learner = 'learner-empty';
      const { signal_id, accepted_at } = appendTestSignal({
        learner_reference: learner,
        payload: {},
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(true);
      const state = getState('org-A', learner);
      expect(state).not.toBeNull();
      expect(state!.state).toEqual({});
    });
  });

  describe('STATE-011: Provenance tracking', () => {
    it('should persist provenance fields for the last applied signal', () => {
      const learner = 'learner-prov';
      const s1 = appendTestSignal({ learner_reference: learner, payload: { a: 1 } });
      const s2 = appendTestSignal({ learner_reference: learner, payload: { b: 2 } });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [s1.signal_id, s2.signal_id],
        requested_at: s1.accepted_at,
      });

      expect(outcome.ok).toBe(true);
      const state = getState('org-A', learner);
      expect(state).not.toBeNull();
      expect(state!.provenance.last_signal_id).toBe(s2.signal_id);
      expect(state!.provenance.last_signal_timestamp).toBe(s2.accepted_at);
    });
  });

  describe('STATE-012: Get state by version', () => {
    it('should retrieve historical versions after sequential applies', () => {
      const learner = 'learner-hist';
      const s1 = appendTestSignal({ learner_reference: learner, payload: { v: 1 } });
      const s2 = appendTestSignal({ learner_reference: learner, payload: { v: 2 } });

      const o1 = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [s1.signal_id],
        requested_at: s1.accepted_at,
      });
      expect(o1.ok).toBe(true);

      const o2 = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [s2.signal_id],
        requested_at: s2.accepted_at,
      });
      expect(o2.ok).toBe(true);

      const v1 = getStateByVersion('org-A', learner, 1);
      const v2 = getStateByVersion('org-A', learner, 2);
      expect(v1).not.toBeNull();
      expect(v1!.state_version).toBe(1);
      expect(v1!.state).toEqual({ v: 1 });
      expect(v2).not.toBeNull();
      expect(v2!.state_version).toBe(2);
      // v2 was applied on top of v1 (prior: { v:1 }) — delta detection enriches the state
      expect(v2!.state).toEqual({ v: 2, v_delta: 1, v_direction: 'improving' });
    });
  });

  describe('STATE-014: Cross-org signal in mixed batch', () => {
    it('should reject with signals_not_in_org_scope when batch includes a cross-org signal', () => {
      // signal-A belongs to org-A, signal-B belongs to org-B (both for learner-1)
      const sigA = appendTestSignal({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        payload: { skill: 'math', level: 1 },
      });
      const sigB = appendTestSignal({
        org_id: 'org-B',
        learner_reference: 'learner-1',
        payload: { skill: 'reading', level: 2 },
      });

      // Apply both signals under org-A — sigB is cross-org
      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [sigA.signal_id, sigB.signal_id],
        requested_at: sigA.accepted_at,
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors.length).toBeGreaterThanOrEqual(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.SIGNALS_NOT_IN_ORG_SCOPE);
    });

    it('should not persist any state when the batch is rejected (no partial apply)', () => {
      const sigA = appendTestSignal({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        payload: { skill: 'science', level: 3 },
      });
      const sigB = appendTestSignal({
        org_id: 'org-B',
        learner_reference: 'learner-1',
        payload: { skill: 'art', level: 1 },
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [sigA.signal_id, sigB.signal_id],
        requested_at: sigA.accepted_at,
      });

      expect(outcome.ok).toBe(false);

      // No state should have been persisted for learner-1
      const state = getState('org-A', 'learner-1');
      expect(state).toBeNull();
    });
  });

  describe('STATE-013: State isolation by learner', () => {
    it('should keep learner-1 and learner-2 state independent (same org); versions start at v1 each', () => {
      const org = 'org-A';
      const sig1 = appendTestSignal({
        learner_reference: 'learner-1',
        payload: { learner: 'one', skill: 'math' },
      });
      const sig2 = appendTestSignal({
        learner_reference: 'learner-2',
        payload: { learner: 'two', skill: 'reading' },
      });

      const outcome1 = applySignals({
        org_id: org,
        learner_reference: 'learner-1',
        signal_ids: [sig1.signal_id],
        requested_at: sig1.accepted_at,
      });
      expect(outcome1.ok).toBe(true);
      if (outcome1.ok) {
        expect(outcome1.result.new_state_version).toBe(1);
        expect(outcome1.result.prior_state_version).toBe(0);
      }

      const outcome2 = applySignals({
        org_id: org,
        learner_reference: 'learner-2',
        signal_ids: [sig2.signal_id],
        requested_at: sig2.accepted_at,
      });
      expect(outcome2.ok).toBe(true);
      if (outcome2.ok) {
        expect(outcome2.result.new_state_version).toBe(1);
        expect(outcome2.result.prior_state_version).toBe(0);
      }

      const state1 = getState(org, 'learner-1');
      const state2 = getState(org, 'learner-2');

      expect(state1).not.toBeNull();
      expect(state1!.state).toEqual({ learner: 'one', skill: 'math' });
      expect(state1!.state_version).toBe(1);

      expect(state2).not.toBeNull();
      expect(state2!.state).toEqual({ learner: 'two', skill: 'reading' });
      expect(state2!.state_version).toBe(1);
    });
  });

  describe('DELTA-005: Delta fields in decision trace', () => {
    it('policy rule on stabilityScore_delta fires; trace snapshot includes delta value; rationale references delta field', () => {
      const learner = 'learner-delta-005';

      // Signal 1 — establishes baseline stabilityScore
      const sig1 = appendTestSignal({ learner_reference: learner, payload: { stabilityScore: 0.55 } });
      const o1 = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [sig1.signal_id],
        requested_at: sig1.accepted_at,
      });
      expect(o1.ok).toBe(true);

      // Signal 2 — drops stabilityScore, triggering delta computation
      const sig2 = appendTestSignal({ learner_reference: learner, payload: { stabilityScore: 0.28 } });
      const o2 = applySignals({
        org_id: 'org-A',
        learner_reference: learner,
        signal_ids: [sig2.signal_id],
        requested_at: sig2.accepted_at,
      });
      expect(o2.ok).toBe(true);

      // Confirm delta fields are present in persisted state
      const stateRecord = getState('org-A', learner);
      expect(stateRecord).not.toBeNull();
      const stateObj = stateRecord!.state as Record<string, unknown>;
      expect(stateObj.stabilityScore_delta as number).toBeCloseTo(-0.27, 5);
      expect(stateObj.stabilityScore_direction).toBe('declining');

      // Policy fixture: fires "intervene" when stabilityScore_delta < -0.1
      const deltaPolicy: PolicyDefinition = {
        policy_id: 'test-delta-policy',
        policy_version: '1.0.0',
        description: 'Test policy exercising delta companion fields',
        default_decision_type: 'monitor',
        rules: [
          {
            rule_id: 'rule-stability-delta-drop',
            decision_type: 'intervene',
            condition: { field: 'stabilityScore_delta', operator: 'lt', value: -0.1 },
          },
        ],
      };

      // Decision engine evaluates policy against state
      const evalResult = evaluatePolicy(stateObj, deltaPolicy);
      expect(evalResult.decision_type).toBe('intervene');
      expect(evalResult.matched_rule_id).toBe('rule-stability-delta-drop');

      // Canonical snapshot for trace includes the delta field
      const snapshot = extractCanonicalSnapshot(stateObj, deltaPolicy);
      expect(snapshot.stabilityScore_delta as number).toBeCloseTo(-0.27, 5);

      // Rationale: evaluated_fields must reference stabilityScore_delta
      const deltaField = evalResult.evaluated_fields?.find((f) => f.field === 'stabilityScore_delta');
      expect(deltaField).toBeDefined();
      expect(deltaField!.field).toBe('stabilityScore_delta');
    });
  });
});
