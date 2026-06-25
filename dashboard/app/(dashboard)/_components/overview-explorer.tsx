'use client';

import { SectionCards } from '@/components/dashboard/section-cards';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { PageHeader } from '@/components/layout/page-header';
import { FreshnessChip } from '@/components/shared/freshness-chip';

import { ActiveFilterChips } from './active-filter-chips';
import { useOverviewFilter } from './overview-sync-provider';
import { RecentDecisionsTable } from './recent-decisions-table';
import { SyncFilterToggle } from './sync-filter-toggle';

/**
 * Client wrapper for Overview KPI cards, trend chart, and recent-decisions table.
 * Consumes OverviewSyncProvider for cross-filter sync when enabled.
 */
export function OverviewExplorer() {
  const { data } = useOverviewFilter();
  const { kpis, decisions, recentDecisions, learnerStates, fetchedAt } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Is anything wrong right now? Scan KPIs, trends, and recent decisions."
      >
        <SyncFilterToggle />
        {fetchedAt ? <FreshnessChip fetchedAt={fetchedAt} /> : null}
      </PageHeader>
      <ActiveFilterChips />
      <SectionCards kpis={kpis} />
      <TrendChart decisions={decisions} learnerStates={learnerStates} />
      <RecentDecisionsTable decisions={recentDecisions} />
    </div>
  );
}
