import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/org-id', () => ({
  getServerOrgId: vi.fn(() => 'org-pilot'),
}));

import { POST } from '@/app/api/preflight/route';
import { getServerOrgId } from '@/lib/org-id';
import { resetServerEnvForTest } from '@/lib/env';

function preflightRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('UPL-PRE-002: preflight disabled without admin key', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetServerEnvForTest();
    process.env.CONTROL_LAYER_API_BASE_URL = 'http://127.0.0.1:9999';
    process.env.CONTROL_LAYER_API_KEY = 'tenant-key';
    delete process.env.CONTROL_LAYER_ADMIN_API_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = envBackup;
    resetServerEnvForTest();
    vi.restoreAllMocks();
  });

  it('returns { disabled: true } without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(
      preflightRequest({ source_system: 'lms-demo', payload: { score: 1 } })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disabled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('UPL-PRE-001: preflight proxy with admin key', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetServerEnvForTest();
    process.env.CONTROL_LAYER_API_BASE_URL = 'http://127.0.0.1:9999';
    process.env.CONTROL_LAYER_API_KEY = 'tenant-key';
    process.env.CONTROL_LAYER_ADMIN_API_KEY = 'admin-secret';
    process.env.CONTROL_LAYER_ORG_ID = 'org-pilot';
    vi.mocked(getServerOrgId).mockReturnValue('org-pilot');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = envBackup;
    resetServerEnvForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns pii_blocking verdict for a forbidden-key sample', async () => {
    const upstreamVerdict = {
      preflight_id: 'pf-test',
      received_at: '2026-06-01T12:00:00Z',
      forbidden_pii: [{ key: 'ssn', path: 'payload.ssn' }],
      forbidden_semantic_raw: [],
      forbidden_semantic_after_mapping: null,
      mapping_suggestions: [],
      verdict: 'pii_blocking',
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamVerdict), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(
      preflightRequest({
        source_system: 'lms-demo',
        payload: { ssn: '123-45-6789', score: 0.5 },
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof upstreamVerdict;
    expect(body.verdict).toBe('pii_blocking');
    expect(body.forbidden_pii).toEqual([{ key: 'ssn', path: 'payload.ssn' }]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:9999/v1/admin/ingestion/preflight');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['x-admin-api-key']).toBe('admin-secret');
    expect(console.error).not.toHaveBeenCalled();

    const sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sentBody).toEqual({
      org_id: 'org-pilot',
      source_system: 'lms-demo',
      payload: { ssn: '123-45-6789', score: 0.5 },
    });
  });

  it('omits org scope when org is not pinned (payload-only dry-run)', async () => {
    vi.mocked(getServerOrgId).mockReturnValue('');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ verdict: 'clean', forbidden_pii: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await POST(
      preflightRequest({ source_system: 'lms-demo', payload: { score: 1 } })
    );

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(sentBody).toEqual({ payload: { score: 1 } });
    expect(sentBody).not.toHaveProperty('org_id');
    expect(sentBody).not.toHaveProperty('source_system');
  });

  it('rejects bodies over 32 KB', async () => {
    const res = await POST(
      preflightRequest({
        source_system: 'lms-demo',
        payload: { blob: 'x'.repeat(33_000) },
      })
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });
});
