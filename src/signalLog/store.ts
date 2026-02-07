/**
 * Signal Log Store
 * SQLite-backed immutable, append-only storage for accepted signals
 * 
 * Core guarantees:
 * - Immutability: No UPDATE or DELETE operations
 * - Determinism: Same query always returns same results
 * - Org isolation: Queries scoped to org_id
 */

import Database from 'better-sqlite3';
import type {
  SignalEnvelope,
  SignalRecord,
  SignalLogReadRequest,
  SignalLogQueryResult,
  SignalMetadata,
} from '../shared/types.js';

let db: Database.Database | null = null;

/**
 * Initialize the Signal Log store with SQLite
 * Creates the signal_log table and indexes if they don't exist
 * 
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initSignalLogStore(dbPath: string): void {
  db = new Database(dbPath);
  
  // Create table for signal records
  // Note: payload and metadata stored as JSON strings
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_system TEXT NOT NULL,
      learner_reference TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT,
      accepted_at TEXT NOT NULL,
      UNIQUE(org_id, signal_id)
    )
  `);
  
  // Create index for efficient queries on (org_id, learner_reference, accepted_at)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signal_log_query 
    ON signal_log(org_id, learner_reference, accepted_at)
  `);
  
  // Use WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
}

/**
 * Close the database connection
 * Call this during graceful shutdown
 */
export function closeSignalLogStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Append a signal to the log
 * This is the only write operation allowed (immutable store)
 * 
 * @param signal - The validated signal envelope to store
 * @param acceptedAt - ISO timestamp when signal was accepted
 * @returns The complete SignalRecord with accepted_at
 */
