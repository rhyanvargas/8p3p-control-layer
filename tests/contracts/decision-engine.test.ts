/**
 * Contract Tests for Decision Engine (DEC-001 through DEC-008)
 * Tests evaluateState and validators against the spec contract.
 *
 * Strategy (per spec §Testing strategy note):
 *   DEC-001, DEC-006, DEC-007, DEC-008 — full evaluateState() flow end-to-end
 *   DEC-002–DEC-005 — test validator functions directly (edge cases the engine
 *     won't produce, ensuring safety-net validators are exercised)
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
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  getDecisionById,
} from '../../src/decision/store.js';
import { applySignals } from '../../src/state/engine.js';
import { evaluateState } from '../../src/decision/engine.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import { validateDecisionType, validateDecisionContext } from '../../src/decision/validator.js';
import { validateDecision } from '../../src/contracts/validators/decision.js';
import type { SignalEnvelope } from '../../src/shared/types.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

describe('Decision Engine Contract Tests', () => {
  beforeAll(() => {
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy(); // loads default.json (POC v1 policy)
  });

  afterAll(() => {
    closeSignalLogStore();
    closeStateStore();
    closeDecisionStore();
  });

  beforeEach(() => {
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Append a signal to the Signal Log and apply it to state via STATE engine.
   * Returns the resulting state_id and state_version for evaluateState requests.
   */
  function createStateViaSignal(
    payload: Record<string, unknown>,
    opts: { org_id?: string; learner_reference?: string } = {}
  ): { state_id: string; state_version: number; org_id: string; learner_reference: string } {
    const org_id = opts.org_id ?? 'org-A';
    const learner_reference = opts.learner_reference ?? 'learner-1';
    const signal_id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const accepted_at = new Date().toISOString();

    const envelope: SignalEnvelope = {
      org_id,
      signal_id,
      source_system: 'test',
      learner_reference,
      timestamp: accepted_at,
      schema_version: 'v1',
      payload,
    };

    appendSignal(envelope, accepted_at);

    const outcome = applySignals({
      org_id,
      learner_reference,
      signal_ids: [signal_id],
      requested_at: accepted_at,
    });

    if (!outcome.ok) {
      throw new Error(`applySignals failed: ${JSON.stringify(outcome.errors)}`);
    }

    return {
      state_id: outcome.result.state_id,
      state_version: outcome.result.new_state_version,
      org_id,
      learner_reference,
    };
  }

  // ---------------------------------------------------------------------------
  // DEC-001: Evaluate Decision Happy Path
  // ---------------------------------------------------------------------------

  describe('DEC-001: Evaluate Decision Happy Path', () => {
    it('should return valid Decision with trace for valid request', () => {
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const decision = outcome.result;

      // Decision shape — all required fields present
      expect(decision.org_id).toBe(org_id);
      expect(typeof decision.decision_id).toBe('string');
      expect(decision.decision_id.length).toBeGreaterThan(0);
      expect(decision.learner_reference).toBe(learner_reference);
      expect(typeof decision.decision_type).toBe('string');
      expect(typeof decision.decided_at).toBe('string');
      expect(typeof decision.decision_context).toBe('object');
      expect(Array.isArray(decision.decision_context)).toBe(false);

      // Trace — all required fields present and correct
      expect(decision.trace).toBeDefined();
      expect(decision.trace.state_id).toBe(state_id);
      expect(decision.trace.state_version).toBe(state_version);
      expect(typeof decision.trace.policy_version).toBe('string');
      expect(decision.trace.policy_version.length).toBeGreaterThan(0);
      expect(
        decision.trace.matched_rule_id === null ||
          typeof decision.trace.matched_rule_id === 'string'
      ).toBe(true);
    });

    it('should persist decision (retrievable via getDecisionById)', () => {
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const persisted = getDecisionById(org_id, outcome.result.decision_id);
      expect(persisted).not.toBeNull();
      expect(persisted!.decision_id).toBe(outcome.result.decision_id);
      expect(persisted!.decision_type).toBe(outcome.result.decision_type);
      expect(persisted!.trace.state_id).toBe(state_id);
      expect(persisted!.trace.state_version).toBe(state_version);
    });

    it('should pass Ajv schema validation on the produced Decision', () => {
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const schemaResult = validateDecision(outcome.result);
      expect(schemaResult.valid).toBe(true);
      expect(schemaResult.errors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-002: Closed Decision Type Enforcement
  // ---------------------------------------------------------------------------

  describe('DEC-002: Closed Decision Type Enforcement', () => {
    it('should reject decision_type "promote" as invalid', () => {
      const result = validateDecisionType('promote');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ErrorCodes.INVALID_DECISION_TYPE);
    });

    it('should accept all 7 valid decision types', () => {
      const validTypes = [
        'reinforce',
        'advance',
        'intervene',
        'pause',
        'escalate',
        'recommend',
        'reroute',
      ];
      for (const type of validTypes) {
        const result = validateDecisionType(type);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-003: decision_context Must Be Object
  // ---------------------------------------------------------------------------

  describe('DEC-003: decision_context Must Be Object', () => {
    it('should reject decision_context=[] (array)', () => {
      const result = validateDecisionContext([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ErrorCodes.DECISION_CONTEXT_NOT_OBJECT);
    });

    it('should reject decision_context=null', () => {
      const result = validateDecisionContext(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCodes.DECISION_CONTEXT_NOT_OBJECT);
    });

    it('should accept decision_context={} (empty object)', () => {
      const result = validateDecisionContext({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-004: Forbidden Semantic Keys in decision_context
  // ---------------------------------------------------------------------------

  describe('DEC-004: Forbidden Semantic Keys in decision_context', () => {
    it('should reject decision_context with forbidden key "task"', () => {
      const result = validateDecisionContext({ task: { assignee: 'bob' } });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-005: Trace Required
  // ---------------------------------------------------------------------------

  describe('DEC-005: Trace Required', () => {
    it('should reject Decision missing trace via Ajv schema', () => {
      const decisionWithoutTrace = {
        org_id: 'org-A',
        decision_id: 'dec-001',
        learner_reference: 'learner-1',
        decision_type: 'reinforce',
        decided_at: '2026-01-30T10:00:00Z',
        decision_context: {},
        // trace intentionally omitted
      };

      const result = validateDecision(decisionWithoutTrace);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.code === ErrorCodes.MISSING_TRACE)).toBe(true);
    });

    it('should reject Decision with trace missing required fields', () => {
      const decisionWithPartialTrace = {
        org_id: 'org-A',
        decision_id: 'dec-002',
        learner_reference: 'learner-1',
        decision_type: 'reinforce',
        decided_at: '2026-01-30T10:00:00Z',
        decision_context: {},
        trace: {
          state_id: 'org-A:learner-1:v1',
          // state_version, policy_version, matched_rule_id missing
        },
      };

      const result = validateDecision(decisionWithPartialTrace);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.code === ErrorCodes.MISSING_TRACE)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-006: Deterministic Decision Output
  // ---------------------------------------------------------------------------

  describe('DEC-006: Deterministic Decision Output', () => {
    it('should produce identical decision_type and matched_rule_id for same state evaluated twice', () => {
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome1 = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      const outcome2 = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome1.ok).toBe(true);
      expect(outcome2.ok).toBe(true);
      if (!outcome1.ok || !outcome2.ok) return;

      // Same decision_type
      expect(outcome1.result.decision_type).toBe(outcome2.result.decision_type);
      // Same matched_rule_id
      expect(outcome1.result.trace.matched_rule_id).toBe(
        outcome2.result.trace.matched_rule_id
      );
      // Equivalent decision_context
      expect(outcome1.result.decision_context).toEqual(outcome2.result.decision_context);
      // Different decision_ids (each evaluation creates a new decision)
      expect(outcome1.result.decision_id).not.toBe(outcome2.result.decision_id);
    });

    it('should produce deterministic output on default path as well', () => {
      // State that falls to default (stabilityScore above threshold)
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.9,
        timeSinceReinforcement: 100000,
      });

      const outcome1 = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      const outcome2 = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome1.ok).toBe(true);
      expect(outcome2.ok).toBe(true);
      if (!outcome1.ok || !outcome2.ok) return;

      expect(outcome1.result.decision_type).toBe(outcome2.result.decision_type);
      expect(outcome1.result.trace.matched_rule_id).toBe(
        outcome2.result.trace.matched_rule_id
      );
      expect(outcome1.result.decision_context).toEqual(outcome2.result.decision_context);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-007: Trace-State Mismatch
  // ---------------------------------------------------------------------------

  describe('DEC-007: Trace-State Mismatch', () => {
    it('should reject with trace_state_mismatch when state_version does not match', () => {
      const { state_id, state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id,
        learner_reference,
        state_id,
        state_version: state_version + 999, // intentionally wrong version
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.TRACE_STATE_MISMATCH);
    });

    it('should reject with trace_state_mismatch when state_id does not match', () => {
      const { state_version, org_id, learner_reference } = createStateViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id,
        learner_reference,
        state_id: 'completely-wrong-state-id',
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe(ErrorCodes.TRACE_STATE_MISMATCH);
    });
  });

  // ---------------------------------------------------------------------------
  // DEC-008: Traceability per decision type (POC v1 — 3 parameterized cases)
  // ---------------------------------------------------------------------------

  describe('DEC-008: Traceability per decision type (POC v1 — 3 cases)', () => {
    const testVectors = [
      {
        case_id: '8a',
        description: 'Both conditions met — rule fires',
        state: { stabilityScore: 0.5, timeSinceReinforcement: 100000 },
        expected_decision_type: 'reinforce',
        expected_matched_rule_id: 'rule-reinforce',
      },
      {
        case_id: '8b',
        description: 'stabilityScore above threshold — default path',
        state: { stabilityScore: 0.9, timeSinceReinforcement: 100000 },
        expected_decision_type: 'reinforce',
        expected_matched_rule_id: null,
      },
      {
        case_id: '8c',
        description: 'timeSinceReinforcement below window — default path',
        state: { stabilityScore: 0.5, timeSinceReinforcement: 1000 },
        expected_decision_type: 'reinforce',
        expected_matched_rule_id: null,
      },
    ] as const;

    for (const vector of testVectors) {
      it(`Case ${vector.case_id}: ${vector.description}`, () => {
        const { state_id, state_version, org_id, learner_reference } = createStateViaSignal(
          { ...vector.state }
        );

        const outcome = evaluateState({
          org_id,
          learner_reference,
          state_id,
          state_version,
          requested_at: new Date().toISOString(),
        });

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        // decision_type matches expected
        expect(outcome.result.decision_type).toBe(vector.expected_decision_type);

        // matched_rule_id matches expected
        expect(outcome.result.trace.matched_rule_id).toBe(vector.expected_matched_rule_id);

        // policy_version matches default.json
        expect(outcome.result.trace.policy_version).toBe('1.0.0');

        // trace references the correct state
        expect(outcome.result.trace.state_id).toBe(state_id);
        expect(outcome.result.trace.state_version).toBe(state_version);
      });
    }
  });
});
