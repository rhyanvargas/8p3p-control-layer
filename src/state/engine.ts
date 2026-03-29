/**
 * STATE Engine
 * Computes learner state by applying signals (deep merge) and persists via STATE store.
 * Single source of truth for learner state; no external setState.
 */

import type {
  LearnerState,
  ApplySignalsRequest,
  ApplySignalsResult,
  SignalRecord,
  RejectionReason,
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateApplySignalsRequest, validateStateObject } from './validator.js';
import * as stateStore from './store.js';
import { getSignalsByIds } from '../signalLog/store.js';

/** Outcome of applySignals: either success with result or rejection with errors */
export type ApplySignalsOutcome =
  | { ok: true; result: ApplySignalsResult }
  | { ok: false; errors: RejectionReason[] };

/** Error thrown by getSignalsByIds with code and optional field_path */
interface SignalLogError extends Error {
  code: string;
  field_path?: string;
}

function isSignalLogError(err: unknown): err is SignalLogError {
  return err instanceof Error && 'code' in err && typeof (err as SignalLogError).code === 'string';
}

/**
 * Deep merge: merge source into target.
 * - Objects merge recursively (nested objects combined).
 * - Arrays replace entirely (not concatenated).
 * - Explicit null removes the key from state.
 * - Primitives overwrite previous values.
 * Does not mutate target; returns a new object.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal === null) {
      delete result[key];
      continue;
    }

    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = Array.isArray(sourceVal) ? [...sourceVal] : sourceVal;
    }
  }

  return result;
}

/**
 * Compute delta companion fields for every top-level numeric field that changed.
 * For each key F in `next`:
 *   - Skip if prior[F] is absent (first-signal — no baseline to diff against).
 *   - Skip if either value is non-numeric.
 *   - Emit F_delta (numeric difference) and F_direction ("improving"|"declining"|"stable").
 * Null-removal propagation: keys deleted by deepMerge null-semantics have their
 * companion delta fields removed from the result.
 * Does not mutate `next`; returns a new merged object.
 *
 * @param prior - Top-level state object before the current batch of signals
 * @param next  - Top-level state object after deepMerge (before delta enrichment)
 * @returns Copy of `next` merged with computed delta companion fields
 */
export function computeStateDeltas(
  prior: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...next };

  for (const key of Object.keys(next)) {
    if (!(key in prior)) continue;

    const nextVal = next[key];
    const priorVal = prior[key];

    if (typeof nextVal !== 'number') continue;
    if (typeof priorVal !== 'number') {
      console.debug(`[computeStateDeltas] skipping delta for '${key}': prior type '${typeof priorVal}', next is number`);
      continue;
    }

    const delta = nextVal - priorVal;
    result[`${key}_delta`] = delta;
    result[`${key}_direction`] = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable';
  }

  // Null-removal propagation: keys absent in `next` (removed by deepMerge null semantics)
  // must not retain stale companion delta fields.
  for (const key of Object.keys(prior)) {
    if (!(key in next)) {
      delete result[`${key}_delta`];
      delete result[`${key}_direction`];
    }
  }

  return result;
}

/**
 * Compute new state by applying signal payloads in order (reducer pattern).
 * Starts with current state snapshot or {}; each signal payload is deep-merged in order.
 *
 * @param currentState - Current learner state or null for new learner
 * @param signals - Signals in accepted_at order (e.g. from getSignalsByIds)
 * @returns New state object (not persisted)
 */
export function computeNewState(
  currentState: LearnerState | null,
  signals: SignalRecord[]
): Record<string, unknown> {
  let state: Record<string, unknown> =
    currentState && typeof currentState.state === 'object' && !Array.isArray(currentState.state)
      ? JSON.parse(JSON.stringify(currentState.state)) as Record<string, unknown>
      : {};

  for (const signal of signals) {
    const payload = signal.payload;
    if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
      state = deepMerge(state, payload as Record<string, unknown>);
    }
  }

  return state;
}

/**
 * Generate state_id per spec: {org_id}:{learner_reference}:v{version}
 */
function formatStateId(orgId: string, learnerReference: string, version: number): string {
  return `${orgId}:${learnerReference}:v${version}`;
}

/**
 * Apply signals to learner state.
 * Validates request, fetches signals from Signal Log, computes new state, validates it,
 * then saves with optimistic locking (retry once on version conflict).
 * Idempotent: already-applied signal_ids are skipped; if none new, returns prior state.
 *
 * @param request - ApplySignalsRequest (org_id, learner_reference, signal_ids, requested_at)
 * @returns ApplySignalsOutcome — success with ApplySignalsResult or rejection with errors
 */
