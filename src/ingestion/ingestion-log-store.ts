/**
 * Ingestion Log Store
 * SQLite-backed append-only storage for all ingestion attempts (accepted, rejected, duplicate)
 *
 * Core guarantees:
 * - Append-only: No UPDATE or DELETE
 * - Org isolation: Queries scoped by org_id
 * - Ordering: Most recent first (received_at DESC, id DESC)
 */

import Database from 'better-sqlite3';
import type {
  IngestionOutcomeEntry,
  IngestionOutcome,
  GetIngestionOutcomesRequest,
} from '../shared/types.js';

let db: Database.Database | null = null;

/**
 * Initialize the ingestion log store with SQLite.
 * Creates the ingestion_log table and indexes if they don't exist.
 *
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initIngestionLogStore(dbPath: string): void {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ingestion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL DEFAULT '',
      signal_id TEXT NOT NULL DEFAULT '',
      source_system TEXT NOT NULL DEFAULT '',
      learner_reference TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT '',
      schema_version TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL,
      received_at TEXT NOT NULL,
      rejection_code TEXT,
      rejection_message TEXT,
      rejection_field_path TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ingestion_log_query
    ON ingestion_log(org_id, received_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ingestion_log_outcome
    ON ingestion_log(org_id, outcome, received_at)
  `);

  db.pragma('journal_mode = WAL');
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeIngestionLogStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Append an ingestion outcome to the log.
 * Append-only; may throw on DB error (caller must catch per spec §1.4).
 *
 * @param entry - The ingestion outcome to record
 */
export function appendIngestionOutcome(entry: IngestionOutcomeEntry): void {
  if (!db) {
    throw new Error('Ingestion log store not initialized. Call initIngestionLogStore first.');
  }

  const stmt = db.prepare(`
    INSERT INTO ingestion_log (
      org_id, signal_id, source_system, learner_reference,
      timestamp, schema_version, outcome, received_at,
      rejection_code, rejection_message, rejection_field_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rejection = entry.rejection_reason ?? null;
  stmt.run(
    entry.org_id,
    entry.signal_id,
    entry.source_system,
    entry.learner_reference,
    entry.timestamp,
    entry.schema_version,
    entry.outcome,
    entry.received_at,
    rejection?.code ?? null,
    rejection?.message ?? null,
    rejection?.field_path ?? null
  );
}

/**
 * Decode cursor to numeric id. Cursor is base64-encoded id for pagination.
 *
 * Phase-1 note (SQLite, single-writer): id-based cursor is sufficient because inserts
 * are append-only and id monotonicity tracks insertion order.
 * Phase-2 note (multi-writer/distributed stores): migrate to a composite keyset cursor
 * aligned to ORDER BY (received_at, id) to avoid cross-writer ordering ambiguity.
 */
function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const id = parseInt(decoded, 10);
    return Number.isNaN(id) || id < 0 ? 0 : id;
  } catch {
    return 0;
  }
}

/**
 * Encode id to opaque cursor string.
 */
function encodeCursor(id: number): string {
  return Buffer.from(String(id), 'utf-8').toString('base64url');
}

interface IngestionLogRow {
  id: number;
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  outcome: string;
  received_at: string;
  rejection_code: string | null;
  rejection_message: string | null;
  rejection_field_path: string | null;
}

function rowToIngestionOutcome(row: IngestionLogRow): IngestionOutcome {
  const rejection_reason: IngestionOutcome['rejection_reason'] =
    row.rejection_code != null
      ? {
          code: row.rejection_code,
          message: row.rejection_message ?? '',
          field_path: row.rejection_field_path ?? undefined,
        }
      : null;

  return {
    signal_id: row.signal_id,
    source_system: row.source_system,
    learner_reference: row.learner_reference,
    timestamp: row.timestamp,
    schema_version: row.schema_version,
    outcome: row.outcome as IngestionOutcome['outcome'],
    received_at: row.received_at,
    rejection_reason,
  };
}

/**
 * Query ingestion outcomes by org_id with optional outcome filter and pagination.
 * Order: most recent first (received_at DESC, id DESC).
 *
 * @param request - Query parameters
 * @returns Entries and next_cursor for pagination
 */
export function getIngestionOutcomes(
  request: GetIngestionOutcomesRequest
): { entries: IngestionOutcome[]; nextCursor: string | null } {
  if (!db) {
    throw new Error('Ingestion log store not initialized. Call initIngestionLogStore first.');
  }

  const limit = Math.min(Math.max(1, request.limit ?? 50), 500);
  const cursorId = request.cursor ? decodeCursor(request.cursor) : 0;

  const validOutcomes = ['accepted', 'rejected', 'duplicate'] as const;
  const outcomeFilter =
    request.outcome && validOutcomes.includes(request.outcome as (typeof validOutcomes)[number])
      ? request.outcome
      : null;

  let stmt: Database.Statement;
  let rows: IngestionLogRow[];

  if (outcomeFilter) {
    stmt = db.prepare(`
      SELECT id, org_id, signal_id, source_system, learner_reference,
             timestamp, schema_version, outcome, received_at,
             rejection_code, rejection_message, rejection_field_path
      FROM ingestion_log
      WHERE org_id = ? AND outcome = ? AND id < ?
      ORDER BY received_at DESC, id DESC
      LIMIT ?
    `);
    rows = stmt.all(
      request.org_id,
      outcomeFilter,
      cursorId === 0 ? 0x7fffffff : cursorId,
      limit + 1
    ) as IngestionLogRow[];
  } else {
    stmt = db.prepare(`
      SELECT id, org_id, signal_id, source_system, learner_reference,
             timestamp, schema_version, outcome, received_at,
             rejection_code, rejection_message, rejection_field_path
      FROM ingestion_log
      WHERE org_id = ? AND id < ?
      ORDER BY received_at DESC, id DESC
      LIMIT ?
    `);
    rows = stmt.all(
      request.org_id,
      cursorId === 0 ? 0x7fffffff : cursorId,
      limit + 1
    ) as IngestionLogRow[];
  }

  const hasMore = rows.length > limit;
  const resultRows = hasMore ? rows.slice(0, limit) : rows;
  const entries = resultRows.map(rowToIngestionOutcome);

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const lastRow = resultRows[resultRows.length - 1];
    if (lastRow) {
      nextCursor = encodeCursor(lastRow.id);
    }
  }

  return { entries, nextCursor };
}

/**
 * Clear all ingestion log entries (for testing only).
 */
export function clearIngestionLogStore(): void {
  if (!db) {
    throw new Error('Ingestion log store not initialized. Call initIngestionLogStore first.');
  }
  db.exec('DELETE FROM ingestion_log');
}
