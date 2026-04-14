/**
 * Signal Ingestion Handler Core — framework-agnostic
 *
 * Contains the full ingestion validation pipeline extracted from handler.ts.
 * Called directly by the Fastify handler (thin wrapper) and by the Lambda ingest handler.
 */

import type {
  SignalEnvelope,
  SignalIngestResult,
  EvaluateStateForDecisionRequest,
  IngestionOutcomeEntry,
  RejectionReason,
  HandlerResult,
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateSignalEnvelope } from '../contracts/validators/signal-envelope.js';
import { detectForbiddenKeys } from './forbidden-keys.js';
import { normalizeAndValidateTenantPayloadAsync } from '../config/tenant-field-mappings.js';
import { checkAndStore } from './idempotency.js';
import { appendSignal } from '../signalLog/store.js';
import { appendIngestionOutcome } from './ingestion-log-store.js';
import { applySignals, type ApplySignalsOutcome } from '../state/engine.js';
import { evaluateState } from '../decision/engine.js';
import { resolveUserTypeFromSourceSystem } from '../decision/policy-loader.js';

type Logger = { warn?: (obj: unknown, msg: string) => void };

function logIngestionOutcome(entry: IngestionOutcomeEntry, log: Logger): void {
  try {
    appendIngestionOutcome(entry);
  } catch (err) {
    log.warn?.({ err, org_id: entry.org_id, signal_id: entry.signal_id }, 'appendIngestionOutcome failed; signal response unchanged');
  }
}

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
 * Framework-agnostic signal ingestion pipeline.
 *
 * @param body   - Raw request body (unknown, will be validated)
 * @param log    - Optional structured logger (Fastify log or console)
 * @returns      - { statusCode, body } — caller sets HTTP status and serializes body
 */
export async function handleSignalIngestionCore(
  body: unknown,
  log: Logger = {}
): Promise<HandlerResult<SignalIngestResult>> {
  const receivedAt = new Date().toISOString();

  const validationResult = validateSignalEnvelope(body);

  if (!validationResult.valid) {
    const firstError = validationResult.errors[0]!;
    const partialSignal = body as Partial<SignalEnvelope> | null;

    logIngestionOutcome(buildOutcomeEntry(partialSignal, 'rejected', receivedAt, firstError), log);

    return {
      statusCode: 400,
      body: {
        org_id: partialSignal?.org_id ?? '',
        signal_id: partialSignal?.signal_id ?? '',
        status: 'rejected',
        received_at: receivedAt,
        rejection_reason: firstError,
      },
    };
  }

  let signal = body as SignalEnvelope;

  const forbiddenKey = detectForbiddenKeys(signal.payload, 'payload');

  if (forbiddenKey) {
    const rejectionReason: RejectionReason = {
      code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
      message: `Forbidden semantic key '${forbiddenKey.key}' detected in payload`,
      field_path: forbiddenKey.path,
    };

    logIngestionOutcome(buildOutcomeEntry(signal, 'rejected', receivedAt, rejectionReason), log);

    return {
      statusCode: 400,
      body: {
        org_id: signal.org_id,
        signal_id: signal.signal_id,
        status: 'rejected',
        received_at: receivedAt,
        rejection_reason: rejectionReason,
      },
    };
  }

  const tenantPayload = await normalizeAndValidateTenantPayloadAsync({ orgId: signal.org_id, sourceSystem: signal.source_system, payload: signal.payload });
  if (!tenantPayload.ok) {
    const firstError = tenantPayload.errors[0]!;

    logIngestionOutcome(buildOutcomeEntry(signal, 'rejected', receivedAt, firstError), log);

    return {
      statusCode: 400,
      body: {
        org_id: signal.org_id,
        signal_id: signal.signal_id,
        status: 'rejected',
        received_at: receivedAt,
        rejection_reason: firstError,
      },
    };
  }

  signal = { ...signal, payload: tenantPayload.payload };

  const idempotencyResult = checkAndStore(signal.org_id, signal.signal_id);

  if (idempotencyResult.isDuplicate) {
    const dupReceivedAt = idempotencyResult.receivedAt ?? receivedAt;

    logIngestionOutcome(buildOutcomeEntry(signal, 'duplicate', dupReceivedAt), log);

    return {
      statusCode: 200,
      body: {
        org_id: signal.org_id,
        signal_id: signal.signal_id,
        status: 'duplicate',
        received_at: dupReceivedAt,
      },
    };
  }

  const acceptedAt = idempotencyResult.receivedAt ?? receivedAt;
  appendSignal(signal, acceptedAt);

  let applyOutcome: ApplySignalsOutcome | null = null;
  try {
    applyOutcome = applySignals({
      org_id: signal.org_id,
      learner_reference: signal.learner_reference,
      signal_ids: [signal.signal_id],
      requested_at: acceptedAt,
    });
    if (!applyOutcome.ok) {
      log.warn?.(
        { err: applyOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
        'applySignals rejected after appendSignal; signal remains in log'
      );
    }
  } catch (err) {
    log.warn?.(
      { err, org_id: signal.org_id, signal_id: signal.signal_id },
      'applySignals threw after appendSignal; signal remains in log'
    );
  }

  if (applyOutcome?.ok) {
    try {
      const userType = resolveUserTypeFromSourceSystem(signal.org_id, signal.source_system);
      const evalRequest: EvaluateStateForDecisionRequest = {
        org_id: signal.org_id,
        learner_reference: signal.learner_reference,
        state_id: applyOutcome.result.state_id,
        state_version: applyOutcome.result.new_state_version,
        requested_at: new Date().toISOString(),
        user_type: userType,
        signal_context: {
          skill: typeof signal.payload?.skill === 'string' ? signal.payload.skill : undefined,
          assessment_type: typeof signal.payload?.assessment_type === 'string' ? signal.payload.assessment_type : undefined,
          school_id: typeof signal.metadata?.school_id === 'string' ? signal.metadata.school_id : undefined,
        },
      };
      const decisionOutcome = evaluateState(evalRequest);
      if (!decisionOutcome.ok) {
        log.warn?.(
          { err: decisionOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
          'evaluateState rejected after applySignals; signal and state remain intact'
        );
      }
    } catch (err) {
      log.warn?.(
        { err, org_id: signal.org_id, signal_id: signal.signal_id },
        'evaluateState threw after applySignals; signal and state remain intact'
      );
    }
  }

  logIngestionOutcome(buildOutcomeEntry(signal, 'accepted', acceptedAt), log);

  return {
    statusCode: 200,
    body: {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'accepted',
      received_at: acceptedAt,
    },
  };
}
