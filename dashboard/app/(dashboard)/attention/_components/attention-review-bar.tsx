'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';

import {
  RejectReasonStep,
  buildRejectFeedbackPayload,
} from '@/app/(dashboard)/attention/_components/reject-reason-step';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useLearnerSummary } from '@/hooks/use-learner-summary';
import { attentionQueueUrl } from '@/lib/attention-review-url';
import type { RejectReasonCategory, SuggestedDecisionType } from '@/lib/decision-feedback';
import { queryClient } from '@/lib/query-client';
import { executeReviewAction } from '@/lib/review-actions';
import { cn } from '@/lib/utils';

type AttentionReviewBarProps = {
  orgId: string;
  learnerRef: string;
  decisionId: string;
};

export function AttentionReviewBar({
  orgId,
  learnerRef,
  decisionId,
}: AttentionReviewBarProps) {
  const router = useRouter();
  const { isMobile, state } = useSidebar();
  const summaryQuery = useLearnerSummary(orgId, learnerRef, {
    recentDecisionsLimit: 10,
  });

  const [rejectDecisionId, setRejectDecisionId] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [reasonCategory, setReasonCategory] = useState<RejectReasonCategory | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [suggestedDecisionType, setSuggestedDecisionType] =
    useState<SuggestedDecisionType | null>(null);

  if (decisionId !== rejectDecisionId) {
    setRejectDecisionId(decisionId);
    setShowRejectReason(false);
    setReasonCategory(null);
    setReasonText('');
    setSuggestedDecisionType(null);
  }

  const decision = summaryQuery.data?.recent_decisions.find(
    (item) => item.decision_id === decisionId
  );

  const decisionType = (decision?.decision_type ?? 'intervene') as 'intervene' | 'pause';
  const summary =
    decision?.educator_summary ||
    (decisionType === 'pause'
      ? 'High decay risk — consider pausing'
      : 'Needs stronger support now');

  const rejectPayload = buildRejectFeedbackPayload({
    reasonCategory,
    reasonText,
    suggestedDecisionType,
  });

  function bumpQueueChange() {
    void queryClient.invalidateQueries({ queryKey: ['learner-summary'] });
  }

  function resetRejectReason() {
    setShowRejectReason(false);
    setReasonCategory(null);
    setReasonText('');
    setSuggestedDecisionType(null);
  }

  async function runReviewAction(
    action: 'approve' | 'reject',
    payload?: NonNullable<typeof rejectPayload>
  ) {
    const success = await executeReviewAction({
      action,
      decisionId,
      learnerReference: learnerRef,
      decisionType,
      educatorSummary: decision?.educator_summary,
      origin: 'bar',
      rejectPayload: payload,
      onQueueChange: bumpQueueChange,
    });

    if (success) {
      resetRejectReason();
      router.push(attentionQueueUrl());
    }
  }

  function handleApprove() {
    void runReviewAction('approve');
  }

  function handleRejectClick() {
    setShowRejectReason(true);
  }

  function handleRejectSubmit() {
    if (!rejectPayload) return;
    void runReviewAction('reject', rejectPayload);
  }

  return (
    <div
      className={cn(
        'border-border bg-card text-card-foreground fixed z-40 border shadow-lg ring-1 ring-[var(--urgency-medium)]/30',
        'border-t-2 border-t-[var(--urgency-medium)] backdrop-blur supports-[backdrop-filter]:bg-card/95',
        isMobile
          ? 'inset-x-0 bottom-0 px-4 py-4'
          : cn(
              'bottom-2 right-2 px-5 py-4 md:rounded-xl',
              state === 'collapsed'
                ? 'left-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
                : 'left-(--sidebar-width)'
            )
      )}
      role="region"
      aria-label="Attention review actions"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--urgency-medium)]/15 text-[var(--urgency-medium)]"
                aria-hidden="true"
              >
                <ClipboardCheck className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[var(--urgency-medium)] text-xs font-semibold uppercase tracking-wide">
                  Action required
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Approve or reject this decision before returning to the queue.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DecisionBadge type={decisionType} />
                  <span className="text-foreground text-sm font-medium">{learnerRef}</span>
                  <span className="text-muted-foreground hidden text-sm sm:inline">·</span>
                  <span className="text-muted-foreground line-clamp-1 text-sm">{summary}</span>
                </div>
              </div>
            </div>
          </div>

          {!showRejectReason ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Button type="button" onClick={handleApprove}>
                Approve
              </Button>
              <Button type="button" variant="outline" onClick={handleRejectClick}>
                Reject
              </Button>
            </div>
          ) : null}
        </div>

        {showRejectReason ? (
          <>
            <RejectReasonStep
              reasonCategory={reasonCategory}
              reasonText={reasonText}
              suggestedDecisionType={suggestedDecisionType}
              onReasonCategoryChange={setReasonCategory}
              onReasonTextChange={setReasonText}
              onSuggestedDecisionTypeChange={setSuggestedDecisionType}
              className="max-h-[min(40vh,320px)] overflow-y-auto border-0 pt-0"
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={resetRejectReason}>
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={rejectPayload == null}
                onClick={handleRejectSubmit}
              >
                Submit rejection
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
