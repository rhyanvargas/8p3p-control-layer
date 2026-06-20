'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarChart3, Download, FileJson } from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import {
  isProgramMetricsUnavailable,
  useProgramMetrics,
} from '@/hooks/use-program-metrics';
import {
  defaultMetricsWindow,
  downloadTextFile,
  formatMetricValue,
  metricDescription,
  metricLabel,
  pickReportMetrics,
  REPORT_METRIC_IDS,
  reportToCsv,
  type ReportMetricId,
} from '@/lib/program-metrics-display';

type ReportsViewProps = {
  orgId: string;
};

export function ReportsView({ orgId }: ReportsViewProps) {
  const [windowRange] = useState(defaultMetricsWindow);
  const metricsQuery = useProgramMetrics(orgId, windowRange.from, windowRange.to);

  const cards = useMemo(() => {
    if (!metricsQuery.data) return [];
    return pickReportMetrics(metricsQuery.data);
  }, [metricsQuery.data]);

  const unavailable = isProgramMetricsUnavailable(metricsQuery.error);

  function exportJson() {
    if (!metricsQuery.data) return;
    downloadTextFile(
      `program-metrics-${windowRange.from}-${windowRange.to}.json`,
      JSON.stringify(metricsQuery.data, null, 2),
      'application/json'
    );
  }

  function exportCsv() {
    if (!metricsQuery.data) return;
    downloadTextFile(
      `program-metrics-${windowRange.from}-${windowRange.to}.csv`,
      reportToCsv(metricsQuery.data),
      'text/csv'
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Window: {windowRange.from} → {windowRange.to}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!metricsQuery.data}
            onClick={exportCsv}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!metricsQuery.data}
            onClick={exportJson}
          >
            <FileJson aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </div>

      {metricsQuery.isLoading ? (
        <LoadingState variant="cards" count={6} />
      ) : metricsQuery.isError && !unavailable ? (
        <ErrorState error={metricsQuery.error} onRetry={() => void metricsQuery.refetch()} />
      ) : unavailable || cards.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          message="Program metrics are not available yet. Drill down to learner and decision data below."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ id, metric }) => (
            <StatCard
              key={id}
              title={metricLabel(id as ReportMetricId)}
              value={formatMetricValue(id as ReportMetricId, metric)}
              description={metricDescription(id as ReportMetricId)}
            />
          ))}
        </div>
      )}

      {metricsQuery.data && cards.length < REPORT_METRIC_IDS.length ? (
        <p className="text-muted-foreground text-xs">
          Some metrics are unavailable for this window (partial report).
        </p>
      ) : null}

      <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Drill down</h2>
        <p className="text-muted-foreground text-sm">
          Program-level metrics do not include learner-level rows. Open these routes for
          detail.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/learners"
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            View learners
          </Link>
          <Link
            href="/decisions"
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            View decisions
          </Link>
        </div>
      </div>
    </div>
  );
}
