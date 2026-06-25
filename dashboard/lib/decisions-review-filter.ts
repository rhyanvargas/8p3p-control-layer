import type { Decision } from '@/lib/api/types';

export type DecisionsReviewFilter = 'all' | 'pending' | 'session';

export const DECISIONS_REVIEW_FILTER_OPTIONS: {
  value: DecisionsReviewFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending review' },
  { value: 'session', label: 'Reviewed by me (session)' },
];

function isUrgentDecisionType(decisionType: string): boolean {
  return decisionType === 'intervene' || decisionType === 'pause';
}

export function parseDecisionsReviewFilter(
  reviewedParam: string | null
): DecisionsReviewFilter {
  if (reviewedParam === 'pending') return 'pending';
  if (reviewedParam === 'session') return 'session';
  return 'all';
}

export function decisionsReviewFilterToParam(
  filter: DecisionsReviewFilter
): string | null {
  if (filter === 'all') return null;
  return filter;
}

export interface FilterDecisionsByReviewStatusOptions {
  filter: DecisionsReviewFilter;
  sessionReviewedIds: ReadonlySet<string>;
  serverReviewedIds?: ReadonlySet<string>;
}

function isPendingReview(
  decision: Decision,
  sessionReviewedIds: ReadonlySet<string>,
  serverReviewedIds?: ReadonlySet<string>
): boolean {
  if (!isUrgentDecisionType(decision.decision_type)) return false;
  if (sessionReviewedIds.has(decision.decision_id)) return false;
  if (serverReviewedIds?.has(decision.decision_id)) return false;
  return true;
}

/** Applies review-status filter on top of time-sorted decision rows. */
export function filterDecisionsByReviewStatus(
  decisions: Decision[],
  options: FilterDecisionsByReviewStatusOptions
): Decision[] {
  const { filter, sessionReviewedIds, serverReviewedIds } = options;

  if (filter === 'all') {
    return decisions;
  }

  if (filter === 'session') {
    return decisions.filter((decision) =>
      sessionReviewedIds.has(decision.decision_id)
    );
  }

  return decisions.filter((decision) =>
    isPendingReview(decision, sessionReviewedIds, serverReviewedIds)
  );
}
