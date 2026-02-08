/**
 * Decision Store
 * SQLite-backed immutable, append-only storage for decisions
 *
 * Core guarantees:
 * - Immutability: No UPDATE or DELETE operations
 * - Org isolation: Queries scoped to org_id
 * - Cursor-based pagination by decided_at ASC, id ASC
 */

import Database from 'better-sqlite3';
import type { Decision, GetDecisionsRequest } from '../shared/types.js';

let db: Database.Database | null = null;

/**
 * Initialize the Decision store with SQLite.
 * Creates the decisions table and index, enables WAL mode.
 *
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initDecisionStore(dbPath: string): void {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL,
      decision_id TEXT NOT NULL UNIQUE,
      learner_reference TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      decision_context TEXT NOT NULL,
      trace_state_id TEXT NOT NULL,
      trace_state_version INTEGER NOT NULL,
      trace_policy_version TEXT NOT NULL,
      trace_matched_rule_id TEXT,
      UNIQUE(org_id, decision_id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_decisions_query
    ON decisions(org_id, learner_reference, decided_at)
  `);

  db.pragma('journal_mode = WAL');
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeDecisionStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Persist a decision. Insert only; duplicate decision_id throws.
 *
 * @param decision - The Decision to save
 * @throws Error on UNIQUE constraint (duplicate decision_id)
 */
export function saveDecision(decision: Decision): void {
  if (!db) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }

  const stmt = db.prepare(`
    INSERT INTO decisions (
      org_id, decision_id, learner_reference, decision_type, decided_at,
      decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    decision.org_id,
    decision.decision_id,
    decision.learner_reference,
    decision.decision_type,
    decision.decided_at,
    JSON.stringify(decision.decision_context),
    decision.trace.state_id,
    decision.trace.state_version,
    decision.trace.policy_version,
    decision.trace.matched_rule_id
  );
}

/**
 * Query decisions by org, learner, and time range with cursor-based pagination.
 *
 * @param request - GetDecisionsRequest with from_time, to_time, optional page_token and page_size
 * @returns decisions, hasMore, and nextCursor (id of last row returned, for next page)
 */
export function getDecisions(request: GetDecisionsRequest): {
  decisions: Decision[];
  hasMore: boolean;
  nextCursor?: number;
} {
  if (!db) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }

  const pageSize = Math.min(Math.max(1, request.page_size ?? 100), 1000);
  const cursorId = request.page_token ? decodePageToken(request.page_token) : 0;

  const stmt = db.prepare(`
    SELECT id, org_id, decision_id, learner_reference, decision_type, decided_at,
           decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id
    FROM decisions
    WHERE org_id = ?
      AND learner_reference = ?
      AND decided_at >= ?
      AND decided_at <= ?
      AND id > ?
    ORDER BY decided_at ASC, id ASC
    LIMIT ?
  `);

  const rows = stmt.all(
    request.org_id,
    request.learner_reference,
    request.from_time,
    request.to_time,
    cursorId,
    pageSize + 1
  ) as DecisionRow[];

  const hasMore = rows.length > pageSize;
  const resultRows = hasMore ? rows.slice(0, pageSize) : rows;
  const decisions = resultRows.map(rowToDecision);

  let nextCursor: number | undefined;
  if (hasMore && resultRows.length > 0) {
    const lastRow = resultRows[resultRows.length - 1];
    nextCursor = lastRow ? lastRow.id : undefined;
  }

  return {
    decisions,
    hasMore,
    nextCursor,
  };
}

/**
 * Retrieve a single decision by org and decision_id.
 *
 * @param orgId - Tenant identifier
 * @param decisionId - Decision UUID
 * @returns The Decision or null if not found
 */
export function getDecisionById(orgId: string, decisionId: string): Decision | null {
  if (!db) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }

  const stmt = db.prepare(`
    SELECT id, org_id, decision_id, learner_reference, decision_type, decided_at,
           decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id
    FROM decisions
    WHERE org_id = ? AND decision_id = ?
  `);

  const row = stmt.get(orgId, decisionId) as DecisionRow | undefined;
  return row ? rowToDecision(row) : null;
}

/**
 * Clear all decisions (for testing only).
 */
export function clearDecisionStore(): void {
  if (!db) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }
  db.exec('DELETE FROM decisions');
}

/**
 * Get the current database instance (for testing).
 */
export function getDecisionStoreDatabase(): Database.Database | null {
  return db;
}

// =============================================================================
// Internal helpers
// =============================================================================

interface DecisionRow {
  id: number;
  org_id: string;
  decision_id: string;
  learner_reference: string;
  decision_type: string;
  decided_at: string;
  decision_context: string;
  trace_state_id: string;
  trace_state_version: number;
  trace_policy_version: string;
  trace_matched_rule_id: string | null;
}

function rowToDecision(row: DecisionRow): Decision {
  return {
    org_id: row.org_id,
    decision_id: row.decision_id,
    learner_reference: row.learner_reference,
    decision_type: row.decision_type as Decision['decision_type'],
    decided_at: row.decided_at,
    decision_context: JSON.parse(row.decision_context) as Record<string, unknown>,
    trace: {
      state_id: row.trace_state_id,
      state_version: row.trace_state_version,
      policy_version: row.trace_policy_version,
      matched_rule_id: row.trace_matched_rule_id,
    },
  };
}

/**
 * Decode page token to cursor id. Same pattern as Signal Log (v1:id base64).
 * Returns 0 if token is invalid.
 */
function decodePageToken(token: string): number {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
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

/**
 * Encode cursor id as page token. Exported for handler (same pattern as Signal Log).
 */
export function encodePageToken(cursorId: number): string {
  const tokenData = `v1:${cursorId}`;
  return Buffer.from(tokenData).toString('base64');
}
