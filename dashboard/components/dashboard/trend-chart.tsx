'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { useOptionalOverviewFilter } from '@/app/(dashboard)/_components/overview-sync-provider';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Decision, DecisionType, LearnerStateResponse } from '@/lib/api/types';
import {
  buildDecisionTrendSeries,
  buildMasteryTrendSeries,
  summarizeTrendSeries,
  type DecisionSeriesKey,
  type TrendRangeDays,
  type TrendViewMode,
} from '@/lib/overview-metrics';

type TrendChartProps = {
  decisions: Decision[];
  learnerStates: LearnerStateResponse[];
};

const decisionSeriesOptions: { value: DecisionSeriesKey; label: string }[] = [
  { value: 'all', label: 'All decisions' },
  { value: 'intervene', label: 'Intervene' },
  { value: 'pause', label: 'Pause' },
  { value: 'reinforce', label: 'Reinforce' },
  { value: 'advance', label: 'Advance' },
];

const chartConfig = {
  value: {
    label: 'Count',
    color: 'var(--brand-accent-500)',
  },
} satisfies ChartConfig;

function decisionTypeToSeries(decisionType: DecisionType | null): DecisionSeriesKey {
  return decisionType ?? 'all';
}

export function TrendChart({ decisions, learnerStates }: TrendChartProps) {
  const sync = useOptionalOverviewFilter();
  const syncEnabled = sync?.syncEnabled ?? false;

  const [localRangeDays, setLocalRangeDays] = useState<TrendRangeDays>(30);
  const [viewMode, setViewMode] = useState<TrendViewMode>('decisions');
  const [localDecisionSeries, setLocalDecisionSeries] = useState<DecisionSeriesKey>('all');

  const rangeDays = syncEnabled ? sync!.filter.range : localRangeDays;
  const decisionSeries = syncEnabled
    ? decisionTypeToSeries(sync!.filter.decisionType)
    : localDecisionSeries;

  const chartDecisions =
    syncEnabled && viewMode === 'decisions' ? sync!.derived.filteredDecisions : decisions;

  function handleRangeChange(value: string | null) {
    if (value == null) return;
    const days = Number(value) as TrendRangeDays;
    if (syncEnabled) {
      sync!.setFilter((prev) => ({ ...prev, range: days }));
      return;
    }
    setLocalRangeDays(days);
  }

  function handleDecisionSeriesChange(value: DecisionSeriesKey) {
    if (syncEnabled) {
      sync!.setFilter((prev) => ({
        ...prev,
        decisionType: value === 'all' ? null : value,
      }));
      return;
    }
    setLocalDecisionSeries(value);
  }

  const points = useMemo(() => {
    if (viewMode === 'mastery') {
      return buildMasteryTrendSeries(learnerStates, rangeDays);
    }
    const seriesForBuild =
      syncEnabled && viewMode === 'decisions' ? 'all' : decisionSeries;
    return buildDecisionTrendSeries(chartDecisions, rangeDays, seriesForBuild);
  }, [
    chartDecisions,
    learnerStates,
    rangeDays,
    viewMode,
    decisionSeries,
    syncEnabled,
  ]);

  const seriesLabel =
    viewMode === 'mastery'
      ? 'mastery updates'
      : (decisionSeriesOptions.find((o) => o.value === decisionSeries)?.label.toLowerCase() ??
        'decisions');

  const summary = summarizeTrendSeries(points, viewMode, seriesLabel);
  const yLabel = viewMode === 'mastery' ? 'Avg mastery %' : 'Decisions';

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Trend</CardTitle>
          <CardDescription>
            {viewMode === 'decisions'
              ? 'Decision volume over time — one series visible at a time.'
              : 'Average mastery on days learners received updates.'}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as TrendViewMode)}
          >
            <TabsList>
              <TabsTrigger value="decisions">Decisions</TabsTrigger>
              <TabsTrigger value="mastery">Mastery</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={String(rangeDays)} onValueChange={handleRangeChange}>
            <SelectTrigger size="sm" className="w-[120px]" aria-label="Chart range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          {viewMode === 'decisions' ? (
            <Select
              value={decisionSeries}
              onValueChange={(value) =>
                handleDecisionSeriesChange(value as DecisionType | 'all')
              }
            >
              <SelectTrigger size="sm" className="w-[160px]" aria-label="Decision series">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {decisionSeriesOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <AreaChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
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
                allowDecimals={viewMode === 'mastery'}
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
              <Area
                dataKey="value"
                type="monotone"
                fill="var(--color-value)"
                fillOpacity={0.25}
                stroke="var(--color-value)"
                strokeWidth={2}
                isAnimationActive={false}
                name={yLabel}
              />
            </AreaChart>
          </ChartContainer>
        </div>
        <p
          className="text-muted-foreground lg:border-border max-w-sm text-sm leading-relaxed lg:border-l lg:pl-4"
          aria-live="polite"
        >
          {summary}
        </p>
      </CardContent>
    </Card>
  );
}
