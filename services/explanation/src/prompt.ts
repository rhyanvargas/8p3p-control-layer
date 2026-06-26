/**
 * System instructions and PII-safe user prompt for educator explanations.
 * SYSTEM_PROMPT is passed to generateText as `instructions`.
 */

import type { ExplanationInput, EvaluatedField } from './generator.js';

/**
 * Guardrail policies for the model (verbatim-in-spirit from ai-educator-explanations spec).
 * Encodes confidence-not-grade framing and the six prompt/guardrail rules.
 */
export const SYSTEM_PROMPT = `You write short, plain-language explanations for educators about why the learning system issued a specific instructional decision.

Follow these policies exactly:
1. Explain only what the provided signals support. Do not speculate, invent causes, or add facts not present in the input.
2. Name the specific skill (when provided) and describe whether the system's confidence or stability in that skill is rising or falling and why, using the score deltas and direction fields in the state snapshot.
3. Frame learning as the system's confidence in the learner's mastery — not as a grade. Do not use letter grades (A, B, C, D, F), percentage grades, scores presented as grades, or judgmental language about the student.
4. Write at most three short sentences at a general-audience reading level. Use a neutral, supportive tone.
5. Never include names, IDs, learner references, or any personally identifiable information.
6. If the signals are insufficient to explain confidently, write one brief template-style statement about what the decision means (for example, needs more practice, ready to move on, needs stronger support) without fabricating detail.

Output only the explanation text. No headings, labels, bullet points, or preamble.`;

const FORBIDDEN_SNAPSHOT_KEYS = ['learner_reference'] as const;

function snapshotForPrompt(snapshot: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.includes(key as (typeof FORBIDDEN_SNAPSHOT_KEYS)[number])) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

function formatEvaluatedField(field: EvaluatedField): string {
  return `${field.field}: actual ${JSON.stringify(field.actual_value)} ${field.operator} threshold ${JSON.stringify(field.threshold)}`;
}

/**
 * Build the user prompt from PII-safe ExplanationInput fields only.
 * Never interpolates learner_reference.
 */
export function buildUserPrompt(input: ExplanationInput): string {
  const sections: string[] = [
    `Decision type: ${input.decision_type}`,
  ];

  if (input.skill !== undefined && input.skill !== '') {
    sections.push(`Skill: ${input.skill}`);
  }

  sections.push(`Rationale: ${input.rationale}`);

  if (input.evaluated_fields.length > 0) {
    const conditions = input.evaluated_fields.map(formatEvaluatedField).join('\n');
    sections.push(`Matched rule conditions:\n${conditions}`);
  }

  const snapshot = snapshotForPrompt(input.state_snapshot);
  sections.push(`State snapshot (canonical, PII-stripped):\n${JSON.stringify(snapshot, null, 2)}`);

  return sections.join('\n\n');
}
