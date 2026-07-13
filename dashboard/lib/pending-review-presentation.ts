import {
  buildPendingAttentionQueue,
} from '@/lib/attention-decisions';
import type { LearnerSummaryResponse } from '@/lib/api/types';

export interface PendingQueuePosition {
  /** 1-based index into the pending ordered list. */
  index: number;
  total: number;
}

export interface NextPendingDecisionIdOptions {
  /** When true (default), wrap from last id to first. */
  wrap?: boolean;
}

/**
 * Ordered pending urgent decision ids for one learner.
 * Reuses exclusion/order from `buildPendingAttentionQueue` (intervene before pause,
 * then decided_at descending; excludes local review store OR server latest_action).
 */
export function listPendingUrgentDecisionIds(
  summary: LearnerSummaryResponse,
  serverReviewedIds?: Set<string>
): string[] {
  return buildPendingAttentionQueue([summary], { serverReviewedIds })
    .filter((item) => item.learner_reference === summary.learner_reference)
    .map((item) => item.decision.decision_id);
}

/** 1-based position of `currentId` in `orderedIds`, or null if not present. */
export function pendingQueuePosition(
  orderedIds: readonly string[],
  currentId: string
): PendingQueuePosition | null {
  const zeroBased = orderedIds.indexOf(currentId);
  if (zeroBased < 0) return null;
  return { index: zeroBased + 1, total: orderedIds.length };
}

/**
 * Next pending decision id after `currentId` in queue order.
 * Wraps to the first id when `wrap` is true (default).
 */
export function nextPendingDecisionId(
  orderedIds: readonly string[],
  currentId: string,
  options?: NextPendingDecisionIdOptions
): string | null {
  if (orderedIds.length === 0) return null;

  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0) return null;

  const wrap = options?.wrap ?? true;
  const nextIndex = currentIndex + 1;

  if (nextIndex < orderedIds.length) {
    return orderedIds[nextIndex] ?? null;
  }

  if (wrap) {
    return orderedIds[0] ?? null;
  }

  return null;
}
