import { ApiError } from '@/lib/api/errors';

const PROXY_PREFIX = '/api/control';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? 'GET';
  const hasBody = init?.body != null && method !== 'GET' && method !== 'HEAD';

  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return headers;
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

/** Same-origin proxy; server attaches x-api-key (TASK-003). Browser must never send the key. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY_PREFIX}${normalizePath(path)}`, {
    ...init,
    headers: buildHeaders(init),
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiError(`API error ${res.status}: ${path}`, res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
