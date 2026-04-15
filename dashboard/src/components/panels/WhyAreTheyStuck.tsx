import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/api/client';
import type { LearnerStateResponse } from '@/api/types';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { useDecisions } from '@/hooks/use-decisions';
import { attentionLearnerRefs } from '@/lib/attention-decisions';
import { buildStabilityRationale } from '@/lib/rationale-builder';
import { extractSkillRows } from '@/lib/state-skills';

const MAX_ISSUES = 8;

export function WhyAreTheyStuck({ orgId }: { orgId: string }) {
  const decisionsQuery = useDecisions(orgId);
  const learnerRefs = useMemo(
    () => attentionLearnerRefs(decisionsQuery.data ?? []),
    [decisionsQuery.data]
  );

  const stateQueries = useQueries({
    queries: learnerRefs.map((learnerRef) => ({
      queryKey: ['learner-state', orgId, learnerRef],
      queryFn: () =>
        apiFetch<LearnerStateResponse>(
          `/v1/state?org_id=${encodeURIComponent(orgId)}&learner=${encodeURIComponent(learnerRef)}`
        ),
      refetchInterval: 30_000,
      enabled: !!orgId && learnerRefs.length > 0,
    })),
  });

  const isLoading = decisionsQuery.isLoading || (learnerRefs.length > 0 && stateQueries.some((q) => q.isLoading));
  const isError =
    decisionsQuery.isError ||
    stateQueries.some((q) => q.isError);
  const firstError =
    decisionsQuery.error?.message ?? stateQueries.find((q) => q.error)?.error?.message ?? 'Unknown error';

  const refetchAll = () => {
    void decisionsQuery.refetch();
    for (const q of stateQueries) void q.refetch();
  };

  if (isLoading) {
    return (
      <PanelCard
        title="Why Are They Stuck?"
        description="Skills where stability is declining or below the support threshold."
        icon={AlertTriangle}
        variant="warning"
      >
        <PanelSkeleton />
      </PanelCard>
    );
  }

  if (isError) {
    return (
      <PanelCard
        title="Why Are They Stuck?"
        description="Skills where stability is declining or below the support threshold."
        icon={AlertTriangle}
        variant="warning"
      >
        <PanelError status={firstError} onRetry={refetchAll} />
      </PanelCard>
    );
  }

  type Issue = { key: string; learnerRef: string; skillName: string; direction: string; quote: string };

  const issues: Issue[] = [];
  for (let i = 0; i < stateQueries.length; i++) {
    const q = stateQueries[i]!;
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
      const quote =
        typeof score === 'number'
          ? buildStabilityRationale(score, row.skillName)
          : `Stability trend for ${row.skillName} needs attention.`;
      const directionLabel = declining ? 'declining' : 'below threshold';
      issues.push({
        key: `${learnerRef}-${row.skillName}-${issues.length}`,
        learnerRef,
        skillName: row.skillName,
        direction: directionLabel,
        quote,
      });
    }
  }

  if (issues.length === 0) {
    return (
      <PanelCard
        title="Why Are They Stuck?"
        description="Skills where stability is declining or below the support threshold."
        icon={AlertTriangle}
        variant="warning"
      >
        <PanelEmpty message="No skill struggles detected." />
      </PanelCard>
    );
  }

  const shown = issues.slice(0, MAX_ISSUES);
  const more = issues.length - shown.length;

  return (
    <PanelCard
      title="Why Are They Stuck?"
      description="Skills where stability is declining or below the support threshold."
      icon={AlertTriangle}
      variant="warning"
      footer={
        more > 0 ? (
          <p className="w-full text-center text-xs text-muted-foreground">+ {more} more issues</p>
        ) : undefined
      }
    >
      {shown.map((issue) => (
        <LearnerCard key={issue.key} learnerRef={issue.learnerRef}>
          <p className="text-sm font-medium text-foreground">
            {issue.skillName}: stability {issue.direction}
          </p>
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground">
            {issue.quote}
          </blockquote>
        </LearnerCard>
      ))}
    </PanelCard>
  );
}
