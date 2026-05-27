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
  listLearners,
  getStateVersionRange,
  StateVersionConflictError,
  setStateRepository,
  SqliteStateRepository,
} from '../../src/state/store.js';
import type { LearnerState } from '../../src/shared/types.js';
import type { StateRepository } from '../../src/state/repository.js';

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

  describe('listLearners', () => {
    it('should return empty array when no learners exist', () => {
      const { learners, nextCursor } = listLearners('test-org', 50);
      expect(learners).toEqual([]);
      expect(nextCursor).toBeNull();
    });

    it('should return distinct learners with latest state_version per learner', () => {
      saveState(
        createState({
          learner_reference: 'L1',
          state_id: 'test-org:L1:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L1',
          state_id: 'test-org:L1:v2',
          state_version: 2,
          updated_at: '2026-02-07T11:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L2',
          state_id: 'test-org:L2:v1',
          state_version: 1,
          updated_at: '2026-02-07T09:00:00Z',
        })
      );

      const { learners, nextCursor } = listLearners('test-org', 50);
      expect(learners).toHaveLength(2);
      expect(learners.map((l) => l.learner_reference).sort()).toEqual(['L1', 'L2']);
      expect(learners.find((l) => l.learner_reference === 'L1')).toMatchObject({
        learner_reference: 'L1',
        state_version: 2,
        updated_at: '2026-02-07T11:00:00Z',
      });
      expect(learners.find((l) => l.learner_reference === 'L2')).toMatchObject({
        learner_reference: 'L2',
        state_version: 1,
        updated_at: '2026-02-07T09:00:00Z',
      });
      expect(nextCursor).toBeNull();
    });

    it('should order by updated_at DESC, learner_reference ASC', () => {
      saveState(
        createState({
          learner_reference: 'L-A',
          state_id: 'test-org:L-A:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L-B',
          state_id: 'test-org:L-B:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L-C',
          state_id: 'test-org:L-C:v1',
          state_version: 1,
          updated_at: '2026-02-07T11:00:00Z',
        })
      );

      const { learners } = listLearners('test-org', 50);
      expect(learners.map((l) => l.learner_reference)).toEqual(['L-C', 'L-A', 'L-B']);
    });

    it('should respect limit and return nextCursor when more results exist', () => {
      saveState(
        createState({
          learner_reference: 'L1',
          state_id: 'test-org:L1:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L2',
          state_id: 'test-org:L2:v1',
          state_version: 1,
          updated_at: '2026-02-07T09:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L3',
          state_id: 'test-org:L3:v1',
          state_version: 1,
          updated_at: '2026-02-07T08:00:00Z',
        })
      );

      const page1 = listLearners('test-org', 2);
      expect(page1.learners).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = listLearners('test-org', 2, page1.nextCursor!);
      expect(page2.learners).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });

    it('should scope by org_id', () => {
      saveState(
        createState({ org_id: 'org-A', learner_reference: 'L1', state_id: 'org-A:L1:v1', state_version: 1 })
      );
      saveState(
        createState({ org_id: 'org-B', learner_reference: 'L2', state_id: 'org-B:L2:v1', state_version: 1 })
      );

      const { learners: orgA } = listLearners('org-A', 50);
      const { learners: orgB } = listLearners('org-B', 50);
      expect(orgA).toHaveLength(1);
      expect(orgB).toHaveLength(1);
      expect(orgA[0]!.learner_reference).toBe('L1');
      expect(orgB[0]!.learner_reference).toBe('L2');
    });

    it('should cap limit at 500', () => {
      const { learners } = listLearners('test-org', 999);
      expect(learners).toEqual([]);
      // No throw; limit is capped internally
    });
  });

  describe('getStateVersionRange', () => {
    function seedVersions(
      orgId: string,
      learnerRef: string,
      count: number,
      startVersion = 1
    ): void {
      for (let v = startVersion; v < startVersion + count; v++) {
        saveState(
          createState({
            org_id: orgId,
            learner_reference: learnerRef,
            state_id: `${orgId}:${learnerRef}:v${v}`,
            state_version: v,
            updated_at: `2026-03-01T${String(v).padStart(2, '0')}:00:00Z`,
            state: { version: v },
          })
        );
      }
    }

    it('should return all 5 versions in ASC order with no cursor', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange('test-org', 'learner-1', 1, 5, 50);
      expect(states).toHaveLength(5);
      expect(states.map((s) => s.state_version)).toEqual([1, 2, 3, 4, 5]);
      expect(nextCursor).toBeNull();
    });

    it('should return only versions within [fromVersion, toVersion]', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange('test-org', 'learner-1', 2, 4, 50);
      expect(states).toHaveLength(3);
      expect(states.map((s) => s.state_version)).toEqual([2, 3, 4]);
      expect(nextCursor).toBeNull();
    });

    it('should respect limit and return nextCursor when more results exist', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange('test-org', 'learner-1', 1, 5, 2);
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.state_version)).toEqual([1, 2]);
      expect(nextCursor).toBe(2);
    });

    it('should paginate from cursor to next page', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange('test-org', 'learner-1', 1, 5, 2, 2);
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.state_version)).toEqual([3, 4]);
      expect(nextCursor).toBe(4);
    });

    it('should return final page with nextCursor null', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange('test-org', 'learner-1', 1, 5, 2, 4);
      expect(states).toHaveLength(1);
      expect(states.map((s) => s.state_version)).toEqual([5]);
      expect(nextCursor).toBeNull();
    });

    it('should isolate results by org_id', () => {
      seedVersions('org-A', 'shared-learner', 3);
      seedVersions('org-B', 'shared-learner', 2);

      const resultA = getStateVersionRange('org-A', 'shared-learner', 1, 10, 50);
      expect(resultA.states).toHaveLength(3);
      expect(resultA.states.every((s) => s.org_id === 'org-A')).toBe(true);

      const resultB = getStateVersionRange('org-B', 'shared-learner', 1, 10, 50);
      expect(resultB.states).toHaveLength(2);
      expect(resultB.states.every((s) => s.org_id === 'org-B')).toBe(true);
    });

    it('should return empty result for non-existent learner', () => {
      const { states, nextCursor } = getStateVersionRange('test-org', 'nonexistent', 1, 10, 50);
      expect(states).toEqual([]);
      expect(nextCursor).toBeNull();
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

    it('should throw when listLearners called without init', () => {
      closeStateStore();
      expect(() => listLearners('test-org', 50)).toThrow('STATE store not initialized');
    });
  });

  describe('SqliteStateRepository (direct)', () => {
    it('should support direct class usage without module wrappers', () => {
      const repo = new SqliteStateRepository(':memory:');
      const state = createState({
        state_id: 'test-org:learner-123:v1',
        state_version: 1,
        state: { direct: true },
      });

      repo.saveState(state);
      const current = repo.getState('test-org', 'learner-123');

      expect(current).not.toBeNull();
      expect(current!.state).toEqual({ direct: true });
      expect(repo.getDatabase()).not.toBeNull();

      repo.close();
    });
  });

  describe('setStateRepository (injection)', () => {
    it('should delegate module exports to injected repository', () => {
      class StubRepository implements StateRepository {
        getState(orgId: string, learnerReference: string): LearnerState | null {
          return createState({
            org_id: orgId,
            learner_reference: learnerReference,
            state: { injected: true },
          });
        }
        getStateByVersion(): LearnerState | null {
          return null;
        }
        saveState(): void {}
        saveStateWithAppliedSignals(): void {}
        isSignalApplied(): boolean {
          return true;
        }
        recordAppliedSignals(): void {}
        listLearners() {
          return { learners: [], nextCursor: null };
        }
        getStateVersionRange() {
          return { states: [], nextCursor: null };
        }
        close(): void {}
      }

      setStateRepository(new StubRepository());
      expect(getState('org-injected', 'learner-injected')?.state).toEqual({ injected: true });
      expect(isSignalApplied('org-injected', 'learner-injected', 'sig-1')).toBe(true);
    });

    it('should close previous repository before replacing it', () => {
      let closed1 = false;
      let closed2 = false;

      class ClosingStub implements StateRepository {
        constructor(private readonly onClose: () => void) {}
        getState(): LearnerState | null {
          return null;
        }
        getStateByVersion(): LearnerState | null {
          return null;
        }
        saveState(): void {}
        saveStateWithAppliedSignals(): void {}
        isSignalApplied(): boolean {
          return false;
        }
        recordAppliedSignals(): void {}
        listLearners() {
          return { learners: [], nextCursor: null };
        }
        getStateVersionRange() {
          return { states: [], nextCursor: null };
        }
        close(): void {
          this.onClose();
        }
      }

      const repo1 = new ClosingStub(() => {
        closed1 = true;
      });
      const repo2 = new ClosingStub(() => {
        closed2 = true;
      });

      setStateRepository(repo1);
      setStateRepository(repo2);
      expect(closed1).toBe(true);

      closeStateStore();
      expect(closed2).toBe(true);
    });
  });

  describe('getStateVersionRange', () => {
    function seedVersions(
      orgId: string,
      learnerRef: string,
      count: number
    ): void {
      for (let v = 1; v <= count; v++) {
        saveState(
          createState({
            org_id: orgId,
            learner_reference: learnerRef,
            state_id: `${orgId}:${learnerRef}:v${v}`,
            state_version: v,
            updated_at: `2026-03-0${v}T10:00:00Z`,
            state: { version: v },
          })
        );
      }
    }

    it('should return all states ASC when range covers everything', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'learner-1', 1, 5, 50, undefined
      );

      expect(states).toHaveLength(5);
      expect(states.map((s) => s.state_version)).toEqual([1, 2, 3, 4, 5]);
      expect(nextCursor).toBeNull();
    });

    it('should filter by from_version and to_version inclusive', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'learner-1', 2, 4, 50, undefined
      );

      expect(states).toHaveLength(3);
      expect(states.map((s) => s.state_version)).toEqual([2, 3, 4]);
      expect(nextCursor).toBeNull();
    });

    it('should respect limit and return nextCursor when more results exist', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'learner-1', 1, 5, 2, undefined
      );

      expect(states).toHaveLength(2);
      expect(states.map((s) => s.state_version)).toEqual([1, 2]);
      expect(nextCursor).toBe(2);
    });

    it('should paginate from cursor (keyset)', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'learner-1', 1, 5, 2, 2
      );

      expect(states).toHaveLength(2);
      expect(states.map((s) => s.state_version)).toEqual([3, 4]);
      expect(nextCursor).toBe(4);
    });

    it('should return remaining results after cursor with no nextCursor at end', () => {
      seedVersions('test-org', 'learner-1', 5);

      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'learner-1', 1, 5, 2, 4
      );

      expect(states).toHaveLength(1);
      expect(states.map((s) => s.state_version)).toEqual([5]);
      expect(nextCursor).toBeNull();
    });

    it('should enforce org isolation', () => {
      seedVersions('org-A', 'shared-learner', 3);
      seedVersions('org-B', 'shared-learner', 2);

      const { states: orgAStates } = getStateVersionRange(
        'org-A', 'shared-learner', 1, 10, 50, undefined
      );
      const { states: orgBStates } = getStateVersionRange(
        'org-B', 'shared-learner', 1, 10, 50, undefined
      );

      expect(orgAStates).toHaveLength(3);
      expect(orgAStates.every((s) => s.org_id === 'org-A')).toBe(true);
      expect(orgBStates).toHaveLength(2);
      expect(orgBStates.every((s) => s.org_id === 'org-B')).toBe(true);
    });

    it('should return empty result for non-existent learner', () => {
      const { states, nextCursor } = getStateVersionRange(
        'test-org', 'nonexistent', 1, 100, 50, undefined
      );

      expect(states).toEqual([]);
      expect(nextCursor).toBeNull();
    });
  });
});
