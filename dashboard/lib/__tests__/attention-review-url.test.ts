import { describe, expect, it } from 'vitest';

import {
  ATTENTION_REVIEW_DECISION_PARAM,
  ATTENTION_REVIEW_FROM_PARAM,
  ATTENTION_REVIEW_FROM_VALUE,
  learnerAttentionReviewUrl,
} from '@/lib/attention-review-url';

describe('learnerAttentionReviewUrl', () => {
  it('includes review decision and from=attention query params', () => {
    const url = learnerAttentionReviewUrl('stu-20891', 'decision-001');
    expect(url).toBe(
      `/learners/stu-20891?${ATTENTION_REVIEW_DECISION_PARAM}=decision-001&${ATTENTION_REVIEW_FROM_PARAM}=${ATTENTION_REVIEW_FROM_VALUE}`
    );
  });

  it('encodes learner references with special characters', () => {
    const url = learnerAttentionReviewUrl('learner/with space', 'd-1');
    expect(url).toContain('/learners/learner%2Fwith%20space?');
    expect(url).toContain(`${ATTENTION_REVIEW_DECISION_PARAM}=d-1`);
  });
});
