/**
 * Unit tests for STATE Engine
 * computeNewState, applySignals validation and rejection paths, monotonic version, provenance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../src/signalLog/store.js';
import * as stateStoreModule from '../../src/state/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  getState,
  getStateStoreDatabase,
} from '../../src/state/store.js';
import { computeNewState, deepMerge, applySignals } from '../../src/state/engine.js';
import type { LearnerState, SignalRecord } from '../../src/shared/types.js';
import type { SignalEnvelope } from '../../src/shared/types.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

function createSignalRecord(
  overrides: Partial<SignalRecord> & { payload?: Record<string, unknown> } = {}
): SignalRecord {
  const signal_id = overrides.signal_id ?? `sig-${Date.now()}`;
  const accepted_at = overrides.accepted_at ?? new Date().toISOString();
  return {
    org_id: 'org-A',
    signal_id,
    source_system: 'test',
    learner_reference: 'learner-1',
    timestamp: accepted_at,
    schema_version: 'v1',
    payload: { skill: 'math', level: 1 },
    accepted_at,
    ...overrides,
  } as SignalRecord;
}

function appendTestSignal(
  overrides: Partial<SignalEnvelope> & { payload?: Record<string, unknown> } = {}
): { signal_id: string; accepted_at: string } {
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
  return { signal_id, accepted_at };
}

describe('STATE Engine', () => {
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

  describe('deepMerge', () => {
    it('should merge objects recursively', () => {
      const target = { a: 1, nested: { x: 10 } };
      const source = { b: 2, nested: { y: 20 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 2, nested: { x: 10, y: 20 } });
    });

    it('should replace arrays entirely', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ arr: [3, 4, 5] });
    });

    it('should remove key when source value is explicit null', () => {
      const target = { a: 1, b: 2 };
      const source = { b: null };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1 });
    });

    it('should overwrite primitives', () => {
      const target = { a: 1, b: 'old' };
      const source = { a: 2, b: 'new' };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 2, b: 'new' });
    });
  });

  describe('computeNewState', () => {
    it('should return merged state from empty current and one signal', () => {
      const signals: SignalRecord[] = [
        createSignalRecord({ payload: { skill: 'math', level: 5 } }),
      ];
      const state = computeNewState(null, signals);
      expect(state).toEqual({ skill: 'math', level: 5 });
    });

    it('should start with empty object when current is null', () => {
      const signals: SignalRecord[] = [
        createSignalRecord({ payload: { a: 1 } }),
      ];
      const state = computeNewState(null, signals);
      expect(state).toEqual({ a: 1 });
    });

    it('should apply signals in order (merge order)', () => {
      const signals: SignalRecord[] = [
        createSignalRecord({ payload: { a: 1, b: 2 } }),
        createSignalRecord({ payload: { b: 20, c: 3 } }),
      ];
      const state = computeNewState(null, signals);
      expect(state).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should merge over current state when current is provided', () => {
      const current: LearnerState = {
        org_id: 'org-A',
        learner_reference: 'learner-1',
        state_id: 'org-A:learner-1:v1',
        state_version: 1,
        updated_at: '2026-02-07T10:00:00Z',
        state: { existing: true, level: 1 },
        provenance: { last_signal_id: 'prev', last_signal_timestamp: '2026-02-07T09:00:00Z' },
      };
      const signals: SignalRecord[] = [
        createSignalRecord({ payload: { level: 2, newKey: true } }),
      ];
      const state = computeNewState(current, signals);
      expect(state).toEqual({ existing: true, level: 2, newKey: true });
    });

    it('should ignore non-object payloads (array or null)', () => {
      const signals: SignalRecord[] = [
        createSignalRecord({ payload: { a: 1 } }),
        createSignalRecord({ payload: [1, 2, 3] as unknown as Record<string, unknown> }),
        createSignalRecord({ payload: null as unknown as Record<string, unknown> }),
      ];
      const state = computeNewState(null, signals);
      expect(state).toEqual({ a: 1 });
    });
  });

  describe('applySignals validation failures', () => {
    it('should reject with org_scope_required when org_id is missing', () => {
      const outcome = applySignals({
        learner_reference: 'learner-1',
        signal_ids: ['any'],
        requested_at: new Date().toISOString(),
      } as Parameters<typeof applySignals>[0]);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toContainEqual(
          expect.objectContaining({
            code: ErrorCodes.ORG_SCOPE_REQUIRED,
            field_path: 'org_id',
          })
        );
      }
    });

    it('should reject with missing_required_field when signal_ids is empty', () => {
      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [],
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toContainEqual(
          expect.objectContaining({
            code: ErrorCodes.MISSING_REQUIRED_FIELD,
            field_path: 'signal_ids',
          })
        );
      }
    });

    it('should reject with missing_required_field when learner_reference is missing', () => {
      const outcome = applySignals({
        org_id: 'org-A',
        signal_ids: ['sig-1'],
        requested_at: new Date().toISOString(),
      } as Parameters<typeof applySignals>[0]);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toContainEqual(
          expect.objectContaining({
            code: ErrorCodes.MISSING_REQUIRED_FIELD,
            field_path: 'learner_reference',
          })
        );
      }
    });
  });

  describe('applySignals unknown_signal_id', () => {
    it('should reject with unknown_signal_id when signal_ids include unknown id', () => {
      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: ['non-existent-signal-id'],
        requested_at: new Date().toISOString(),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0].code).toBe(ErrorCodes.UNKNOWN_SIGNAL_ID);
      }
    });
  });

  describe('applySignals forbidden key in payload', () => {
    it('should reject with forbidden_semantic_key_detected when payload has forbidden key (e.g. course)', () => {
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
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0].code).toBe(ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED);
        expect(outcome.errors[0].field_path).toBeDefined();
      }
    });
  });

  describe('monotonic state_version', () => {
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

  describe('provenance last_signal_id', () => {
    it('should set provenance last_signal_id to last applied signal', () => {
      const { signal_id, accepted_at } = appendTestSignal({ payload: { x: 1 } });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      expect(outcome.ok).toBe(true);
      const state = getState('org-A', 'learner-1');
      expect(state).not.toBeNull();
      expect(state!.provenance.last_signal_id).toBe(signal_id);
      expect(state!.provenance.last_signal_timestamp).toBe(accepted_at);
    });

    it('should set provenance from last signal when applying multiple signals', () => {
      const s1 = appendTestSignal({ payload: { a: 1 } });
      const s2 = appendTestSignal({ payload: { b: 2 } });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [s1.signal_id, s2.signal_id],
        requested_at: s1.accepted_at,
      });

      expect(outcome.ok).toBe(true);
      const state = getState('org-A', 'learner-1');
      expect(state).not.toBeNull();
      expect(state!.provenance.last_signal_id).toBe(s2.signal_id);
      expect(state!.provenance.last_signal_timestamp).toBe(s2.accepted_at);
    });
  });

  describe('optimistic-lock retry on version conflict', () => {
    it('should retry and succeed when first save hits a version conflict', () => {
      const { signal_id, accepted_at } = appendTestSignal({ payload: { x: 1 } });

      // Spy on saveStateWithAppliedSignals: on the first call, insert a conflicting row THEN delegate
      const originalSaveStateWithAppliedSignals = stateStoreModule.saveStateWithAppliedSignals;
      let callCount = 0;
      const spy = vi.spyOn(stateStoreModule, 'saveStateWithAppliedSignals').mockImplementation((state, appliedEntries) => {
        callCount++;
        if (callCount === 1) {
          // Insert a conflicting row directly via db (same org, learner, version but different state_id)
          const database = getStateStoreDatabase()!;
          database.prepare(`
            INSERT INTO learner_state (org_id, learner_reference, state_id, state_version, updated_at, state, last_signal_id, last_signal_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            state.org_id,
            state.learner_reference,
            'conflict-state-id',
            state.state_version,
            state.updated_at,
            JSON.stringify({ conflict: true }),
            'conflict-sig',
            state.updated_at
          );
        }
        // Now delegate to the real implementation
        return originalSaveStateWithAppliedSignals(state, appliedEntries);
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      spy.mockRestore();

      // First attempt hit conflict (version 1 taken by conflicting row), retry re-reads
      // current state (which now includes the conflicting row) and recomputes over it.
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.new_state_version).toBe(2);
      }

      const finalState = getState('org-A', 'learner-1');
      expect(finalState).not.toBeNull();
      expect(finalState!.state_version).toBe(2);
      // Retry merges signal payload { x: 1 } over the conflicting row's state { conflict: true }
      expect(finalState!.state).toEqual({ conflict: true, x: 1 });
    });

    it('should return state_version_conflict when all retry attempts fail', () => {
      const { signal_id, accepted_at } = appendTestSignal({ payload: { y: 2 } });

      // Spy on saveStateWithAppliedSignals: always insert a conflicting row before delegating
      const originalSaveStateWithAppliedSignals = stateStoreModule.saveStateWithAppliedSignals;
      const spy = vi.spyOn(stateStoreModule, 'saveStateWithAppliedSignals').mockImplementation((state, appliedEntries) => {
        const database = getStateStoreDatabase()!;
        database.prepare(`
          INSERT OR IGNORE INTO learner_state (org_id, learner_reference, state_id, state_version, updated_at, state, last_signal_id, last_signal_timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          state.org_id,
          state.learner_reference,
          `conflict-${state.state_version}`,
          state.state_version,
          state.updated_at,
          JSON.stringify({ conflict: true }),
          'conflict-sig',
          state.updated_at
        );
        return originalSaveStateWithAppliedSignals(state, appliedEntries);
      });

      const outcome = applySignals({
        org_id: 'org-A',
        learner_reference: 'learner-1',
        signal_ids: [signal_id],
        requested_at: accepted_at,
      });

      spy.mockRestore();

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors[0].code).toBe(ErrorCodes.STATE_VERSION_CONFLICT);
      }
    });
  });
});
