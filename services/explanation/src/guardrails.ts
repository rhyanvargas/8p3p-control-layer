/**
 * Post-process model output: empty check, PII-echo guard, word-boundary truncation.
 */

import type { ExplanationInput } from './generator.js';

/** Default post-process truncation limit (spec: EDUCATOR_EXPLANATION_MAX_CHARS). */
export const DEFAULT_EXPLANATION_MAX_CHARS = 480;

/** Minimum string length for PII-echo substring matching (avoids numeric noise). */
const PII_ECHO_MIN_LENGTH = 4;

export type PostProcessResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'pii_echo' };

/**
 * Trim, validate non-empty, reject PII echoes from source state, truncate at word boundary.
 */
export function postProcessExplanation(
  text: string,
  input: ExplanationInput,
  maxChars: number = DEFAULT_EXPLANATION_MAX_CHARS
): PostProcessResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (containsPiiEcho(trimmed, input)) {
    return { ok: false, reason: 'pii_echo' };
  }

  return { ok: true, value: truncateAtWordBoundary(trimmed, maxChars) };
}

function containsPiiEcho(output: string, input: ExplanationInput): boolean {
  const candidates = collectPiiEchoCandidates(input);
  const outputLower = output.toLowerCase();
  for (const candidate of candidates) {
    if (outputLower.includes(candidate.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** Best-effort: string leaf values from state_snapshot that may appear in model echo. */
function collectPiiEchoCandidates(input: ExplanationInput): string[] {
  const values = new Set<string>();
  collectStringLeaves(input.state_snapshot, values);
  return [...values].filter((v) => v.length >= PII_ECHO_MIN_LENGTH);
}

function collectStringLeaves(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      out.add(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringLeaves(item, out);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(nested, out);
    }
  }
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace <= 0) {
    return slice.trimEnd();
  }
  return slice.slice(0, lastSpace).trimEnd();
}
