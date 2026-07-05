'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ActiveFilterChips } from '@/app/(dashboard)/_components/active-filter-chips';
import { RecentDecisionsTable } from '@/app/(dashboard)/_components/recent-decisions-table';
import { useOptionalOverviewFilter } from '@/app/(dashboard)/_components/overview-sync-provider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Decision, DecisionType, LearnerStateResponse } from '@/lib/api/types';
import {
  buildCumulativeSeries,
  buildStackedDecisionTrendSeries,
  downloadActivityCsv,
  formatActivityInsight,
  formatPeriodRangeLabel,
  type ActivityChartPoint,
  type ActivityGroupBy,
  type ActivityMetric,
} from '@/lib/overview-activity';
import {
  buildMasteryTrendSeries,
  localDateKeyFromDate,
  toLocalDateKey,
  type TrendRangeDays,
} from '@/lib/overview-metrics';
import { cn } from '@/lib/utils';

type ActivityPanelProps = {
  decisions: Decision[];
  learnerStates: LearnerStateResponse[];
  recentDecisions: Decision[];
  rangeDays: TrendRangeDays;
};

type SeriesDef = {
  key: string;
  label: string;
  color: string;
  filterType?: DecisionType;
};

const GROUP_BY_OPTIONS: { value: ActivityGroupBy; label: string }[] = [
  { value: 'decision_type', label: 'Decision type' },
  { value: 'needs_review_vs_ok', label: 'Review status' },
];

const METRIC_OPTIONS: { value: ActivityMetric; label: string }[] = [
  { value: 'daily', label: 'Daily count' },
  { value: 'cumulative_needs_review', label: 'Cumulative needs review' },
  { value: 'avg_mastery', label: 'Avg mastery %' },
];

function getSeriesDefs(metric: ActivityMetric, groupBy: ActivityGroupBy): SeriesDef[] {
  if (metric === 'avg_mastery') {
    return [{ key: 'value', label: 'Avg mastery %', color: 'var(--brand-accent-500)' }];
  }

  if (metric === 'cumulative_needs_review' && groupBy === 'decision_type') {
    return [
      {
        key: 'cumulative_intervene',
        label: 'Intervene',
        color: 'var(--status-intervene)',
        filterType: 'intervene',
      },
      {
        key: 'cumulative_pause',
        label: 'Pause',
        color: 'var(--status-pause)',
        filterType: 'pause',
      },
    ];
  }

  if (metric === 'cumulative_needs_review' && groupBy === 'needs_review_vs_ok') {
    return [{ key: 'needs_review', label: 'Needs review', color: 'var(--status-intervene)' }];
  }

  if (groupBy === 'decision_type') {
    return [
      {
        key: 'intervene',
        label: 'Intervene',
        color: 'var(--status-intervene)',
        filterType: 'intervene',
      },
      { key: 'pause', label: 'Pause', color: 'var(--status-pause)', filterType: 'pause' },
      {
        key: 'reinforce',
        label: 'Reinforce',
        color: 'var(--status-reinforce)',
        filterType: 'reinforce',
      },
      { key: 'advance', label: 'Advance', color: 'var(--status-advance)', filterType: 'advance' },
    ];
  }

  return [
    { key: 'needs_review', label: 'Needs review', color: 'var(--status-intervene)' },
    { key: 'on_track', label: 'On track', color: 'var(--status-reinforce)' },
  ];
}

function buildChartConfig(series: SeriesDef[]): ChartConfig {
  return Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }])
  ) satisfies ChartConfig;
}

function scopeDecisionsByRange(
  decisions: Decision[],
  rangeDays: TrendRangeDays,
  now = new Date()
): Decision[] {
  const MS_PER_DAY = 86_400_000;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (rangeDays - 1) * MS_PER_DAY);
  const startKey = localDateKeyFromDate(start);
  return decisions.filter((d) => toLocalDateKey(d.decided_at) >= startKey);
}

