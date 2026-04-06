import type { LearnerState } from '../shared/types.js';

/**
 * StateRepository — vendor-agnostic learner state persistence contract.
 * Phase 1: SqliteStateRepository (in store.ts)
 * Phase 2: DynamoDbStateRepository
 *
 * Core guarantees all adapters must uphold:
 * - Immutable history: each state version is a new record (append-only)
 * - Optimistic lock: saveState/saveStateWithAppliedSignals throws
 *   StateVersionConflictError on duplicate (org_id, learner_reference, state_version)
 * - Atomicity: saveStateWithAppliedSignals persists state + applied_signals
 *   in a single atomic operation (SQLite transaction / DynamoDB TransactWriteItems)
 * - Applied-signal idempotency: recordAppliedSignals uses INSERT OR IGNORE semantics
 *
 * clearStateStore() is intentionally omitted — test utility only.
 */
export interface StateRepository {
  getState(orgId: string, learnerReference: string): LearnerState | null;
  getStateByVersion(orgId: string, learnerReference: string, version: number): LearnerState | null;
  saveState(state: LearnerState): void;
  saveStateWithAppliedSignals(
    state: LearnerState,
    appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): void;
  isSignalApplied(orgId: string, learnerReference: string, signalId: string): boolean;
  recordAppliedSignals(
    orgId: string,
    learnerReference: string,
    entries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): void;
  /**
   * List learners for an org with their latest state version.
   * Keyset pagination. Returns empty array when not supported (DynamoDB requires GSI).
   */
  listLearners(
    orgId: string,
    limit: number,
    cursor?: string
  ): { learners: Array<{ learner_reference: string; state_version: number; updated_at: string }>; nextCursor: string | null };
  close(): void;
}
