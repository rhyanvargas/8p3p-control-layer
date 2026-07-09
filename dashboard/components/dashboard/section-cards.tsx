'use client';

import { useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';

import { useOptionalOverviewFilter } from '@/app/(dashboard)/_components/overview-sync-provider';
import { StatCard } from '@/components/dashboard/stat-card';
import { countReviewedToday, subscribeReviewLog } from '@/lib/decision-review';
import type { DecisionType } from '@/lib/api/types';
import type { OverviewKpis } from '@/lib/overview-metrics';
import { attentionFromPendingUrl } from '@/lib/page-url-state';
import { useDashboardPersona } from '@/lib/persona-context';
import { icon } from '@/lib/semantic-colors';

type SectionCardsProps = {
  kpis: OverviewKpis;
};

function hasActiveDecisionFilters(
  decisionType: DecisionType | null,
  learner: string | null
): boolean {
  return decisionType !== null || (learner !== null && learner.trim() !== '');
}

export function SectionCards({ kpis }: SectionCardsProps) {
  const persona = useDashboardPersona();
  const isEducator = persona === 'educator';
  const sync = useOptionalOverviewFilter();
  const syncEnabled = sync?.syncEnabled ?? false;

  const displayKpis = syncEnabled
    ? {
        needsAttention: sync!.derived.decisionDerivedKpis.needsAttention,
        pendingDecisions: sync!.derived.decisionDerivedKpis.pendingDecisions,
        signalsToday: sync!.derived.programWideKpis.signalsToday,
        improvingLearners: sync!.derived.programWideKpis.improvingLearners,
      }
    : kpis;

  const { needsAttention, pendingDecisions, signalsToday, improvingLearners } = displayKpis;

  const showProgramWideIndicator =
    syncEnabled &&
    hasActiveDecisionFilters(sync!.filter.decisionType, sync!.filter.learner);

  const reviewedToday = useSyncExternalStore(
    subscribeReviewLog,
    countReviewedToday,
    () => 0
  );

  const pendingTooltip =
    reviewedToday > 0
      ? `Intervene and pause decisions awaiting your review. Approve or reject each one. ${reviewedToday} reviewed today.`
      : 'Intervene and pause decisions awaiting your review. Approve or reject each one.';

  return (
    <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
      <section aria-label="Needs your action" className="contents">
        <h2 className="col-span-full text-sm font-medium text-muted-foreground sm:sr-only">
          Needs your action
        </h2>
        <StatCard
          title="Needs action"
          ariaLabel={`Needs attention: ${needsAttention.count}`}
          value={needsAttention.count}
          delta={needsAttention.delta}
          href="/attention"
          icon={AlertCircle}
          iconClassName={icon.danger}
          tooltip="Learners with urgent intervene or pause decisions, ranked by priority."
        />
        <StatCard
          title="Pending"
          ariaLabel={`Pending decisions: ${pendingDecisions}`}
          value={pendingDecisions}
          href={attentionFromPendingUrl()}
          icon={Clock}
          iconClassName={icon.neutral}
          tooltip={pendingTooltip}
          secondaryLine={
            reviewedToday > 0 ? `${reviewedToday} reviewed` : undefined
          }
        />
      </section>
      {!isEducator ? (
        <section aria-label="Program health" className="contents">
          <h2 className="col-span-full text-sm font-medium text-muted-foreground sm:sr-only">
            Program health
          </h2>
          <StatCard
            title="Rejected today"
            ariaLabel={`Rejected signals today: ${signalsToday.rejected}`}
            value={
              <span className="inline-flex items-center gap-2">
                {signalsToday.rejected}
                {signalsToday.accepted > 0 ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-sm font-normal">
                    <CheckCircle2 aria-hidden="true" className={`size-4 ${icon.success}`} />
                    {signalsToday.accepted}
                  </span>
                ) : null}
              </span>
            }
            href="/signals"
            icon={XCircle}
            iconClassName="text-destructive"
            tooltip={`${signalsToday.accepted} accepted and ${signalsToday.rejected} rejected since midnight.`}
            secondaryLine={showProgramWideIndicator ? 'Program-wide' : undefined}
          />
          <StatCard
            title="Improving"
            ariaLabel={`Improving learners: ${improvingLearners}`}
            value={improvingLearners}
            href="/learners?trend=improving"
            icon={TrendingUp}
            iconClassName={icon.success}
            tooltip="Learners with at least one improving mastery signal."
            secondaryLine={showProgramWideIndicator ? 'Program-wide' : undefined}
          />
        </section>
      ) : null}
    </div>
  );
}
