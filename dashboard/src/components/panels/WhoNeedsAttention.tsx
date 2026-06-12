import { AlertCircle } from 'lucide-react';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { DecisionBadge } from '@/components/shared/DecisionBadge';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { UrgencyBadge } from '@/components/shared/UrgencyBadge';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { decisionTypePriority, rankSummaryAttention } from '@/lib/attention-decisions';

function decisionNarration(decisionType: string): string {
  if (decisionType === 'intervene') return 'high urgency decision';
  if (decisionType === 'pause') return 'high decay risk';
  return 'needs attention';
}

export function WhoNeedsAttention({ orgId }: { orgId: string }) {
  const { summaries, isLoading, isError, error, refetch } = useOrgLearnerSummaries(orgId);

  if (isLoading) {
    return (
      <PanelCard
        title="Who Needs Help Now"
        description="Learners with recent intervene or pause decisions, ordered by urgency."
        icon={AlertCircle}
        variant="danger"
      >
        <PanelSkeleton />
      </PanelCard>
    );
  }

  if (isError) {
    return (
      <PanelCard
        title="Who Needs Help Now"
        description="Learners with recent intervene or pause decisions, ordered by urgency."
        icon={AlertCircle}
        variant="danger"
      >
        <PanelError status={error?.message ?? 'Unknown error'} onRetry={() => void refetch()} />
      </PanelCard>
    );
  }

  const ranked = rankSummaryAttention(summaries);
  const rows = ranked.slice(0, 5);
  const more = Math.max(0, ranked.length - rows.length);

  if (rows.length === 0) {
    return (
      <PanelCard
        title="Who Needs Help Now"
        description="Learners with recent intervene or pause decisions, ordered by urgency."
        icon={AlertCircle}
        variant="danger"
      >
        <PanelEmpty message="No learners need attention right now." />
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Who Needs Help Now"
      description="Learners with recent intervene or pause decisions, ordered by urgency."
      icon={AlertCircle}
      variant="danger"
      footer={
        more > 0 ? (
          <p className="w-full text-center text-xs text-muted-foreground">+ {more} more learners</p>
        ) : undefined
      }
    >
      {rows.map((row) => {
        const skillLine = skillDisplayLine(row.dominantSkill);
        const decisionType = row.decision.decision_type;
        return (
          <LearnerCard
            key={`${row.decision.decision_id}-who`}
            learnerRef={row.learner_reference}
            headerRight={<UrgencyBadge priority={decisionTypePriority(decisionType)} />}
          >
            <div className="flex flex-wrap items-center gap-2">
              <DecisionBadge type={decisionType} />
              <span className="text-sm text-muted-foreground">
                {row.decision.educator_summary || decisionNarration(decisionType)}
              </span>
            </div>
            {skillLine ? <p className="text-sm text-foreground">{skillLine}</p> : null}
          </LearnerCard>
        );
      })}
    </PanelCard>
  );
}
