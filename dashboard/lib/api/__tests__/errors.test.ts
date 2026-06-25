import { describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  extractErrorCode,
  formatErrorDescription,
  getErrorRequestId,
  getReasonCodeMessage,
  getSafeErrorMessage,
  getUserFacingError,
  getUserFacingMessageByCode,
} from '@/lib/api/errors';

describe('OBS-003: ErrorState request id helper', () => {
  it('extracts request id from ApiError', () => {
    const err = new ApiError('fail', 502, { request_id: 'abc-123' }, 'header-id');
    expect(getErrorRequestId(err)).toBe('header-id');
  });

  it('falls back to body request_id', () => {
    const err = new ApiError('fail', 502, { request_id: 'body-id' });
    expect(getErrorRequestId(err)).toBe('body-id');
  });
});

describe('extractErrorCode', () => {
  it('reads top-level code (feedback API shape)', () => {
    expect(extractErrorCode({ code: 'session_required', message: 'Dashboard session cookie required.' })).toBe(
      'session_required'
    );
  });

  it('reads string error field as code', () => {
    expect(extractErrorCode({ error: 'dashboard_upstream_unavailable' })).toBe(
      'dashboard_upstream_unavailable'
    );
  });

  it('reads nested error.code', () => {
    expect(extractErrorCode({ error: { code: 'api_key_invalid', message: 'nope' } })).toBe('api_key_invalid');
  });

  it('maps legacy Invalid server configuration string', () => {
    expect(extractErrorCode({ error: 'Invalid server configuration.' })).toBe('invalid_server_configuration');
  });
});

describe('OBS-004: reason-code friendly messages', () => {
  it('maps known upstream codes', () => {
    expect(getReasonCodeMessage('dashboard_upstream_unavailable')).toBe(
      'Service unavailable, retrying.'
    );
  });

  it('uses friendly copy via getSafeErrorMessage for known 502 body', () => {
    const err = new ApiError('fail', 502, { error: 'dashboard_upstream_unavailable' });
    expect(getSafeErrorMessage(err)).toBe('Service unavailable, retrying.');
  });

  it('maps invalid_server_configuration to actionable copy', () => {
    expect(getUserFacingMessageByCode('invalid_server_configuration')).toContain('COOKIE_SECRET');
  });

  it('falls back for unknown codes', () => {
    const err = new ApiError('fail', 400, { error: 'some_internal_code_xyz' });
    expect(getSafeErrorMessage(err)).toBe('Unable to load data.');
  });

  it('maps session_required from top-level code body', () => {
    const err = new ApiError('fail', 401, {
      code: 'session_required',
      message: 'Dashboard session cookie required.',
    });
    expect(getSafeErrorMessage(err)).toBe('Sign in to continue.');
  });
});

describe('getUserFacingError', () => {
  it('uses review-context copy and sign-in action for session_required', () => {
    const err = new ApiError('fail', 401, { code: 'session_required' }, 'req-xyz');
    const facing = getUserFacingError(err, { context: 'review' });

    expect(facing.message).toBe('Session expired. Sign in again to save your review.');
    expect(facing.description).toBe(`${facing.message} (req-xyz)`);
    expect(facing.action).toEqual({ label: 'Sign in', href: '/login' });
  });

  it('surfaces config guidance for invalid_server_configuration', () => {
    const err = new ApiError(
      'fail',
      500,
      { code: 'invalid_server_configuration', message: 'Server session secret is not configured.' },
      'req-config'
    );
    const facing = getUserFacingError(err, { context: 'review' });

    expect(facing.message).toContain('COOKIE_SECRET');
    expect(facing.description).toContain('req-config');
    expect(facing.action).toBeUndefined();
  });

  it('uses fallback message for non-ApiError', () => {
    const facing = getUserFacingError(new Error('network blew up'), {
      fallbackMessage: 'Custom fallback.',
    });
    expect(facing.message).toBe('Custom fallback.');
  });
});

describe('formatErrorDescription', () => {
  it('appends request id when present', () => {
    expect(formatErrorDescription('Save failed.', 'abc-123')).toBe('Save failed. (abc-123)');
  });

  it('returns message alone when no request id', () => {
    expect(formatErrorDescription('Save failed.', null)).toBe('Save failed.');
  });
});

describe('logApiError', () => {
  it('logs safe diagnostic fields only', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logApiError } = await import('@/lib/api/errors');
    const err = new ApiError(
      'fail',
      500,
      { code: 'invalid_server_configuration', cookie: 'must-not-log' },
      'req-safe'
    );

    logApiError('review.save', err);

    expect(console.error).toHaveBeenCalledWith('[dashboard-api]', 'review.save', {
      status: 500,
      code: 'invalid_server_configuration',
      requestId: 'req-safe',
    });
    vi.restoreAllMocks();
  });
});
