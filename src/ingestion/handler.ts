/**
 * Signal Ingestion Handler
 * Orchestrates the validation pipeline for POST /signals
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SignalEnvelope, SignalIngestResult } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateSignalEnvelope } from '../contracts/validators/signal-envelope.js';
import { detectForbiddenKeys } from './forbidden-keys.js';
import { checkAndStore } from './idempotency.js';
import { appendSignal } from '../signalLog/store.js';

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
    const firstError = validationResult.errors[0];
    
    // Cast to get org_id and signal_id if they exist (for response)
    const partialSignal = body as Partial<SignalEnvelope> | null;
    
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
  const signal = body as SignalEnvelope;
  
  // Step 2: Forbidden key detection in payload
  const forbiddenKey = detectForbiddenKeys(signal.payload, 'payload');
  
  if (forbiddenKey) {
    const result: SignalIngestResult = {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'rejected',
      received_at: receivedAt,
      rejection_reason: {
        code: ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED,
        message: `Forbidden semantic key '${forbiddenKey.key}' detected in payload`,
        field_path: forbiddenKey.path,
      },
    };
    
    reply.status(400);
    return result;
  }
  
  // Step 3: Idempotency check
  const idempotencyResult = checkAndStore(signal.org_id, signal.signal_id);
  
  if (idempotencyResult.isDuplicate) {
    const result: SignalIngestResult = {
      org_id: signal.org_id,
      signal_id: signal.signal_id,
      status: 'duplicate',
      received_at: idempotencyResult.receivedAt ?? receivedAt,
    };
    
    // Duplicates return 200 OK per spec (not an error, just idempotent)
    reply.status(200);
    return result;
  }
  
  // Step 4: Forward to Signal Log
  // The signal is accepted, so we persist it in the immutable Signal Log
  const acceptedAt = idempotencyResult.receivedAt ?? receivedAt;
  appendSignal(signal, acceptedAt);
  
  // Step 5: Success - signal accepted
  const result: SignalIngestResult = {
    org_id: signal.org_id,
    signal_id: signal.signal_id,
    status: 'accepted',
    received_at: acceptedAt,
  };
  
  reply.status(201);
  return result;
}
