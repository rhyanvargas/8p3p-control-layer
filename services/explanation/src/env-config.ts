/**
 * Parsed explanation env vars (defaults from ai-educator-explanations spec).
 */

export type ExplanationProvider = 'amazon-bedrock' | 'gateway';

export interface ExplanationEnvConfig {
  provider: ExplanationProvider;
  model: string;
  region: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  maxChars: number;
  gatewayApiKey?: string;
}

const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const DEFAULT_GATEWAY_MODEL = 'anthropic/claude-haiku-4.5';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseProvider(value: string | undefined): ExplanationProvider {
  if (value === 'gateway') {
    return 'gateway';
  }
  return 'amazon-bedrock';
}

/** Parse env into config with spec defaults. */
export function parseExplanationEnv(env: NodeJS.ProcessEnv = process.env): ExplanationEnvConfig {
  const provider = parseProvider(env.AI_PROVIDER);
  const defaultModel = provider === 'gateway' ? DEFAULT_GATEWAY_MODEL : DEFAULT_BEDROCK_MODEL;

  return {
    provider,
    model: env.AI_MODEL?.trim() || defaultModel,
    region: env.AI_REGION?.trim() || env.AWS_REGION?.trim() || 'us-east-1',
    maxOutputTokens: parsePositiveInt(env.AI_MAX_OUTPUT_TOKENS, 256),
    temperature: parseFloatInRange(env.AI_TEMPERATURE, 0.2, 0, 2),
    timeoutMs: parsePositiveInt(env.AI_TIMEOUT_MS, 4000),
    maxRetries: parsePositiveInt(env.AI_MAX_RETRIES, 2),
    maxChars: parsePositiveInt(env.EDUCATOR_EXPLANATION_MAX_CHARS, 480),
    gatewayApiKey: env.AI_GATEWAY_API_KEY?.trim() || undefined,
  };
}

/** Truthy when AI_EXPLANATIONS_ENABLED is true or 1 (case-insensitive). */
export function isExplanationsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.AI_EXPLANATIONS_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}
