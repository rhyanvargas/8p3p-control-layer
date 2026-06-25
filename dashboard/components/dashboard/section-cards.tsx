'use client';

import { useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';

import { useOptionalOverviewFilter } from '@/app/(dashboard)/_components/overview-sync-provider';
import { StatCard } from '@/components/dashboard/stat-card';
import { countReviewedToday, subscribeReviewLog } from '@/lib/decision-review';
import type { DecisionType } from '@/lib/api/types';
import type { OverviewKpis } from '@/lib/overview-metrics';
import { attentionFromPendingUrl } from '@/lib/page-url-state';

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
    <section aria-label="Program KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Needs attention"
        value={needsAttention.count}
        delta={needsAttention.delta}
        href="/attention"
        icon={AlertCircle}
        iconClassName="text-[var(--urgency-high)]"
        tooltip="Learners with urgent intervene or pause decisions, ranked by priority."
      />
      <StatCard
        title="Rejected signals today"
        ariaLabel={`Rejected signals today: ${signalsToday.rejected}`}
        value={
          <span className="inline-flex items-center gap-2">
            {signalsToday.rejected}
            {signalsToday.accepted > 0 ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-sm font-normal">
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--status-advance)]" />
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
        title="Pending decisions"
        value={pendingDecisions}
        href={attentionFromPendingUrl()}
        icon={Clock}
        iconClassName="text-[var(--status-pause)]"
        tooltip={pendingTooltip}
        secondaryLine={
          reviewedToday > 0 ? `${reviewedToday} reviewed today` : undefined
        }
      />
      <StatCard
        title="Improving learners"
        value={improvingLearners}
        href="/learners?trend=improving"
        icon={TrendingUp}
        iconClassName="text-[var(--progress-improved)]"
        tooltip="Learners with at least one improving mastery signal."
        secondaryLine={showProgramWideIndicator ? 'Program-wide' : undefined}
      />
    </section>
  );
}
