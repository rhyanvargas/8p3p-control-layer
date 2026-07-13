'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import {
  RejectReasonStep,
  buildRejectFeedbackPayload,
} from '@/app/(dashboard)/attention/_components/reject-reason-step';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import {
  CardInlineAction,
  cardInlineActionVariants,
} from '@/components/shared/card-inline-action';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import { useLearnerStates } from '@/hooks/use-learner-states';
import { summaryAttentionLearnerRefs } from '@/lib/attention-decisions';
import type { RejectReasonCategory, SuggestedDecisionType } from '@/lib/decision-feedback';
import { isReviewedLocally } from '@/lib/decision-review';
import {
  educatorBodyCopy,
  findRecentDecisionForSkill,
  skillDisplayLine,
} from '@/lib/panel-helpers';
import { queryClient } from '@/lib/query-client';
import { buildStabilityRationale } from '@/lib/rationale-builder';
import { useDashboardPersona } from '@/lib/persona-context';
import { executeReviewAction } from '@/lib/review-actions';
import { formatSkillLabel, extractSkillRows } from '@/lib/state-skills';
import { icon, surface } from '@/lib/semantic-colors';
import { cn } from '@/lib/utils';

const MAX_WATCH = 5;

type WatchIssue = {
  key: string;
  learnerRef: string;
  skillName: string;
  direction: 'declining' | 'below threshold';
  stabilityScore?: number;
};

/**
 * Single Overview surface for AI educator insights.
 * Featured next action (full narrative + review) + compact watch list
 * (skill status only — no duplicate explanation copy).
 */
