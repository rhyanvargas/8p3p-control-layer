import type { Decision, GetDecisionsRequest } from '../shared/types.js';

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
  close(): void;
}
