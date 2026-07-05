import type { Decision, DecisionType } from '@/lib/api/types';
import {
  localDateKeyFromDate,
  summarizeTrendSeries,
  toLocalDateKey,
  type TrendPoint,
  type TrendRangeDays,
} from '@/lib/overview-metrics';

export type ActivityGroupBy = 'decision_type' | 'needs_review_vs_ok';
export type ActivityMetric = 'daily' | 'cumulative_needs_review' | 'avg_mastery';

export type DecisionTypeStackedPoint = {
  date: string;
  label: string;
  intervene: number;
  pause: number;
  reinforce: number;
  advance: number;
};

export type ReviewStatusStackedPoint = {
  date: string;
  label: string;
  needs_review: number;
  on_track: number;
};

export type StackedDailyPoint = DecisionTypeStackedPoint | ReviewStatusStackedPoint;

export type CumulativeDecisionTypePoint = {
  date: string;
  label: string;
  cumulative_intervene: number;
  cumulative_pause: number;
};

export type CumulativeReviewStatusPoint = {
  date: string;
  label: string;
  needs_review: number;
};

export type CumulativePoint = CumulativeDecisionTypePoint | CumulativeReviewStatusPoint;

export type ActivityChartPoint = StackedDailyPoint | CumulativePoint | TrendPoint;

const MS_PER_DAY = 86_400_000;
const PERIOD_SEPARATOR = '\u2013';
const MAX_CSV_ROWS = 90;

const DECISION_TYPES: DecisionType[] = ['intervene', 'pause', 'reinforce', 'advance'];

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDateKeys(rangeDays: TrendRangeDays, now = new Date()): string[] {
  const end = startOfLocalDay(now);
  const keys: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * MS_PER_DAY);
    keys.push(localDateKeyFromDate(d));
  }
  return keys;
}

function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function isDecisionTypePoint(point: StackedDailyPoint): point is DecisionTypeStackedPoint {
  return 'intervene' in point;
}

function dailyNeedsReviewCount(point: StackedDailyPoint): number {
  if (isDecisionTypePoint(point)) {
    return point.intervene + point.pause;
  }
  return point.needs_review;
}

function dailyDecisionTotal(point: StackedDailyPoint): number {
  if (isDecisionTypePoint(point)) {
    return point.intervene + point.pause + point.reinforce + point.advance;
  }
  return point.needs_review + point.on_track;
}

export function buildStackedDecisionTrendSeries(
  decisions: Decision[],
  rangeDays: TrendRangeDays,
  groupBy: ActivityGroupBy,
  now = new Date()
): StackedDailyPoint[] {
  const keys = buildDateKeys(rangeDays, now);
  const rangeStart = keys[0]!;

  if (groupBy === 'decision_type') {
    const counts = new Map<string, Record<DecisionType, number>>(
      keys.map((k) => [k, { intervene: 0, pause: 0, reinforce: 0, advance: 0 }])
    );

    for (const decision of decisions) {
      const key = toLocalDateKey(decision.decided_at);
      if (key < rangeStart || !counts.has(key)) continue;
      const bucket = counts.get(key)!;
      bucket[decision.decision_type] += 1;
    }

    return keys.map((date) => {
      const bucket = counts.get(date)!;
      return {
        date,
        label: formatDayLabel(date),
        intervene: bucket.intervene,
        pause: bucket.pause,
        reinforce: bucket.reinforce,
        advance: bucket.advance,
      };
    });
  }

  const counts = new Map<string, { needs_review: number; on_track: number }>(
    keys.map((k) => [k, { needs_review: 0, on_track: 0 }])
  );

  for (const decision of decisions) {
    const key = toLocalDateKey(decision.decided_at);
    if (key < rangeStart || !counts.has(key)) continue;
    const bucket = counts.get(key)!;
    if (decision.decision_type === 'intervene' || decision.decision_type === 'pause') {
      bucket.needs_review += 1;
    } else {
      bucket.on_track += 1;
    }
  }

  return keys.map((date) => {
    const bucket = counts.get(date)!;
    return {
      date,
      label: formatDayLabel(date),
      needs_review: bucket.needs_review,
      on_track: bucket.on_track,
    };
  });
}

export function buildCumulativeSeries(
  dailyStackedPoints: StackedDailyPoint[],
  metric: ActivityMetric,
  groupBy: ActivityGroupBy
): CumulativePoint[] | StackedDailyPoint[] {
  if (metric !== 'cumulative_needs_review') {
    return dailyStackedPoints;
  }

  if (groupBy === 'decision_type') {
    let cumulativeIntervene = 0;
    let cumulativePause = 0;

    return dailyStackedPoints.filter(isDecisionTypePoint).map((point) => {
      cumulativeIntervene += point.intervene;
      cumulativePause += point.pause;
      return {
        date: point.date,
        label: point.label,
        cumulative_intervene: cumulativeIntervene,
        cumulative_pause: cumulativePause,
      };
    });
  }

  let cumulativeNeedsReview = 0;
  return dailyStackedPoints.map((point) => {
    cumulativeNeedsReview += dailyNeedsReviewCount(point);
    return {
      date: point.date,
      label: point.label,
      needs_review: cumulativeNeedsReview,
    };
  });
}

