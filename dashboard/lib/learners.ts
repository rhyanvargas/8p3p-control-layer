import type { LearnerListItem, LearnerSummaryResponse } from '@/lib/api/types';
import type { ProgressVariant } from '@/components/shared/progress-badge';
import { scoreToLevel, type Level } from '@/lib/score-levels';
import { formatSkillLabel } from '@/lib/state-skills';

export type LearnerRosterRow = LearnerListItem & {
  level: Level;
  trend: ProgressVariant;
  status: string;
  skill: string | null;
};

const LEVEL_LABELS: Record<Level, string> = {
  emerging: 'Emerging',
  novice: 'Novice',
  proficient: 'Proficient',
  mastery: 'Mastery',
};

export function formatLevel(level: Level): string {
  return LEVEL_LABELS[level];
}

/** Ordinal rank for roster sorting (lower = needs more support). */
const TREND_ORDER: Record<ProgressVariant, number> = {
  declining: 1,
  stable: 2,
  improving: 3,
};

export function trendRank(trend: ProgressVariant): number {
  return TREND_ORDER[trend];
}

export function formatRelativeActivity(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function directionToTrend(
  direction: string | null | undefined
): ProgressVariant {
  if (direction === 'improving') return 'improving';
  if (direction === 'declining') return 'declining';
  return 'stable';
}

function deriveStatus(
  fields: LearnerSummaryResponse['current_state']['fields']
): string {
  const trend = fields.masteryScore_direction ?? fields.stabilityScore_direction;
  const risk = fields.riskSignal;
  const stability = fields.stabilityScore;

  if (typeof risk === 'number' && risk >= 0.7) return 'At risk';
  if (typeof stability === 'number' && stability < 0.4) return 'At risk';
  if (trend === 'declining') return 'Needs attention';
  if (trend === 'improving') return 'Improving';
  return 'On track';
}

export function buildLearnerRosterRows(
  learners: LearnerListItem[],
  summaries: LearnerSummaryResponse[]
): LearnerRosterRow[] {
  const summaryByRef = new Map(
    summaries.map((summary) => [summary.learner_reference, summary])
  );

  return learners.map((learner) => {
    const summary = summaryByRef.get(learner.learner_reference);
    const fields = summary?.current_state.fields;
    const mastery =
      typeof fields?.masteryScore === 'number' ? fields.masteryScore : 0.5;
    const trend = directionToTrend(
      fields?.masteryScore_direction ?? fields?.stabilityScore_direction
    );
    const skill =
      typeof fields?.skill === 'string' && fields.skill.trim()
        ? formatSkillLabel(fields.skill.trim())
        : null;

    return {
      ...learner,
      level: scoreToLevel(mastery),
      trend,
      status: fields ? deriveStatus(fields) : 'Unknown',
      skill,
    };
  });
}

export type RosterTrendFilter = ProgressVariant | null;

const ROSTER_TREND_FILTERS = new Set<ProgressVariant>([
  'improving',
  'declining',
  'stable',
]);

export const ROSTER_TREND_FILTER_LABELS: Record<
  'all' | ProgressVariant,
  string
> = {
  all: 'All learners',
  improving: 'Improving only',
  declining: 'Declining only',
  stable: 'Stable only',
};

export function rosterTrendFilterLabel(trend: RosterTrendFilter): string {
  return ROSTER_TREND_FILTER_LABELS[trend ?? 'all'];
}

export function parseRosterTrendFilter(
  value: string | null | undefined
): RosterTrendFilter {
  if (!value || value === 'all') return null;
  return ROSTER_TREND_FILTERS.has(value as ProgressVariant)
    ? (value as ProgressVariant)
    : null;
}

export function filterRosterRows(
  rows: LearnerRosterRow[],
  options: { trend?: RosterTrendFilter; skill?: string | null }
): LearnerRosterRow[] {
  let filtered = rows;

  if (options.trend) {
    filtered = filtered.filter((row) => row.trend === options.trend);
  }

  if (options.skill) {
    filtered = filtered.filter((row) => row.skill === options.skill);
  }

  return filtered;
}

export function collectRosterSkills(rows: LearnerRosterRow[]): string[] {
  const skills = new Set<string>();
  for (const row of rows) {
    if (row.skill) skills.add(row.skill);
  }
  return [...skills].sort((a, b) => a.localeCompare(b));
}
