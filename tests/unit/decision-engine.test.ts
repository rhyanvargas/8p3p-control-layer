/**
 * Unit tests for Decision Engine
 * evaluateState validation, rejection paths, trace correctness, determinism, persistence
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
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
import { applySignals } from '../../src/state/engine.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  getDecisionById,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import { evaluateState } from '../../src/decision/engine.js';
import type { SignalEnvelope, EvaluateStateForDecisionRequest } from '../../src/shared/types.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let sigCounter = 0;

function appendTestSignal(
  overrides: Partial<SignalEnvelope> & { payload?: Record<string, unknown> } = {}
): { signal_id: string; accepted_at: string } {
  sigCounter++;
  const signal_id = `sig-engine-${sigCounter}-${Date.now()}`;
  const accepted_at = new Date().toISOString();
  const envelope: SignalEnvelope = {
    org_id: 'org-A',
    signal_id,
    source_system: 'test',
    learner_reference: 'learner-1',
    timestamp: accepted_at,
    schema_version: 'v1',
    payload: { stabilityScore: 0.5, timeSinceReinforcement: 100000 },
    ...overrides,
  };
  if (overrides.payload !== undefined) {
    envelope.payload = overrides.payload;
  }
  appendSignal(envelope, accepted_at);
  return { signal_id, accepted_at };
}

/**
 * Create a learner state by applying a signal, return the state_id and state_version
 * needed to build an EvaluateStateForDecisionRequest.
 */
