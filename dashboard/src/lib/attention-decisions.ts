import type { Decision, LearnerSummaryResponse, RecentDecisionItem } from '@/api/types';

function decidedAtDesc(a: Decision, b: Decision): number {
  return b.decided_at.localeCompare(a.decided_at);
}

export interface SummaryAttentionRow {
  learner_reference: string;
  decision: RecentDecisionItem;
  dominantSkill: string | null;
}

function isUrgentDecisionType(decisionType: string): boolean {
  return decisionType === 'intervene' || decisionType === 'pause';
}

/** Map decision_type to urgency priority when output_metadata is unavailable on summary. */
export function decisionTypePriority(decisionType: string): number {
  if (decisionType === 'intervene') return 1;
  if (decisionType === 'pause') return 2;
  return 999;
}

/** Intervene/pause: latest recent_decision per learner from summary, sorted by urgency. */
export function rankSummaryAttention(summaries: LearnerSummaryResponse[]): SummaryAttentionRow[] {
  const rows: SummaryAttentionRow[] = [];
  for (const summary of summaries) {
    const latest = summary.recent_decisions.find((d) => isUrgentDecisionType(d.decision_type));
    if (!latest) continue;
    const skillField = summary.current_state.fields.skill;
    const dominantSkill = typeof skillField === 'string' && skillField.trim() ? skillField : null;
    rows.push({
      learner_reference: summary.learner_reference,
      decision: latest,
      dominantSkill,
    });
  }
  rows.sort((a, b) => {
    const pa = decisionTypePriority(a.decision.decision_type);
    const pb = decisionTypePriority(b.decision.decision_type);
    if (pa !== pb) return pa - pb;
    return b.decision.decided_at.localeCompare(a.decision.decided_at);
  });
  return rows;
}

export function selectSummaryAttention(summaries: LearnerSummaryResponse[]): SummaryAttentionRow[] {
  return rankSummaryAttention(summaries).slice(0, 5);
}

export function summaryAttentionLearnerRefs(summaries: LearnerSummaryResponse[]): string[] {
  return selectSummaryAttention(summaries).map((r) => r.learner_reference);
}

/** Intervene/pause: latest decision per learner, sorted priority asc then decided_at desc (full list). */
export function rankAttentionDecisions(decisions: Decision[]): Decision[] {
  const urgent = decisions.filter(
    (d) => d.decision_type === 'intervene' || d.decision_type === 'pause'
  );
  const sortedNewestFirst = [...urgent].sort(decidedAtDesc);
  const latestByLearner = new Map<string, Decision>();
  for (const d of sortedNewestFirst) {
    if (!latestByLearner.has(d.learner_reference)) latestByLearner.set(d.learner_reference, d);
  }
  const rows = [...latestByLearner.values()];
  rows.sort((a, b) => {
    const pa = a.output_metadata?.priority ?? 999;
    const pb = b.output_metadata?.priority ?? 999;
    if (pa !== pb) return pa - pb;
    return decidedAtDesc(a, b);
  });
  return rows;
}

/** Top 5 for Panel 1. */
export function selectAttentionDecisions(decisions: Decision[]): Decision[] {
  return rankAttentionDecisions(decisions).slice(0, 5);
}

export function attentionLearnerRefs(decisions: Decision[]): string[] {
  return selectAttentionDecisions(decisions).map((d) => d.learner_reference);
}
