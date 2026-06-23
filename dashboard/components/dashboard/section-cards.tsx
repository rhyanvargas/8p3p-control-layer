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
        href={needsAttention.count > 0 ? '/attention' : undefined}
        footerLabel={needsAttention.count > 0 ? 'View attention queue' : undefined}
      />
      <StatCard
        title="Pending decisions"
        value={pendingDecisions}
        description="Intervene and pause decisions awaiting review."
      />
      <StatCard
        title="Signals today"
        value={`${signalsToday.accepted} accepted · ${signalsToday.rejected} rejected`}
        description="Ingestion outcomes since midnight."
      />
      <StatCard
        title="Improving learners"
        value={improvingLearners}
        description="Learners with at least one improving mastery signal."
      />
    </section>
  );
}
