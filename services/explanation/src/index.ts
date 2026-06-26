/**
 * @8p3p/explanation — AI educator explanation generation layer.
 */

export const EXPLANATION_PACKAGE_VERSION = '0.0.0';

export {
  type DecisionType,
  type EvaluatedField,
  type ExplanationGenerator,
  type ExplanationInput,
} from './generator.js';

export { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

export { TemplateExplanationGenerator } from './template-generator.js';

export { postProcessExplanation, DEFAULT_EXPLANATION_MAX_CHARS } from './guardrails.js';

export {
  type ExplanationEnvConfig,
  type ExplanationProvider,
  isExplanationsEnabled,
  parseExplanationEnv,
} from './env-config.js';

export { selectExplanationGenerator } from './factory.js';
