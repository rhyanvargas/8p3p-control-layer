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
import type { DecisionRepository } from './repository.js';

let repository: DecisionRepository | null = null;

// =============================================================================
// SqliteDecisionRepository — Phase 1 adapter implementing DecisionRepository
// =============================================================================

export class SqliteDecisionRepository implements DecisionRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
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
        trace_state_snapshot TEXT,
        trace_matched_rule TEXT,
        trace_rationale TEXT,
        output_metadata TEXT,
        UNIQUE(org_id, decision_id)
      )
    `);
    this.migrateAddOutputMetadata();
    this.migrateAddEnrichedTraceColumns();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decisions_query
      ON decisions(org_id, learner_reference, decided_at)
    `);
    this.db.pragma('journal_mode = WAL');
  }

  /** Migration: add output_metadata column if missing (existing DBs) */
  private migrateAddOutputMetadata(): void {
    const info = this.db.pragma('table_info(decisions)') as Array<{ name: string }>;
    if (!info.some((c) => c.name === 'output_metadata')) {
      this.db.exec('ALTER TABLE decisions ADD COLUMN output_metadata TEXT');
    }
  }

  /** Migration: add enriched trace columns if missing (existing DBs) */
  private migrateAddEnrichedTraceColumns(): void {
    const info = this.db.pragma('table_info(decisions)') as Array<{ name: string }>;
    const cols = new Set(info.map((c) => c.name));
    if (!cols.has('trace_state_snapshot')) {
      this.db.exec('ALTER TABLE decisions ADD COLUMN trace_state_snapshot TEXT');
    }
    if (!cols.has('trace_matched_rule')) {
      this.db.exec('ALTER TABLE decisions ADD COLUMN trace_matched_rule TEXT');
    }
    if (!cols.has('trace_rationale')) {
      this.db.exec('ALTER TABLE decisions ADD COLUMN trace_rationale TEXT');
    }
  }

  saveDecision(decision: Decision): void {
    const stmt = this.db.prepare(`
      INSERT INTO decisions (
        org_id, decision_id, learner_reference, decision_type, decided_at,
        decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id,
        trace_state_snapshot, trace_matched_rule, trace_rationale, output_metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      decision.trace.matched_rule_id,
      JSON.stringify(decision.trace.state_snapshot),
      decision.trace.matched_rule != null ? JSON.stringify(decision.trace.matched_rule) : null,
      decision.trace.rationale,
      decision.output_metadata ? JSON.stringify(decision.output_metadata) : null
    );
  }

  getDecisions(request: GetDecisionsRequest): {
    decisions: Decision[];
    hasMore: boolean;
    nextCursor?: number;
  } {
    const pageSize = Math.min(Math.max(1, request.page_size ?? 100), 1000);
    const cursorId = request.page_token ? decodePageToken(request.page_token) : 0;

    const stmt = this.db.prepare(`
      SELECT id, org_id, decision_id, learner_reference, decision_type, decided_at,
             decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id,
             trace_state_snapshot, trace_matched_rule, trace_rationale, output_metadata
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

  getDecisionById(orgId: string, decisionId: string): Decision | null {
    const stmt = this.db.prepare(`
      SELECT id, org_id, decision_id, learner_reference, decision_type, decided_at,
             decision_context, trace_state_id, trace_state_version, trace_policy_version, trace_matched_rule_id,
             trace_state_snapshot, trace_matched_rule, trace_rationale, output_metadata
      FROM decisions
      WHERE org_id = ? AND decision_id = ?
    `);
    const row = stmt.get(orgId, decisionId) as DecisionRow | undefined;
    return row ? rowToDecision(row) : null;
  }

  close(): void {
    this.db.close();
  }

  /** Test utility — not on DecisionRepository interface. */
  clear(): void {
    this.db.exec('DELETE FROM decisions');
  }

  /** Test accessor — matches getDecisionStoreDatabase() pattern. */
  getDatabase(): Database.Database {
    return this.db;
  }
}

/**
 * Initialize the Decision store with SQLite.
 * Creates the decisions table and index, enables WAL mode.
 *
 * @param dbPath - Path to SQLite database file, or ':memory:' for in-memory
 */
export function initDecisionStore(dbPath: string): void {
  setDecisionRepository(new SqliteDecisionRepository(dbPath));
}

/**
 * Inject a DecisionRepository instance (Phase 2 or test doubles).
 * Closes existing repository before assigning to avoid connection leaks.
 */
export function setDecisionRepository(repo: DecisionRepository): void {
  if (repository) {
    repository.close();
    repository = null;
  }
  repository = repo;
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeDecisionStore(): void {
  if (repository) {
    repository.close();
    repository = null;
  }
}

/**
 * Persist a decision. Insert only; duplicate decision_id throws.
 *
 * @param decision - The Decision to save
 * @throws Error on UNIQUE constraint (duplicate decision_id)
 */
export function saveDecision(decision: Decision): void {
  if (!repository) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }
  repository.saveDecision(decision);
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
  if (!repository) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }
  return repository.getDecisions(request);
}

