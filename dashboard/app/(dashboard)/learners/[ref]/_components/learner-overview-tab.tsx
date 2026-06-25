'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
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
import { getReviewRecord } from '@/lib/decision-review';
import { formatLevel } from '@/lib/learners';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { scoreToLevel } from '@/lib/score-levels';
import type { RecentDecisionItem } from '@/lib/api/types';

type LearnerOverviewTabProps = {
  orgId: string;
  learnerRef: string;
};

export function LearnerOverviewTab({ orgId, learnerRef }: LearnerOverviewTabProps) {
  const summaryQuery = useLearnerSummary(orgId, learnerRef, {
    recentDecisionsLimit: 10,
  });

  const decisionIds = useMemo(
    () => summaryQuery.data?.recent_decisions.map((d) => d.decision_id) ?? [],
    [summaryQuery.data?.recent_decisions]
  );

  const { latestActionByDecisionId } = useFeedbackStatusForDecisionIds(decisionIds);

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
          const sessionRecord = getReviewRecord(row.original.decision_id);
          const action =
            sessionRecord?.action ??
            feedbackActionToReviewAction(
              latestActionByDecisionId.get(row.original.decision_id)
            );
          return action ? <ReviewActionChip action={action} /> : '—';
        },
      },
      {
        id: 'rule',
        header: 'Rule',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {truncateRule(row.original.matched_rule_id)}
          </span>
        ),
      },
      {
        accessorKey: 'educator_summary',
        header: 'Summary',
        cell: ({ row }) => (
          <span className="line-clamp-2 text-sm">
            {row.original.educator_summary || row.original.rationale}
          </span>
        ),
      },
    ],
    [latestActionByDecisionId]
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

  return (
    <div className="flex flex-col gap-6">
      <SheetSection
        title="Summary"
        fields={[
          {
            label: 'Level',
            value: (
              <span className="flex flex-wrap items-center gap-2">
                {mastery != null ? formatLevel(scoreToLevel(mastery)) : '—'}
                <ProgressBadge variant={trend} />
              </span>
            ),
          },
          {
            label: 'State version',
            value: String(summary.current_state.state_version),
          },
          ...(skillLine
            ? [{ label: 'Focus skill', value: skillLine.replace('Skill: ', '') }]
            : []),
          {
            label: 'Signals',
            value: `${summary.signals_summary.total_count} total`,
          },
          {
            label: 'Active policy',
            value: summary.active_policy
              ? `${summary.active_policy.policy_id} (${summary.active_policy.policy_version})`
              : '—',
          },
        ]}
      />

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
          emptyMessage="No decisions recorded for this learner."
        />
      </section>
    </div>
  );
}
