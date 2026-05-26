/**
 * Forbidden-key rejection structured log parity (sync + async ingestion cores).
 *
 * @see docs/specs/ingestion-preflight.md § Requirements — handler-core.ts behaviour
 */

import { describe, it, expect, vi } from 'vitest';
import { handleSignalIngestionCore } from '../../src/ingestion/handler-core.js';
import {
  handleSignalIngestionAsync,
  type DynamoIngestionPorts,
} from '../../src/ingestion/handler-core-async.js';

function validSignal(payload: Record<string, unknown>) {
  return {
    org_id: 'test-org',
    signal_id: 'sig-forbidden-log-1',
    source_system: 'test-system',
    learner_reference: 'learner-123',
    timestamp: '2026-01-15T10:00:00Z',
    schema_version: 'v1',
    payload,
  };
}

function minimalAsyncPorts(): DynamoIngestionPorts {
  return {
    idempotency: { checkAndStore: vi.fn() },
    signalLog: { appendSignal: vi.fn(), getSignalsByIds: vi.fn() },
    state: { getState: vi.fn(), isSignalApplied: vi.fn(), saveStateWithAppliedSignals: vi.fn() },
    decision: { saveDecision: vi.fn() },
    ingestionLog: { appendIngestionOutcome: vi.fn().mockResolvedValue(undefined) },
  } as unknown as DynamoIngestionPorts;
}

describe('forbidden key rejection structured log', () => {
  it('handleSignalIngestionCore logs forbidden_key_category', async () => {
    const warn = vi.fn();
    const result = await handleSignalIngestionCore(validSignal({ email: 'x@test.com' }), { warn });

    expect(result.statusCode).toBe(400);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'test-org',
        signal_id: 'sig-forbidden-log-1',
        forbidden_key: 'email',
        forbidden_key_path: 'payload.email',
        forbidden_key_category: 'pii',
      }),
      'forbidden key detected in payload'
    );
  });

  it('handleSignalIngestionAsync logs forbidden_key_category', async () => {
    const warn = vi.fn();
    const result = await handleSignalIngestionAsync(
      validSignal({ score: 95 }),
      minimalAsyncPorts(),
      { warn }
    );

    expect(result.statusCode).toBe(400);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'test-org',
        signal_id: 'sig-forbidden-log-1',
        forbidden_key: 'score',
        forbidden_key_path: 'payload.score',
        forbidden_key_category: 'semantic',
      }),
      'forbidden key detected in payload'
    );
  });
});
