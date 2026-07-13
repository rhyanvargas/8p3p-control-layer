import type { IdempotencyResult } from '../shared/types.js';

/**
 * IdempotencyRepository — vendor-agnostic duplicate detection contract.
 * Phase 1: SqliteIdempotencyRepository (in idempotency.ts)
 * Phase 2: DynamoDbIdempotencyRepository (conditional writes on Signals table)
 *
 * clearIdempotencyStore() is intentionally omitted — it is a test utility,
 * not a production contract.
 */
export interface IdempotencyRepository {
  /**
   * @param receivedAt - Value stored/returned for first acceptance. Defaults to wall-clock now.
   *   Callers should pass the same `received_at` they return on accept (e.g. event time)
   *   so duplicates echo the original response.
   */
  checkAndStore(orgId: string, signalId: string, receivedAt?: string): IdempotencyResult;
  close(): void;
}
