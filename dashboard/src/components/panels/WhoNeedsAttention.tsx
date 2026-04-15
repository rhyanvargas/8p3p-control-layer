import { AlertCircle } from 'lucide-react';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { DecisionBadge } from '@/components/shared/DecisionBadge';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { UrgencyBadge } from '@/components/shared/UrgencyBadge';
import { useDecisions } from '@/hooks/use-decisions';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { rankAttentionDecisions } from '@/lib/attention-decisions';

function decisionNarration(decisionType: string): string {
  if (decisionType === 'intervene') return 'high urgency decision';
  if (decisionType === 'pause') return 'high decay risk';
  return 'needs attention';
}

export function WhoNeedsAttention({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, error, refetch } = useDecisions(orgId);

  if (isLoading) {
    return (
      <PanelCard
        title="Who Needs Attention?"
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
        title="Who Needs Attention?"
        description="Learners with recent intervene or pause decisions, ordered by urgency."
        icon={AlertCircle}
        variant="danger"
      >
        <PanelError status={error.message} onRetry={() => void refetch()} />
      </PanelCard>
    );
  }

  const ranked = rankAttentionDecisions(data ?? []);
  const rows = ranked.slice(0, 5);
  const more = Math.max(0, ranked.length - rows.length);

  if (!data || rows.length === 0) {
    return (
      <PanelCard
        title="Who Needs Attention?"
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
      title="Who Needs Attention?"
      description="Learners with recent intervene or pause decisions, ordered by urgency."
      icon={AlertCircle}
      variant="danger"
      footer={
        more > 0 ? (
          <p className="w-full text-center text-xs text-muted-foreground">+ {more} more learners</p>
        ) : undefined
      }
    >
      {rows.map((d) => {
        const skillLine = skillDisplayLine(d.decision_context.skill);
        return (
          <LearnerCard
            key={`${d.decision_id}-who`}
            learnerRef={d.learner_reference}
            headerRight={<UrgencyBadge priority={d.output_metadata?.priority ?? null} />}
          >
            <div className="flex flex-wrap items-center gap-2">
              <DecisionBadge type={d.decision_type} />
              <span className="text-sm text-muted-foreground">{decisionNarration(d.decision_type)}</span>
            </div>
            {skillLine ? <p className="text-sm text-foreground">{skillLine}</p> : null}
          </LearnerCard>
        );
      })}
    </PanelCard>
  );
}
