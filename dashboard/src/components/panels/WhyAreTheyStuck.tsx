import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import { useLearnerStates } from '@/hooks/use-learner-states';
import { summaryAttentionLearnerRefs } from '@/lib/attention-decisions';
import { buildStabilityRationale } from '@/lib/rationale-builder';
import { extractSkillRows } from '@/lib/state-skills';

const MAX_ISSUES = 8;

export function WhyAreTheyStuck({ orgId }: { orgId: string }) {
  const summariesQuery = useOrgLearnerSummaries(orgId);
  const learnerRefs = useMemo(
    () => summaryAttentionLearnerRefs(summariesQuery.summaries),
    [summariesQuery.summaries]
  );

  const stateQuery = useLearnerStates(orgId, learnerRefs);

  const isLoading = summariesQuery.isLoading || stateQuery.isLoading;
  const isError = summariesQuery.isError || stateQuery.isError;
  const firstError =
    summariesQuery.error?.message ?? stateQuery.error?.message ?? 'Unknown error';

  const refetchAll = () => {
    summariesQuery.refetch();
    stateQuery.refetch();
  };

  if (isLoading) {
    return (
      <PanelCard
        title="What Do They Need Help With"
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
        title="What Do They Need Help With"
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
        title="What Do They Need Help With"
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
      title="What Do They Need Help With"
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