/**
 * Retrieve a single decision by org and decision_id.
 *
 * @param orgId - Tenant identifier
 * @param decisionId - Decision UUID
 * @returns The Decision or null if not found
 */
export function getDecisionById(orgId: string, decisionId: string): Decision | null {
  if (!repository) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }
  return repository.getDecisionById(orgId, decisionId);
}

/**
 * Clear all decisions (for testing only).
 */
export function clearDecisionStore(): void {
  if (!repository) {
    throw new Error('Decision store not initialized. Call initDecisionStore first.');
  }
  if (repository instanceof SqliteDecisionRepository) {
    repository.clear();
  } else {
    throw new Error('clearDecisionStore is only supported for SqliteDecisionRepository');
  }
}

/**
 * Get the current database instance (for testing).
 */
export function getDecisionStoreDatabase(): Database.Database | null {
  if (!repository) {
    return null;
  }
  if (repository instanceof SqliteDecisionRepository) {
    return repository.getDatabase();
  }
  return null;
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
  trace_state_snapshot: string | null;
  trace_matched_rule: string | null;
  trace_rationale: string | null;
  output_metadata: string | null;
}

function rowToDecision(row: DecisionRow): Decision {
  const trace: Decision['trace'] = {
    state_id: row.trace_state_id,
    state_version: row.trace_state_version,
    policy_version: row.trace_policy_version,
    matched_rule_id: row.trace_matched_rule_id,
    // Required enriched receipt fields (legacy rows may have NULLs).
    state_snapshot: {},
    matched_rule: null,
    rationale: 'legacy decision: rationale unavailable',
  };
  if (row.trace_state_snapshot) {
    trace.state_snapshot = JSON.parse(row.trace_state_snapshot) as Record<string, unknown>;
  }
  if (row.trace_matched_rule) {
    trace.matched_rule = JSON.parse(row.trace_matched_rule) as Decision['trace']['matched_rule'];
  }
  if (row.trace_rationale) {
    trace.rationale = row.trace_rationale;
  }

  const decision: Decision = {
    org_id: row.org_id,
    decision_id: row.decision_id,
    learner_reference: row.learner_reference,
    decision_type: row.decision_type as Decision['decision_type'],
    decided_at: row.decided_at,
    decision_context: JSON.parse(row.decision_context) as Record<string, unknown>,
    trace,
  };
  if (row.output_metadata) {
    decision.output_metadata = JSON.parse(row.output_metadata) as Decision['output_metadata'];
  }
  return decision;
}

/**
 * Decode page token to cursor id. Same pattern as Signal Log (v1:id base64).
 * Returns 0 if token is invalid.
 *
 * Phase-1 note (SQLite, single-writer): id-based cursor is sufficient because
 * decisions are append-only and id monotonicity tracks insertion order.
 * Phase-2 note (multi-writer/distributed stores): migrate to a composite keyset
 * cursor aligned to ORDER BY (decided_at, id) to preserve deterministic paging.
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
