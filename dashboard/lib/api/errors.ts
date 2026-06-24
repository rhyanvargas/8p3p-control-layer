export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly requestId?: string;

  constructor(message: string, status: number, body?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

const REASON_CODE_MESSAGES: Record<string, string> = {
  dashboard_upstream_unavailable: 'Service unavailable, retrying.',
  api_key_required: "You don't have access to this data.",
  api_key_invalid: "You don't have access to this data.",
  not_found: 'The requested resource was not found.',
};

function extractBodyErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  if ('error' in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = (err as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return null;
}

export function getReasonCodeMessage(code: string): string | undefined {
  return REASON_CODE_MESSAGES[code];
}

export function isUpstreamUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 502) return false;
  return extractBodyErrorCode(error.body) === 'dashboard_upstream_unavailable';
}

export function getErrorRequestId(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.requestId) return error.requestId;
    if (typeof error.body === 'object' && error.body !== null && 'request_id' in error.body) {
      const id = (error.body as { request_id: unknown }).request_id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  }
  return null;
}

/** User-facing copy for ErrorState — never exposes keys, upstream URLs, or stack traces. */
export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = extractBodyErrorCode(error.body);
    if (code) {
      const mapped = getReasonCodeMessage(code);
      if (mapped) return mapped;
    }
  }

  if (isUpstreamUnavailable(error)) {
    return 'Service unavailable, retrying.';
  }

  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
      case 403:
        return "You don't have access to this data.";
      case 404:
        return 'The requested resource was not found.';
      case 502:
        return 'Service unavailable.';
      case 503:
        return 'Service is temporarily unavailable.';
      default:
        if (error.status >= 500) {
          return 'Something went wrong on our end.';
        }
        return 'Unable to load data.';
    }
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (
      msg.includes('http://') ||
      msg.includes('https://') ||
      msg.includes('x-api-key') ||
      msg.includes('CONTROL_LAYER') ||
      msg.includes('\n    at ')
    ) {
      return 'Unable to load data.';
    }
  }

  return 'Unable to load data.';
}

export function getErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status;
  return null;
}
