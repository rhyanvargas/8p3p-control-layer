'use client';

import { DecisionBadge } from '@/components/shared/decision-badge';
import { IngestionOutcomeChip } from '@/components/shared/ingestion-outcome-chip';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import { ProgressBadge } from '@/components/shared/progress-badge';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { useLearnerIngestion } from '@/hooks/use-learner-ingestion';
import { useLearnerSummary } from '@/hooks/use-learner-summary';
import {
  formatLevel,
  formatRelativeActivity,
  type LearnerRosterRow,
} from '@/lib/learners';
import { ingestionLogEntryKey } from '@/lib/ingestion-log';
import { formatDecisionTime } from '@/lib/overview-metrics';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { scoreToLevel } from '@/lib/score-levels';

const SHEET_DECISIONS_LIMIT = 3;
const SHEET_SIGNALS_LIMIT = 3;

type LearnerDetailSheetProps = {
  learner: LearnerRosterRow | null;
  orgId: string;
  onClose: () => void;
};

export function LearnerDetailSheet({
  learner,
  orgId,
  onClose,
}: LearnerDetailSheetProps) {
  const learnerRef = learner?.learner_reference ?? '';

  const summaryQuery = useLearnerSummary(orgId, learnerRef, {
    recentDecisionsLimit: SHEET_DECISIONS_LIMIT,
  });
  const ingestionQuery = useLearnerIngestion(orgId, learnerRef, SHEET_SIGNALS_LIMIT);

  const isLoading = summaryQuery.isLoading || ingestionQuery.isLoading;
  const isError = summaryQuery.isError || ingestionQuery.isError;
  const error = summaryQuery.error ?? ingestionQuery.error;

  const refetch = () => {
    void summaryQuery.refetch();
    void ingestionQuery.refetch();
  };

  const summary = summaryQuery.data;
  const fields = summary?.current_state.fields;
  const mastery =
    typeof fields?.masteryScore === 'number' ? fields.masteryScore : undefined;
  const level =
    mastery != null ? scoreToLevel(mastery) : (learner?.level ?? 'novice');
  const trend = learner?.trend ?? 'stable';
  const skillLine = fields ? skillDisplayLine(fields.skill) : null;

  return (
    <DetailSheet
      open={learner != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        learner ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{learner.learner_reference}</span>
            <ProgressBadge variant={trend} />
          </span>
        ) : undefined
      }
      description={
        learner
          ? `${formatLevel(level)} · ${formatRelativeActivity(learner.updated_at)}`
          : undefined
      }
      footer={
        learner ? (
          <DrillDownLink
            href={`/learners/${encodeURIComponent(learner.learner_reference)}`}
          />
        ) : undefined
      }
    >
      {learner == null ? null : isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <SheetSection
            title="Current state"
            fields={[
              {
                label: 'Level',
                value: formatLevel(level),
              },
              {
                label: 'State version',
                value: String(
                  summary?.current_state.state_version ?? learner.state_version
                ),
              },
              ...(skillLine
                ? [{ label: 'Focus skill', value: skillLine.replace('Skill: ', '') }]
                : []),
              {
                label: 'Last updated',
                value: formatRelativeActivity(
                  summary?.current_state.updated_at ?? learner.updated_at
                ),
              },
            ]}
          />

          <SheetSection title={`Recent signals (max ${SHEET_SIGNALS_LIMIT})`}>
            {ingestionQuery.data && ingestionQuery.data.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {ingestionQuery.data.map((entry) => (
                  <li
                    key={ingestionLogEntryKey(entry)}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{entry.source_system}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatDecisionTime(entry.received_at)}
                      </span>
                    </div>
                    <IngestionOutcomeChip outcome={entry.outcome} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No recent signals.</p>
            )}
          </SheetSection>

          <SheetSection title={`Recent decisions (max ${SHEET_DECISIONS_LIMIT})`}>
            {summary?.recent_decisions && summary.recent_decisions.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {summary.recent_decisions.map((decision) => (
                  <li
                    key={decision.decision_id}
                    className="flex flex-col gap-1 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DecisionBadge type={decision.decision_type} />
                      <span className="text-muted-foreground text-xs">
                        {formatDecisionTime(decision.decided_at)}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">
                      {decision.educator_summary || decision.rationale}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No recent decisions.</p>
            )}
          </SheetSection>
        </>
      )}
    </DetailSheet>
  );
}
