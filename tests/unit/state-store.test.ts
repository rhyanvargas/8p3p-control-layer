/**
 * Unit tests for STATE Store
 * Tests the SQLite-backed learner state and applied_signals storage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initStateStore,
  closeStateStore,
  getState,
  getStateByVersion,
  saveState,
  saveStateWithAppliedSignals,
  clearStateStore,
  isSignalApplied,
  recordAppliedSignals,
  getStateStoreDatabase,
  StateVersionConflictError,
} from '../../src/state/store.js';
import type { LearnerState } from '../../src/shared/types.js';

function createState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    org_id: 'test-org',
    learner_reference: 'learner-123',
    state_id: 'test-org:learner-123:v1',
    state_version: 1,
    updated_at: '2026-02-07T10:00:00Z',
    state: { skill: 'math', level: 5 },
    provenance: {
      last_signal_id: 'signal-001',
      last_signal_timestamp: '2026-02-07T09:55:00Z',
    },
    ...overrides,
  };
}

describe('STATE Store', () => {
  beforeEach(() => {
    initStateStore(':memory:');
  });

  afterEach(() => {
    closeStateStore();
  });

  describe('initStateStore creates schema', () => {
    it('should create learner_state and applied_signals tables', () => {
      const database = getStateStoreDatabase();
      expect(database).not.toBeNull();

      const learnerStateInfo = database!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learner_state'").get();
      expect(learnerStateInfo).toEqual({ name: 'learner_state' });

      const appliedSignalsInfo = database!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='applied_signals'").get();
      expect(appliedSignalsInfo).toEqual({ name: 'applied_signals' });
    });

    it('should create idx_learner_state_lookup and idx_learner_state_current indexes', () => {
      const database = getStateStoreDatabase();
      const indexes = database!.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='learner_state'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_learner_state_lookup');
      expect(indexNames).toContain('idx_learner_state_current');
    });
  });

  describe('getState / saveState round-trip', () => {
    it('should return null for unknown learner', () => {
      const result = getState('test-org', 'unknown-learner');
      expect(result).toBeNull();
    });

    it('should save and retrieve same LearnerState', () => {
      const state = createState({
        state_id: 'test-org:learner-123:v1',
        state_version: 1,
        state: { skill: 'math', level: 5 },
      });
      saveState(state);

      const retrieved = getState('test-org', 'learner-123');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.org_id).toBe(state.org_id);
      expect(retrieved!.learner_reference).toBe(state.learner_reference);
      expect(retrieved!.state_id).toBe(state.state_id);
      expect(retrieved!.state_version).toBe(state.state_version);
      expect(retrieved!.updated_at).toBe(state.updated_at);
      expect(retrieved!.state).toEqual(state.state);
      expect(retrieved!.provenance).toEqual(state.provenance);
    });

    it('should return current (highest version) state when multiple versions exist', () => {
      saveState(createState({ state_version: 1, state_id: 'test-org:learner-123:v1', state: { v: 1 } }));
      saveState(createState({ state_version: 2, state_id: 'test-org:learner-123:v2', state: { v: 2 } }));
      saveState(createState({ state_version: 3, state_id: 'test-org:learner-123:v3', state: { v: 3 } }));

      const current = getState('test-org', 'learner-123');
      expect(current).not.toBeNull();
      expect(current!.state_version).toBe(3);
      expect(current!.state).toEqual({ v: 3 });
    });

    it('should preserve complex state object', () => {
      const complexState = {
        nested: { deeply: { value: 42 } },
        array: [1, 2, 3],
        string: 'hello',
      };
      const state = createState({ state: complexState });
      saveState(state);

      const retrieved = getState('test-org', 'learner-123');
      expect(retrieved!.state).toEqual(complexState);
    });
  });

  describe('getStateByVersion', () => {
    it('should return null for non-existent version', () => {
      const result = getStateByVersion('test-org', 'learner-123', 99);
      expect(result).toBeNull();
    });

    it('should return correct version when multiple exist', () => {
      saveState(createState({ state_version: 1, state_id: 'test-org:learner-123:v1', state: { v: 1 } }));
      saveState(createState({ state_version: 2, state_id: 'test-org:learner-123:v2', state: { v: 2 } }));

      const v1 = getStateByVersion('test-org', 'learner-123', 1);
      expect(v1).not.toBeNull();
      expect(v1!.state_version).toBe(1);
      expect(v1!.state).toEqual({ v: 1 });

      const v2 = getStateByVersion('test-org', 'learner-123', 2);
      expect(v2).not.toBeNull();
      expect(v2!.state_version).toBe(2);
      expect(v2!.state).toEqual({ v: 2 });
    });
  });

  describe('saveStateWithAppliedSignals', () => {
    it('should persist state and applied_signals in one call', () => {
      const state = createState({
        state_id: 'test-org:learner-123:v1',
        state_version: 1,
        state: { v: 1 },
      });

      saveStateWithAppliedSignals(state, [
        { signal_id: 'sig-a', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
        { signal_id: 'sig-b', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);

      const retrieved = getState('test-org', 'learner-123');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.state_version).toBe(1);
      expect(retrieved!.state).toEqual({ v: 1 });

      expect(isSignalApplied('test-org', 'learner-123', 'sig-a')).toBe(true);
      expect(isSignalApplied('test-org', 'learner-123', 'sig-b')).toBe(true);
    });

    it('should rollback applied_signals when state insert conflicts (atomicity)', () => {
      // Seed a conflicting learner_state row for version 1
      saveState(
        createState({
          state_id: 'test-org:learner-123:v1',
          state_version: 1,
          state: { conflict: true },
        })
      );

      const state = createState({
        state_id: 'test-org:learner-123:v1-duplicate',
        state_version: 1,
        state: { v: 1 },
      });

      expect(() =>
        saveStateWithAppliedSignals(state, [
          { signal_id: 'sig-conflict', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
        ])
      ).toThrow(StateVersionConflictError);

      // If the transaction is atomic, applied_signals should not have been inserted.
      expect(isSignalApplied('test-org', 'learner-123', 'sig-conflict')).toBe(false);
    });

    it('should tolerate existing applied_signals rows (INSERT OR IGNORE idempotency)', () => {
      recordAppliedSignals('test-org', 'learner-123', [
        { signal_id: 'sig-existing', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);

      const state = createState({
        state_id: 'test-org:learner-123:v2',
        state_version: 2,
        state: { v: 2 },
      });

      expect(() =>
        saveStateWithAppliedSignals(state, [
          { signal_id: 'sig-existing', state_version: 2, applied_at: '2026-02-07T10:01:00Z' },
          { signal_id: 'sig-new', state_version: 2, applied_at: '2026-02-07T10:01:00Z' },
        ])
      ).not.toThrow();

      const retrieved = getState('test-org', 'learner-123');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.state_version).toBe(2);
      expect(retrieved!.state).toEqual({ v: 2 });

      expect(isSignalApplied('test-org', 'learner-123', 'sig-existing')).toBe(true);
      expect(isSignalApplied('test-org', 'learner-123', 'sig-new')).toBe(true);
    });

    it('should persist state when appliedEntries is empty', () => {
      const state = createState({
        state_id: 'test-org:learner-123:v1',
        state_version: 1,
        state: { v: 1 },
      });

      expect(() => saveStateWithAppliedSignals(state, [])).not.toThrow();

      const retrieved = getState('test-org', 'learner-123');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.state_version).toBe(1);
      expect(retrieved!.state).toEqual({ v: 1 });

      expect(isSignalApplied('test-org', 'learner-123', 'sig-any')).toBe(false);
    });
  });

  describe('clearStateStore', () => {
    it('should wipe learner_state and applied_signals', () => {
      saveState(createState());
      recordAppliedSignals('test-org', 'learner-123', [
        { signal_id: 'sig-1', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);

      expect(getState('test-org', 'learner-123')).not.toBeNull();
      expect(isSignalApplied('test-org', 'learner-123', 'sig-1')).toBe(true);

      clearStateStore();

      expect(getState('test-org', 'learner-123')).toBeNull();
      expect(isSignalApplied('test-org', 'learner-123', 'sig-1')).toBe(false);
    });
  });

  describe('applied_signals and idempotency helpers', () => {
    it('should report signal not applied before recordAppliedSignals', () => {
      expect(isSignalApplied('test-org', 'learner-123', 'signal-001')).toBe(false);
    });

    it('should report signal applied after recordAppliedSignals', () => {
      recordAppliedSignals('test-org', 'learner-123', [
        { signal_id: 'signal-001', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);
      expect(isSignalApplied('test-org', 'learner-123', 'signal-001')).toBe(true);
    });

    it('should record multiple signals in one call', () => {
      recordAppliedSignals('test-org', 'learner-123', [
        { signal_id: 'sig-a', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
        { signal_id: 'sig-b', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);
      expect(isSignalApplied('test-org', 'learner-123', 'sig-a')).toBe(true);
      expect(isSignalApplied('test-org', 'learner-123', 'sig-b')).toBe(true);
    });

    it('should not affect different org or learner', () => {
      recordAppliedSignals('org-A', 'learner-1', [
        { signal_id: 'sig-1', state_version: 1, applied_at: '2026-02-07T10:00:00Z' },
      ]);
      expect(isSignalApplied('org-A', 'learner-1', 'sig-1')).toBe(true);
      expect(isSignalApplied('org-B', 'learner-1', 'sig-1')).toBe(false);
      expect(isSignalApplied('org-A', 'learner-2', 'sig-1')).toBe(false);
    });

    it('should handle recordAppliedSignals with empty entries', () => {
      expect(() => recordAppliedSignals('test-org', 'learner-123', [])).not.toThrow();
    });
  });

  describe('errors when store not initialized', () => {
    it('should throw when getState called without init', () => {
      closeStateStore();
      expect(() => getState('test-org', 'learner-123')).toThrow('STATE store not initialized');
    });

    it('should throw when saveState called without init', () => {
      closeStateStore();
      expect(() => saveState(createState())).toThrow('STATE store not initialized');
    });

    it('should throw when clearStateStore called without init', () => {
      closeStateStore();
      expect(() => clearStateStore()).toThrow('STATE store not initialized');
    });
  });
});
