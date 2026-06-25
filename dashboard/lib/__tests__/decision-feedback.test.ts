import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/api/client';
import {
  getDecisionFeedback,
  submitDecisionFeedback,
  submitFeedbackBodySchema,
} from '@/lib/decision-feedback';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('REVIEW-UX-011: approve feedback POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs { action: "approve" } and returns parsed 201 response', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      feedback_id: 'fb-approve-001',
      decision_id: 'dec-001',
      action: 'approve',
      reason_category: null,
      created_at: '2026-06-24T12:00:00.000Z',
    });

    const result = await submitDecisionFeedback('dec-001', { action: 'approve' });

    expect(apiFetch).toHaveBeenCalledWith('/v1/decisions/dec-001/feedback', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve' }),
    });
    expect(result).toEqual({
      feedback_id: 'fb-approve-001',
      decision_id: 'dec-001',
      action: 'approve',
      reason_category: null,
      created_at: '2026-06-24T12:00:00.000Z',
    });
  });
});

describe('REVIEW-UX-012: reject feedback POST with not_at_risk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs reject body and GET latest_action reflects reject', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        feedback_id: 'fb-reject-001',
        decision_id: 'dec-002',
        action: 'reject',
        reason_category: 'not_at_risk',
        created_at: '2026-06-24T12:05:00.000Z',
      })
      .mockResolvedValueOnce({
        decision_id: 'dec-002',
        feedback: [
          {
            feedback_id: 'fb-reject-001',
            action: 'reject',
            reason_category: 'not_at_risk',
            reason_text: null,
            suggested_decision_type: null,
            created_at: '2026-06-24T12:05:00.000Z',
          },
        ],
        latest_action: 'reject',
      });

    const rejectBody = {
      action: 'reject' as const,
      reason_category: 'not_at_risk' as const,
    };

    const created = await submitDecisionFeedback('dec-002', rejectBody);
    expect(created.action).toBe('reject');
    expect(created.reason_category).toBe('not_at_risk');

    const feedback = await getDecisionFeedback('dec-002');
    expect(feedback.latest_action).toBe('reject');
    expect(feedback.feedback[0]?.reason_category).toBe('not_at_risk');
  });
});

describe('REVIEW-UX-013: wrong_decision_type client validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects wrong_decision_type without suggested_decision_type before apiFetch', async () => {
    expect(() =>
      submitFeedbackBodySchema.parse({
        action: 'reject',
        reason_category: 'wrong_decision_type',
      })
    ).toThrow();

    await expect(
      submitDecisionFeedback('dec-003', {
        action: 'reject',
        reason_category: 'wrong_decision_type',
      } as never)
    ).rejects.toThrow();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('accepts wrong_decision_type when suggested_decision_type is provided', () => {
    const parsed = submitFeedbackBodySchema.parse({
      action: 'reject',
      reason_category: 'wrong_decision_type',
      suggested_decision_type: 'reinforce',
    });

    expect(parsed).toEqual({
      action: 'reject',
      reason_category: 'wrong_decision_type',
      suggested_decision_type: 'reinforce',
    });
  });
});