function setupLearnerState(
  orgId = 'org-A',
  learnerRef = 'learner-1',
  payload: Record<string, unknown> = { stabilityScore: 0.5, timeSinceReinforcement: 100000 }
): { state_id: string; state_version: number; signal_id: string } {
  const { signal_id, accepted_at } = appendTestSignal({
    org_id: orgId,
    learner_reference: learnerRef,
    payload,
  });
  const outcome = applySignals({
    org_id: orgId,
    learner_reference: learnerRef,
    signal_ids: [signal_id],
    requested_at: accepted_at,
  });
  if (!outcome.ok) {
    throw new Error(`Failed to set up learner state: ${JSON.stringify(outcome.errors)}`);
  }
  return {
    state_id: outcome.result.state_id,
    state_version: outcome.result.new_state_version,
    signal_id,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Decision Engine', () => {
  beforeAll(() => {
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy(path.join(process.cwd(), 'src/decision/policies/default.json'));
  });

  afterAll(() => {
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
  });

  beforeEach(() => {
    sigCounter = 0;
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  describe('happy path', () => {
    it('should return { ok: true, result: Decision } with valid request', () => {
      const { state_id, state_version } = setupLearnerState();

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.org_id).toBe('org-A');
        expect(outcome.result.learner_reference).toBe('learner-1');
        expect(outcome.result.decision_id).toBeDefined();
        expect(outcome.result.decision_type).toBeDefined();
        expect(outcome.result.decided_at).toBeDefined();
        expect(outcome.result.decision_context).toEqual({});
        expect(outcome.result.trace).toBeDefined();
      }
    });

    it('should include correct trace fields', () => {
      const { state_id, state_version } = setupLearnerState();

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.trace.state_id).toBe(state_id);
        expect(outcome.result.trace.state_version).toBe(state_version);
        expect(outcome.result.trace.policy_version).toBe('1.0.0');
        // Default policy: stabilityScore<0.7 AND timeSinceReinforcement>86400 → rule-reinforce
        expect(outcome.result.trace.matched_rule_id).toBe('rule-reinforce');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation failures
  // -----------------------------------------------------------------------
  describe('validation failures', () => {
    it('should reject with org_scope_required when org_id is missing', () => {
      const outcome = evaluateState({
        learner_reference: 'learner-1',
        state_id: 'some-id',
        state_version: 1,
        requested_at: new Date().toISOString(),
      } as EvaluateStateForDecisionRequest);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toContainEqual(
          expect.objectContaining({ code: ErrorCodes.ORG_SCOPE_REQUIRED })
        );
      }
    });

    it('should reject with missing_required_field when learner_reference is missing', () => {
      const outcome = evaluateState({
        org_id: 'org-A',
        state_id: 'some-id',
        state_version: 1,
        requested_at: new Date().toISOString(),
      } as EvaluateStateForDecisionRequest);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toContainEqual(
          expect.objectContaining({ code: ErrorCodes.MISSING_REQUIRED_FIELD })
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // State not found
  // -----------------------------------------------------------------------
  describe('state not found', () => {
    it('should reject with state_not_found when no state exists for learner', () => {
      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'nonexistent-learner',
        state_id: 'fake-id',
        state_version: 1,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0]!.code).toBe(ErrorCodes.STATE_NOT_FOUND);
      }
    });
  });

  // -----------------------------------------------------------------------
  // State version mismatch
  // -----------------------------------------------------------------------
  describe('state version mismatch', () => {
    it('should reject with trace_state_mismatch when state_version differs', () => {
      const { state_id } = setupLearnerState();

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version: 999, // wrong version
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0]!.code).toBe(ErrorCodes.TRACE_STATE_MISMATCH);
      }
    });

    it('should reject with trace_state_mismatch when state_id differs', () => {
      const { state_version } = setupLearnerState();

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id: 'wrong-state-id',
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0]!.code).toBe(ErrorCodes.TRACE_STATE_MISMATCH);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Decision is persisted
  // -----------------------------------------------------------------------
  describe('persistence', () => {
    it('should persist decision retrievable via getDecisionById', () => {
      const { state_id, state_version } = setupLearnerState();

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        const retrieved = getDecisionById('org-A', outcome.result.decision_id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.decision_id).toBe(outcome.result.decision_id);
        expect(retrieved!.decision_type).toBe(outcome.result.decision_type);
        expect(retrieved!.trace).toEqual(outcome.result.trace);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Determinism (DEC-006 unit-level)
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('should produce the same decision_type for the same input state (DEC-006)', () => {
      const { state_id, state_version } = setupLearnerState();

      const request: EvaluateStateForDecisionRequest = {
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      };

      const outcome1 = evaluateState(request);
      expect(outcome1.ok).toBe(true);

      // Clear decisions so we can evaluate again (same state, fresh decision store)
      clearDecisionStore();

      const outcome2 = evaluateState(request);
      expect(outcome2.ok).toBe(true);

      if (outcome1.ok && outcome2.ok) {
        expect(outcome1.result.decision_type).toBe(outcome2.result.decision_type);
        expect(outcome1.result.trace.matched_rule_id).toBe(outcome2.result.trace.matched_rule_id);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Different state payloads → different outcomes
  // -----------------------------------------------------------------------
  describe('policy evaluation outcomes', () => {
    it('should return reinforce (rule match) when stabilityScore < 0.7 and timeSinceReinforcement > 86400', () => {
      const { state_id, state_version } = setupLearnerState('org-A', 'learner-1', {
        stabilityScore: 0.3,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.decision_type).toBe('reinforce');
        expect(outcome.result.trace.matched_rule_id).toBe('rule-reinforce');
      }
    });

    it('should return reinforce (default) when stabilityScore >= 0.7 (no rule match)', () => {
      const { state_id, state_version } = setupLearnerState('org-A', 'learner-1', {
        stabilityScore: 0.9,
        timeSinceReinforcement: 100000,
      });

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.decision_type).toBe('reinforce');
        // Default: no rule matched
        expect(outcome.result.trace.matched_rule_id).toBeNull();
      }
    });

    it('should return reinforce (default) when timeSinceReinforcement <= 86400 (no rule match)', () => {
      const { state_id, state_version } = setupLearnerState('org-A', 'learner-1', {
        stabilityScore: 0.3,
        timeSinceReinforcement: 1000,
      });

      const outcome = evaluateState({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id,
        state_version,
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.decision_type).toBe('reinforce');
        expect(outcome.result.trace.matched_rule_id).toBeNull();
      }
    });
  });
});
