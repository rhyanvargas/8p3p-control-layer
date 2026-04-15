import type { Decision } from '@/api/types';

function decidedAtDesc(a: Decision, b: Decision): number {
  return b.decided_at.localeCompare(a.decided_at);
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
