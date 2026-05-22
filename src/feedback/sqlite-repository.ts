/**
 * SQLite-backed FeedbackRepository (pilot host / local dev).
 * Attaches the decisions database so pending counts can join decisions + decision_feedback.
 */

import Database from 'better-sqlite3';
import { DECISION_TYPES, type DecisionType, type DecisionViewRecord, type FeedbackRecord } from '../shared/types.js';
import type { FeedbackRepository, PendingCountResult } from './repository.js';

let repository: FeedbackRepository | null = null;

function escapeSqlitePath(path: string): string {
  return path.replace(/'/g, "''");
}

export class SqliteFeedbackRepository implements FeedbackRepository {
  private readonly db: Database.Database;

  constructor(feedbackDbPath: string, decisionsDbPath: string) {
    this.db = new Database(feedbackDbPath);
    this.db.exec(`ATTACH DATABASE '${escapeSqlitePath(decisionsDbPath)}' AS decdb`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decision_feedback (
        feedback_id TEXT PRIMARY KEY NOT NULL,
        decision_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        learner_reference TEXT NOT NULL,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason_category TEXT,
        reason_text TEXT,
        suggested_decision_type TEXT,
        created_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decision_view_log (
        view_id TEXT PRIMARY KEY NOT NULL,
        decision_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        viewed_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_org_created ON decision_feedback(org_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_feedback_decision ON decision_feedback(decision_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_view_org_viewed ON decision_view_log(org_id, viewed_at);
      CREATE INDEX IF NOT EXISTS idx_view_dedup ON decision_view_log(decision_id, session_id, viewed_at);
    `);
    this.db.pragma('journal_mode = WAL');
  }

  async saveFeedback(record: FeedbackRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO decision_feedback (
        feedback_id, decision_id, org_id, learner_reference, session_id,
        action, reason_category, reason_text, suggested_decision_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.feedback_id,
      record.decision_id,
      record.org_id,
      record.learner_reference,
      record.session_id,
      record.action,
      record.reason_category,
      record.reason_text,
      record.suggested_decision_type,
      record.created_at
    );
  }

  async listFeedbackForDecision(orgId: string, decisionId: string): Promise<FeedbackRecord[]> {
    const stmt = this.db.prepare(`
      SELECT feedback_id, decision_id, org_id, learner_reference, session_id,
             action, reason_category, reason_text, suggested_decision_type, created_at
      FROM decision_feedback
      WHERE org_id = ? AND decision_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(orgId, decisionId) as Array<{
      feedback_id: string;
      decision_id: string;
      org_id: string;
      learner_reference: string;
      session_id: string;
      action: string;
      reason_category: string | null;
      reason_text: string | null;
      suggested_decision_type: string | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      feedback_id: r.feedback_id,
      decision_id: r.decision_id,
      org_id: r.org_id,
      learner_reference: r.learner_reference,
      session_id: r.session_id,
      action: r.action as FeedbackRecord['action'],
      reason_category: r.reason_category,
      reason_text: r.reason_text,
      suggested_decision_type: r.suggested_decision_type,
      created_at: r.created_at,
    }));
  }

  async recordView(
    record: DecisionViewRecord,
    dedupWindowSeconds: number
  ): Promise<{ recorded: boolean; existing_viewed_at?: string }> {
    const latest = this.db
      .prepare(
        `
      SELECT viewed_at FROM decision_view_log
      WHERE org_id = ? AND decision_id = ? AND session_id = ?
      ORDER BY viewed_at DESC
      LIMIT 1
    `
      )
      .get(record.org_id, record.decision_id, record.session_id) as { viewed_at: string } | undefined;

    const nowMs = Date.parse(record.viewed_at);
    if (latest) {
      const prevMs = Date.parse(latest.viewed_at);
      if (!Number.isNaN(prevMs) && !Number.isNaN(nowMs) && nowMs - prevMs < dedupWindowSeconds * 1000) {
        return { recorded: false, existing_viewed_at: latest.viewed_at };
      }
    }

    this.db
      .prepare(
        `
      INSERT INTO decision_view_log (view_id, decision_id, org_id, session_id, viewed_at)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(record.view_id, record.decision_id, record.org_id, record.session_id, record.viewed_at);
    return { recorded: true };
  }

  async countPendingByType(orgId: string, olderThanDays: number, nowIso: string): Promise<PendingCountResult> {
    const nowMs = Date.parse(nowIso);
    const cutoffMs = nowMs - olderThanDays * 86400000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const rows = this.db
      .prepare(
        `
      SELECT d.decision_type AS decision_type, COUNT(*) AS c, MIN(d.decided_at) AS oldest
      FROM decdb.decisions d
      WHERE d.org_id = ? AND d.decided_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM decision_feedback f
          WHERE f.org_id = d.org_id AND f.decision_id = d.decision_id
        )
      GROUP BY d.decision_type
    `
      )
      .all(orgId, cutoffIso) as Array<{ decision_type: string; c: number; oldest: string | null }>;

    const byType = Object.fromEntries(DECISION_TYPES.map((t) => [t, 0])) as Record<DecisionType, number>;
    let total = 0;
    let oldestDecidedAt: string | null = null;

    for (const row of rows) {
      const dt = row.decision_type as DecisionType;
      if (DECISION_TYPES.includes(dt)) {
        byType[dt] = Number(row.c);
        total += Number(row.c);
      }
      if (row.oldest != null && row.oldest !== '' && (oldestDecidedAt === null || row.oldest < oldestDecidedAt)) {
        oldestDecidedAt = row.oldest;
      }
    }

    return { total, byType, oldestDecidedAt };
  }

  close(): void {
    this.db.close();
  }

  clear(): void {
    this.db.exec('DELETE FROM decision_feedback');
    this.db.exec('DELETE FROM decision_view_log');
  }
}

export function initFeedbackStore(opts: { feedbackDbPath: string; decisionsDbPath: string }): void {
  setFeedbackRepository(new SqliteFeedbackRepository(opts.feedbackDbPath, opts.decisionsDbPath));
}

export function setFeedbackRepository(repo: FeedbackRepository): void {
  if (repository) {
    repository.close();
    repository = null;
  }
  repository = repo;
}

export function getFeedbackRepository(): FeedbackRepository | null {
  return repository;
}

export function closeFeedbackStore(): void {
  if (repository) {
    repository.close();
    repository = null;
  }
}

export function clearFeedbackStore(): void {
  if (!repository) {
    throw new Error('Feedback store not initialized.');
  }
  if (!(repository instanceof SqliteFeedbackRepository)) {
    throw new Error('clearFeedbackStore is only supported for SqliteFeedbackRepository');
  }
  repository.clear();
}
