'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import {
  RejectReasonStep,
  buildRejectFeedbackPayload,
} from '@/app/(dashboard)/attention/_components/reject-reason-step';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { ReviewActionChip } from '@/components/shared/review-action-chip';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { UrgencyBadge } from '@/components/shared/urgency-badge';
import { Button } from '@/components/ui/button';
import type { PendingAttentionItem } from '@/lib/attention-decisions';
import { learnerAttentionReviewUrl } from '@/lib/attention-review-url';
import type { DecisionReviewRecord } from '@/lib/decision-review';
import type { RejectFeedbackBody, RejectReasonCategory, SuggestedDecisionType } from '@/lib/decision-feedback';
import { recordDecisionView } from '@/lib/decision-feedback';
import { skillDisplayLine } from '@/lib/panel-helpers';

function decisionNarration(decisionType: string): string {
  if (decisionType === 'intervene') return 'Needs stronger support now';
  if (decisionType === 'pause') return 'High decay risk — consider pausing';
  return 'Needs your review';
}

export type AttentionReviewSheetMode = 'review' | 'rejectReason';

type AttentionReviewSheetProps = {
  item: PendingAttentionItem | null;
  readOnlyRecord?: DecisionReviewRecord | null;
  initialMode?: AttentionReviewSheetMode;
  onClose: () => void;
  onApprove: (item: PendingAttentionItem) => void;
  onRejectSubmit: (item: PendingAttentionItem, payload: RejectFeedbackBody) => void;
};

