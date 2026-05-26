import { describe, it, expect } from 'vitest';
import { extractWebhookEnvelope } from '../../src/ingestion/webhook-envelope-extractor.js';
import type { TenantPayloadMapping } from '../../src/config/tenant-field-mappings.js';

const FIXED_NOW = '2026-03-28T10:30:01Z';
const now = () => FIXED_NOW;

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function makeMapping(envelope?: TenantPayloadMapping['envelope']): TenantPayloadMapping {
  return { required: ['stabilityScore'], envelope };
}

describe('extractWebhookEnvelope', () => {
  it('returns missing_envelope_mapping when mapping is null', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: null,
      body: { foo: 1 },
      now,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.body.error.code).toBe('missing_envelope_mapping');
      expect(result.body.error.message).toContain("org 'springs'");
      expect(result.body.error.message).toContain("source_system 'canvas-lms'");
    }
  });

  it('returns missing_envelope_mapping when mapping has no envelope', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping(undefined),
      body: { foo: 1 },
      now,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.body.error.code).toBe('missing_envelope_mapping');
    }
  });

  it('returns envelope_extraction_failed when learner_reference path missing in body', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'submission.user_id' }),
      body: { submission: { id: '123' } },
      now,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.body.error.code).toBe('envelope_extraction_failed');
      expect(result.body.error.message).toContain("path 'submission.user_id'");
    }
  });

  it('uses signal_id from body when signal_id_path configured and present', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'submission.user_id',
        signal_id_path: 'submission.id',
      }),
      body: { submission: { user_id: 'student_1', id: 'sub_98765' } },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.signal_id).toBe('sub_98765');
    }
  });

  it('generates UUID v4 when signal_id_path configured but absent in body', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'submission.user_id',
        signal_id_path: 'submission.id',
      }),
      body: { submission: { user_id: 'student_1' } },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.signal_id).toMatch(UUID_V4_REGEX);
    }
  });

  it('generates UUID v4 when signal_id_path not configured', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'user_id' }),
      body: { user_id: 'student_1' },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.signal_id).toMatch(UUID_V4_REGEX);
    }
  });

  it('uses timestamp from body when timestamp_path configured and valid ISO 8601', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        timestamp_path: 'submitted_at',
      }),
      body: { user_id: 'student_1', submitted_at: '2026-03-28T10:30:00Z' },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.timestamp).toBe('2026-03-28T10:30:00Z');
    }
  });

  it('falls back to now() when timestamp_path configured but value is invalid', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        timestamp_path: 'submitted_at',
      }),
      body: { user_id: 'student_1', submitted_at: 'not-a-date' },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.timestamp).toBe(FIXED_NOW);
    }
  });

  it('falls back to now() when timestamp_path not configured', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'user_id' }),
      body: { user_id: 'student_1' },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.timestamp).toBe(FIXED_NOW);
    }
  });

  it('returns envelope when event_type_path configured and value is in allowed_event_types', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created', 'submission_updated'],
      }),
      body: { user_id: 'student_1', event_type: 'submission_created' },
      now,
    });
    expect(result.kind).toBe('envelope');
  });

  it('returns dropped when event_type_path configured and value NOT in allowed_event_types', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created'],
      }),
      body: { user_id: 'student_1', event_type: 'enrollment_created' },
      now,
    });
    expect(result.kind).toBe('dropped');
  });

  it('returns envelope regardless of body when event_type_path not configured', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'user_id' }),
      body: { user_id: 'student_1', event_type: 'anything_at_all' },
      now,
    });
    expect(result.kind).toBe('envelope');
  });

  it('passes any string value when allowed_event_types absent but event_type_path configured', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        event_type_path: 'event_type',
      }),
      body: { user_id: 'student_1', event_type: 'random_event' },
      now,
    });
    expect(result.kind).toBe('envelope');
  });

  it('drops when event_type_path configured and value is missing/null', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'user_id',
        event_type_path: 'event_type',
      }),
      body: { user_id: 'student_1' },
      now,
    });
    expect(result.kind).toBe('dropped');
  });

  it('coerces number learner_reference to string', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'student_num' }),
      body: { student_num: 12345 },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.learner_reference).toBe('12345');
    }
  });

  it('payload is referentially the full raw body (no clone)', () => {
    const body = { user_id: 'student_1', extra: { nested: true } };
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'user_id' }),
      body,
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.payload).toBe(body);
    }
  });

  it('schema_version is exactly "v1"', () => {
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({ learner_reference_path: 'user_id' }),
      body: { user_id: 'student_1' },
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope.schema_version).toBe('v1');
    }
  });

  it('constructs complete envelope with all extracted fields', () => {
    const body = {
      submission: {
        user_id: 'canvas_student_001',
        id: 'sub_98765',
        submitted_at: '2026-03-28T10:30:00Z',
      },
      event_type: 'submission_created',
    };
    const result = extractWebhookEnvelope({
      orgId: 'springs',
      sourceSystem: 'canvas-lms',
      mapping: makeMapping({
        learner_reference_path: 'submission.user_id',
        signal_id_path: 'submission.id',
        timestamp_path: 'submission.submitted_at',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created', 'submission_updated'],
      }),
      body,
      now,
    });
    expect(result.kind).toBe('envelope');
    if (result.kind === 'envelope') {
      expect(result.envelope).toEqual({
        org_id: 'springs',
        signal_id: 'sub_98765',
        source_system: 'canvas-lms',
        learner_reference: 'canvas_student_001',
        timestamp: '2026-03-28T10:30:00Z',
        schema_version: 'v1',
        payload: body,
      });
    }
  });
});