export function EducatorInsights({ orgId }: { orgId: string }) {
  const persona = useDashboardPersona();
  const summariesQuery = useOrgLearnerSummaries(orgId);
  const { summaries, isLoading: summariesLoading, isError: summariesError, error, refetch } =
    summariesQuery;

  const [expanded, setExpanded] = useState(false);
  const [reviewTick, setReviewTick] = useState(0);
  const [selectedWatchKey, setSelectedWatchKey] = useState<string | null>(null);

  const nextAction = useMemo(() => {
    void reviewTick;
    const candidates: Array<{
      learnerRef: string;
      dominantSkill: string | null;
      decision: (typeof summaries)[number]['recent_decisions'][number];
    }> = [];
    for (const summary of summaries) {
      const skillField = summary.current_state.fields.skill;
      const dominantSkill = typeof skillField === 'string' && skillField.trim() ? skillField : null;
      for (const decision of summary.recent_decisions) {
        if (
          (decision.decision_type === 'intervene' || decision.decision_type === 'pause') &&
          !isReviewedLocally(decision.decision_id)
        ) {
          candidates.push({
            learnerRef: summary.learner_reference,
            dominantSkill,
            decision,
          });
        }
      }
    }
    candidates.sort((a, b) => b.decision.decided_at.localeCompare(a.decision.decided_at));
    return candidates[0] ?? null;
  }, [summaries, reviewTick]);

  const learnerRefs = useMemo(
    () => summaryAttentionLearnerRefs(summaries),
    [summaries]
  );
  const stateQuery = useLearnerStates(orgId, learnerRefs);

  const decisionsByLearner = useMemo(() => {
    const map = new Map<string, (typeof summaries)[number]['recent_decisions']>();
    for (const summary of summaries) {
      map.set(summary.learner_reference, summary.recent_decisions);
    }
    return map;
  }, [summaries]);

  const watchIssues = useMemo(() => {
    const featuredLearner = nextAction?.learnerRef ?? null;
    const featuredSkills = new Set(
      [nextAction?.decision.skill, nextAction?.dominantSkill]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s))
    );

    const issues: WatchIssue[] = [];
    for (let i = 0; i < stateQuery.queries.length; i++) {
      const q = stateQuery.queries[i]!;
      const learnerRef = learnerRefs[i]!;
      const body = q.data;
      if (!body) continue;
      const rows = extractSkillRows(body.state);
      for (const row of rows) {
        const dir = row.stabilityScore_direction;
        const score = row.stabilityScore;
        const declining = dir === 'declining';
        const low = typeof score === 'number' && score < 0.5;
        if (!declining && !low) continue;

        // Skip the featured learner+skill — narrative already shown above.
        if (
          featuredLearner &&
          learnerRef === featuredLearner &&
          featuredSkills.has(row.skillName.trim())
        ) {
          continue;
        }

        issues.push({
          key: `${learnerRef}-${row.skillName}`,
          learnerRef,
          skillName: row.skillName,
          direction: declining ? 'declining' : 'below threshold',
          stabilityScore: typeof score === 'number' ? score : undefined,
        });
      }
    }
    return issues;
  }, [stateQuery.queries, learnerRefs, nextAction]);

  const activeDecisionId = nextAction?.decision.decision_id ?? null;
  const [rejectDecisionId, setRejectDecisionId] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [reasonCategory, setReasonCategory] = useState<RejectReasonCategory | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [suggestedDecisionType, setSuggestedDecisionType] =
    useState<SuggestedDecisionType | null>(null);

  if (activeDecisionId !== rejectDecisionId) {
    setRejectDecisionId(activeDecisionId);
    setShowRejectReason(false);
    setReasonCategory(null);
    setReasonText('');
    setSuggestedDecisionType(null);
  }

  function resetRejectReason() {
    setShowRejectReason(false);
    setReasonCategory(null);
    setReasonText('');
    setSuggestedDecisionType(null);
  }

  function bumpQueueChange() {
    setReviewTick((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ['learner-summary'] });
  }

  const isLoading = summariesLoading || stateQuery.isLoading;
  const isError = summariesError || stateQuery.isError;
  const firstError = error?.message ?? stateQuery.error?.message ?? 'Unknown error';

  const refetchAll = () => {
    void refetch();
    stateQuery.refetch();
  };

  const shownWatch = watchIssues.slice(0, MAX_WATCH);
  const moreWatch = watchIssues.length - shownWatch.length;

  const selectedWatch = selectedWatchKey
    ? watchIssues.find((i) => i.key === selectedWatchKey) ?? null
    : null;

  const selectedWatchQuote = selectedWatch
    ? (() => {
        const matched = findRecentDecisionForSkill(
          decisionsByLearner.get(selectedWatch.learnerRef) ?? [],
          selectedWatch.skillName
        );
        if (matched) {
          return educatorBodyCopy({
            ...matched,
            skill: matched.skill ?? selectedWatch.skillName,
          });
        }
        if (typeof selectedWatch.stabilityScore === 'number') {
          return buildStabilityRationale(selectedWatch.stabilityScore, selectedWatch.skillName);
        }
        return `Stability trend for ${selectedWatch.skillName} needs attention.`;
      })()
    : null;

  return (
    <Card className="overflow-hidden ring-1 ring-foreground/10" aria-labelledby="educator-insights-title">
      <CardHeader className="flex flex-row items-start gap-3 border-b pb-4">
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
            surface.infoMutedIcon
          )}
        >
          <Sparkles className={cn('size-4', icon.info)} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle id="educator-insights-title" className="text-base font-semibold">
            AI educator insights
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One priority action, then a compact watch list — explanations appear once.
          </p>
        </div>
        {nextAction || watchIssues.length > 0 ? (
          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {nextAction ? '1 to review' : 'Clear'}
            {watchIssues.length > 0 ? ` · ${watchIssues.length} watching` : ''}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-0 p-0">
        {isLoading ? (
          <div className="p-4">
            <PanelSkeleton rows={2} />
          </div>
        ) : null}

        {isError ? (
          <div className="p-4">
            <PanelError status={firstError} onRetry={refetchAll} />
          </div>
        ) : null}

        {!isLoading && !isError && !nextAction && watchIssues.length === 0 ? (
          <div className="p-4">
            <PanelEmpty message="Nothing needs attention right now." />
          </div>
        ) : null}

        {!isLoading && !isError && nextAction ? (
          <FeaturedAction
            nextAction={nextAction}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((e) => !e)}
            showRejectReason={showRejectReason}
            reasonCategory={reasonCategory}
            reasonText={reasonText}
            suggestedDecisionType={suggestedDecisionType}
            onReasonCategoryChange={setReasonCategory}
            onReasonTextChange={setReasonText}
            onSuggestedDecisionTypeChange={setSuggestedDecisionType}
            onApprove={() => {
              const { decision, learnerRef } = nextAction;
              void executeReviewAction({
                action: 'approve',
                decisionId: decision.decision_id,
                learnerReference: learnerRef,
                decisionType: decision.decision_type as 'intervene' | 'pause',
                educatorSummary: decision.educator_summary,
                origin: 'what-to-do',
                persona,
                onQueueChange: bumpQueueChange,
              });
              resetRejectReason();
              setExpanded(false);
            }}
            onRejectClick={() => setShowRejectReason(true)}
            onRejectCancel={resetRejectReason}
            onRejectSubmit={() => {
              const rejectPayload = buildRejectFeedbackPayload({
                reasonCategory,
                reasonText,
                suggestedDecisionType,
              });
              if (!rejectPayload) return;
              const { decision, learnerRef } = nextAction;
              void executeReviewAction({
                action: 'reject',
                decisionId: decision.decision_id,
                learnerReference: learnerRef,
                decisionType: decision.decision_type as 'intervene' | 'pause',
                educatorSummary: decision.educator_summary,
                origin: 'what-to-do',
                persona,
                rejectPayload,
                onQueueChange: bumpQueueChange,
              });
              resetRejectReason();
              setExpanded(false);
            }}
            rejectPayloadReady={
              buildRejectFeedbackPayload({
                reasonCategory,
                reasonText,
                suggestedDecisionType,
              }) != null
            }
          />
        ) : null}

        {!isLoading && !isError && shownWatch.length > 0 ? (
          <div className="border-t">
            <div className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Also watching
              </h3>
              <Link
                href="/attention"
                className={cn(
                  cardInlineActionVariants({ variant: 'arrow' }),
                  'text-muted-foreground hover:text-foreground'
                )}
              >
                Open attention
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
            <ul className="divide-y divide-border/60" role="list">
              {shownWatch.map((issue) => {
                const isOpen = selectedWatchKey === issue.key;
                const toggleWatch = () =>
                  setSelectedWatchKey((prev) => (prev === issue.key ? null : issue.key));
                const panelId = `watch-why-${issue.key}`;
                return (
                  <li key={issue.key}>
                    <div
                      className={cn(
                        'flex w-full items-start gap-2 px-4 py-2.5 transition-colors',
                        'hover:bg-muted/40',
                        isOpen && 'bg-muted/50'
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={toggleWatch}
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                            issue.direction === 'declining' ? 'bg-amber-600' : 'bg-red-600'
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-medium text-foreground">
                              {issue.learnerRef}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatSkillLabel(issue.skillName)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Stability {issue.direction}
                            {typeof issue.stabilityScore === 'number'
                              ? ` · ${Math.round(issue.stabilityScore * 100)}%`
                              : ''}
                          </span>
                        </span>
                      </button>
                      <CardInlineAction
                        variant="disclosure"
                        expanded={isOpen}
                        className="mt-0.5"
                        aria-controls={panelId}
                        aria-label={
                          isOpen
                            ? `Hide why ${issue.learnerRef} needs attention`
                            : `Why ${issue.learnerRef} needs attention`
                        }
                        onClick={toggleWatch}
                      >
                        {isOpen ? 'Hide' : 'Why'}
                      </CardInlineAction>
                    </div>
                    {isOpen && selectedWatchQuote ? (
                      <div
                        id={panelId}
                        className="border-t border-border/40 bg-muted/20 px-4 py-3 pl-8"
                      >
                        <p className="text-sm text-foreground">{selectedWatchQuote}</p>
                        <Link
                          href={`/learners/${encodeURIComponent(issue.learnerRef)}`}
                          className={cn(
                            cardInlineActionVariants({ variant: 'arrow' }),
                            'mt-2'
                          )}
                        >
                          View learner
                          <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {moreWatch > 0 ? (
              <p className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
                +{moreWatch} more on Attention
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FeaturedAction({
  nextAction,
  expanded,
  onToggleExpanded,
  showRejectReason,
  reasonCategory,
  reasonText,
  suggestedDecisionType,
  onReasonCategoryChange,
  onReasonTextChange,
  onSuggestedDecisionTypeChange,
  onApprove,
  onRejectClick,
  onRejectCancel,
  onRejectSubmit,
  rejectPayloadReady,
}: {
  nextAction: {
    learnerRef: string;
    dominantSkill: string | null;
    decision: {
      decision_id: string;
      decision_type: string;
      educator_summary?: string | null;
      educator_explanation?: string | null;
      rationale?: string | null;
      skill?: string | null;
    };
  };
  expanded: boolean;
  onToggleExpanded: () => void;
  showRejectReason: boolean;
  reasonCategory: RejectReasonCategory | null;
  reasonText: string;
  suggestedDecisionType: SuggestedDecisionType | null;
  onReasonCategoryChange: (v: RejectReasonCategory | null) => void;
  onReasonTextChange: (v: string) => void;
  onSuggestedDecisionTypeChange: (v: SuggestedDecisionType | null) => void;
  onApprove: () => void;
  onRejectClick: () => void;
  onRejectCancel: () => void;
  onRejectSubmit: () => void;
  rejectPayloadReady: boolean;
}) {
  const { decision, learnerRef, dominantSkill } = nextAction;
  const bodyCopy = educatorBodyCopy(decision);
  const skillLine =
    skillDisplayLine(decision.skill) ?? skillDisplayLine(dominantSkill);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Act now
        </span>
        <DecisionBadge type={decision.decision_type} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-lg font-semibold tracking-tight text-foreground">{learnerRef}</p>
        {skillLine ? <p className="text-sm text-muted-foreground">{skillLine}</p> : null}
      </div>

      <div>
        <p
          className={cn('text-sm leading-relaxed text-foreground', !expanded && 'line-clamp-3')}
          aria-label="Decision explanation"
        >
          {bodyCopy}
        </p>
        {bodyCopy.length > 160 ? (
          <CardInlineAction
            variant="link"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : 'Read more'}
          </CardInlineAction>
        ) : null}
      </div>

      {showRejectReason ? (
        <RejectReasonStep
          reasonCategory={reasonCategory}
          reasonText={reasonText}
          suggestedDecisionType={suggestedDecisionType}
          onReasonCategoryChange={onReasonCategoryChange}
          onReasonTextChange={onReasonTextChange}
          onSuggestedDecisionTypeChange={onSuggestedDecisionTypeChange}
          className="border-0 pt-0"
        />
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {showRejectReason ? (
          <>
            <Button type="button" variant="outline" onClick={onRejectCancel} aria-label="Cancel rejection">
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectPayloadReady}
              onClick={onRejectSubmit}
              aria-label="Submit rejection"
            >
              Submit rejection
            </Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={onApprove} aria-label="Approve decision review">
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRejectClick}
              aria-label="Reject decision review"
            >
              Reject
            </Button>
            <Link
              href={`/learners/${encodeURIComponent(learnerRef)}`}
              className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto')}
            >
              View learner
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
