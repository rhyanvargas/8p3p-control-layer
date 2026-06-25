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

import { GET, POST } from '@/app/api/control/[...path]/route';
import { FB_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/session-cookie-edge';
import { resetServerEnvForTest } from '@/lib/env';

const SIGNED_SESSION = 'abc123.signature.payload';

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

describe('REVIEW-UX-010: fb_session injection on feedback/view POST', () => {
  const envBackup = { ...process.env };
  const feedbackPath = ['v1', 'decisions', 'd1', 'feedback'] as const;

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

  it('injects fb_session on POST feedback when dp_session is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ feedback_id: 'fb-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/control/v1/decisions/d1/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${SIGNED_SESSION}`,
      },
      body: JSON.stringify({ action: 'approve' }),
    });

    await POST(req, { params: Promise.resolve({ path: [...feedbackPath] }) });

    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get('Cookie')).toBe(`${FB_SESSION_COOKIE_NAME}=${SIGNED_SESSION}`);
  });

  it('injects fb_session on POST view when __Host-dp_session is present', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ recorded: true, viewed_at: '2026-06-24T12:00:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/control/v1/decisions/d1/view', {
      method: 'POST',
      headers: {
        cookie: `__Host-dp_session=${SIGNED_SESSION}`,
      },
    });

    await POST(req, {
      params: Promise.resolve({ path: ['v1', 'decisions', 'd1', 'view'] }),
    });

    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get('Cookie')).toBe(`${FB_SESSION_COOKIE_NAME}=${SIGNED_SESSION}`);

    vi.unstubAllEnvs();
  });

  it('does not inject Cookie on GET feedback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ decision_id: 'd1', feedback: [], latest_action: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/control/v1/decisions/d1/feedback', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${SIGNED_SESSION}`,
      },
    });

    await GET(req, { params: Promise.resolve({ path: [...feedbackPath] }) });

    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get('Cookie')).toBeNull();
  });

  it('does not inject Cookie on POST feedback when session cookie is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'session_required', message: 'Dashboard session cookie required.' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/control/v1/decisions/d1/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: [...feedbackPath] }) });

    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get('Cookie')).toBeNull();
    expect(res.status).toBe(401);
  });
});
