import type {
  SignalEnvelope,
  SignalRecord,
  SignalLogReadRequest,
  SignalLogQueryResult,
} from '../shared/types.js';

/**
 * SignalLogRepository — vendor-agnostic immutable signal storage contract.
 * Phase 1: SqliteSignalLogRepository (in store.ts)
 * Phase 2: DynamoDbSignalLogRepository
 *
 * Core guarantees all adapters must uphold:
 * - Immutability: append-only, no UPDATE or DELETE
 * - Org isolation: queries scoped to org_id
 * - Error contracts: getSignalsByIds throws 'unknown_signal_id' or
 *   'signals_not_in_org_scope' for missing/cross-org IDs
 *
 * clearSignalLogStore() is intentionally omitted — test utility only.
 */
export interface SignalLogRepository {
  appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord;
  querySignals(request: SignalLogReadRequest): SignalLogQueryResult;
  getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[];
  close(): void;
}

