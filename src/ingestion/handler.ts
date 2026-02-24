/**
 * Signal Ingestion Handler
 * Orchestrates the validation pipeline for POST /signals
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  SignalEnvelope,
  SignalIngestResult,
  EvaluateStateForDecisionRequest,
  IngestionOutcomeEntry,
  RejectionReason,
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateSignalEnvelope } from '../contracts/validators/signal-envelope.js';
import { detectForbiddenKeys } from './forbidden-keys.js';
import { normalizeAndValidateTenantPayload } from '../config/tenant-field-mappings.js';
import { checkAndStore } from './idempotency.js';
import { appendSignal } from '../signalLog/store.js';
import { appendIngestionOutcome } from './ingestion-log-store.js';
import { applySignals, type ApplySignalsOutcome } from '../state/engine.js';
import { evaluateState } from '../decision/engine.js';

/**
 * Log ingestion outcome to the ingestion log. Must not fail signal acceptance (spec §1.4).
 */
function logIngestionOutcome(
  entry: IngestionOutcomeEntry,
  log: { warn?: (obj: unknown, msg: string) => void }
): void {
  try {
    appendIngestionOutcome(entry);
  } catch (err) {
    log?.warn?.({ err, org_id: entry.org_id, signal_id: entry.signal_id }, 'appendIngestionOutcome failed; signal response unchanged');
  }
}

/**
 * Build IngestionOutcomeEntry from partial request body and result
 */
function buildOutcomeEntry(
  body: Partial<SignalEnvelope> | null,
  outcome: 'accepted' | 'rejected' | 'duplicate',
  receivedAt: string,
  rejectionReason?: RejectionReason
): IngestionOutcomeEntry {
  return {
    org_id: body?.org_id ?? '',
    signal_id: body?.signal_id ?? '',
    source_system: body?.source_system ?? '',
    learner_reference: body?.learner_reference ?? '',
    timestamp: body?.timestamp ?? '',
    schema_version: body?.schema_version ?? '',
    outcome,
    received_at: receivedAt,
    rejection_reason: rejectionReason ?? null,
  };
}

/**
 * Handle POST /signals request
 *
 * Validation pipeline (in order):
 * 1. Structural validation with Ajv
 * 2. Forbidden key detection in payload
 * 3. Idempotency check
 * 4. Return result with received_at timestamp
 * 
 * Determinism guarantee: Same input always produces same output (except received_at)
 */