export function ActivityPanel({
  decisions,
  learnerStates,
  recentDecisions,
  rangeDays,
}: ActivityPanelProps) {
  const sync = useOptionalOverviewFilter();
  const syncEnabled = sync?.syncEnabled ?? false;

  const [groupBy, setGroupBy] = useState<ActivityGroupBy>('decision_type');
  const [metric, setMetric] = useState<ActivityMetric>('cumulative_needs_review');

  const chartDecisions = useMemo(() => {
    if (syncEnabled) {
      return sync!.derived.filteredDecisions;
    }
    return scopeDecisionsByRange(decisions, rangeDays);
  }, [syncEnabled, sync, decisions, rangeDays]);

  const stackedDaily = useMemo(() => {
    if (metric === 'avg_mastery') return [];
    return buildStackedDecisionTrendSeries(chartDecisions, rangeDays, groupBy);
  }, [chartDecisions, rangeDays, groupBy, metric]);

  const chartPoints = useMemo((): ActivityChartPoint[] => {
    if (metric === 'avg_mastery') {
      return buildMasteryTrendSeries(learnerStates, rangeDays);
    }
    return buildCumulativeSeries(stackedDaily, metric, groupBy) as ActivityChartPoint[];
  }, [metric, learnerStates, rangeDays, stackedDaily, groupBy]);

  const seriesDefs = getSeriesDefs(metric, groupBy);
  const chartConfig = buildChartConfig(seriesDefs);

  const insight = useMemo(() => {
    if (metric === 'avg_mastery') {
      return formatActivityInsight(
        chartPoints as ReturnType<typeof buildMasteryTrendSeries>,
        metric,
        groupBy
      );
    }
    return formatActivityInsight(stackedDaily, metric, groupBy);
  }, [chartPoints, stackedDaily, metric, groupBy]);

  const periodLabel = formatPeriodRangeLabel(rangeDays);
  const todayKey = localDateKeyFromDate(new Date());
  const todayLabel = chartPoints.find((p) => p.date === todayKey)?.label;
  const showTodayLine = todayLabel != null;

  const legendFilterEnabled =
    syncEnabled && groupBy === 'decision_type' && metric !== 'avg_mastery';

  const activeDecisionType = syncEnabled ? sync!.filter.decisionType : null;

  function toggleDecisionTypeFilter(type: DecisionType) {
    if (!syncEnabled) return;
    sync!.setFilter((prev) => ({
      ...prev,
      decisionType: prev.decisionType === type ? null : type,
    }));
  }

  function handleExportCsv() {
    downloadActivityCsv(chartPoints, metric, groupBy, rangeDays);
  }

  const yAxisLabel = metric === 'avg_mastery' ? 'Avg mastery %' : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <CardTitle>Classroom activity</CardTitle>
            <CardDescription>
              Decisions and mastery across {periodLabel}.
            </CardDescription>
            {syncEnabled ? <ActiveFilterChips className="pt-1" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={groupBy}
              onValueChange={(value) => setGroupBy(value as ActivityGroupBy)}
              disabled={metric === 'avg_mastery'}
            >
              <SelectTrigger size="sm" className="w-[160px]" aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={metric}
              onValueChange={(value) => setMetric(value as ActivityMetric)}
            >
              <SelectTrigger size="sm" className="w-[200px]" aria-label="Metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 pt-4">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {insight}
        </p>

        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={chartPoints} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={40}
              allowDecimals={metric === 'avg_mastery'}
              domain={metric === 'avg_mastery' ? [0, 100] : undefined}
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                    }
                  : undefined
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.label ?? undefined
                  }
                />
              }
            />
            {showTodayLine ? (
              <ReferenceLine
                x={todayLabel}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{ value: 'Today', position: 'top' }}
              />
            ) : null}
            {seriesDefs.map((series) => (
              <Area
                key={series.key}
                dataKey={series.key}
                type="monotone"
                stackId={metric === 'avg_mastery' ? undefined : 'activity'}
                fill={`var(--color-${series.key})`}
                fillOpacity={0.25}
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                isAnimationActive={false}
                name={series.label}
              />
            ))}
          </AreaChart>
        </ChartContainer>

        {seriesDefs.length > 0 ? (
          <div
            role="group"
            aria-label="Chart series"
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {seriesDefs.map((series) => {
              const isFilterSource = legendFilterEnabled && series.filterType != null;
              const isActive = isFilterSource && activeDecisionType === series.filterType;

              if (isFilterSource) {
                return (
                  <button
                    key={series.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => toggleDecisionTypeFilter(series.filterType!)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive && 'bg-muted font-medium'
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: series.color }}
                      aria-hidden="true"
                    />
                    {series.label}
                  </button>
                );
              }

              return (
                <span
                  key={series.key}
                  className="inline-flex items-center gap-1.5 text-xs opacity-80"
                >
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                  {series.label}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <RecentDecisionsTable decisions={recentDecisions} showSectionHeader={false} />
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
