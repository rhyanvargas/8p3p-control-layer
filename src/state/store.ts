/**
 * STATE Store
 * SQLite-backed storage for learner state and applied-signals idempotency
 *
 * Core guarantees:
 * - Immutable history: each state version is a new row (append-only)
 * - Current state: highest state_version per (org_id, learner_reference)
 * - Idempotency: applied_signals tracks which signals have been applied
 */

import Database from 'better-sqlite3';
import type { LearnerState } from '../shared/types.js';

let db: Database.Database | null = null;

/**
 * Initialize the STATE store with SQLite.
 * Creates learner_state and applied_signals tables and indexes if they don't exist.
 *
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initStateStore(dbPath: string): void {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS learner_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL,
      learner_reference TEXT NOT NULL,
      state_id TEXT NOT NULL UNIQUE,
      state_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      state TEXT NOT NULL,
      last_signal_id TEXT NOT NULL,
      last_signal_timestamp TEXT NOT NULL,
      UNIQUE(org_id, learner_reference, state_version)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learner_state_lookup
    ON learner_state(org_id, learner_reference)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learner_state_current
    ON learner_state(org_id, learner_reference, state_version DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS applied_signals (
      org_id TEXT NOT NULL,
      learner_reference TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      state_version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY(org_id, learner_reference, signal_id)
    )
  `);

  db.pragma('journal_mode = WAL');
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeStateStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the current (highest version) state for a learner.
 *
 * @param orgId - Tenant identifier
 * @param learnerReference - Learner identifier
 * @returns The current LearnerState or null if no state exists
 */
export function getState(orgId: string, learnerReference: string): LearnerState | null {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }

  const stmt = db.prepare(`
    SELECT id, org_id, learner_reference, state_id, state_version, updated_at,
           state, last_signal_id, last_signal_timestamp
    FROM learner_state
    WHERE org_id = ? AND learner_reference = ?
    ORDER BY state_version DESC
    LIMIT 1
  `);

  const row = stmt.get(orgId, learnerReference) as LearnerStateRow | undefined;
  return row ? rowToLearnerState(row) : null;
}

/**
 * Get a specific state version for a learner.
 *
 * @param orgId - Tenant identifier
 * @param learnerReference - Learner identifier
 * @param version - State version number
 * @returns The LearnerState for that version or null if not found
 */
export function getStateByVersion(
  orgId: string,
  learnerReference: string,
  version: number
): LearnerState | null {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }

  const stmt = db.prepare(`
    SELECT id, org_id, learner_reference, state_id, state_version, updated_at,
           state, last_signal_id, last_signal_timestamp
    FROM learner_state
    WHERE org_id = ? AND learner_reference = ? AND state_version = ?
  `);

  const row = stmt.get(orgId, learnerReference, version) as LearnerStateRow | undefined;
  return row ? rowToLearnerState(row) : null;
}

/**
 * Persist a new state version.
 * Fails if (org_id, learner_reference, state_version) already exists (optimistic lock).
 *
 * @param state - The LearnerState to save
 */
export function saveState(state: LearnerState): void {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }

  const insertState = db.prepare(`
    INSERT INTO learner_state (
      org_id, learner_reference, state_id, state_version, updated_at,
      state, last_signal_id, last_signal_timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertState.run(
    state.org_id,
    state.learner_reference,
    state.state_id,
    state.state_version,
    state.updated_at,
    JSON.stringify(state.state),
    state.provenance.last_signal_id,
    state.provenance.last_signal_timestamp
  );
}

/**
 * Check whether a signal has already been applied for this learner.
 *
 * @param orgId - Tenant identifier
 * @param learnerReference - Learner identifier
 * @param signalId - Signal ID to check
 * @returns true if the signal is in applied_signals
 */
export function isSignalApplied(
  orgId: string,
  learnerReference: string,
  signalId: string
): boolean {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }

  const stmt = db.prepare(`
    SELECT 1 FROM applied_signals
    WHERE org_id = ? AND learner_reference = ? AND signal_id = ?
  `);
  const row = stmt.get(orgId, learnerReference, signalId);
  return row !== undefined;
}

/**
 * Record that the given signals were applied at the given state version.
 * Idempotent: existing (org_id, learner_reference, signal_id) rows are skipped (PRIMARY KEY).
 *
 * @param orgId - Tenant identifier
 * @param learnerReference - Learner identifier
 * @param entries - Array of { signal_id, state_version, applied_at }
 */
export function recordAppliedSignals(
  orgId: string,
  learnerReference: string,
  entries: Array<{ signal_id: string; state_version: number; applied_at: string }>
): void {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }
  if (entries.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO applied_signals (org_id, learner_reference, signal_id, state_version, applied_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const runMany = db.transaction(() => {
    for (const e of entries) {
      insert.run(orgId, learnerReference, e.signal_id, e.state_version, e.applied_at);
    }
  });

  runMany();
}

/**
 * Persist a new state version and record applied signals in a single transaction.
 * Ensures that a crash cannot leave state without corresponding applied_signals rows.
 * Fails if (org_id, learner_reference, state_version) already exists (optimistic lock).
 *
 * @param state - The LearnerState to save
 * @param appliedEntries - Array of { signal_id, state_version, applied_at } to record
 */
export function saveStateWithAppliedSignals(
  state: LearnerState,
  appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
): void {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }

  const insertState = db.prepare(`
    INSERT INTO learner_state (
      org_id, learner_reference, state_id, state_version, updated_at,
      state, last_signal_id, last_signal_timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertApplied = db.prepare(`
    INSERT OR IGNORE INTO applied_signals (org_id, learner_reference, signal_id, state_version, applied_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const runBoth = db.transaction(
    (s: LearnerState, entries: Array<{ signal_id: string; state_version: number; applied_at: string }>) => {
      insertState.run(
        s.org_id,
        s.learner_reference,
        s.state_id,
        s.state_version,
        s.updated_at,
        JSON.stringify(s.state),
        s.provenance.last_signal_id,
        s.provenance.last_signal_timestamp
      );
      for (const e of entries) {
        insertApplied.run(s.org_id, s.learner_reference, e.signal_id, e.state_version, e.applied_at);
      }
    }
  );

  runBoth(state, appliedEntries);
}

/**
 * Clear all learner_state and applied_signals (for testing only).
 */
export function clearStateStore(): void {
  if (!db) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }
  db.exec('DELETE FROM applied_signals');
  db.exec('DELETE FROM learner_state');
}

/**
 * Get the current database instance (for testing).
 */
export function getStateStoreDatabase(): Database.Database | null {
  return db;
}

// =============================================================================
// Internal helpers
// =============================================================================

interface LearnerStateRow {
  id: number;
  org_id: string;
  learner_reference: string;
  state_id: string;
  state_version: number;
  updated_at: string;
  state: string;
  last_signal_id: string;
  last_signal_timestamp: string;
}

function rowToLearnerState(row: LearnerStateRow): LearnerState {
  return {
    org_id: row.org_id,
    learner_reference: row.learner_reference,
    state_id: row.state_id,
    state_version: row.state_version,
    updated_at: row.updated_at,
    state: JSON.parse(row.state) as Record<string, unknown>,
    provenance: {
      last_signal_id: row.last_signal_id,
      last_signal_timestamp: row.last_signal_timestamp,
    },
  };
}
