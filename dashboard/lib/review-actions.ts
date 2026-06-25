'use client';

import { toast } from 'sonner';

import { getUserFacingError, logApiError } from '@/lib/api/errors';
import {
  recordReview,
  undoReview,
  updateReviewFromApi,
  type DecisionReviewRecord,
  type ReviewAction,
} from '@/lib/decision-review';
import {
  submitDecisionFeedback,
  type RejectFeedbackBody,
  type SubmitFeedbackBody,
} from '@/lib/decision-feedback';

const UNDO_DURATION_MS = 8000;

const DECISION_TYPE_LABELS: Record<'intervene' | 'pause', string> = {
  intervene: 'Intervene',
  pause: 'Pause',
};

export type ReviewActionOrigin = 'table' | 'sheet' | 'bar' | 'what-to-do';

export interface ExecuteReviewActionParams {
  action: ReviewAction;
  decisionId: string;
  learnerReference: string;
  decisionType: 'intervene' | 'pause';
  educatorSummary?: string;
  origin: ReviewActionOrigin;
  rejectPayload?: RejectFeedbackBody;
  onQueueChange: () => void;
  onSheetReopen?: (decisionId: string) => void;
  /** Called after feedback is persisted upstream (for query invalidation). */
  onFeedbackPersisted?: (decisionId: string) => void;
}

function reviewSuccessTitle(action: ReviewAction, learnerReference: string): string {
  return action === 'approve'
    ? `Approved · ${learnerReference}`
    : `Rejected · ${learnerReference}`;
}

function buildFeedbackBody(
  action: ReviewAction,
  rejectPayload?: RejectFeedbackBody
): SubmitFeedbackBody | null {
  if (action === 'approve') {
    return { action: 'approve' };
  }
  return rejectPayload ?? null;
}

export async function executeReviewAction(
  params: ExecuteReviewActionParams
): Promise<boolean> {
  const {
    action,
    decisionId,
    learnerReference,
    decisionType,
    educatorSummary,
    origin,
    rejectPayload,
    onQueueChange,
    onSheetReopen,
    onFeedbackPersisted,
  } = params;

  const record: DecisionReviewRecord = {
    decisionId,
    action,
    learnerReference,
    decisionType,
    educatorSummary,
    reviewedAt: new Date().toISOString(),
    source: 'local',
  };

  recordReview(record);
  onQueueChange();

  let undoAvailable = true;
  const expireUndo = () => {
    undoAvailable = false;
  };
  const undoTimer = window.setTimeout(expireUndo, UNDO_DURATION_MS);

  const handleUndo = () => {
    if (!undoAvailable) {
      toast.info('Undo expired');
      return;
    }

    window.clearTimeout(undoTimer);
    undoAvailable = false;
    undoReview(decisionId);
    onQueueChange();
    toast.success(`Restored · ${learnerReference}`);

    if (origin === 'sheet') {
      onSheetReopen?.(decisionId);
    }
  };

  const handleViewDecision = () => {
    window.location.assign(`/decisions/${encodeURIComponent(decisionId)}`);
  };

  const toastId = toast.success(reviewSuccessTitle(action, learnerReference), {
    description: DECISION_TYPE_LABELS[decisionType],
    duration: UNDO_DURATION_MS,
    action: {
      label: 'Undo',
      onClick: handleUndo,
    },
    cancel: {
      label: 'View decision',
      onClick: handleViewDecision,
    },
  });

  const feedbackBody = buildFeedbackBody(action, rejectPayload);
  if (!feedbackBody) {
    return false;
  }

  try {
    const response = await submitDecisionFeedback(decisionId, feedbackBody);
    updateReviewFromApi(decisionId, {
      feedbackId: response.feedback_id,
      reviewedAt: response.created_at,
    });
    onQueueChange();
    onFeedbackPersisted?.(decisionId);
    return true;
  } catch (error) {
    undoReview(decisionId);
    onQueueChange();
    toast.dismiss(toastId);

    logApiError('review.save', error);
    const facing = getUserFacingError(error, {
      context: 'review',
      fallbackMessage: 'Something went wrong saving your review.',
    });

    toast.error('Could not save review', {
      description: facing.description,
      action: facing.action
        ? {
            label: facing.action.label,
            onClick: () => {
              window.location.assign(facing.action!.href);
            },
          }
        : undefined,
    });
    return false;
  }
}
