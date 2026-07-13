'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import {
  cardInlineActionVariants,
} from '@/components/shared/card-inline-action';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { ProgressBadge } from '@/components/shared/progress-badge';
import {
  ReviewActionChip,
  feedbackActionToReviewAction,
} from '@/components/shared/review-action-chip';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { useFeedbackStatusForDecisionIds } from '@/hooks/use-decision-feedback-status';
import { useLearnerSummary } from '@/hooks/use-learner-summary';
import {
  learnerAttentionReviewUrl,
  learnerDetailReviewUrl,
} from '@/lib/attention-review-url';
import { getReviewRecord } from '@/lib/decision-review';
import { formatLevel } from '@/lib/learners';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';
import { useDashboardPersona } from '@/lib/persona-context';
import { educatorBodyCopy, skillDisplayLine } from '@/lib/panel-helpers';
import { listPendingUrgentDecisionIds } from '@/lib/pending-review-presentation';
import { scoreToLevel } from '@/lib/score-levels';
import type { RecentDecisionItem } from '@/lib/api/types';

type LearnerOverviewTabProps = {
  orgId: string;
  learnerRef: string;
  /** Pending decision under review — highlights Overview row + Reviewing chip (RTC-F03/F04). */
  activePendingDecisionId?: string;
  /** Preserve `from=attention` on Review links when entry was Attention-originated (RTC-F14). */
  fromAttention?: boolean;
};

export function LearnerOverviewTab({
  orgId,
  learnerRef,
  activePendingDecisionId,
  fromAttention = false,
}: LearnerOverviewTabProps) {
  const persona = useDashboardPersona();
  const isEducator = persona === 'educator';
  const summaryQuery = useLearnerSummary(orgId, learnerRef, {
    recentDecisionsLimit: 10,
  });

  const decisionIds = useMemo(
    () => summaryQuery.data?.recent_decisions.map((d) => d.decision_id) ?? [],
    [summaryQuery.data?.recent_decisions]
  );

  const { latestActionByDecisionId, serverReviewedIds } =
    useFeedbackStatusForDecisionIds(decisionIds);

  const pendingDecisionIdSet = useMemo(() => {
    if (!summaryQuery.data) return new Set<string>();
    return new Set(
      listPendingUrgentDecisionIds(summaryQuery.data, serverReviewedIds)
    );
  }, [summaryQuery.data, serverReviewedIds]);

  const columns = useMemo<ColumnDef<RecentDecisionItem>[]>(
    () => [
      {
        accessorKey: 'decided_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        cell: ({ row }) => formatDecisionTime(row.original.decided_at),
      },
      {
        accessorKey: 'decision_type',
        header: 'Type',
        cell: ({ row }) => <DecisionBadge type={row.original.decision_type} />,
      },
      {
        id: 'yourAction',
        header: 'Your action',
        cell: ({ row }) => {
          const decisionId = row.original.decision_id;
          const sessionRecord = getReviewRecord(decisionId);
          const action =
            sessionRecord?.action ??
            feedbackActionToReviewAction(latestActionByDecisionId.get(decisionId));
          if (action) {
            return <ReviewActionChip action={action} />;
          }
          if (activePendingDecisionId === decisionId) {
            return <ReviewActionChip action="reviewing" />;
          }
          // RTC-F14: quiet Review link on non-active pending rows — URL only, never Approve/Reject.
          if (pendingDecisionIdSet.has(decisionId)) {
            const href = fromAttention
              ? learnerAttentionReviewUrl(learnerRef, decisionId)
              : learnerDetailReviewUrl(learnerRef, decisionId);
            return (
              <Link
                href={href}
                className={cardInlineActionVariants({ variant: 'underline' })}
                data-slot="card-inline-action"
                data-variant="underline"
              >
                Review
              </Link>
            );
          }
          return '—';
        },
      },
      ...(isEducator
        ? []
        : [
            {
              id: 'rule',
              header: 'Rule',
              cell: ({ row }: { row: { original: RecentDecisionItem } }) => (
                <span className="text-muted-foreground font-mono text-xs">
                  {truncateRule(row.original.matched_rule_id)}
                </span>
              ),
            } as ColumnDef<RecentDecisionItem>,
          ]),
      {
        accessorKey: 'educator_summary',
        header: 'Summary',
        cell: ({ row }) => (
          <span className="line-clamp-2 text-sm">
            {educatorBodyCopy(row.original)}
          </span>
        ),
      },
    ],
    [
      activePendingDecisionId,
      fromAttention,
      isEducator,
      latestActionByDecisionId,
      learnerRef,
      pendingDecisionIdSet,
    ]
  );

  if (summaryQuery.isLoading) {
    return <LoadingState variant="list" count={4} />;
  }

  if (summaryQuery.isError) {
    return (
      <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
    );
  }

  const summary = summaryQuery.data;
  if (!summary) {
    return <LoadingState variant="list" count={2} />;
  }

  const fields = summary.current_state.fields;
  const mastery =
    typeof fields.masteryScore === 'number' ? fields.masteryScore : null;
  const trend =
    fields.masteryScore_direction === 'improving'
      ? 'improving'
      : fields.masteryScore_direction === 'declining'
        ? 'declining'
        : 'stable';
  const skillLine = skillDisplayLine(fields.skill);

  const summaryFields = [
    {
      label: 'Level',
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {mastery != null ? formatLevel(scoreToLevel(mastery)) : '—'}
          <ProgressBadge variant={trend} />
        </span>
      ),
    },
    ...(isEducator
      ? []
      : [
          {
            label: 'State version',
            value: String(summary.current_state.state_version),
          },
        ]),
    ...(skillLine
      ? [{ label: 'Focus skill', value: skillLine.replace('Skill: ', '') }]
      : []),
    {
      label: 'Signals',
      value: `${summary.signals_summary.total_count} total`,
    },
    ...(isEducator
      ? []
      : [
          {
            label: 'Active policy',
            value: summary.active_policy
              ? `${summary.active_policy.policy_id} (${summary.active_policy.policy_version})`
              : '—',
          },
        ]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <SheetSection title="Summary" fields={summaryFields} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Recent decisions</h2>
          <p className="text-muted-foreground text-sm">
            Decision-driven view from the learner summary endpoint.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={summary.recent_decisions}
          pageSize={10}
          showPagination={summary.recent_decisions.length > 10}
          showFilter={false}
          getRowId={(row) => row.decision_id}
          activeRowId={activePendingDecisionId}
          initialSorting={[{ id: 'decided_at', desc: true }]}
          emptyMessage="No decisions recorded for this learner."
        />
      </section>
    </div>
  );
}
