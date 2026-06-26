/**
 * ExplanationGenerator port and PII-safe input contract.
 * DecisionType / EvaluatedField must stay aligned with src/shared/types.ts (package boundary).
 */

/** Closed set of 4 decision types — aligned with src/shared/types.ts */
export type DecisionType = 'reinforce' | 'advance' | 'intervene' | 'pause';

/** Single leaf comparison result for trace — aligned with src/shared/types.ts */
export interface EvaluatedField {
  field: string;
  operator: string;
  threshold: string | number | boolean;
  actual_value: unknown;
}

/** PII-safe inputs for explanation generation (no learner_reference). */
export interface ExplanationInput {
  decision_type: DecisionType;
  skill?: string;
  rationale: string;
  evaluated_fields: EvaluatedField[];
  state_snapshot: Record<string, unknown>;
}

/** Async port consumed by sync and Lambda decision engines. */
export interface ExplanationGenerator {
  generate(input: ExplanationInput): Promise<string | null>;
}
