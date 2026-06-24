import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => void) => {
      callback();
    },
  };
});

import { GET } from '@/app/api/control/[...path]/route';
import { resetServerEnvForTest } from '@/lib/env';

describe('OBS-001/OBS-002: proxy request-id and failure logging', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetServerEnvForTest();
    process.env.CONTROL_LAYER_API_BASE_URL = 'http://127.0.0.1:9999';
    process.env.CONTROL_LAYER_API_KEY = 'test-key';
    process.env.CONTROL_LAYER_ORG_ID = 'test-org';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = envBackup;
    resetServerEnvForTest();
    vi.restoreAllMocks();
  });

  it('returns request_id and x-request-id on upstream failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    );

    const req = new Request('http://localhost/api/control/v1/state/list');
    const res = await GET(req, { params: Promise.resolve({ path: ['v1', 'state', 'list'] }) });

    expect(res.status).toBe(502);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as { error: string; request_id: string };
    expect(body.error).toBe('dashboard_upstream_unavailable');
    expect(body.request_id).toBe(res.headers.get('x-request-id'));
    expect(console.error).toHaveBeenCalled();

    const logged = JSON.stringify(console.error.mock.calls);
    expect(logged).not.toContain('test-key');
    expect(logged).not.toContain('x-api-key');
    expect(logged).toContain('fetch_failed');
  });

  it('forwards inbound x-request-id upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-request-id': 'inbound-id' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/control/v1/state/list', {
      headers: { 'x-request-id': 'inbound-id' },
    });
    await GET(req, { params: Promise.resolve({ path: ['v1', 'state', 'list'] }) });

    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get('x-request-id')).toBe('inbound-id');
  });
});
