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
  /**
   * Return LearnerState records in state_version ASC order for a given
   * learner within the inclusive version range [fromVersion, toVersion].
   *
   * Keyset pagination: `cursor` is the last state_version already seen;
   * results start from the first version strictly greater than `cursor`.
   *
   * `nextCursor` is the state_version of the last returned record when
   * more results exist beyond `limit` and within `toVersion`; otherwise `null`.
   *
   * SQLite implementation is synchronous; the DynamoDB implementation
   * provides an async counterpart on DynamoDbStateRepository (parallel to
   * existing getState / getStateByVersion async signatures).
   */
  getStateVersionRange(
    orgId: string,
    learnerRef: string,
    fromVersion: number,
    toVersion: number,
    limit: number,
    cursor?: number
  ): { states: LearnerState[]; nextCursor: number | null };
  close(): void;
}
