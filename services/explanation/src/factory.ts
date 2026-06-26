/**
 * Select explanation generator from env — dynamic AI SDK load only when enabled.
 */

import { isExplanationsEnabled, parseExplanationEnv } from './env-config.js';
import type { ExplanationGenerator } from './generator.js';
import { TemplateExplanationGenerator } from './template-generator.js';

/** Lazy wrapper: dynamic-imports AiSdkExplanationGenerator on first generate(). */
class LazyAiSdkExplanationGenerator implements ExplanationGenerator {
  private delegate: ExplanationGenerator | null = null;
  private initPromise: Promise<ExplanationGenerator> | null = null;

  constructor(private readonly env: NodeJS.ProcessEnv) {}

  private loadDelegate(): Promise<ExplanationGenerator> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const [{ AiSdkExplanationGenerator }, config] = await Promise.all([
          import('./ai-sdk-generator.js'),
          Promise.resolve(parseExplanationEnv(this.env)),
        ]);
        return new AiSdkExplanationGenerator(config);
      })();
    }
    return this.initPromise;
  }

  async generate(input: Parameters<ExplanationGenerator['generate']>[0]): Promise<string | null> {
    if (!this.delegate) {
      this.delegate = await this.loadDelegate();
    }
    return this.delegate.generate(input);
  }
}

/**
 * Factory: Template when disabled; lazy AiSdk when AI_EXPLANATIONS_ENABLED is truthy.
 * Disabled path never imports ai or provider modules.
 */
export function selectExplanationGenerator(
  env: NodeJS.ProcessEnv = process.env
): ExplanationGenerator {
  if (!isExplanationsEnabled(env)) {
    return new TemplateExplanationGenerator();
  }
  return new LazyAiSdkExplanationGenerator(env);
}
