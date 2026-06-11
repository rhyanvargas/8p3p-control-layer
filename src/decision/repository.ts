import type { Decision, DecisionType, GetDecisionsRequest } from '../shared/types.js';

/** Count of all decisions for a learner, broken down by decision_type. */
export interface DecisionTypeSummary {
  total: number;
  types: Record<DecisionType, number>;
}

/**
 * DecisionRepository — vendor-agnostic persistence contract.
 * Phase 1: SqliteDecisionRepository (in store.ts)
 * Phase 2: DynamoDbDecisionRepository
 *
 * clearDecisionStore() is intentionally omitted — it is a test utility,
 * not a production contract.
 */
export interface DecisionRepository {
  saveDecision(decision: Decision): void;
  getDecisions(request: GetDecisionsRequest): {
    decisions: Decision[];
    hasMore: boolean;
    nextCursor?: number;
  };
  getDecisionById(orgId: string, decisionId: string): Decision | null;
  /**
   * Returns at most `limit` decisions for the learner, ordered by `decided_at` DESC
   * then `id` DESC. No pagination — callers must respect the 50-row cap.
   */
  getRecentDecisionsByLearner(orgId: string, learnerRef: string, limit: number): Decision[];
  /**
   * Returns decision counts for the learner across ALL stored decisions (no row cap).
   * Used by gifted-interest evaluation (G3–G5).
   */
  getDecisionTypeSummaryForLearner(orgId: string, learnerRef: string): DecisionTypeSummary;
  close(): void;
}
