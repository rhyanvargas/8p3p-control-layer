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
  close(): void;
}
