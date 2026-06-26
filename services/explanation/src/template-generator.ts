import type { ExplanationGenerator, ExplanationInput } from './generator.js';

/**
 * Disabled-mode fallback generator (AI_EXPLANATIONS_ENABLED=false).
 * Returns null so the Decision Panel uses educator_summary / rationale.
 * No AI SDK dependency.
 */
export class TemplateExplanationGenerator implements ExplanationGenerator {
  generate(_input: ExplanationInput): Promise<string | null> {
    return Promise.resolve(null);
  }
}
