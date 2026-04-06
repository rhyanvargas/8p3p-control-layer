/**
 * Async applySignals for DynamoDB-backed repositories (Lambda).
 * Mirrors state/engine.ts applySignals logic including computeStateDeltas and retry on version conflict.
 */

import type { ApplySignalsRequest, LearnerState, SignalRecord } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateApplySignalsRequest, validateStateObject } from './validator.js';
import { computeNewState, computeStateDeltas, type ApplySignalsOutcome } from './engine.js';
import { StateVersionConflictError } from './dynamodb-repository.js';

export interface ApplySignalsAsyncPort {
  isSignalApplied(orgId: string, learnerReference: string, signalId: string): Promise<boolean>;
  getState(orgId: string, learnerReference: string): Promise<LearnerState | null>;
  getSignalsByIds(orgId: string, signalIds: string[]): Promise<SignalRecord[]>;
  saveStateWithAppliedSignals(
    state: LearnerState,
    appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): Promise<void>;
}

interface SignalLogError extends Error {
  code: string;
  field_path?: string;
}

function isSignalLogError(err: unknown): err is SignalLogError {
  return err instanceof Error && 'code' in err && typeof (err as SignalLogError).code === 'string';
}

function formatStateId(orgId: string, learnerReference: string, version: number): string {
  return `${orgId}:${learnerReference}:v${version}`;
}

function isVersionConflict(err: unknown): boolean {
  return err instanceof StateVersionConflictError;
}

/** Order signal records to match signalIds (BatchGetItem order is undefined). */
function orderSignalsByIds(signals: SignalRecord[], signalIds: string[]): SignalRecord[] {
  const byId = new Map(signals.map((s) => [s.signal_id, s]));
  return signalIds.map((id) => byId.get(id)).filter((s): s is SignalRecord => s !== undefined);
}

export async function applySignalsAsync(
  request: ApplySignalsRequest,
  port: ApplySignalsAsyncPort
): Promise<ApplySignalsOutcome> {
  const validation = validateApplySignalsRequest(request);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { org_id: orgId, learner_reference: learnerReference, signal_ids: signalIds, requested_at: requestedAt } =
    request;

  const appliedChecks = await Promise.all(
    signalIds.map((id) => port.isSignalApplied(orgId, learnerReference, id))
  );
  const toApply = signalIds.filter((_, i) => !appliedChecks[i]);

  if (toApply.length === 0) {
    const current = await port.getState(orgId, learnerReference);
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
    const batch = await port.getSignalsByIds(orgId, toApply);
    signals = orderSignalsByIds(batch, toApply);
    if (signals.length !== toApply.length) {
      return {
        ok: false,
        errors: [
          {
            code: ErrorCodes.UNKNOWN_SIGNAL_ID,
            message: 'One or more signal ids were not found',
            field_path: 'signal_ids',
          },
        ],
      };
    }
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

  const current = await port.getState(orgId, learnerReference);
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
        {
          code: ErrorCodes.UNKNOWN_SIGNAL_ID,
          message: 'No signals returned',
          field_path: 'signal_ids',
        },
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
    const currentForSave = await port.getState(orgId, learnerReference);
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
      await port.saveStateWithAppliedSignals(
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
      if (isVersionConflict(saveErr) && attempt < maxRetries - 1) {
        const refreshed = await port.getState(orgId, learnerReference);
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
      if (isVersionConflict(saveErr)) {
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
