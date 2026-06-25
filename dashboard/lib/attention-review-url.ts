export const ATTENTION_REVIEW_DECISION_PARAM = 'reviewDecision';
export const ATTENTION_REVIEW_FROM_PARAM = 'from';
export const ATTENTION_REVIEW_FROM_VALUE = 'attention';

export function learnerAttentionReviewUrl(
  learnerRef: string,
  decisionId: string
): string {
  const params = new URLSearchParams({
    [ATTENTION_REVIEW_DECISION_PARAM]: decisionId,
    [ATTENTION_REVIEW_FROM_PARAM]: ATTENTION_REVIEW_FROM_VALUE,
  });
  return `/learners/${encodeURIComponent(learnerRef)}?${params.toString()}`;
}

export function attentionQueueUrl(): string {
  return '/attention';
}
