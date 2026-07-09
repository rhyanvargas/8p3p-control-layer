/**
 * Demo-only mock AI educator explanations.
 *
 * Production explanations are generated at decision time by the control-layer
 * (`trace.educator_explanation`). Local seed data usually lacks that field.
 * When NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true, the dashboard fills in
 * production-shaped narratives so the feature can be showcased without an LLM.
 *
 * Never enable this flag in a real customer environment — it is presentation-only.
 */

import type { DecisionType } from '@/lib/api/types';

export function isAiExplanationsDemoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_EXPLANATIONS_DEMO === 'true';
}

type MockExplanationInput = {
  decisionType: string;
  skill?: string | null;
  educatorSummary?: string | null;
};

function skillLabel(skill?: string | null): string {
  const t = skill?.trim();
  return t && t.length > 0 ? t : 'the focus skill';
}

/** Production-shaped mock narratives (confidence framing, not grades). */
export function mockEducatorExplanation(input: MockExplanationInput): string {
  const skill = skillLabel(input.skill);
  const type = input.decisionType.toLowerCase() as DecisionType | string;

  switch (type) {
    case 'intervene':
      return `We're less confident ${skill} is sticking — stability has slipped and recent evidence looks thin. A short check-in or reteach now can stop the slide before it compounds.`;
    case 'pause':
      return `Signals for ${skill} look noisy or incomplete, so we're pausing progression until we have a clearer read. Holding here protects the learner from advancing on shaky ground.`;
    case 'reinforce':
      return `Mastery on ${skill} is close, but confidence hasn't settled yet. A brief reinforcement pass should lock the learning before moving on.`;
    case 'advance':
      return `Confidence and mastery on ${skill} both clear the bar, so the learner looks ready to move forward. Keep a light watch on the next unit for any early wobble.`;
    default:
      return (
        input.educatorSummary?.trim() ||
        `The system has a recommendation for ${skill} based on recent stability and mastery signals.`
      );
  }
}

/**
 * Prefer a real cached AI explanation; when demo mode is on and the field is
 * empty, return a mock narrative so UI surfaces look production-ready.
 */
export function resolveEducatorExplanation(fields: {
  educator_explanation?: string | null;
  educator_summary?: string | null;
  decision_type?: string | null;
  skill?: string | null;
}): string | null {
  const real = fields.educator_explanation?.trim();
  if (real) return real;

  if (!isAiExplanationsDemoEnabled()) return null;

  return mockEducatorExplanation({
    decisionType: fields.decision_type ?? 'reinforce',
    skill: fields.skill,
    educatorSummary: fields.educator_summary,
  });
}
