import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  toastSuccess,
  toastInfo,
  toastError,
  toastDismiss,
  recordReviewMock,
  undoReviewMock,
  updateReviewFromApiMock,
  submitDecisionFeedbackMock,
} = vi.hoisted(() => ({
  toastSuccess: vi.fn(() => 'toast-id'),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastDismiss: vi.fn(),
  recordReviewMock: vi.fn(),
  undoReviewMock: vi.fn(),
  updateReviewFromApiMock: vi.fn(),
  submitDecisionFeedbackMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    info: toastInfo,
    error: toastError,
    dismiss: toastDismiss,
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/decision-review', () => ({
  recordReview: recordReviewMock,
  undoReview: undoReviewMock,
  updateReviewFromApi: updateReviewFromApiMock,
}));

vi.mock('@/lib/decision-feedback', () => ({
  submitDecisionFeedback: submitDecisionFeedbackMock,
}));

import { ApiError } from '@/lib/api/errors';
import { executeReviewAction } from '@/lib/review-actions';

describe('REVIEW-UX-005: toast payload shape', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'setTimeout').mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    });
    submitDecisionFeedbackMock.mockResolvedValue({
      feedback_id: 'fb-001',
      decision_id: 'dec-001',
      action: 'approve',
      created_at: '2026-06-24T12:00:00.000Z',
    });
  });

  it('shows success toast with learner reference, action label, and decision type', async () => {
    const onQueueChange = vi.fn();

    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'table',
      onQueueChange,
    });

    expect(recordReviewMock).toHaveBeenCalledOnce();
    expect(onQueueChange).toHaveBeenCalledTimes(2);
    expect(submitDecisionFeedbackMock).toHaveBeenCalledWith('dec-001', { action: 'approve' });
    expect(updateReviewFromApiMock).toHaveBeenCalledWith('dec-001', {
      feedbackId: 'fb-001',
      reviewedAt: '2026-06-24T12:00:00.000Z',
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      'Approved · Malosi',
      expect.objectContaining({
        description: 'Intervene',
        duration: 8000,
        action: expect.objectContaining({ label: 'Undo' }),
        cancel: expect.objectContaining({ label: 'View decision' }),
      })
    );
  });

  it('shows Rejected title for reject actions with reject payload', async () => {
    await executeReviewAction({
      action: 'reject',
      decisionId: 'dec-002',
      learnerReference: 'Leilani',
      decisionType: 'pause',
      origin: 'table',
      onQueueChange: vi.fn(),
      rejectPayload: {
        action: 'reject',
        reason_category: 'not_at_risk',
      },
    });

    expect(submitDecisionFeedbackMock).toHaveBeenCalledWith('dec-002', {
      action: 'reject',
      reason_category: 'not_at_risk',
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      'Rejected · Leilani',
      expect.objectContaining({ description: 'Pause' })
    );
  });

  it('Undo from sheet origin reopens the same decision via onSheetReopen', async () => {
    const onQueueChange = vi.fn();
    const onSheetReopen = vi.fn();

    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'sheet',
      onQueueChange,
      onSheetReopen,
    });

    const toastOptions = toastSuccess.mock.calls[0]?.[1] as unknown as {
      action?: { onClick?: () => void };
    };

    toastOptions.action?.onClick?.();

    expect(undoReviewMock).toHaveBeenCalledWith('dec-001');
    expect(onQueueChange).toHaveBeenCalledTimes(3);
    expect(onSheetReopen).toHaveBeenCalledWith('dec-001');
    expect(toastSuccess).toHaveBeenCalledWith('Restored · Malosi');
  });

  it('View decision action navigates to /decisions/{id}', async () => {
    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'table',
      onQueueChange: vi.fn(),
    });

    const toastOptions = toastSuccess.mock.calls[0]?.[1] as unknown as {
      cancel?: { onClick?: () => void };
    };

    toastOptions.cancel?.onClick?.();

    expect(assignMock).toHaveBeenCalledWith('/decisions/dec-001');
  });

  it('rolls back optimistic review and shows error toast on API failure', async () => {
    const onQueueChange = vi.fn();
    submitDecisionFeedbackMock.mockRejectedValueOnce(
      new ApiError('API error 401', 401, { code: 'session_required' }, 'req-abc')
    );

    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'table',
      onQueueChange,
    });

    expect(undoReviewMock).toHaveBeenCalledWith('dec-001');
    expect(onQueueChange).toHaveBeenCalledTimes(2);
    expect(toastDismiss).toHaveBeenCalledWith('toast-id');
    expect(toastError).toHaveBeenCalledWith(
      'Could not save review',
      expect.objectContaining({
        description: expect.stringContaining('req-abc'),
        action: expect.objectContaining({ label: 'Sign in' }),
      })
    );
  });

  it('shows actionable config message when COOKIE_SECRET is missing on the API', async () => {
    submitDecisionFeedbackMock.mockRejectedValueOnce(
      new ApiError(
        'API error 500',
        500,
        { code: 'invalid_server_configuration', message: 'Server session secret is not configured.' },
        'req-config'
      )
    );

    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'bar',
      onQueueChange: vi.fn(),
    });

    expect(toastError).toHaveBeenCalledWith(
      'Could not save review',
      expect.objectContaining({
        description: expect.stringMatching(/COOKIE_SECRET.*req-config/),
      })
    );
  });

  it('calls onFeedbackPersisted after successful API write', async () => {
    const onFeedbackPersisted = vi.fn();

    await executeReviewAction({
      action: 'approve',
      decisionId: 'dec-001',
      learnerReference: 'Malosi',
      decisionType: 'intervene',
      origin: 'table',
      onQueueChange: vi.fn(),
      onFeedbackPersisted,
    });

    expect(onFeedbackPersisted).toHaveBeenCalledWith('dec-001');
  });
});