export function formatPeriodRangeLabel(rangeDays: TrendRangeDays, now = new Date()): string {
  const keys = buildDateKeys(rangeDays, now);
  const startShort = formatDayLabel(keys[0]!);
  const endShort = formatDayLabel(keys[keys.length - 1]!);
  return `${startShort} ${PERIOD_SEPARATOR} ${endShort}`;
}

export function formatActivityInsight(
  points: StackedDailyPoint[] | TrendPoint[],
  metric: ActivityMetric,
  groupBy: ActivityGroupBy
): string {
  if (metric === 'avg_mastery') {
    const masteryPoints = points as TrendPoint[];
    const summary = summarizeTrendSeries(masteryPoints, 'mastery', 'decisions');
    return summary.replace('vs prior half', 'vs start of period');
  }

  const stackedPoints = points as StackedDailyPoint[];

  if (metric === 'cumulative_needs_review') {
    const cumulative = buildCumulativeSeries(
      stackedPoints,
      'cumulative_needs_review',
      groupBy
    ) as CumulativePoint[];
    const totals = cumulative.map((point) =>
      'cumulative_intervene' in point
        ? point.cumulative_intervene + point.cumulative_pause
        : point.needs_review
    );
    const latestCumulative = totals[totals.length - 1] ?? 0;
    const firstTotal = totals[0] ?? 0;
    const delta = latestCumulative - firstTotal;
    const deltaSign = delta > 0 ? '+' : delta < 0 ? '-' : '';
    const deltaAbs = Math.abs(delta);
    return `${latestCumulative} learners need review (${deltaSign}${deltaAbs} vs start of period).`;
  }

  const periodTotal = stackedPoints.reduce((acc, point) => acc + dailyDecisionTotal(point), 0);
  let busiestDayLabel = stackedPoints[0]?.label ?? '';
  let busiestTotal = stackedPoints[0] ? dailyDecisionTotal(stackedPoints[0]) : 0;

  for (const point of stackedPoints) {
    const total = dailyDecisionTotal(point);
    if (total > busiestTotal) {
      busiestTotal = total;
      busiestDayLabel = point.label;
    }
  }

  return `${periodTotal} decisions in this period (${busiestDayLabel} busiest).`;
}

export function buildActivityCsvRows(
  points: ActivityChartPoint[],
  metric: ActivityMetric,
  groupBy: ActivityGroupBy
): { headers: string[]; rows: string[][] } {
  const boundedPoints = points.slice(0, MAX_CSV_ROWS);

  if (metric === 'avg_mastery') {
    const headers = ['date', 'avg_mastery_pct'];
    const rows = (boundedPoints as TrendPoint[]).map((point) => [
      point.date,
      String(point.value),
    ]);
    return { headers, rows };
  }

  if (metric === 'cumulative_needs_review' && groupBy === 'decision_type') {
    const headers = ['date', 'cumulative_intervene', 'cumulative_pause'];
    const rows = (boundedPoints as CumulativeDecisionTypePoint[]).map((point) => [
      point.date,
      String(point.cumulative_intervene),
      String(point.cumulative_pause),
    ]);
    return { headers, rows };
  }

  if (metric === 'daily' && groupBy === 'decision_type') {
    const headers = ['date', 'intervene', 'pause', 'reinforce', 'advance'];
    const rows = (boundedPoints as DecisionTypeStackedPoint[]).map((point) => [
      point.date,
      String(point.intervene),
      String(point.pause),
      String(point.reinforce),
      String(point.advance),
    ]);
    return { headers, rows };
  }

  if (groupBy === 'needs_review_vs_ok') {
    const headers = ['date', 'needs_review', 'on_track'];
    if (metric === 'daily') {
      const rows = (boundedPoints as ReviewStatusStackedPoint[]).map((point) => [
        point.date,
        String(point.needs_review),
        String(point.on_track),
      ]);
      return { headers, rows };
    }

    const rows = (boundedPoints as CumulativeReviewStatusPoint[]).map((point) => [
      point.date,
      String(point.needs_review),
      '0',
    ]);
    return { headers, rows };
  }

  return { headers: ['date'], rows: boundedPoints.map((point) => [point.date]) };
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvContent(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function downloadActivityCsv(
  points: ActivityChartPoint[],
  metric: ActivityMetric,
  groupBy: ActivityGroupBy,
  rangeDays: TrendRangeDays,
  now = new Date()
): void {
  if (typeof document === 'undefined') return;

  const keys = buildDateKeys(rangeDays, now);
  const startDate = keys[0]!;
  const endDate = keys[keys.length - 1]!;
  const filename = `overview-activity-${startDate}-${endDate}.csv`;

  const { headers, rows } = buildActivityCsvRows(points, metric, groupBy);
  const content = buildCsvContent(headers, rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export { DECISION_TYPES };
