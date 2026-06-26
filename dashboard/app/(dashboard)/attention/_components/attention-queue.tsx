'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, ListChecks, X } from 'lucide-react';

import { AttentionQueueTable } from '@/app/(dashboard)/attention/_components/attention-queue-table';
import {
  AttentionReviewSheet,
  type AttentionReviewSheetMode,
} from '@/app/(dashboard)/attention/_components/attention-review-sheet';
import { RecentlyReviewed } from '@/app/(dashboard)/attention/_components/recently-reviewed';
import { PageHeader } from '@/components/layout/page-header';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import {
  invalidateDecisionFeedbackQuery,
  useDecisionFeedbackStatus,
} from '@/hooks/use-decision-feedback-status';
import {
  buildPendingAttentionQueue,
  type PendingAttentionItem,
} from '@/lib/attention-decisions';
import type { RejectFeedbackBody } from '@/lib/decision-feedback';
import {
  countReviewedToday,
  type DecisionReviewRecord,
} from '@/lib/decision-review';
import {
  ATTENTION_FROM_PARAM,
  ATTENTION_FROM_PENDING_VALUE,
} from '@/lib/page-url-state';
import { executeReviewAction, type ReviewActionOrigin } from '@/lib/review-actions';

type DecisionFilter = 'all' | 'intervene' | 'pause';

type AttentionQueueProps = {
  orgId: string;
};

function getNextInFilteredQueue(
  queue: PendingAttentionItem[],
  currentDecisionId: string
): PendingAttentionItem | null {
  const index = queue.findIndex(
    (entry) => entry.decision.decision_id === currentDecisionId
  );
  if (index === -1) return null;
  return queue[index + 1] ?? null;
}

