import type { Decision, DecisionType, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import {
  computeOverviewKpis,
  computeRecentDecisions,
  localDateKeyFromDate,
  toLocalDateKey,
  type OverviewKpis,
  type TrendRangeDays,
} from '@/lib/overview-metrics';

export type OverviewFilter = {
  decisionType: DecisionType | null;
  learner: string | null;
  range: TrendRangeDays;
};

export const DEFAULT_OVERVIEW_FILTER: OverviewFilter = {
  decisionType: null,
  learner: null,
  range: 30,
};

export type OverviewFilterData = {
  decisions: Decision[];
  ingestionToday: IngestionLogEntry[];
  learnerStates: LearnerStateResponse[];
};

export type DecisionDerivedKpis = Pick<OverviewKpis, 'needsAttention' | 'pendingDecisions'>;
export type ProgramWideKpis = Pick<OverviewKpis, 'signalsToday' | 'improvingLearners'>;

export type OverviewFilterResult = {
  filteredDecisions: Decision[];
  filteredRecentDecisions: Decision[];
  decisionDerivedKpis: DecisionDerivedKpis;
  programWideKpis: ProgramWideKpis;
};

const MS_PER_DAY = 86_400_000;

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeStartKey(rangeDays: TrendRangeDays, now = new Date()): string {
  const end = startOfLocalDay(now);
  const start = new Date(end.getTime() - (rangeDays - 1) * MS_PER_DAY);
  return localDateKeyFromDate(start);
}

function scopeDecisionsByRange(
  decisions: Decision[],
  rangeDays: TrendRangeDays,
  now = new Date()
): Decision[] {
  const startKey = rangeStartKey(rangeDays, now);
  return decisions.filter((decision) => toLocalDateKey(decision.decided_at) >= startKey);
}

function matchesLearner(decision: Decision, learner: string): boolean {
  const needle = learner.trim().toLowerCase();
  if (!needle) return true;
  return decision.learner_reference.toLowerCase().includes(needle);
}

function narrowDecisions(
  decisions: Decision[],
  filter: OverviewFilter,
  now = new Date()
): Decision[] {
  let result = scopeDecisionsByRange(decisions, filter.range, now);

  if (filter.decisionType != null) {
    result = result.filter((d) => d.decision_type === filter.decisionType);
  }

  if (filter.learner != null && filter.learner.trim() !== '') {
    result = result.filter((d) => matchesLearner(d, filter.learner!));
  }

  return result;
}

export function applyOverviewFilter(
  data: OverviewFilterData,
  filter: OverviewFilter,
  now = new Date()
): OverviewFilterResult {
  const filteredDecisions = narrowDecisions(data.decisions, filter, now);
  const filteredRecentDecisions = computeRecentDecisions(filteredDecisions, 20);

  const programWideFull = computeOverviewKpis(
    data.decisions,
    data.ingestionToday,
    data.learnerStates
  );
  const decisionDerivedFull = computeOverviewKpis(
    filteredDecisions,
    data.ingestionToday,
    data.learnerStates
  );

  return {
    filteredDecisions,
    filteredRecentDecisions,
    decisionDerivedKpis: {
      needsAttention: decisionDerivedFull.needsAttention,
      pendingDecisions: decisionDerivedFull.pendingDecisions,
    },
    programWideKpis: {
      signalsToday: programWideFull.signalsToday,
      improvingLearners: programWideFull.improvingLearners,
    },
  };
}
