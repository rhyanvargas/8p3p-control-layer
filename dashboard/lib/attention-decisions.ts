import { isReviewedLocally } from '@/lib/decision-review';
import { extractProblemAreas, type ProblemArea } from '@/lib/learner-problem-areas';
import type { Decision, LearnerSummaryResponse, RecentDecisionItem } from '@/lib/api/types';

export interface PendingAttentionItem {
  learner_reference: string;
  decision: RecentDecisionItem;
  dominantSkill: string | null;
  priority: number;
  problemAreas: ProblemArea[];
}

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

export interface BuildPendingAttentionQueueOptions {
  maxItems?: number;
  /** Decision IDs with server-side latest_action (P2-F08). */
  serverReviewedIds?: Set<string>;
}

function isExcludedFromPendingQueue(
  decisionId: string,
  serverReviewedIds?: Set<string>
): boolean {
  if (isReviewedLocally(decisionId)) return true;
  if (serverReviewedIds?.has(decisionId)) return true;
  return false;
}

/** Unreviewed intervene/pause decisions, urgency-ranked for the attention queue. */
export function buildPendingAttentionQueue(
  summaries: LearnerSummaryResponse[],
  options?: BuildPendingAttentionQueueOptions
): PendingAttentionItem[] {
  const maxItems = options?.maxItems;
  const serverReviewedIds = options?.serverReviewedIds;
  const ranked = rankSummaryAttention(summaries);
  const rankByLearner = new Map(
    ranked.map((row, index) => [row.learner_reference, index])
  );

  const items: Array<PendingAttentionItem & { learnerRank: number }> = [];

  for (const summary of summaries) {
    const skillField = summary.current_state.fields.skill;
    const dominantSkill =
      typeof skillField === 'string' && skillField.trim() ? skillField : null;
    const learnerRank = rankByLearner.get(summary.learner_reference) ?? 999;

    for (const decision of summary.recent_decisions) {
      if (
        !isUrgentDecisionType(decision.decision_type) ||
        isExcludedFromPendingQueue(decision.decision_id, serverReviewedIds)
      ) {
        continue;
      }
      items.push({
        learner_reference: summary.learner_reference,
        decision,
        dominantSkill,
        priority: decisionTypePriority(decision.decision_type),
        learnerRank,
        problemAreas: extractProblemAreas(summary),
      });
    }
  }

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.learnerRank !== b.learnerRank) return a.learnerRank - b.learnerRank;
    return b.decision.decided_at.localeCompare(a.decision.decided_at);
  });

  const limited = maxItems != null ? items.slice(0, maxItems) : items;
  return limited.map(
    ({ learner_reference, decision, dominantSkill, priority, problemAreas }) => ({
      learner_reference,
      decision,
      dominantSkill,
      priority,
      problemAreas,
    })
  );
}