export function AttentionQueue({ orgId }: AttentionQueueProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPending =
    searchParams.get(ATTENTION_FROM_PARAM) === ATTENTION_FROM_PENDING_VALUE;

  const [reviewTick, setReviewTick] = useState(0);
  const [selected, setSelected] = useState<PendingAttentionItem | null>(null);
  const [sheetInitialMode, setSheetInitialMode] =
    useState<AttentionReviewSheetMode>('review');
  const [historyRecord, setHistoryRecord] = useState<DecisionReviewRecord | null>(
    null
  );
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');

  const summariesQuery = useOrgLearnerSummaries(orgId, { recentDecisionsLimit: 5 });
  const { serverReviewedIds } = useDecisionFeedbackStatus(summariesQuery.summaries);

  const isLoading = summariesQuery.isLoading;
  const isError = summariesQuery.isError;
  const error = summariesQuery.error;

  const queue = useMemo(() => {
    void reviewTick;
    return buildPendingAttentionQueue(summariesQuery.summaries, { serverReviewedIds });
  }, [summariesQuery.summaries, reviewTick, serverReviewedIds]);

  const filteredQueue = useMemo(() => {
    if (decisionFilter === 'all') return queue;
    return queue.filter((item) => item.decision.decision_type === decisionFilter);
  }, [queue, decisionFilter]);

  const reviewedToday = useMemo(() => {
    void reviewTick;
    return countReviewedToday();
  }, [reviewTick]);

  function bumpQueueChange() {
    setReviewTick((n) => n + 1);
  }

  function reopenSheetForDecision(decisionId: string) {
    const item = buildPendingAttentionQueue(summariesQuery.summaries, {
      serverReviewedIds,
    }).find((entry) => entry.decision.decision_id === decisionId);
    if (!item) return;
    setHistoryRecord(null);
    setSheetInitialMode('review');
    setSelected(item);
  }

  function runReviewAction(
    action: 'approve' | 'reject',
    item: PendingAttentionItem,
    origin: ReviewActionOrigin,
    rejectPayload?: RejectFeedbackBody
  ) {
    void executeReviewAction({
      action,
      decisionId: item.decision.decision_id,
      learnerReference: item.learner_reference,
      decisionType: item.decision.decision_type as 'intervene' | 'pause',
      educatorSummary: item.decision.educator_summary,
      origin,
      rejectPayload,
      onQueueChange: bumpQueueChange,
      onSheetReopen: reopenSheetForDecision,
      onFeedbackPersisted: invalidateDecisionFeedbackQuery,
    });
  }

  function handleApprove(item: PendingAttentionItem) {
    runReviewAction('approve', item, 'table');
    if (selected?.decision.decision_id === item.decision.decision_id) {
      setSelected(null);
    }
  }

  function handleReject(item: PendingAttentionItem) {
    setHistoryRecord(null);
    setSheetInitialMode('rejectReason');
    setSelected(item);
  }

  function handleApproveFromSheet(item: PendingAttentionItem) {
    const next = getNextInFilteredQueue(
      filteredQueue,
      item.decision.decision_id
    );
    runReviewAction('approve', item, 'sheet');
    setHistoryRecord(null);
    setSelected(next);
  }

  function handleRejectSubmitFromSheet(
    item: PendingAttentionItem,
    payload: RejectFeedbackBody
  ) {
    const next = getNextInFilteredQueue(
      filteredQueue,
      item.decision.decision_id
    );
    runReviewAction('reject', item, 'sheet', payload);
    setHistoryRecord(null);
    setSelected(next);
  }

  function handleHistoryRowClick(record: DecisionReviewRecord) {
    setSelected(null);
    setHistoryRecord(record);
  }

  function closeSheet() {
    setSelected(null);
    setHistoryRecord(null);
    setSheetInitialMode('review');
  }

  function openPendingItem(item: PendingAttentionItem) {
    setHistoryRecord(null);
    setSheetInitialMode('review');
    setSelected(item);
  }

  function dismissEntryContext() {
    router.replace('/attention');
  }

  const showHeaderCounts = !isLoading && !isError && (queue.length > 0 || reviewedToday > 0);

  const emptyMessage =
    queue.length === 0 && reviewedToday > 0
      ? `Queue clear — you reviewed ${reviewedToday} decision${reviewedToday === 1 ? '' : 's'} today.`
      : 'No urgent decisions right now.';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attention"
        description="Review intervene and pause decisions below. Approve to acknowledge the recommendation, or reject if you disagree."
      >
        {showHeaderCounts ? (
          <Badge variant="secondary">
            {queue.length} awaiting · {reviewedToday} reviewed today
          </Badge>
        ) : null}
        <RefreshDataButton successMessage="Attention queue refreshed" />
      </PageHeader>

      {fromPending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 pr-1">
            From: Pending decisions
            <button
              type="button"
              className="hover:bg-muted rounded-full p-0.5"
              aria-label="Dismiss entry context"
              onClick={dismissEntryContext}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        </div>
      ) : null}

      {!isLoading && !isError && queue.length > 0 ? (
        <Alert className="border-[var(--status-pause)]/30 bg-[var(--status-pause)]/5">
          <ListChecks aria-hidden="true" />
          <AlertTitle>How to complete a review</AlertTitle>
          <AlertDescription>
            Use <strong>Approve</strong> or <strong>Reject</strong> in the table or detail
            panel to mark each decision reviewed. Open a row for learner context, problem areas,
            and rationale. Need more context? Use <strong>View learner profile</strong> — the review
            bar stays at the bottom so you can finish Approve or Reject there.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Attention queue" className="flex flex-col gap-4">
        {isLoading ? (
          <LoadingState variant="table" count={10} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => summariesQuery.refetch()} />
        ) : queue.length === 0 ? (
          <EmptyState icon={ClipboardList} message={emptyMessage} />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attention-decision-filter" className="text-xs">
                  Action type
                </Label>
                <Select
                  value={decisionFilter}
                  onValueChange={(value) =>
                    setDecisionFilter(value as DecisionFilter)
                  }
                >
                  <SelectTrigger id="attention-decision-filter" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="intervene">Intervene only</SelectItem>
                    <SelectItem value="pause">Pause only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground text-xs sm:ml-auto sm:pb-2">
                Showing {filteredQueue.length} of {queue.length} in queue
              </p>
            </div>

            <AttentionQueueTable
              rows={filteredQueue}
              onRowClick={openPendingItem}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </>
        )}
      </section>

      <RecentlyReviewed
        reviewTick={reviewTick}
        onRowClick={handleHistoryRowClick}
      />

      <AttentionReviewSheet
        item={selected}
        readOnlyRecord={historyRecord}
        initialMode={sheetInitialMode}
        onClose={closeSheet}
        onApprove={handleApproveFromSheet}
        onRejectSubmit={handleRejectSubmitFromSheet}
      />
    </div>
  );
}
