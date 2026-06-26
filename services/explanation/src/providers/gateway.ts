/**
 * Vercel AI Gateway model resolver (local dev path).
 * Requires AI_GATEWAY_API_KEY in the environment.
 */

import type { ExplanationEnvConfig } from '../env-config.js';

/** Return gateway model ID string for generateText (AI SDK default global provider). */
export function resolveGatewayModel(env: ExplanationEnvConfig): string {
  if (!env.gatewayApiKey) {
    throw new Error('AI_GATEWAY_API_KEY is required when AI_PROVIDER=gateway');
  }
  return env.model;
}
