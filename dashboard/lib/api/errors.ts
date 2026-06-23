export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function isUpstreamUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 502) return false;
  return (
    typeof error.body === 'object' &&
    error.body !== null &&
    'error' in error.body &&
    (error.body as { error: string }).error === 'dashboard_upstream_unavailable'
  );
}

/** User-facing copy for ErrorState — never exposes keys, upstream URLs, or stack traces. */
export function getSafeErrorMessage(error: unknown): string {
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