export function applySignals(request: ApplySignalsRequest): ApplySignalsOutcome {
  const validation = validateApplySignalsRequest(request);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { org_id: orgId, learner_reference: learnerReference, signal_ids: signalIds, requested_at: requestedAt } = request;

  // Idempotency: filter to only signals not yet applied
  const toApply = signalIds.filter((id) => !stateStore.isSignalApplied(orgId, learnerReference, id));
  if (toApply.length === 0) {
    const current = stateStore.getState(orgId, learnerReference);
    const priorVersion = current?.state_version ?? 0;
    const stateId = current?.state_id ?? formatStateId(orgId, learnerReference, priorVersion || 0);
    const updatedAt = current?.updated_at ?? requestedAt;
    return {
      ok: true,
      result: {
        org_id: orgId,
        learner_reference: learnerReference,
        prior_state_version: priorVersion,
        new_state_version: priorVersion,
        state_id: stateId,
        applied_signal_ids: [],
        updated_at: updatedAt,
      },
    };
  }

  let signals: SignalRecord[];
  try {
    signals = getSignalsByIds(orgId, toApply);
  } catch (err) {
    if (isSignalLogError(err)) {
      return {
        ok: false,
        errors: [
          {
            code: err.code,
            message: err.message,
            field_path: err.field_path,
          },
        ],
      };
    }
    throw err;
  }

  const current = stateStore.getState(orgId, learnerReference);
  const newState = computeNewState(current, signals);
  const priorStateObj: Record<string, unknown> =
    current?.state && typeof current.state === 'object' && !Array.isArray(current.state)
      ? (current.state as Record<string, unknown>)
      : {};
  const newStateWithDeltas = computeStateDeltas(priorStateObj, newState);
  const stateValidation = validateStateObject(newStateWithDeltas);
  if (!stateValidation.valid) {
    return { ok: false, errors: stateValidation.errors };
  }

  const priorVersion = current?.state_version ?? 0;
  const lastSignal = signals[signals.length - 1];
  if (!lastSignal) {
    return {
      ok: false,
      errors: [
        { code: ErrorCodes.UNKNOWN_SIGNAL_ID, message: 'No signals returned', field_path: 'signal_ids' },
      ],
    };
  }
  const provenance = {
    last_signal_id: lastSignal.signal_id,
    last_signal_timestamp: lastSignal.accepted_at,
  };

  let stateToSave: Record<string, unknown> = newStateWithDeltas;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentForSave = stateStore.getState(orgId, learnerReference);
    const versionForSave = (currentForSave?.state_version ?? 0) + 1;
    const stateId = formatStateId(orgId, learnerReference, versionForSave);
    const updatedAt = new Date().toISOString();

    const learnerState: LearnerState = {
      org_id: orgId,
      learner_reference: learnerReference,
      state_id: stateId,
      state_version: versionForSave,
      updated_at: updatedAt,
      state: stateToSave,
      provenance,
    };

    try {
      stateStore.saveStateWithAppliedSignals(
        learnerState,
        signals.map((s) => ({
          signal_id: s.signal_id,
          state_version: versionForSave,
          applied_at: s.accepted_at,
        }))
      );
      return {
        ok: true,
        result: {
          org_id: orgId,
          learner_reference: learnerReference,
          prior_state_version: priorVersion,
          new_state_version: versionForSave,
          state_id: stateId,
          applied_signal_ids: toApply,
          updated_at: updatedAt,
        },
      };
    } catch (saveErr: unknown) {
      const isVersionConflict = saveErr instanceof stateStore.StateVersionConflictError;
      if (isVersionConflict && attempt < maxRetries - 1) {
        const refreshed = stateStore.getState(orgId, learnerReference);
        const recomputed = computeNewState(refreshed, signals);
        const refreshedPriorObj: Record<string, unknown> =
          refreshed?.state && typeof refreshed.state === 'object' && !Array.isArray(refreshed.state)
            ? (refreshed.state as Record<string, unknown>)
            : {};
        const recomputedWithDeltas = computeStateDeltas(refreshedPriorObj, recomputed);
        const revalid = validateStateObject(recomputedWithDeltas);
        if (!revalid.valid) {
          return { ok: false, errors: revalid.errors };
        }
        stateToSave = recomputedWithDeltas;
        continue;
      }
      if (isVersionConflict) {
        return {
          ok: false,
          errors: [
            {
              code: ErrorCodes.STATE_VERSION_CONFLICT,
              message: 'State version conflict after retry',
              field_path: undefined,
            },
          ],
        };
      }
      throw saveErr;
    }
  }

  return {
    ok: false,
    errors: [
      {
        code: ErrorCodes.STATE_VERSION_CONFLICT,
        message: 'State version conflict',
        field_path: undefined,
      },
    ],
  };
}
