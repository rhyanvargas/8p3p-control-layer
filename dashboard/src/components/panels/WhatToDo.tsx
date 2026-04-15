import { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { Button } from '@/components/ui/button';
import { DecisionBadge } from '@/components/shared/DecisionBadge';
import { useDecisions } from '@/hooks/use-decisions';
import { markReviewed, isReviewed } from '@/lib/decision-review';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { queryClient } from '@/lib/query-client';

export function WhatToDo({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, error, refetch } = useDecisions(orgId);
  const [expanded, setExpanded] = useState(false);

  const nextDecision = useMemo(() => {
    const list = data ?? [];
    const candidates = list
      .filter(
        (d) =>
          (d.decision_type === 'intervene' || d.decision_type === 'pause') && !isReviewed(d.decision_id)
      )
      .sort((a, b) => b.decided_at.localeCompare(a.decided_at));
    return candidates[0];
  }, [data]);

  if (isLoading) {
    return (
      <PanelCard
        title="What To Do?"
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
        title="What To Do?"
        description="Most recent actionable intervene or pause decision awaiting educator review."
        icon={Lightbulb}
        variant="action"
      >
        <PanelError status={error.message} onRetry={() => void refetch()} />
      </PanelCard>
    );
  }

  if (!nextDecision) {
    return (
      <PanelCard
        title="What To Do?"
        description="Most recent actionable intervene or pause decision awaiting educator review."
        icon={Lightbulb}
        variant="action"
      >
        <PanelEmpty message="No pending decisions." />
      </PanelCard>
    );
  }

  const rationale = nextDecision.trace?.rationale ?? '';
  const skillLine = skillDisplayLine(nextDecision.decision_context.skill);

  const onReviewed = () => {
    markReviewed(nextDecision.decision_id);
    setExpanded(false);
    void queryClient.invalidateQueries({ queryKey: ['decisions'] });
  };

  return (
    <PanelCard
      title="What To Do?"
      description="Most recent actionable intervene or pause decision awaiting educator review."
      icon={Lightbulb}
      variant="action"
    >
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <DecisionBadge type={nextDecision.decision_type} />
        </div>
        <p className="text-base font-semibold text-foreground">{nextDecision.learner_reference}</p>
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