export function appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord {
  if (!db) {
    throw new Error('Signal Log store not initialized. Call initSignalLogStore first.');
  }
  
  const stmt = db.prepare(`
    INSERT INTO signal_log (
      org_id, signal_id, source_system, learner_reference, 
      timestamp, schema_version, payload, metadata, accepted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    signal.org_id,
    signal.signal_id,
    signal.source_system,
    signal.learner_reference,
    signal.timestamp,
    signal.schema_version,
    JSON.stringify(signal.payload),
    signal.metadata ? JSON.stringify(signal.metadata) : null,
    acceptedAt
  );
  
  return {
    ...signal,
    accepted_at: acceptedAt,
  };
}

/**
 * Query signals from the log
 * Supports pagination with cursor-based tokens
 * 
 * @param request - Query parameters
 * @returns Query result with signals and pagination info
 */
export function querySignals(request: SignalLogReadRequest): SignalLogQueryResult {
  if (!db) {
    throw new Error('Signal Log store not initialized. Call initSignalLogStore first.');
  }
  
  const pageSize = request.page_size ?? 100;
  
  // Decode cursor from page_token if provided
  let cursorId = 0;
  if (request.page_token) {
    cursorId = decodePageToken(request.page_token);
  }
  
  // Query with one extra row to determine if there are more results
  // We use `id > cursorId` for cursor-based pagination (stable ordering by insert order)
  // Filter by accepted_at time range for user-specified window
  const stmt = db.prepare(`
    SELECT id, org_id, signal_id, source_system, learner_reference,
           timestamp, schema_version, payload, metadata, accepted_at
    FROM signal_log
    WHERE org_id = ?
      AND learner_reference = ?
      AND accepted_at >= ?
      AND accepted_at <= ?
      AND id > ?
    ORDER BY accepted_at ASC, id ASC
    LIMIT ?
  `);
  
  const rows = stmt.all(
    request.org_id,
    request.learner_reference,
    request.from_time,
    request.to_time,
    cursorId,
    pageSize + 1 // Fetch one extra to check for more
  ) as SignalLogRow[];
  
  // Check if there are more results
  const hasMore = rows.length > pageSize;
  const resultRows = hasMore ? rows.slice(0, pageSize) : rows;
  
  // Transform rows to SignalRecord objects
  const signals: SignalRecord[] = resultRows.map(rowToSignalRecord);
  
  // Get next cursor position if there are more results
  let nextCursor: number | undefined;
  if (hasMore && resultRows.length > 0) {
    const lastRow = resultRows[resultRows.length - 1];
    nextCursor = lastRow ? lastRow.id : undefined;
  }
  
  return {
    signals,
    hasMore,
    nextCursor,
  };
}

/**
 * Retrieve specific signals by their IDs for downstream processing (e.g. STATE Engine).
 * All signals must belong to the specified org_id. Results are ordered by accepted_at ASC, then id ASC.
 *
 * @param orgId - Tenant identifier (enforces org isolation)
 * @param signalIds - Signal IDs to fetch
 * @returns Array of SignalRecord in accepted_at order
 * @throws Error with code 'unknown_signal_id' if any signal_id is not found
 * @throws Error with code 'signals_not_in_org_scope' if any returned signal belongs to a different org
 */
export function getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[] {
  if (!db) {
    throw new Error('Signal Log store not initialized. Call initSignalLogStore first.');
  }

  if (signalIds.length === 0) {
    return [];
  }

  const placeholders = signalIds.map(() => '?').join(', ');
  const stmt = db.prepare(`
    SELECT id, org_id, signal_id, source_system, learner_reference,
           timestamp, schema_version, payload, metadata, accepted_at
    FROM signal_log
    WHERE org_id = ? AND signal_id IN (${placeholders})
    ORDER BY accepted_at ASC, id ASC
  `);

  const rows = stmt.all(orgId, ...signalIds) as SignalLogRow[];

  const foundIds = new Set(rows.map((r) => r.signal_id));
  const missingIds = signalIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    const err = new Error(`Unknown signal id(s): ${missingIds.join(', ')}`) as Error & {
      code: string;
      field_path?: string;
    };
    err.code = 'unknown_signal_id';
    err.field_path = 'signal_ids';
    throw err;
  }

  for (const row of rows) {
    if (row.org_id !== orgId) {
      const err = new Error(
        `Signal ${row.signal_id} belongs to org ${row.org_id}, not ${orgId}`
      ) as Error & { code: string; field_path?: string };
      err.code = 'signals_not_in_org_scope';
      err.field_path = 'signal_ids';
      throw err;
    }
  }

  return rows.map(rowToSignalRecord);
}

/**
 * Clear all entries (for testing only)
 */
export function clearSignalLogStore(): void {
  if (!db) {
    throw new Error('Signal Log store not initialized. Call initSignalLogStore first.');
  }
  
  db.exec('DELETE FROM signal_log');
}

/**
 * Get the current database instance (for testing purposes)
 */
export function getSignalLogDatabase(): Database.Database | null {
  return db;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Raw database row type
 */
interface SignalLogRow {
  id: number;
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  payload: string;
  metadata: string | null;
  accepted_at: string;
}

/**
 * Transform a database row to a SignalRecord
 */
function rowToSignalRecord(row: SignalLogRow): SignalRecord {
  const record: SignalRecord = {
    org_id: row.org_id,
    signal_id: row.signal_id,
    source_system: row.source_system,
    learner_reference: row.learner_reference,
    timestamp: row.timestamp,
    schema_version: row.schema_version,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    accepted_at: row.accepted_at,
  };
  
  // Only add metadata if it exists
  if (row.metadata) {
    record.metadata = JSON.parse(row.metadata) as SignalMetadata;
  }
  
  return record;
}

/**
 * Encode a cursor position as a page token
 * Uses base64 encoding with version prefix for future compatibility
 */
export function encodePageToken(cursorId: number): string {
  // Format: v1:{id} -> base64
  const tokenData = `v1:${cursorId}`;
  return Buffer.from(tokenData).toString('base64');
}

/**
 * Decode a page token to get the cursor position
 * Returns 0 if token is invalid (start from beginning)
 */
export function decodePageToken(token: string): number {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    
    // Check for v1 format
    if (!decoded.startsWith('v1:')) {
      return 0;
    }
    
    const cursorStr = decoded.substring(3);
    const cursor = parseInt(cursorStr, 10);
    
    if (isNaN(cursor) || cursor < 0) {
      return 0;
    }
    
    return cursor;
  } catch {
    return 0;
  }
}
