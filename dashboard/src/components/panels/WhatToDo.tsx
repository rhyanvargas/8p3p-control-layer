import { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { Button } from '@/components/ui/button';
import { DecisionBadge } from '@/components/shared/DecisionBadge';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import { markReviewed, isReviewed } from '@/lib/decision-review';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { queryClient } from '@/lib/query-client';

export function WhatToDo({ orgId }: { orgId: string }) {
  const { summaries, isLoading, isError, error, refetch } = useOrgLearnerSummaries(orgId);
  const [expanded, setExpanded] = useState(false);

  const nextAction = useMemo(() => {
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
          !isReviewed(decision.decision_id)
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
  }, [summaries]);

  if (isLoading) {
    return (
      <PanelCard
        title="What Should Happen Next"
        description="Most recent actionable intervene or pause decision awaiting educator review."
        icon={Lightbulb}
        variant="action"
      >
        <PanelSkeleton rows={2} />
      </PanelCard>
    );
  }

  if (isError) {
    return (
      <PanelCard
        title="What Should Happen Next"
        description="Most recent actionable intervene or pause decision awaiting educator review."
        icon={Lightbulb}
        variant="action"
      >
        <PanelError status={error?.message ?? 'Unknown error'} onRetry={() => void refetch()} />
      </PanelCard>
    );
  }

  if (!nextAction) {
    return (
      <PanelCard
        title="What Should Happen Next"
        description="Most recent actionable intervene or pause decision awaiting educator review."
        icon={Lightbulb}
        variant="action"
      >
        <PanelEmpty message="No pending decisions." />
      </PanelCard>
    );
  }

  const { decision, learnerRef, dominantSkill } = nextAction;
  const rationale = decision.rationale ?? '';
  const skillLine = skillDisplayLine(dominantSkill);

  const onReviewed = () => {
    markReviewed(decision.decision_id);
    setExpanded(false);
    void queryClient.invalidateQueries({ queryKey: ['learner-summary'] });
  };

  return (
    <PanelCard
      title="What Should Happen Next"
      description="Most recent actionable intervene or pause decision awaiting educator review."
      icon={Lightbulb}
      variant="action"
    >
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-start gap-2">
            <DecisionBadge type={decision.decision_type} />
          </div>
          {decision.educator_summary ? (
            <p className="text-sm text-foreground" aria-label="Educator-facing decision summary">
              {decision.educator_summary}
            </p>
          ) : null}
        </div>
        <p className="text-base font-semibold text-foreground">{learnerRef}</p>
        {skillLine ? <p className="text-sm text-muted-foreground">{skillLine}</p> : null}
        <div>
          <p
            className={`text-sm text-foreground ${expanded ? '' : 'line-clamp-3'}`}
            aria-label="Decision rationale"
          >
            {rationale || 'No rationale text was provided for this decision.'}
          </p>
          {rationale.length > 160 ? (
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" onClick={onReviewed} aria-label="Approve decision review">
            Approve
          </Button>
          <Button type="button" variant="outline" onClick={onReviewed} aria-label="Reject decision review">
            Reject
          </Button>
        </div>
      </div>
    </PanelCard>
  );
}
