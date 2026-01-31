/**
 * Idempotency Store for Signal Ingestion
 * Uses SQLite to track (org_id, signal_id) pairs for duplicate detection
 */

import Database from 'better-sqlite3';
import type { IdempotencyResult } from '../shared/types.js';

let db: Database.Database | null = null;

/**
 * Initialize the idempotency store with SQLite
 * Must be called before any checkAndStore operations
 * 
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initIdempotencyStore(dbPath: string): void {
  db = new Database(dbPath);
  
  // Create table with composite primary key for idempotency
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_ids (
      org_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (org_id, signal_id)
    )
  `);
  
  // Prepare statements for better performance
  db.pragma('journal_mode = WAL');
}

/**
 * Close the database connection
 * Call this during graceful shutdown
 */
export function closeIdempotencyStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if a signal has been processed and store if new
 * Uses INSERT OR IGNORE for atomic check-and-store
 * 
 * @param orgId - Organization ID
 * @param signalId - Signal ID
 * @returns IdempotencyResult indicating if duplicate and when originally received
 */
export function checkAndStore(orgId: string, signalId: string): IdempotencyResult {
  if (!db) {
    throw new Error('Idempotency store not initialized. Call initIdempotencyStore first.');
  }
  
  const now = new Date().toISOString();
  
  // Try to insert - this will fail silently if the key exists (INSERT OR IGNORE)
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO signal_ids (org_id, signal_id, received_at)
    VALUES (?, ?, ?)
  `);
  
  const result = insertStmt.run(orgId, signalId, now);
  
  // If changes === 1, the insert succeeded (new signal)
  // If changes === 0, the key already existed (duplicate)
  if (result.changes === 1) {
    return {
      isDuplicate: false,
      receivedAt: now,
    };
  }
  
  // Fetch the original received_at time for duplicates
  const selectStmt = db.prepare(`
    SELECT received_at FROM signal_ids WHERE org_id = ? AND signal_id = ?
  `);
  
  const row = selectStmt.get(orgId, signalId) as { received_at: string } | undefined;
  
  return {
    isDuplicate: true,
    receivedAt: row?.received_at,
  };
}

/**
 * Clear all entries (useful for testing)
 */
export function clearIdempotencyStore(): void {
  if (!db) {
    throw new Error('Idempotency store not initialized. Call initIdempotencyStore first.');
  }
  
  db.exec('DELETE FROM signal_ids');
}

/**
 * Get the current database instance (for testing purposes)
 */
export function getDatabase(): Database.Database | null {
  return db;
}
