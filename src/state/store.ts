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
import type { LearnerState, StateSummary } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import type { StateRepository } from './repository.js';

/**
 * Vendor-neutral optimistic-lock conflict error.
 * Thrown when persisting a new state version fails due to a unique/constraint violation.
 */
export class StateVersionConflictError extends Error {
  code: string;

  constructor(message = 'State version conflict') {
    super(message);
    this.name = 'StateVersionConflictError';
    this.code = ErrorCodes.STATE_VERSION_CONFLICT;
  }
}

/**
 * Detect SQLite UNIQUE/PRIMARY KEY constraint errors.
 * better-sqlite3 may or may not set `error.code`; we fall back to message matching
 * so version-conflict detection is resilient across driver variants.
 */
function isSqliteConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const errWithCode = err as Error & { code?: string };
  if (errWithCode.code === 'SQLITE_CONSTRAINT' || errWithCode.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return true;
  }
  const msg = err.message;
  return msg.includes('UNIQUE constraint failed') || msg.includes('SQLITE_CONSTRAINT');
}

// ─── SqliteStateRepository ────────────────────────────────────────────────────

export class SqliteStateRepository implements StateRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    this.db.exec(`
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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_learner_state_lookup
      ON learner_state(org_id, learner_reference)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_learner_state_current
      ON learner_state(org_id, learner_reference, state_version DESC)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS applied_signals (
        org_id TEXT NOT NULL,
        learner_reference TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        state_version INTEGER NOT NULL,
        applied_at TEXT NOT NULL,
        PRIMARY KEY(org_id, learner_reference, signal_id)
      )
    `);

    this.db.pragma('journal_mode = WAL');
  }

  getState(orgId: string, learnerReference: string): LearnerState | null {
    const stmt = this.db.prepare(`
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

  getStateByVersion(orgId: string, learnerReference: string, version: number): LearnerState | null {
    const stmt = this.db.prepare(`
      SELECT id, org_id, learner_reference, state_id, state_version, updated_at,
             state, last_signal_id, last_signal_timestamp
      FROM learner_state
      WHERE org_id = ? AND learner_reference = ? AND state_version = ?
    `);

    const row = stmt.get(orgId, learnerReference, version) as LearnerStateRow | undefined;
    return row ? rowToLearnerState(row) : null;
  }

  /**
   * @deprecated Prefer `saveStateWithAppliedSignals` to keep state + applied_signals atomic.
   */
  saveState(state: LearnerState): void {
    const insertState = this.db.prepare(`
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

  saveStateWithAppliedSignals(
    state: LearnerState,
    appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): void {
    const insertState = this.db.prepare(`
      INSERT INTO learner_state (
        org_id, learner_reference, state_id, state_version, updated_at,
        state, last_signal_id, last_signal_timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertApplied = this.db.prepare(`
      INSERT OR IGNORE INTO applied_signals (org_id, learner_reference, signal_id, state_version, applied_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const runBoth = this.db.transaction(
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

    try {
      runBoth(state, appliedEntries);
    } catch (err) {
      if (isSqliteConstraintError(err)) {
        throw new StateVersionConflictError();
      }
      throw err;
    }
  }

  isSignalApplied(orgId: string, learnerReference: string, signalId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM applied_signals
      WHERE org_id = ? AND learner_reference = ? AND signal_id = ?
    `);
    const row = stmt.get(orgId, learnerReference, signalId);
    return row !== undefined;
  }

  recordAppliedSignals(
    orgId: string,
    learnerReference: string,
    entries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): void {
    if (entries.length === 0) return;

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO applied_signals (org_id, learner_reference, signal_id, state_version, applied_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const runMany = this.db.transaction(() => {
      for (const e of entries) {
        insert.run(orgId, learnerReference, e.signal_id, e.state_version, e.applied_at);
      }
    });

    runMany();
  }

  close(): void {
    this.db.close();
  }

  /** Test utility — not part of StateRepository interface. */
  clear(): void {
    this.db.exec('DELETE FROM applied_signals');
    this.db.exec('DELETE FROM learner_state');
  }

  /** Test accessor — not part of StateRepository interface. */
  getDatabase(): Database.Database {
    return this.db;
  }

  /** SQLite-only helper for the current list endpoint. */
  listLearners(
    orgId: string,
    limit: number,
    cursor?: string
  ): { learners: StateSummary[]; nextCursor: string | null } {
    const cappedLimit = Math.min(Math.max(1, limit), 500);
    const { cursorUpdatedAt, cursorLearnerRef } = decodeListCursor(cursor);

    const stmt = this.db.prepare(`
      SELECT ls.learner_reference, ls.state_version, ls.updated_at
      FROM learner_state ls
      INNER JOIN (
        SELECT org_id, learner_reference, MAX(state_version) AS max_version
        FROM learner_state
        WHERE org_id = ?
        GROUP BY org_id, learner_reference
      ) latest
        ON ls.org_id = latest.org_id
        AND ls.learner_reference = latest.learner_reference
        AND ls.state_version = latest.max_version
      WHERE ls.org_id = ?
        AND (
          ls.updated_at < ?
          OR (ls.updated_at = ? AND ls.learner_reference > ?)
        )
      ORDER BY ls.updated_at DESC, ls.learner_reference ASC
      LIMIT ?
    `);

    const rows = stmt.all(
      orgId,
      orgId,
      cursorUpdatedAt ?? '\uffff',
      cursorUpdatedAt ?? '\uffff',
      cursorLearnerRef ?? '',
      cappedLimit + 1
    ) as Array<{ learner_reference: string; state_version: number; updated_at: string }>;

    const learners = rows.slice(0, cappedLimit).map((r) => ({
      learner_reference: r.learner_reference,
      state_version: r.state_version,
      updated_at: r.updated_at,
    }));

    const nextCursor =
      rows.length > cappedLimit
        ? encodeListCursor(rows[cappedLimit - 1]!.updated_at, rows[cappedLimit - 1]!.learner_reference)
        : null;

    return { learners, nextCursor };
  }
}

// ─── Module-level singleton (delegates to injected repository) ───────────────

let repository: StateRepository | null = null;

function requireRepository(): StateRepository {
  if (!repository) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }
  return repository;
}

function requireSqliteRepository(callerName: string): SqliteStateRepository {
  if (!repository) {
    throw new Error('STATE store not initialized. Call initStateStore first.');
  }
  if (!(repository instanceof SqliteStateRepository)) {
    throw new Error(`${callerName}() is only supported on SqliteStateRepository.`);
  }
  return repository;
}

/**
 * Initialize the STATE store with SQLite.
 * Creates learner_state and applied_signals tables and indexes if they don't exist.
 *
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initStateStore(dbPath: string): void {
  if (repository) {
    repository.close();
  }
  repository = new SqliteStateRepository(dbPath);
}

/**
 * Inject an alternative StateRepository implementation.
 * Closes any existing repository before assigning.
 * Phase 2 entry point — swap in DynamoDbStateRepository here.
 */
export function setStateRepository(repo: StateRepository): void {
  if (repository) {
    repository.close();
  }
  repository = repo;
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeStateStore(): void {
  if (repository) {
    repository.close();
    repository = null;
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
  return requireRepository().getState(orgId, learnerReference);
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
  return requireRepository().getStateByVersion(orgId, learnerReference, version);
}

/**
 * Persist a new state version.
 * Fails if (org_id, learner_reference, state_version) already exists (optimistic lock).
 *
 * @param state - The LearnerState to save
 * @deprecated Prefer `saveStateWithAppliedSignals` to keep state + applied_signals atomic.
 */
export function saveState(state: LearnerState): void {
  requireRepository().saveState(state);
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
  return requireRepository().isSignalApplied(orgId, learnerReference, signalId);
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
  requireRepository().recordAppliedSignals(orgId, learnerReference, entries);
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
  requireRepository().saveStateWithAppliedSignals(state, appliedEntries);
}

/**
 * Clear all learner_state and applied_signals (for testing only).
 */
export function clearStateStore(): void {
  requireSqliteRepository('clearStateStore').clear();
}

/**
 * List learners for an org with latest state version per learner.
 * Keyset pagination: cursor encodes (updated_at, learner_reference) for resume.
 * Order: updated_at DESC, learner_reference ASC.
 *
 * @param orgId - Tenant identifier
 * @param limit - Max results (1–500)
 * @param cursor - Opaque pagination cursor (optional)
 * @returns Learners and next_cursor for pagination
 */
export function listLearners(
  orgId: string,
  limit: number,
  cursor?: string
): { learners: StateSummary[]; nextCursor: string | null } {
  return requireSqliteRepository('listLearners').listLearners(orgId, limit, cursor);
}

/**
 * Get the current database instance (for testing).
 */
export function getStateStoreDatabase(): Database.Database | null {
  if (!repository) return null;
  if (!(repository instanceof SqliteStateRepository)) return null;
  return repository.getDatabase();
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Decode list cursor to (updated_at, learner_reference) for keyset pagination.
 */
function decodeListCursor(
  cursor: string | undefined
): { cursorUpdatedAt: string | null; cursorLearnerRef: string | null } {
  if (!cursor) return { cursorUpdatedAt: null, cursorLearnerRef: null };
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { cursorUpdatedAt: parsed[0], cursorLearnerRef: parsed[1] };
    }
  } catch {
    /* ignore */
  }
  return { cursorUpdatedAt: null, cursorLearnerRef: null };
}

/**
 * Encode (updated_at, learner_reference) to opaque cursor.
 */
function encodeListCursor(updatedAt: string, learnerReference: string): string {
  return Buffer.from(JSON.stringify([updatedAt, learnerReference]), 'utf-8').toString('base64url');
}

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
