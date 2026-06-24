import type { PreflightResult } from '@/lib/upload/types';

export async function runPreflight(payload: Record<string, unknown>, sourceSystem: string): Promise<PreflightResult> {
  const res = await fetch('/api/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ source_system: sourceSystem, payload }),
  });

  if (!res.ok) {
    throw new Error('Preflight request failed.');
  }

  return res.json() as Promise<PreflightResult>;
}

export async function runPreflightSample(
  envelopes: Array<{ source_system: string; payload: Record<string, unknown> }>
): Promise<PreflightResult> {
  if (envelopes.length === 0) {
    return { disabled: true };
  }

  const sample = envelopes[0]!;
  const result = await runPreflight(sample.payload, sample.source_system);
  return result;
}
