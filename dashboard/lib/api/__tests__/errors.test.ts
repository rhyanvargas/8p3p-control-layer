import { describe, expect, it } from 'vitest';

import { ApiError, getErrorRequestId, getReasonCodeMessage, getSafeErrorMessage } from '@/lib/api/errors';

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

  it('falls back for unknown codes', () => {
    const err = new ApiError('fail', 400, { error: 'some_internal_code_xyz' });
    expect(getSafeErrorMessage(err)).toBe('Unable to load data.');
  });
});