export function AttentionReviewSheet({
  item,
  readOnlyRecord = null,
  initialMode = 'review',
  onClose,
  onApprove,
  onRejectSubmit,
}: AttentionReviewSheetProps) {
  const isReadOnly = readOnlyRecord != null;
  const open = item != null || isReadOnly;
  const lastViewedDecisionIdRef = useRef<string | null>(null);
  const stateKey =
    item?.decision.decision_id ??
    (readOnlyRecord ? `readonly:${readOnlyRecord.decisionId}` : 'closed');
  const [trackedStateKey, setTrackedStateKey] = useState('closed');
  const [mode, setMode] = useState<AttentionReviewSheetMode>('review');
  const [reasonCategory, setReasonCategory] = useState<RejectReasonCategory | null>(
    null
  );
  const [reasonText, setReasonText] = useState('');
  const [suggestedDecisionType, setSuggestedDecisionType] =
    useState<SuggestedDecisionType | null>(null);

  if (stateKey !== trackedStateKey) {
    setTrackedStateKey(stateKey);
    setMode(item ? initialMode : 'review');
    setReasonCategory(null);
    setReasonText('');
    setSuggestedDecisionType(null);
  }

  useEffect(() => {
    if (!open) {
      lastViewedDecisionIdRef.current = null;
      return;
    }

    if (isReadOnly || !item) return;

    const decisionId = item.decision.decision_id;
    if (lastViewedDecisionIdRef.current === decisionId) return;

    lastViewedDecisionIdRef.current = decisionId;
    void recordDecisionView(decisionId).catch(() => {
      // Fire-and-forget: view log failure must not block sheet render.
    });
  }, [open, isReadOnly, item?.decision.decision_id]);

  const skillLine = item ? skillDisplayLine(item.dominantSkill) : null;
  const summary = item
    ? item.decision.educator_summary ||
      decisionNarration(item.decision.decision_type)
    : readOnlyRecord?.educatorSummary ||
      (readOnlyRecord ? decisionNarration(readOnlyRecord.decisionType) : '');
  const rationale = item?.decision.rationale ?? '';

  const rejectPayload = buildRejectFeedbackPayload({
    reasonCategory,
    reasonText,
    suggestedDecisionType,
  });

  function handleApprove() {
    if (!item) return;
    onApprove(item);
  }

  function handleRejectClick() {
    setMode('rejectReason');
  }

  function handleRejectBack() {
    setMode('review');
  }

  function handleRejectSubmit() {
    if (!item || !rejectPayload) return;
    onRejectSubmit(item, rejectPayload);
  }

  const titleContent = item ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{item.learner_reference}</span>
      <UrgencyBadge priority={item.priority} />
    </span>
  ) : readOnlyRecord ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">
        {readOnlyRecord.learnerReference || readOnlyRecord.decisionId}
      </span>
      <ReviewActionChip action={readOnlyRecord.action} />
    </span>
  ) : undefined;

  const descriptionContent =
    item || readOnlyRecord ? (
      <span className="flex flex-wrap items-center gap-2">
        <DecisionBadge
          type={item?.decision.decision_type ?? readOnlyRecord!.decisionType}
        />
        <span>{summary}</span>
      </span>
    ) : undefined;

  return (
    <DetailSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={titleContent}
      description={descriptionContent}
      footer={
        item && !isReadOnly ? (
          mode === 'rejectReason' ? (
            <>
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleRejectBack}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  disabled={rejectPayload == null}
                  onClick={handleRejectSubmit}
                >
                  Submit rejection
                </Button>
              </div>
              <Button
                type="button"
                variant="link"
                className="h-auto w-full justify-center px-0 text-sm"
                nativeButton={false}
                render={
                  <Link
                    href={learnerAttentionReviewUrl(
                      item.learner_reference,
                      item.decision.decision_id
                    )}
                  />
                }
              >
                View learner profile
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex w-full gap-2">
                <Button type="button" className="flex-1" onClick={handleApprove}>
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleRejectClick}
                >
                  Reject
                </Button>
              </div>
              <Button
                type="button"
                variant="link"
                className="h-auto w-full justify-center px-0 text-sm"
                nativeButton={false}
                render={
                  <Link
                    href={learnerAttentionReviewUrl(
                      item.learner_reference,
                      item.decision.decision_id
                    )}
                  />
                }
              >
                View learner profile
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </>
          )
        ) : readOnlyRecord ? (
          <Button
            type="button"
            variant="link"
            className="h-auto w-full justify-center px-0 text-sm"
            nativeButton={false}
            render={
              <Link
                href={`/decisions/${encodeURIComponent(readOnlyRecord.decisionId)}`}
              />
            }
          >
            View decision
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        ) : undefined
      }
    >
      {item ? (
        <div className="flex flex-col gap-5 px-4 py-4">
          {skillLine ? (
            <p className="text-muted-foreground text-sm">{skillLine}</p>
          ) : null}

          {item.problemAreas.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle
                  className="text-[var(--urgency-medium)] size-3.5"
                  aria-hidden="true"
                />
                Struggling with
              </h3>
              <ul className="flex flex-col gap-1">
                {item.problemAreas.map((area) => (
                  <li
                    key={`${area.label}-${area.detail}`}
                    className="bg-muted/50 flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm"
                  >
                    <span className="text-foreground font-medium">{area.label}</span>
                    <span className="text-muted-foreground text-right text-xs">
                      {area.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-1.5">
            <h3 className="text-foreground text-sm font-medium">Why this decision</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {rationale || 'No rationale text was provided for this decision.'}
            </p>
          </section>

          {mode === 'rejectReason' ? (
            <RejectReasonStep
              reasonCategory={reasonCategory}
              reasonText={reasonText}
              suggestedDecisionType={suggestedDecisionType}
              onReasonCategoryChange={setReasonCategory}
              onReasonTextChange={setReasonText}
              onSuggestedDecisionTypeChange={setSuggestedDecisionType}
            />
          ) : null}
        </div>
      ) : readOnlyRecord ? (
        <div className="flex flex-col gap-5 px-4 py-4">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-foreground text-sm font-medium">Review summary</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {summary || 'No summary was recorded for this review.'}
            </p>
          </section>
        </div>
      ) : null}
    </DetailSheet>
  );
}
