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
  checkAndStore(orgId: string, signalId: string): IdempotencyResult;
  close(): void;
}
