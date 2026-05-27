/**
 * Unit tests for trajectory-handler-core.
 * UNIT-CORE-01: Validation rejects missing/invalid params with correct error codes.
 * UNIT-CORE-02: Summary computation: improving / declining / stable / single-value null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import type { LearnerState } from '../../src/shared/types.js';

vi.mock('../../src/state/store.js', () => ({
  getState: vi.fn(),
  getStateVersionRange: vi.fn(),
}));

import { handleTrajectoryQueryCore } from '../../src/state/trajectory-handler-core.js';
import { getState, getStateVersionRange } from '../../src/state/store.js';

const mockGetState = vi.mocked(getState);
const mockGetStateVersionRange = vi.mocked(getStateVersionRange);

function makeLearnerState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    org_id: 'test-org',
    learner_reference: 'learner-001',
    state_id: 'test-org:learner-001:v1',
    state_version: 1,
    updated_at: '2026-03-01T10:00:00Z',
    state: {},
    provenance: {
      last_signal_id: 'sig-001',
      last_signal_timestamp: '2026-03-01T09:55:00Z',
    },
    ...overrides,
  };
}

describe('trajectory-handler-core', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetState.mockReturnValue(makeLearnerState({ state_version: 5 }));
    mockGetStateVersionRange.mockReturnValue({ states: [], nextCursor: null });
  });

  // =========================================================================
  // UNIT-CORE-01: Validation
  // =========================================================================
  describe('validation — missing/invalid params', () => {
    it('rejects missing org_id', async () => {
      const result = await handleTrajectoryQueryCore({
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.ORG_SCOPE_REQUIRED });
    });

    it('rejects empty org_id', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: '  ',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.ORG_SCOPE_REQUIRED });
    });

    it('rejects missing learner_reference', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        fields: 'stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.MISSING_REQUIRED_FIELD, field_path: 'learner_reference' });
    });

    it('rejects empty learner_reference', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: '',
        fields: 'stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.MISSING_REQUIRED_FIELD });
    });

    it('rejects missing fields', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.MISSING_REQUIRED_FIELD, field_path: 'fields' });
    });

    it('rejects empty fields string', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: '',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.MISSING_REQUIRED_FIELD, field_path: 'fields' });
    });

    it('rejects more than 10 fields', async () => {
      const fields = Array.from({ length: 11 }, (_, i) => `field${i}`).join(',');
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_FORMAT });
      expect((result.body as { message: string }).message).toContain('Maximum 10 fields per trajectory request. Got 11.');
    });

    it('rejects dot-path field', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'skills.fractions.stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_FORMAT });
      expect((result.body as { message: string }).message).toBe(
        'Dot-path fields are not supported in v1.1. Use top-level canonical field names.'
      );
    });

    it('rejects from_version that is not a positive integer', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: 'abc',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_TYPE, field_path: 'from_version' });
    });

    it('rejects from_version = 0', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '0',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_TYPE, field_path: 'from_version' });
    });

    it('rejects from_version > to_version', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '5',
        to_version: '2',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_FORMAT, field_path: 'from_version' });
    });

    it('rejects malformed page_token', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        page_token: 'not-a-valid-token',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_PAGE_TOKEN, field_path: 'page_token' });
    });

    it('rejects page_size = 0', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        page_size: '0',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE, field_path: 'page_size' });
    });

    it('rejects page_size = 101', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        page_size: '101',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE, field_path: 'page_size' });
    });

    it('rejects to_version that is not a positive integer', async () => {
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        to_version: '-3',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({ code: ErrorCodes.INVALID_TYPE, field_path: 'to_version' });
    });
  });

  // =========================================================================
  // 404 logic
  // =========================================================================
  describe('404 — state not found', () => {
    it('returns 404 when to_version is omitted and no state exists', async () => {
      mockGetState.mockReturnValue(null);
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'ghost',
        fields: 'stabilityScore',
      });
      expect(result.statusCode).toBe(404);
      expect(result.body).toMatchObject({ code: ErrorCodes.STATE_NOT_FOUND });
    });

    it('returns 404 when first page returns empty results and no state exists', async () => {
      mockGetState.mockReturnValue(null);
      mockGetStateVersionRange.mockReturnValue({ states: [], nextCursor: null });
      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'ghost',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '5',
      });
      expect(result.statusCode).toBe(404);
      expect(result.body).toMatchObject({ code: ErrorCodes.STATE_NOT_FOUND });
    });
  });

  // =========================================================================
  // Successful response structure
  // =========================================================================
  describe('successful trajectory query', () => {
    it('returns 200 with proper response shape', async () => {
      const states: LearnerState[] = [
        makeLearnerState({
          state_version: 1,
          updated_at: '2026-03-01T10:00:00Z',
          state: { stabilityScore: 0.72 },
        }),
        makeLearnerState({
          state_version: 2,
          updated_at: '2026-03-02T10:00:00Z',
          state: { stabilityScore: 0.55, stabilityScore_direction: 'declining' },
        }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '2',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        org_id: string;
        learner_reference: string;
        fields: string[];
        versions: unknown[];
        summary: Record<string, unknown>;
        next_page_token: string | null;
      };
      expect(body.org_id).toBe('test-org');
      expect(body.learner_reference).toBe('learner-001');
      expect(body.fields).toEqual(['stabilityScore']);
      expect(body.versions).toHaveLength(2);
      expect(body.next_page_token).toBeNull();
    });

    it('populates versions.values and versions.directions correctly', async () => {
      const states: LearnerState[] = [
        makeLearnerState({
          state_version: 1,
          state: { stabilityScore: 0.72 },
        }),
        makeLearnerState({
          state_version: 2,
          state: { stabilityScore: 0.55, stabilityScore_direction: 'declining' },
        }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '2',
      });

      const body = result.body as { versions: Array<{ values: Record<string, unknown>; directions: Record<string, unknown> }> };
      expect(body.versions[0].values.stabilityScore).toBe(0.72);
      expect(body.versions[0].directions.stabilityScore).toBeNull();
      expect(body.versions[1].values.stabilityScore).toBe(0.55);
      expect(body.versions[1].directions.stabilityScore).toBe('declining');
    });

    it('returns null for fields not present in state', async () => {
      const states: LearnerState[] = [
        makeLearnerState({
          state_version: 1,
          state: { otherField: 100 },
        }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '1',
      });

      const body = result.body as { versions: Array<{ values: Record<string, unknown>; directions: Record<string, unknown> }> };
      expect(body.versions[0].values.stabilityScore).toBeNull();
      expect(body.versions[0].directions.stabilityScore).toBeNull();
    });

    it('encodes next_page_token when nextCursor is present', async () => {
      mockGetStateVersionRange.mockReturnValue({
        states: [makeLearnerState({ state_version: 1, state: { s: 1 } })],
        nextCursor: 1,
      });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 's',
        from_version: '1',
        to_version: '5',
      });

      const body = result.body as { next_page_token: string | null };
      expect(body.next_page_token).not.toBeNull();
      expect(typeof body.next_page_token).toBe('string');
    });
  });

  // =========================================================================
  // UNIT-CORE-02: Summary computation
  // =========================================================================
  describe('summary computation', () => {
    it('computes declining direction when latest < first', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { stabilityScore: 0.72 } }),
        makeLearnerState({ state_version: 2, state: { stabilityScore: 0.55 } }),
        makeLearnerState({ state_version: 3, state: { stabilityScore: 0.28 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '3',
      });

      const body = result.body as { summary: Record<string, { first_value: number; latest_value: number; overall_direction: string | null; version_count: number }> };
      expect(body.summary.stabilityScore).toEqual({
        first_value: 0.72,
        latest_value: 0.28,
        overall_direction: 'declining',
        version_count: 3,
      });
    });

    it('computes improving direction when latest > first', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { masteryScore: 0.30 } }),
        makeLearnerState({ state_version: 2, state: { masteryScore: 0.55 } }),
        makeLearnerState({ state_version: 3, state: { masteryScore: 0.80 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'masteryScore',
        from_version: '1',
        to_version: '3',
      });

      const body = result.body as { summary: Record<string, { first_value: number; latest_value: number; overall_direction: string | null; version_count: number }> };
      expect(body.summary.masteryScore).toEqual({
        first_value: 0.30,
        latest_value: 0.80,
        overall_direction: 'improving',
        version_count: 3,
      });
    });

    it('computes stable direction when latest === first', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { score: 0.50 } }),
        makeLearnerState({ state_version: 2, state: { score: 0.50 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'score',
        from_version: '1',
        to_version: '2',
      });

      const body = result.body as { summary: Record<string, { overall_direction: string | null; version_count: number }> };
      expect(body.summary.score.overall_direction).toBe('stable');
      expect(body.summary.score.version_count).toBe(2);
    });

    it('returns null overall_direction when only one version has the field', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { stabilityScore: 0.72 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '1',
      });

      const body = result.body as { summary: Record<string, { first_value: number; latest_value: number; overall_direction: string | null; version_count: number }> };
      expect(body.summary.stabilityScore).toEqual({
        first_value: 0.72,
        latest_value: 0.72,
        overall_direction: null,
        version_count: 1,
      });
    });

    it('skips null/non-numeric values when computing summary', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { stabilityScore: null } }),
        makeLearnerState({ state_version: 2, state: { stabilityScore: 0.60 } }),
        makeLearnerState({ state_version: 3, state: { stabilityScore: 'not-a-number' } }),
        makeLearnerState({ state_version: 4, state: { stabilityScore: 0.80 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '4',
      });

      const body = result.body as { summary: Record<string, { first_value: number; latest_value: number; overall_direction: string | null; version_count: number }> };
      expect(body.summary.stabilityScore).toEqual({
        first_value: 0.60,
        latest_value: 0.80,
        overall_direction: 'improving',
        version_count: 2,
      });
    });

    it('handles field entirely absent from all versions', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { otherField: 10 } }),
        makeLearnerState({ state_version: 2, state: { otherField: 20 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore',
        from_version: '1',
        to_version: '2',
      });

      const body = result.body as { summary: Record<string, { first_value: unknown; latest_value: unknown; overall_direction: string | null; version_count: number }> };
      expect(body.summary.stabilityScore.version_count).toBe(0);
      expect(body.summary.stabilityScore.overall_direction).toBeNull();
    });

    it('supports multiple fields in summary simultaneously', async () => {
      const states: LearnerState[] = [
        makeLearnerState({ state_version: 1, state: { stabilityScore: 0.72, masteryScore: 0.30 } }),
        makeLearnerState({ state_version: 2, state: { stabilityScore: 0.28, masteryScore: 0.80 } }),
      ];
      mockGetStateVersionRange.mockReturnValue({ states, nextCursor: null });

      const result = await handleTrajectoryQueryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        fields: 'stabilityScore,masteryScore',
        from_version: '1',
        to_version: '2',
      });

      const body = result.body as { summary: Record<string, { overall_direction: string | null }> };
      expect(body.summary.stabilityScore.overall_direction).toBe('declining');
      expect(body.summary.masteryScore.overall_direction).toBe('improving');
    });
  });
});
