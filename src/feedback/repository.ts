import type {
  DecisionType,
  DecisionViewRecord,
  FeedbackRecord,
  ProductFeedbackCategory,
  ProductFeedbackKind,
  ProductFeedbackRecord,
  ProductFeedbackType,
} from '../shared/types.js';

export interface PendingCountResult {
  total: number;
  byType: Record<DecisionType, number>;
  oldestDecidedAt: string | null;
}

/** Optional filters for listProductFeedback (GET /v1/admin/feedback query params). */
export interface ProductFeedbackListFilters {
  kind?: ProductFeedbackKind;
  feedback_type?: ProductFeedbackType;
  category?: ProductFeedbackCategory;
  /** RFC3339 lower bound on created_at */
  since?: string;
  /** Default 100, max 500 */
  limit?: number;
}

/**
 * Vendor-agnostic persistence for educator feedback, view log, and product feedback.
 * @see docs/specs/educator-feedback-api.md
 * @see docs/specs/customer-feedback-loop.md § Storage
 */
export interface FeedbackRepository {
  saveFeedback(record: FeedbackRecord): Promise<void>;
  listFeedbackForDecision(orgId: string, decisionId: string): Promise<FeedbackRecord[]>;
  recordView(
    record: DecisionViewRecord,
    dedupWindowSeconds: number
  ): Promise<{ recorded: boolean; existing_viewed_at?: string }>;
  countPendingByType(orgId: string, olderThanDays: number, nowIso: string): Promise<PendingCountResult>;
  /** Append-only insert for product_feedback rows. */
  insertProductFeedback(record: ProductFeedbackRecord): Promise<void>;
  /** Org-scoped list with optional filters; newest-first within limit. */
  listProductFeedback(orgId: string, filters?: ProductFeedbackListFilters): Promise<ProductFeedbackRecord[]>;
  close(): void;
}
