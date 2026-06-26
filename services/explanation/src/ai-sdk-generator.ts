/**
 * LLM-backed explanation generator (generateText + guardrails + fail-safe null fallback).
 */

import { APICallError, RetryError, generateText } from 'ai';

import type { ExplanationEnvConfig } from './env-config.js';
import type { ExplanationGenerator, ExplanationInput } from './generator.js';
import { postProcessExplanation } from './guardrails.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import { createBedrockModel } from './providers/amazon-bedrock.js';
import { resolveGatewayModel } from './providers/gateway.js';

/** Log-only codes — canonical registry in src/shared/error-codes.ts (TASK-012). */
const CODE_GENERATION_DEGRADED = 'explanation_generation_degraded';
const CODE_GUARDRAIL_TRIPPED = 'explanation_guardrail_tripped';

export class AiSdkExplanationGenerator implements ExplanationGenerator {
  constructor(private readonly config: ExplanationEnvConfig) {}

  async generate(input: ExplanationInput): Promise<string | null> {
    try {
      const model =
        this.config.provider === 'gateway'
          ? resolveGatewayModel(this.config)
          : createBedrockModel(this.config);

      const { text } = await generateText({
        model,
        instructions: SYSTEM_PROMPT,
        prompt: buildUserPrompt(input),
        maxOutputTokens: this.config.maxOutputTokens,
        temperature: this.config.temperature,
        timeout: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
      });

      const processed = postProcessExplanation(text ?? '', input, this.config.maxChars);
      if (!processed.ok) {
        logGuardrailTripped(processed.reason);
        return null;
      }

      return processed.value;
    } catch (error) {
      logGenerationDegraded(error);
      return null;
    }
  }
}

function logGenerationDegraded(error: unknown): void {
  const payload: Record<string, unknown> = {
    event: CODE_GENERATION_DEGRADED,
    code: CODE_GENERATION_DEGRADED,
    error: error instanceof Error ? error.message : String(error),
  };

  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    payload.status_code = error.statusCode;
  }
  if (RetryError.isInstance(error)) {
    payload.retry_reason = error.reason;
  }
  if (isAbortError(error)) {
    payload.abort = true;
  }

  console.warn(JSON.stringify(payload));
}

function logGuardrailTripped(reason: 'empty' | 'pii_echo'): void {
  console.warn(
    JSON.stringify({
      event: CODE_GUARDRAIL_TRIPPED,
      code: CODE_GUARDRAIL_TRIPPED,
      reason,
    })
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return RetryError.isInstance(error) && error.reason === 'abort';
}
