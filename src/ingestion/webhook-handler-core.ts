/**
 * Webhook Handler Core — sync (Fastify) path.
 *
 * Resolves mapping, extracts envelope, delegates to handleSignalIngestionCore.
 * No direct imports of idempotency, signalLog, state, or decision modules.
 * @see docs/specs/webhook-adapters.md §Adapter Pipeline
 */

import type { SignalIngestResult, HandlerResult } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { isRecord } from '../shared/dot-path.js';
import { resolveTenantPayloadMappingForIngest } from '../config/tenant-field-mappings.js';
import { extractWebhookEnvelope } from './webhook-envelope-extractor.js';
import { handleSignalIngestionCore } from './handler-core.js';

type Logger = {
  warn?: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
  debug?: (obj: unknown, msg: string) => void;
};

export async function handleWebhookCore(args: {
  orgId: string;
  sourceSystem: string;
  body: unknown;
  log?: Logger;
}): Promise<HandlerResult<SignalIngestResult | { error: { code: string; message: string } } | undefined>> {
  const { orgId, sourceSystem, body, log = {} } = args;

  if (!isRecord(body)) {
    return {
      statusCode: 400,
      body: { error: { code: ErrorCodes.PAYLOAD_NOT_OBJECT, message: 'webhook body must be a JSON object' } },
    };
  }

  const mapping = await resolveTenantPayloadMappingForIngest(orgId, sourceSystem);

  const extraction = extractWebhookEnvelope({ orgId, sourceSystem, mapping, body });

  switch (extraction.kind) {
    case 'dropped':
      log.debug?.({ org_id: orgId, source_system: sourceSystem }, 'webhook event type filtered out (204)');
      return { statusCode: 204, body: undefined };

    case 'error':
      return extraction;

    case 'envelope':
      return handleSignalIngestionCore(extraction.envelope, log);
  }
}
