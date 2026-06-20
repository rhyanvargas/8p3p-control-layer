import type { Decision } from '@/lib/api/types';

export type EvaluatedField = {
  field: string;
  operator: string;
  threshold: string | number | boolean;
  actual_value: unknown;
};

export type MatchedRuleTrace = {
  rule_id?: string;
  decision_type?: string;
  condition?: unknown;
  evaluated_fields?: EvaluatedField[];
};

export type DecisionTimeRangeDays = 7 | 30 | 90 | 365;

const MS_PER_DAY = 86_400_000;

export function extractEvaluatedFields(matchedRule: unknown): EvaluatedField[] {
  if (!matchedRule || typeof matchedRule !== 'object') return [];
  const fields = (matchedRule as MatchedRuleTrace).evaluated_fields;
  return Array.isArray(fields) ? fields : [];
}

export function extractRuleCondition(matchedRule: unknown): unknown {
  if (!matchedRule || typeof matchedRule !== 'object') return null;
  return (matchedRule as MatchedRuleTrace).condition ?? null;
}

/** Mirrors inspection panel pass/fail semantics (panel-decision-trace.js). */
export function evaluateThresholdPass(
  operator: string,
  actual: unknown,
  threshold: unknown
): 'pass' | 'fail' | 'unknown' {
  if (actual == null || threshold == null || !operator) return 'unknown';

  const actualNum = typeof actual === 'number' ? actual : Number(actual);
  const thresholdNum = typeof threshold === 'number' ? threshold : Number(threshold);
  const useNumeric =
    !Number.isNaN(actualNum) &&
    !Number.isNaN(thresholdNum) &&
    (typeof actual === 'number' || typeof threshold === 'number');

  switch (operator) {
    case 'lt':
      return useNumeric
        ? actualNum < thresholdNum
          ? 'pass'
          : 'fail'
        : actual < threshold
          ? 'pass'
          : 'fail';
    case 'lte':
      return useNumeric
        ? actualNum <= thresholdNum
          ? 'pass'
          : 'fail'
        : actual <= threshold
          ? 'pass'
          : 'fail';
    case 'gt':
      return useNumeric
        ? actualNum > thresholdNum
          ? 'pass'
          : 'fail'
        : actual > threshold
          ? 'pass'
          : 'fail';
    case 'gte':
      return useNumeric
        ? actualNum >= thresholdNum
          ? 'pass'
          : 'fail'
        : actual >= threshold
          ? 'pass'
          : 'fail';
    case 'eq':
      return actual === threshold ? 'pass' : 'fail';
    case 'neq':
      return actual !== threshold ? 'pass' : 'fail';
    default:
      return 'unknown';
  }
}

export function formatTraceValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function filterDecisionsByTimeRange(
  decisions: Decision[],
  rangeDays: DecisionTimeRangeDays,
  now = new Date()
): Decision[] {
  const cutoff = new Date(now.getTime() - rangeDays * MS_PER_DAY).toISOString();
  return decisions.filter((d) => d.decided_at >= cutoff);
}

export function sortDecisionsNewestFirst(decisions: Decision[]): Decision[] {
  return [...decisions].sort((a, b) => b.decided_at.localeCompare(a.decided_at));
}

export function findDecisionById(
  decisions: Decision[],
  decisionId: string
): Decision | undefined {
  return decisions.find((d) => d.decision_id === decisionId);
}

export function buildRationaleExcerpt(rationale: string | undefined, max = 280): string {
  if (!rationale) return 'No rationale text was provided for this decision.';
  if (rationale.length <= max) return rationale;
  return `${rationale.slice(0, max - 1)}…`;
}

export function downloadDecisionJson(decision: Decision): void {
  const blob = new Blob([JSON.stringify(decision, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `decision-${decision.decision_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
