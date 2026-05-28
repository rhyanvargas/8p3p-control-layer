import type { LearnerState } from '../shared/types.js';
import type { URSAllowedKey } from './urs-allowlist.js';
import { isAllowedURSKey } from './urs-allowlist.js';

type LearnerStateProjectionScalar = number | string | null;

export type LearnerStateProjection = Partial<Record<URSAllowedKey, LearnerStateProjectionScalar>>;

const FLOAT_PRECISION = 4;

export function roundNumeric(value: unknown): unknown {
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value)) return value;
  if (Number.isInteger(value)) return value;
  return Math.round(value * 10 ** FLOAT_PRECISION) / 10 ** FLOAT_PRECISION;
}

export function projectLearnerState(state: LearnerState['state']): LearnerStateProjection {
  const out: LearnerStateProjection = {};
  for (const [k, v] of Object.entries(state)) {
    if (!isAllowedURSKey(k)) continue;
    if (typeof v === 'number' || typeof v === 'string' || v === null) {
      out[k as URSAllowedKey] =
        typeof v === 'number' ? (roundNumeric(v) as number) : v;
    }
    // Reject non-scalar values (objects, arrays) — allowlist is scalars-only
  }
  return out;
}
