/**
 * Async signal ingestion pipeline for Lambda + DynamoDB.
 * Semantics match handleSignalIngestionCore (handler-core.ts) but uses async persistence ports.
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
import { applySignalsAsync, type ApplySignalsAsyncPort } from '../state/apply-signals-async.js';
import { evaluateStateAsync } from '../decision/engine-async.js';
import { resolveUserTypeFromSourceSystem } from '../decision/policy-loader.js';
import type { DynamoDbIdempotencyRepository } from './dynamodb-idempotency-repository.js';
import type { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
import type { DynamoDbStateRepository } from '../state/dynamodb-repository.js';
import type { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import type { DynamoDbIngestionLogRepository } from './dynamodb-ingestion-log-repository.js';

type Logger = { warn?: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };

export interface DynamoIngestionPorts {
  idempotency: DynamoDbIdempotencyRepository;
  signalLog: DynamoDbSignalLogRepository;
  state: DynamoDbStateRepository;
  decision: DynamoDbDecisionRepository;
  ingestionLog: DynamoDbIngestionLogRepository;
}

async function logIngestionOutcome(
  repo: DynamoDbIngestionLogRepository,
  entry: IngestionOutcomeEntry,
  log: Logger
): Promise<void> {
  try {
    await repo.appendIngestionOutcome(entry);
  } catch (err) {
    log.warn?.({ err, org_id: entry.org_id, signal_id: entry.signal_id }, 'appendIngestionOutcome failed');
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

function buildApplyPort(state: DynamoDbStateRepository, signalLog: DynamoDbSignalLogRepository): ApplySignalsAsyncPort {
  return {
    isSignalApplied: (o, l, s) => state.isSignalApplied(o, l, s),
    getState: (o, l) => state.getState(o, l),
    getSignalsByIds: (o, ids) => signalLog.getSignalsByIds(o, ids),
    saveStateWithAppliedSignals: (st, entries) => state.saveStateWithAppliedSignals(st, entries),
  };
}

/**
 * Full ingestion with DynamoDB repositories (Lambda).
 */
export async function handleSignalIngestionAsync(
  body: unknown,
  ports: DynamoIngestionPorts,
  log: Logger = {}
): Promise<HandlerResult<SignalIngestResult>> {
  const receivedAt = new Date().toISOString();
  const { idempotency, signalLog, state, decision, ingestionLog } = ports;

  const validationResult = validateSignalEnvelope(body);
  if (!validationResult.valid) {
    const firstError = validationResult.errors[0]!;
    const partialSignal = body as Partial<SignalEnvelope> | null;
    await logIngestionOutcome(ingestionLog, buildOutcomeEntry(partialSignal, 'rejected', receivedAt, firstError), log);
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
    await logIngestionOutcome(ingestionLog, buildOutcomeEntry(signal, 'rejected', receivedAt, rejectionReason), log);
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

  const tenantPayload = await normalizeAndValidateTenantPayloadAsync({
    orgId: signal.org_id,
    sourceSystem: signal.source_system,
    payload: signal.payload,
  });
  if (!tenantPayload.ok) {
    const firstError = tenantPayload.errors[0]!;
    await logIngestionOutcome(ingestionLog, buildOutcomeEntry(signal, 'rejected', receivedAt, firstError), log);
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

  const idempotencyResult = await idempotency.checkAndStore(signal.org_id, signal.signal_id);
  if (idempotencyResult.isDuplicate) {
    const dupReceivedAt = idempotencyResult.receivedAt ?? receivedAt;
    await logIngestionOutcome(ingestionLog, buildOutcomeEntry(signal, 'duplicate', dupReceivedAt), log);
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

  await signalLog.appendSignal(signal, acceptedAt);

  const applyPort = buildApplyPort(state, signalLog);
  let applyOutcome = null;
  try {
    applyOutcome = await applySignalsAsync(
      {
        org_id: signal.org_id,
        learner_reference: signal.learner_reference,
        signal_ids: [signal.signal_id],
        requested_at: acceptedAt,
      },
      applyPort
    );
    if (!applyOutcome.ok) {
      log.warn?.(
        { err: applyOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
        'applySignalsAsync rejected after appendSignal'
      );
    }
  } catch (err) {
    log.warn?.({ err, org_id: signal.org_id, signal_id: signal.signal_id }, 'applySignalsAsync threw after appendSignal');
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
      };
      const decisionOutcome = await evaluateStateAsync(evalRequest, {
        getState: (o, l) => state.getState(o, l),
        saveDecision: (d) => decision.saveDecision(d),
      });
      if (!decisionOutcome.ok) {
        log.warn?.(
          { err: decisionOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
          'evaluateStateAsync rejected'
        );
      } else if (!decisionOutcome.matched) {
        log.info?.(
          { org_id: signal.org_id, signal_id: signal.signal_id },
          'no policy rule matched; no decision emitted (runbook §Policy rule)'
        );
      }
    } catch (err) {
      log.warn?.({ err, org_id: signal.org_id, signal_id: signal.signal_id }, 'evaluateStateAsync threw');
    }
  }

  await logIngestionOutcome(ingestionLog, buildOutcomeEntry(signal, 'accepted', acceptedAt), log);

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
