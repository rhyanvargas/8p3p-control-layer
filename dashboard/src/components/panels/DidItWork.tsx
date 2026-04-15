import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import { apiFetch } from '@/api/client';
import type { LearnerStateResponse } from '@/api/types';
import { PanelCard } from '@/components/layout/PanelCard';
import { PanelEmpty, PanelError, PanelSkeleton } from '@/components/layout/panel-states';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { ProgressBadge } from '@/components/shared/ProgressBadge';
import { useLearnerList } from '@/hooks/use-learner-list';
import { levelRank, scoreToLevel } from '@/lib/score-levels';
import { extractSkillRows } from '@/lib/state-skills';

const MAX_LEARNERS = 25;
const MAX_ROWS = 10;

export function DidItWork({ orgId }: { orgId: string }) {
  const listQuery = useLearnerList(orgId);
  const learnerRefs = useMemo(
    () => (listQuery.data?.learners ?? []).slice(0, MAX_LEARNERS).map((l) => l.learner_reference),
    [listQuery.data?.learners]
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

  const isLoading =
    listQuery.isLoading || (learnerRefs.length > 0 && stateQueries.some((q) => q.isLoading));
  const isError = listQuery.isError || stateQueries.some((q) => q.isError);
  const firstError =
    listQuery.error?.message ?? stateQueries.find((q) => q.error)?.error?.message ?? 'Unknown error';

  const refetchAll = () => {
    void listQuery.refetch();
    for (const q of stateQueries) void q.refetch();
  };

  if (isLoading) {
    return (
      <PanelCard
        title="Did It Work?"
        description="Skills where mastery is improving and proficiency level increased."
        icon={CheckCircle}
        variant="success"
      >
        <PanelSkeleton />
      </PanelCard>
    );
  }

  if (isError) {
    return (
      <PanelCard
        title="Did It Work?"
        description="Skills where mastery is improving and proficiency level increased."
        icon={CheckCircle}
        variant="success"
      >
        <PanelError status={firstError} onRetry={refetchAll} />
      </PanelCard>
    );
  }

  type Row = { key: string; learnerRef: string; skillName: string; transition: string };

  const rows: Row[] = [];
  for (let i = 0; i < stateQueries.length; i++) {
    const q = stateQueries[i]!;
    const learnerRef = learnerRefs[i]!;
    const body = q.data;
    if (!body) continue;
    const skillRows = extractSkillRows(body.state);
    for (const row of skillRows) {
      if (row.masteryScore_direction !== 'improving') continue;
      const current = row.masteryScore;
      if (typeof current !== 'number') continue;
      const delta = typeof row.masteryScore_delta === 'number' ? row.masteryScore_delta : 0;
      const previous = current - delta;
      const curLevel = scoreToLevel(current);
      const prevLevel = scoreToLevel(previous);
      if (!(levelRank(curLevel) > levelRank(prevLevel))) continue;
      rows.push({
        key: `${learnerRef}-${row.skillName}-${rows.length}`,
        learnerRef,
        skillName: row.skillName,
        transition: `${prevLevel} → ${curLevel}`,
      });
    }
  }

  const inspectCount = listQuery.data?.learners.length ?? 0;

  if (rows.length === 0) {
    return (
      <PanelCard
        title="Did It Work?"
        description="Skills where mastery is improving and proficiency level increased."
        icon={CheckCircle}
        variant="success"
        footer={
          <a
            className="w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            href="/inspect/"
            aria-label={`View full inspection report for ${inspectCount} learners`}
          >
            View Full Report ({inspectCount})
          </a>
        }
      >
        <PanelEmpty message="No progress changes yet." />
      </PanelCard>
    );
  }

  const shown = rows.slice(0, MAX_ROWS);
  const more = rows.length - shown.length;

  return (
    <PanelCard
      title="Did It Work?"
      description="Skills where mastery is improving and proficiency level increased."
      icon={CheckCircle}
      variant="success"
      footer={
        <div className="flex w-full flex-col gap-2">
          {more > 0 ? (
            <p className="text-center text-xs text-muted-foreground">+ {more} more improvements</p>
          ) : null}
          <a
            className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            href="/inspect/"
            aria-label={`View full inspection report for ${inspectCount} learners`}
          >
            View Full Report ({inspectCount})
          </a>
        </div>
      }
    >
      {shown.map((r) => (
        <LearnerCard key={r.key} learnerRef={r.learnerRef} headerRight={<ProgressBadge variant="improving" />}>
          <p className="text-sm font-medium text-foreground">{r.skillName}</p>
          <p className="text-sm text-muted-foreground">{r.transition}</p>
        </LearnerCard>
      ))}
    </PanelCard>
  );
}
