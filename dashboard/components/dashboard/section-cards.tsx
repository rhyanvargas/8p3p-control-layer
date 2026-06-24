'use client';

import { AlertCircle, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import type { OverviewKpis } from '@/lib/overview-metrics';

type SectionCardsProps = {
  kpis: OverviewKpis;
};

export function SectionCards({ kpis }: SectionCardsProps) {
  const { needsAttention, pendingDecisions, signalsToday, improvingLearners } = kpis;

  return (
    <section aria-label="Program KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Needs attention"
        value={needsAttention.count}
        delta={needsAttention.delta}
        href="/attention"
        icon={AlertCircle}
        iconClassName="text-[var(--urgency-high)]"
        tooltip="Decisions ranked by urgency that need educator review."
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
      />
      <StatCard
        title="Pending decisions"
        value={pendingDecisions}
        href="/decisions?status=pending"
        icon={Clock}
        iconClassName="text-[var(--status-pause)]"
        tooltip="Intervene and pause decisions awaiting review."
      />
      <StatCard
        title="Improving learners"
        value={improvingLearners}
        href="/learners?trend=improving"
        icon={TrendingUp}
        iconClassName="text-[var(--progress-improved)]"
        tooltip="Learners with at least one improving mastery signal."
      />
    </section>
  );
}
