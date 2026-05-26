/**
 * Webhook Envelope Extractor — pure function, no I/O.
 *
 * Transforms a raw webhook body + mapping into a SignalEnvelope (or a dropped/error result).
 * @see docs/specs/webhook-adapters.md §Adapter Pipeline steps 2-5
 */

import { randomUUID } from 'crypto';
import { getAtPath } from '../shared/dot-path.js';
import { ErrorCodes } from '../shared/error-codes.js';
import type { SignalEnvelope } from '../shared/types.js';
import type { TenantPayloadMapping } from '../config/tenant-field-mappings.js';

export type WebhookExtractionResult =
  | { kind: 'envelope'; envelope: SignalEnvelope }
  | { kind: 'dropped' }
  | { kind: 'error'; statusCode: 400; body: { error: { code: string; message: string } } };

export function extractWebhookEnvelope(args: {
  orgId: string;
  sourceSystem: string;
  mapping: TenantPayloadMapping | null;
  body: Record<string, unknown>;
  now?: () => string;
}): WebhookExtractionResult {
  const { orgId, sourceSystem, mapping, body, now } = args;

  // Step 2: Check envelope mapping exists
  if (!mapping?.envelope?.learner_reference_path) {
    return {
      kind: 'error',
      statusCode: 400,
      body: {
        error: {
          code: ErrorCodes.MISSING_ENVELOPE_MAPPING,
          message: `No envelope mapping configured for org '${orgId}' + source_system '${sourceSystem}'. Use PUT /v1/admin/mappings/${orgId}/${sourceSystem} to configure.`,
        },
      },
    };
  }

  const envelope = mapping.envelope;

  // Step 3: Event type filter
  if (envelope.event_type_path) {
    const eventTypeValue = getAtPath(body, envelope.event_type_path);
    if (eventTypeValue === undefined || eventTypeValue === null || typeof eventTypeValue !== 'string') {
      return { kind: 'dropped' };
    }
    if (envelope.allowed_event_types && !envelope.allowed_event_types.includes(eventTypeValue)) {
      return { kind: 'dropped' };
    }
  }

  // Step 4a: Extract learner_reference (required)
  const learnerRaw = getAtPath(body, envelope.learner_reference_path);
  if (learnerRaw === undefined || learnerRaw === null || learnerRaw === '') {
    return {
      kind: 'error',
      statusCode: 400,
      body: {
        error: {
          code: ErrorCodes.ENVELOPE_EXTRACTION_FAILED,
          message: `Cannot extract learner_reference: path '${envelope.learner_reference_path}' not found in webhook body.`,
        },
      },
    };
  }
  const learnerReference = typeof learnerRaw === 'number' ? String(learnerRaw) : String(learnerRaw);

  // Step 4b: Extract signal_id (optional; auto UUID fallback)
  let signalId: string;
  if (envelope.signal_id_path) {
    const sidRaw = getAtPath(body, envelope.signal_id_path);
    if (sidRaw !== undefined && sidRaw !== null && sidRaw !== '') {
      signalId = String(sidRaw);
    } else {
      signalId = randomUUID();
    }
  } else {
    signalId = randomUUID();
  }

  // Step 4c: Extract timestamp (optional; fallback to now())
  const getNow = now ?? (() => new Date().toISOString());
  let ts: string;
  if (envelope.timestamp_path) {
    const tsRaw = getAtPath(body, envelope.timestamp_path);
    if (typeof tsRaw === 'string' && tsRaw.trim() !== '') {
      const parsed = Date.parse(tsRaw);
      if (!Number.isNaN(parsed)) {
        ts = tsRaw;
      } else {
        ts = getNow();
      }
    } else {
      ts = getNow();
    }
  } else {
    ts = getNow();
  }

  // Step 5: Construct SignalEnvelope
  const result: SignalEnvelope = {
    org_id: orgId,
    signal_id: signalId,
    source_system: sourceSystem,
    learner_reference: learnerReference,
    timestamp: ts,
    schema_version: 'v1',
    payload: body,
  };

  return { kind: 'envelope', envelope: result };
}
