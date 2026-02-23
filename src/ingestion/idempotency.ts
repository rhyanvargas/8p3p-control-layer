/**
 * Idempotency Store for Signal Ingestion
 * Uses SQLite to track (org_id, signal_id) pairs for duplicate detection
 */

import Database from 'better-sqlite3';
import type { IdempotencyResult } from '../shared/types.js';
import type { IdempotencyRepository } from './idempotency-repository.js';

// ─── SqliteIdempotencyRepository ────────────────────────────────────────────

export class SqliteIdempotencyRepository implements IdempotencyRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signal_ids (
        org_id TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY (org_id, signal_id)
      )
    `);
    this.db.pragma('journal_mode = WAL');
  }

  checkAndStore(orgId: string, signalId: string): IdempotencyResult {
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO signal_ids (org_id, signal_id, received_at)
      VALUES (?, ?, ?)
    `);
    const result = insertStmt.run(orgId, signalId, now);

    if (result.changes === 1) {
      return { isDuplicate: false, receivedAt: now };
    }

    const selectStmt = this.db.prepare(`
      SELECT received_at FROM signal_ids WHERE org_id = ? AND signal_id = ?
    `);
    const row = selectStmt.get(orgId, signalId) as { received_at: string } | undefined;

    return { isDuplicate: true, receivedAt: row?.received_at };
  }

  close(): void {
    this.db.close();
  }

  /** Test utility — not part of IdempotencyRepository interface. */
  clear(): void {
    this.db.exec('DELETE FROM signal_ids');
  }

  /** Test accessor — not part of IdempotencyRepository interface. */
  getDatabase(): Database.Database {
    return this.db;
  }
}

// ─── Module-level singleton (delegates to injected repository) ───────────────

let repository: IdempotencyRepository | null = null;

/**
 * Initialize the idempotency store with SQLite.
 * Must be called before any checkAndStore operations.
 * Defensive: closes any existing repository before assigning (avoids handle leak on re-init).
 */
export function initIdempotencyStore(dbPath: string): void {
  if (repository) {
    repository.close();
  }
  repository = new SqliteIdempotencyRepository(dbPath);
}

/**
 * Inject an alternative IdempotencyRepository implementation.
 * Closes any existing repository before assigning.
 * Phase 2 entry point — swap in DynamoDbIdempotencyRepository here.
 */
export function setIdempotencyRepository(repo: IdempotencyRepository): void {
  if (repository) {
    repository.close();
  }
  repository = repo;
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeIdempotencyStore(): void {
  if (repository) {
    repository.close();
    repository = null;
  }
}

/**
 * Check if a signal has been processed and store if new.
 * Uses INSERT OR IGNORE for atomic check-and-store.
 */
export function checkAndStore(orgId: string, signalId: string): IdempotencyResult {
  if (!repository) {
    throw new Error('Idempotency store not initialized. Call initIdempotencyStore first.');
  }
  return repository.checkAndStore(orgId, signalId);
}

/**
 * Clear all entries (test utility).
 */
export function clearIdempotencyStore(): void {
  if (!repository) {
    throw new Error('Idempotency store not initialized. Call initIdempotencyStore first.');
  }
  if (!(repository instanceof SqliteIdempotencyRepository)) {
    throw new Error('clearIdempotencyStore() is only supported on SqliteIdempotencyRepository.');
  }
  repository.clear();
}

/**
 * Get the current database instance (test accessor).
 */
export function getDatabase(): Database.Database | null {
  if (!repository) return null;
  if (!(repository instanceof SqliteIdempotencyRepository)) return null;
  return repository.getDatabase();
}
