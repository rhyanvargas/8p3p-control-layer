import 'server-only';

import { ApiError } from '@/lib/api/errors';
import { getServerEnv } from '@/lib/env';

const UPSTREAM_TIMEOUT_MS = 10_000;

function normalizePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function buildUpstreamUrl(
  baseUrl: string,
  path: string,
  pinnedOrgId: string | undefined
): URL {
  const [pathPart, queryPart] = normalizePath(path).split('?', 2);
  const searchParams = new URLSearchParams(queryPart ?? '');

  if (pinnedOrgId && !searchParams.has('org_id')) {
    searchParams.set('org_id', pinnedOrgId);
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const upstream = new URL(`${normalizedBase}/${pathPart}`);

  searchParams.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });

  return upstream;
}

async function parseErrorBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;

  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Direct upstream fetch for RSC first paint; attaches server key without a browser hop. */
export async function serverApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const env = getServerEnv();
  const upstreamUrl = buildUpstreamUrl(
    env.CONTROL_LAYER_API_BASE_URL,
    path,
    env.CONTROL_LAYER_ORG_ID
  );

  const headers = new Headers(init?.headers);
  headers.set('x-api-key', env.CONTROL_LAYER_API_KEY);

  const accept = init?.headers instanceof Headers ? init.headers.get('accept') : undefined;
  if (accept) headers.set('accept', accept);
  else if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const method = init?.method?.toUpperCase() ?? 'GET';
  const hasBody = init?.body != null && method !== 'GET' && method !== 'HEAD';
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(upstreamUrl, {
      ...init,
      method,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      const contentType = res.headers.get('content-type') ?? '';
      const body = await parseErrorBody(res);

      if (res.status === 404 && contentType.includes('text/html')) {
        throw new ApiError(
          'CONTROL_LAYER_API_BASE_URL is hitting the Next.js dashboard, not the Fastify API. Run the API at repo root (`npm run dev`, port 3000) and the dashboard on port 3001 (`cd dashboard && npm run dev`), or set CONTROL_LAYER_API_BASE_URL to the API port.',
          502,
          { error: 'dashboard_upstream_not_api', path }
        );
      }

      throw new ApiError(`API error ${res.status}: ${path}`, res.status, body);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('dashboard_upstream_unavailable', 502, {
      error: 'dashboard_upstream_unavailable',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
