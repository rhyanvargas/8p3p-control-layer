import { after } from 'next/server';

import { getServerEnv } from '@/lib/env';
import {
  FB_SESSION_COOKIE_NAME,
  isFeedbackProxyPath,
  readDashboardSessionCookieValue,
} from '@/lib/session-cookie-edge';

const UPSTREAM_TIMEOUT_MS = 10_000;

const SAFE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-type',
  'etag',
  'last-modified',
  'x-request-id',
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function upstreamUnavailable(requestId: string): Response {
  return Response.json(
    { error: 'dashboard_upstream_unavailable', request_id: requestId },
    { status: 502, headers: { 'x-request-id': requestId } }
  );
}

function buildUpstreamUrl(baseUrl: string, pathSegments: string[], searchParams: URLSearchParams): URL {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const upstream = new URL(`${normalizedBase}/${pathSegments.join('/')}`);

  searchParams.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });

  return upstream;
}

function injectOrgIdIntoSearchParams(searchParams: URLSearchParams, orgId: string | undefined): void {
  if (orgId && !searchParams.has('org_id')) {
    searchParams.set('org_id', orgId);
  }
}

function resolveRequestId(request: Request): string {
  return request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}

function logProxyEvent(payload: Record<string, unknown>): void {
  after(() => {
    console.error('[dashboard-proxy]', JSON.stringify(payload));
  });
}

async function prepareRequestBody(
  request: Request,
  orgId: string | undefined,
  requestId: string
): Promise<{ body?: BodyInit; contentType?: string }> {
  const contentType = request.headers.get('content-type') ?? undefined;

  if (request.method === 'GET' || request.method === 'HEAD') {
    return {};
  }

  if (contentType?.includes('application/json')) {
    const rawBody = await request.text();
    if (!rawBody) return { contentType };

    if (!orgId) {
      return { body: rawBody, contentType };
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (parsed.org_id === undefined || parsed.org_id === null || parsed.org_id === '') {
        parsed.org_id = orgId;
        return { body: JSON.stringify(parsed), contentType: 'application/json' };
      }
    } catch (err) {
      logProxyEvent({
        requestId,
        method: request.method,
        status: 'json_parse_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return { body: rawBody, contentType };
  }

  const body = await request.arrayBuffer();
  return body.byteLength > 0 ? { body, contentType } : { contentType };
}

function pickSafeResponseHeaders(upstream: Response, requestId: string): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  if (!headers.has('x-request-id')) {
    headers.set('x-request-id', requestId);
  }
  return headers;
}

async function proxyRequest(request: Request, pathSegments: string[]): Promise<Response> {
  if (pathSegments.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const requestId = resolveRequestId(request);
  const env = getServerEnv();
  const incomingUrl = new URL(request.url);
  const searchParams = new URLSearchParams(incomingUrl.searchParams);
  injectOrgIdIntoSearchParams(searchParams, env.CONTROL_LAYER_ORG_ID);

  const upstreamUrl = buildUpstreamUrl(env.CONTROL_LAYER_API_BASE_URL, pathSegments, searchParams);
  const { body, contentType } = await prepareRequestBody(request, env.CONTROL_LAYER_ORG_ID, requestId);

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('x-api-key', env.CONTROL_LAYER_API_KEY);
  upstreamHeaders.set('x-request-id', requestId);

  const accept = request.headers.get('accept');
  if (accept) upstreamHeaders.set('accept', accept);
  if (contentType) upstreamHeaders.set('content-type', contentType);

  if (request.method === 'POST' && isFeedbackProxyPath(pathSegments)) {
    const sessionValue = readDashboardSessionCookieValue(request);
    if (sessionValue) {
      upstreamHeaders.set('Cookie', `${FB_SESSION_COOKIE_NAME}=${sessionValue}`);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body,
      signal: controller.signal,
      cache: 'no-store',
    });

    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: pickSafeResponseHeaders(upstream, requestId),
    });
  } catch (err) {
    logProxyEvent({
      requestId,
      method: request.method,
      url: upstreamUrl.toString(),
      status: 'fetch_failed',
      message: err instanceof Error ? err.message : String(err),
    });
    return upstreamUnavailable(requestId);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handle(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
