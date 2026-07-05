'use client';

import { useMemo, useState } from 'react';

import { ActivityPanel } from '@/components/dashboard/activity-panel';
import { SectionCards } from '@/components/dashboard/section-cards';
import { PageHeader } from '@/components/layout/page-header';
import { FreshnessChip } from '@/components/shared/freshness-chip';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import type { Decision } from '@/lib/api/types';
import {
  computeRecentDecisions,
  localDateKeyFromDate,
  toLocalDateKey,
  type TrendRangeDays,
} from '@/lib/overview-metrics';

import { PeriodBar } from './period-bar';
import { useOverviewFilter } from './overview-sync-provider';
import { SyncFilterToggle } from './sync-filter-toggle';

const MS_PER_DAY = 86_400_000;

function scopeDecisionsByRange(
  decisions: Decision[],
  rangeDays: TrendRangeDays,
  now = new Date()
): Decision[] {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (rangeDays - 1) * MS_PER_DAY);
  const startKey = localDateKeyFromDate(start);
  return decisions.filter((d) => toLocalDateKey(d.decided_at) >= startKey);
}

/**
 * Client wrapper for Overview KPI cards, activity panel, and recent-decisions table.
 * Consumes OverviewSyncProvider for cross-filter sync when enabled.
 */
export function OverviewExplorer() {
  const { syncEnabled, filter, setFilter, data } = useOverviewFilter();
  const { kpis, decisions, recentDecisions, learnerStates, fetchedAt } = data;

  const [pageRangeDays, setPageRangeDays] = useState<TrendRangeDays>(7);
  const effectiveRangeDays = syncEnabled ? filter.range : pageRangeDays;

  function handlePeriodChange(days: TrendRangeDays) {
    if (syncEnabled) {
      setFilter((prev) => ({ ...prev, range: days }));
      return;
    }
    setPageRangeDays(days);
  }

  const tableDecisions = useMemo(() => {
    if (syncEnabled) {
      return recentDecisions;
    }
    return computeRecentDecisions(scopeDecisionsByRange(decisions, pageRangeDays), 20);
  }, [syncEnabled, recentDecisions, decisions, pageRangeDays]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Is anything wrong right now? Scan KPIs, trends, and recent decisions."
      >
        <SyncFilterToggle />
        <RefreshDataButton successMessage="Overview data refreshed" />
        {fetchedAt ? <FreshnessChip fetchedAt={fetchedAt} /> : null}
      </PageHeader>
      <PeriodBar rangeDays={effectiveRangeDays} onRangeChange={handlePeriodChange} />
      <SectionCards kpis={kpis} />
      <ActivityPanel
        decisions={decisions}
        learnerStates={learnerStates}
        recentDecisions={tableDecisions}
        rangeDays={effectiveRangeDays}
      />
    </div>
  );
}
