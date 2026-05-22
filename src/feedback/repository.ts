import type { DecisionType, DecisionViewRecord, FeedbackRecord } from '../shared/types.js';

export interface PendingCountResult {
  total: number;
  byType: Record<DecisionType, number>;
  oldestDecidedAt: string | null;
}

/**
 * Vendor-agnostic persistence for educator feedback + view log.
 * @see docs/specs/educator-feedback-api.md
 */
export interface FeedbackRepository {
  saveFeedback(record: FeedbackRecord): Promise<void>;
  listFeedbackForDecision(orgId: string, decisionId: string): Promise<FeedbackRecord[]>;
  recordView(
    record: DecisionViewRecord,
    dedupWindowSeconds: number
  ): Promise<{ recorded: boolean; existing_viewed_at?: string }>;
  countPendingByType(orgId: string, olderThanDays: number, nowIso: string): Promise<PendingCountResult>;
  close(): void;
}
