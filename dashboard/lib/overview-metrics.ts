import { rankAttentionDecisions } from '@/lib/attention-decisions';
import type { Decision, DecisionType, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import { extractSkillRows } from '@/lib/state-skills';

export type TrendRangeDays = 7 | 30 | 90;
export type TrendViewMode = 'decisions' | 'mastery';
export type DecisionSeriesKey = 'all' | DecisionType;

export type OverviewKpis = {
  needsAttention: { count: number; delta: number };
  pendingDecisions: number;
  signalsToday: { accepted: number; rejected: number };
  improvingLearners: number;
};

export type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

const MS_PER_DAY = 86_400_000;

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function buildDateKeys(rangeDays: TrendRangeDays, now = new Date()): string[] {
  const end = startOfLocalDay(now);
  const keys: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * MS_PER_DAY);
    keys.push(toDateKey(d.toISOString()));
  }
  return keys;
}

function attentionCountAsOf(decisions: Decision[], asOf: Date): number {
  const cutoff = asOf.toISOString();
  const eligible = decisions.filter((d) => d.decided_at <= cutoff);
  return rankAttentionDecisions(eligible).length;
}

export function computeOverviewKpis(
  decisions: Decision[],
  ingestionToday: IngestionLogEntry[],
  learnerStates: LearnerStateResponse[]
): OverviewKpis {
  const now = new Date();
  const startOfToday = startOfLocalDay(now);

  const needsAttentionNow = rankAttentionDecisions(decisions).length;
  const needsAttentionYesterday = attentionCountAsOf(decisions, startOfToday);

  const pendingDecisions = decisions.filter(
    (d) => d.decision_type === 'intervene' || d.decision_type === 'pause'
  ).length;

  let accepted = 0;
  let rejected = 0;
  for (const entry of ingestionToday) {
    if (entry.outcome === 'accepted') accepted += 1;
    if (entry.outcome === 'rejected') rejected += 1;
  }

  const improvingLearners = learnerStates.filter((body) => {
    const rows = extractSkillRows(body.state);
    return rows.some((row) => row.masteryScore_direction === 'improving');
  }).length;

  return {
    needsAttention: {
      count: needsAttentionNow,
      delta: needsAttentionNow - needsAttentionYesterday,
    },
    pendingDecisions,
    signalsToday: { accepted, rejected },
    improvingLearners,
  };
}

export function computeRecentDecisions(decisions: Decision[], limit = 20): Decision[] {
  return [...decisions]
    .sort((a, b) => b.decided_at.localeCompare(a.decided_at))
    .slice(0, limit);
}

export function buildDecisionTrendSeries(
  decisions: Decision[],
  rangeDays: TrendRangeDays,
  series: DecisionSeriesKey
): TrendPoint[] {
  const keys = buildDateKeys(rangeDays);
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));

  const rangeStart = keys[0]!;
  for (const decision of decisions) {
    const key = toDateKey(decision.decided_at);
    if (key < rangeStart || !counts.has(key)) continue;
    if (series !== 'all' && decision.decision_type !== series) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return keys.map((date) => ({
    date,
    label: formatDayLabel(date),
    value: counts.get(date) ?? 0,
  }));
}

export function buildMasteryTrendSeries(
  learnerStates: LearnerStateResponse[],
  rangeDays: TrendRangeDays
): TrendPoint[] {
  const keys = buildDateKeys(rangeDays);
  const sums = new Map<string, number>(keys.map((k) => [k, 0]));
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  const rangeStart = keys[0]!;

  for (const body of learnerStates) {
    const key = toDateKey(body.updated_at);
    if (key < rangeStart || !sums.has(key)) continue;

    const rows = extractSkillRows(body.state);
    const scores = rows
      .map((row) => row.masteryScore)
      .filter((score): score is number => typeof score === 'number');
    if (scores.length === 0) continue;

    const avg = scores.reduce((acc, score) => acc + score, 0) / scores.length;
    sums.set(key, (sums.get(key) ?? 0) + avg);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return keys.map((date) => {
    const count = counts.get(date) ?? 0;
    const total = sums.get(date) ?? 0;
    return {
      date,
      label: formatDayLabel(date),
      value: count > 0 ? Math.round((total / count) * 100) : 0,
    };
  });
}

export function summarizeTrendSeries(
  points: TrendPoint[],
  mode: TrendViewMode,
  seriesLabel: string
): string {
  const total = points.reduce((acc, point) => acc + point.value, 0);
  const midpoint = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, midpoint).reduce((acc, p) => acc + p.value, 0);
  const secondHalf = points.slice(midpoint).reduce((acc, p) => acc + p.value, 0);
  const diff = secondHalf - firstHalf;
  const trend =
    diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  const diffAbs = Math.abs(diff);

  if (mode === 'mastery') {
    const latest = [...points].reverse().find((p) => p.value > 0)?.value;
    const latestText = latest != null ? `${latest}% avg mastery` : 'no mastery updates in range';
    return `${latestText} over ${points.length} days (${trend}${diffAbs} vs prior half).`;
  }

  return `${total} ${seriesLabel} in range (${trend}${diffAbs} vs prior half).`;
}

export function formatDecisionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function truncateRule(ruleId: string | null, max = 32): string {
  if (!ruleId) return '—';
  if (ruleId.length <= max) return ruleId;
  return `${ruleId.slice(0, max - 1)}…`;
}

export function isToday(iso: string, now = new Date()): boolean {
  return toDateKey(iso) === toDateKey(now.toISOString());
}