export async function handleSignalIngestion(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SignalIngestResult> {
  const body = request.body;
  const receivedAt = new Date().toISOString();
  
  // Step 1: Structural validation with Ajv
  const validationResult = validateSignalEnvelope(body);
  
  if (!validationResult.valid) {
    const firstError = validationResult.errors[0]!;
    const partialSignal = body as Partial<SignalEnvelope> | null;

    logIngestionOutcome(
      buildOutcomeEntry(partialSignal, 'rejected', receivedAt, firstError),
      request.log ?? {}
    );

    const result: SignalIngestResult = {
      org_id: partialSignal?.org_id ?? '',
      signal_id: partialSignal?.signal_id ?? '',
      status: 'rejected',
      received_at: receivedAt,
      rejection_reason: firstError,
    };

    reply.status(400);
    return result;
  }
  
  // Now we know body is a valid SignalEnvelope structurally
  let signal = body as SignalEnvelope;
  
  // Step 2: Forbidden key detection in payload
  const forbiddenKey = detectForbiddenKeys(signal.payload, 'payload');
  
  if (forbiddenKey) {
    const rejectionReason = {
      code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
      message: `Forbidden semantic key '${forbiddenKey.key}' detected in payload`,
      field_path: forbiddenKey.path,
    };

    logIngestionOutcome(
      buildOutcomeEntry(signal, 'rejected', receivedAt, rejectionReason),
      request.log ?? {}
    );

    const result: SignalIngestResult = {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'rejected',
      received_at: receivedAt,
      rejection_reason: rejectionReason,
    };

    reply.status(400);
    return result;
  }

  // Step 2b: Optional tenant-scoped payload mappings (Phase 2: DEF-DEC-006)
  // If mappings exist for this org, normalize + enforce required payload semantics.
  const tenantPayload = normalizeAndValidateTenantPayload({ orgId: signal.org_id, payload: signal.payload });
  if (!tenantPayload.ok) {
    const firstError = tenantPayload.errors[0]!;

    logIngestionOutcome(
      buildOutcomeEntry(signal, 'rejected', receivedAt, firstError),
      request.log ?? {}
    );

    const result: SignalIngestResult = {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'rejected',
      received_at: receivedAt,
      rejection_reason: firstError,
    };

    reply.status(400);
    return result;
  }

  // Persist normalized payload (adds canonical keys; does not delete alias keys).
  signal = { ...signal, payload: tenantPayload.payload };
  
  // Step 3: Idempotency check
  const idempotencyResult = checkAndStore(signal.org_id, signal.signal_id);
  
  if (idempotencyResult.isDuplicate) {
    const dupReceivedAt = idempotencyResult.receivedAt ?? receivedAt;

    logIngestionOutcome(
      buildOutcomeEntry(signal, 'duplicate', dupReceivedAt),
      request.log ?? {}
    );

    const result: SignalIngestResult = {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'duplicate',
      received_at: dupReceivedAt,
    };

    // Duplicates return 200 OK per spec (not an error, just idempotent)
    reply.status(200);
    return result;
  }
  
  // Step 4: Forward to Signal Log
  // The signal is accepted, so we persist it in the immutable Signal Log
  const acceptedAt = idempotencyResult.receivedAt ?? receivedAt;
  appendSignal(signal, acceptedAt);

  // Step 4b: Apply signal to learner state (STATE engine).
  // On rejection or throw we log and continue so ingestion stays resilient: the signal is already
  // in the log and STATE can be retried later (e.g. on next read or a batch job).
  let applyOutcome: ApplySignalsOutcome | null = null;
  try {
    applyOutcome = applySignals({
      org_id: signal.org_id,
      learner_reference: signal.learner_reference,
      signal_ids: [signal.signal_id],
      requested_at: acceptedAt,
    });
    if (!applyOutcome.ok) {
      request.log?.warn?.(
        { err: applyOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
        'applySignals rejected after appendSignal; signal remains in log'
      );
    }
  } catch (err) {
    request.log?.warn?.(
      { err, org_id: signal.org_id, signal_id: signal.signal_id },
      'applySignals threw after appendSignal; signal remains in log'
    );
  }

  // Step 4c: Evaluate state for decision (Decision Engine).
  // On rejection or throw we log and continue — ingestion must not fail due to decision evaluation.
  if (applyOutcome?.ok) {
    try {
      const evalRequest: EvaluateStateForDecisionRequest = {
        org_id: signal.org_id,
        learner_reference: signal.learner_reference,
        state_id: applyOutcome.result.state_id,
        state_version: applyOutcome.result.new_state_version,
        requested_at: new Date().toISOString(),
      };
      const decisionOutcome = evaluateState(evalRequest);
      if (!decisionOutcome.ok) {
        request.log?.warn?.(
          { err: decisionOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
          'evaluateState rejected after applySignals; signal and state remain intact'
        );
      }
    } catch (err) {
      request.log?.warn?.(
        { err, org_id: signal.org_id, signal_id: signal.signal_id },
        'evaluateState threw after applySignals; signal and state remain intact'
      );
    }
  }

  // Step 5: Success - signal accepted (200 per OpenAPI: "Signal accepted or duplicate")
  logIngestionOutcome(
    buildOutcomeEntry(signal, 'accepted', acceptedAt),
    request.log ?? {}
  );

  const result: SignalIngestResult = {
    org_id: signal.org_id,
    signal_id: signal.signal_id,
    status: 'accepted',
    received_at: acceptedAt,
  };

  reply.status(200);
  return result;
}
