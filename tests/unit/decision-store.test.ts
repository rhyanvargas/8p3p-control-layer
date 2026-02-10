/**
 * Unit tests for Decision Store
 * SQLite-backed immutable, append-only decision storage
 * Tests CRUD, pagination, org isolation, and JSON serialization round-trips
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDecisionStore,
  closeDecisionStore,
  saveDecision,
  getDecisionById,
  getDecisions,
  clearDecisionStore,
  encodePageToken,
} from '../../src/decision/store.js';
import type { Decision } from '../../src/shared/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function createDecision(overrides: Partial<Decision> = {}): Decision {
  idCounter++;
  return {
    org_id: 'test-org',
    decision_id: `dec-${idCounter}-${Date.now()}`,
    learner_reference: 'learner-1',
    decision_type: 'reinforce',
    decided_at: '2026-02-07T12:00:00.000Z',
    decision_context: {},
    trace: {
      state_id: 'test-org:learner-1:v1',
      state_version: 1,
      policy_version: '1.0.0',
      matched_rule_id: 'rule-1',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Decision Store', () => {
  beforeEach(() => {
    idCounter = 0;
    initDecisionStore(':memory:');
  });

  afterEach(() => {
    closeDecisionStore();
  });

  // -----------------------------------------------------------------------
  // saveDecision + getDecisionById round-trip
  // -----------------------------------------------------------------------
  describe('saveDecision and getDecisionById round-trip', () => {
    it('should save and retrieve the same Decision', () => {
      const decision = createDecision();
      saveDecision(decision);

      const retrieved = getDecisionById(decision.org_id, decision.decision_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.org_id).toBe(decision.org_id);
      expect(retrieved!.decision_id).toBe(decision.decision_id);
      expect(retrieved!.learner_reference).toBe(decision.learner_reference);
      expect(retrieved!.decision_type).toBe(decision.decision_type);
      expect(retrieved!.decided_at).toBe(decision.decided_at);
      expect(retrieved!.decision_context).toEqual(decision.decision_context);
      expect(retrieved!.trace).toEqual(decision.trace);
    });

    it('should return null for unknown decision_id', () => {
      const result = getDecisionById('test-org', 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Immutability — duplicate decision_id
  // -----------------------------------------------------------------------
  describe('immutability', () => {
    it('should throw on duplicate decision_id', () => {
      const decision = createDecision({ decision_id: 'dup-id' });
      saveDecision(decision);

      const duplicate = createDecision({ decision_id: 'dup-id' });
      expect(() => saveDecision(duplicate)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getDecisions — time range query
  // -----------------------------------------------------------------------
  describe('getDecisions time-range query', () => {
    it('should return decisions within the time range', () => {
      saveDecision(createDecision({ decided_at: '2026-01-01T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-06-15T12:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-12-31T23:59:59Z' }));

      const result = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(result.decisions).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should exclude decisions outside the time range', () => {
      saveDecision(createDecision({ decided_at: '2025-06-01T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-06-01T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2027-06-01T00:00:00Z' }));

      const result = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0]!.decided_at).toBe('2026-06-01T00:00:00Z');
    });

    it('should return empty result set when no decisions match', () => {
      saveDecision(createDecision({ decided_at: '2025-01-01T00:00:00Z' }));

      const result = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(result.decisions).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getDecisions — pagination
  // -----------------------------------------------------------------------
  describe('getDecisions pagination', () => {
    it('should paginate with hasMore and nextCursor', () => {
      // Insert 3 decisions
      saveDecision(createDecision({ decided_at: '2026-01-01T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-01-02T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-01-03T00:00:00Z' }));

      // Page 1: size 2
      const page1 = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
      });

      expect(page1.decisions).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      // Page 2: use the cursor
      const token = encodePageToken(page1.nextCursor!);
      const page2 = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
        page_token: token,
      });

      expect(page2.decisions).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should return all results when page_size exceeds total', () => {
      saveDecision(createDecision({ decided_at: '2026-01-01T00:00:00Z' }));
      saveDecision(createDecision({ decided_at: '2026-01-02T00:00:00Z' }));

      const result = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 100,
      });

      expect(result.decisions).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getDecisions — org isolation
  // -----------------------------------------------------------------------
  describe('getDecisions org isolation', () => {
    it('should not return decisions from another org', () => {
      saveDecision(createDecision({ org_id: 'org-A', decided_at: '2026-06-01T00:00:00Z' }));
      saveDecision(createDecision({ org_id: 'org-B', decided_at: '2026-06-01T00:00:00Z' }));

      const resultA = getDecisions({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(resultA.decisions).toHaveLength(1);
      expect(resultA.decisions[0]!.org_id).toBe('org-A');

      const resultB = getDecisions({
        org_id: 'org-B',
        learner_reference: 'learner-1',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(resultB.decisions).toHaveLength(1);
      expect(resultB.decisions[0]!.org_id).toBe('org-B');
    });
  });

  // -----------------------------------------------------------------------
  // trace.matched_rule_id null round-trip
  // -----------------------------------------------------------------------
  describe('trace.matched_rule_id null', () => {
    it('should round-trip null matched_rule_id correctly', () => {
      const decision = createDecision({
        trace: {
          state_id: 'test-org:learner-1:v1',
          state_version: 1,
          policy_version: '1.0.0',
          matched_rule_id: null,
        },
      });
      saveDecision(decision);

      const retrieved = getDecisionById(decision.org_id, decision.decision_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.trace.matched_rule_id).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // decision_context JSON serialization round-trip
  // -----------------------------------------------------------------------
  describe('decision_context JSON serialization', () => {
    it('should round-trip empty object', () => {
      const decision = createDecision({ decision_context: {} });
      saveDecision(decision);

      const retrieved = getDecisionById(decision.org_id, decision.decision_id);
      expect(retrieved!.decision_context).toEqual({});
    });

    it('should round-trip complex object', () => {
      const ctx = {
        reason: 'low stability',
        scores: [0.3, 0.5],
        nested: { deep: { value: true } },
      };
      const decision = createDecision({ decision_context: ctx });
      saveDecision(decision);

      const retrieved = getDecisionById(decision.org_id, decision.decision_id);
      expect(retrieved!.decision_context).toEqual(ctx);
    });
  });

  // -----------------------------------------------------------------------
  // clearDecisionStore
  // -----------------------------------------------------------------------
  describe('clearDecisionStore', () => {
    it('should remove all decisions', () => {
      saveDecision(createDecision());
      saveDecision(createDecision());

      clearDecisionStore();

      const result = getDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-1',
        from_time: '2000-01-01T00:00:00Z',
        to_time: '2099-12-31T23:59:59Z',
      });
      expect(result.decisions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Errors when store not initialized
  // -----------------------------------------------------------------------
  describe('errors when store not initialized', () => {
    it('should throw when saveDecision called without init', () => {
      closeDecisionStore();
      expect(() => saveDecision(createDecision())).toThrow('Decision store not initialized');
    });

    it('should throw when getDecisionById called without init', () => {
      closeDecisionStore();
      expect(() => getDecisionById('org', 'id')).toThrow('Decision store not initialized');
    });

    it('should throw when getDecisions called without init', () => {
      closeDecisionStore();
      expect(() =>
        getDecisions({
          org_id: 'org',
          learner_reference: 'lr',
          from_time: '2026-01-01T00:00:00Z',
          to_time: '2026-12-31T23:59:59Z',
        })
      ).toThrow('Decision store not initialized');
    });

    it('should throw when clearDecisionStore called without init', () => {
      closeDecisionStore();
      expect(() => clearDecisionStore()).toThrow('Decision store not initialized');
    });
  });
});
