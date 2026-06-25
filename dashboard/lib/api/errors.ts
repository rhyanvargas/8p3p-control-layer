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

/** Context-specific overrides for mutation flows (e.g. review save). */
export type UserFacingErrorContext = 'default' | 'review';

export type UserFacingErrorAction = {
  label: string;
  href: string;
};

export type UserFacingError = {
  message: string;
  description: string;
  code: string | null;
  requestId: string | null;
  status: number | null;
  action?: UserFacingErrorAction;
};

/** Legacy plain-string error bodies mapped to canonical codes. */
const LEGACY_ERROR_STRING_TO_CODE: Record<string, string> = {
  'Invalid server configuration.': 'invalid_server_configuration',
};

/**
 * User-facing copy keyed by canonical API error code.
 * Never expose keys, upstream URLs, stack traces, or env var values here.
 */
const USER_FACING_ERROR_MESSAGES: Record<string, string> = {
  dashboard_upstream_unavailable: 'Service unavailable, retrying.',
  api_key_required: "You don't have access to this data.",
  api_key_invalid: "You don't have access to this data.",
  not_found: 'The requested resource was not found.',
  session_required: 'Sign in to continue.',
  invalid_server_configuration:
    'Review could not be saved. Set COOKIE_SECRET (32+ characters) on both the API and dashboard, restart both services, then sign in again.',
  decision_not_found: 'This decision is no longer available.',
  invalid_reason_category: 'Choose a reason before submitting.',
  suggested_decision_type_required: 'Select the action type you expected.',
};

/** Review-save flow uses tighter, action-specific copy where it helps educators. */
const REVIEW_CONTEXT_MESSAGE_OVERRIDES: Record<string, string> = {
  session_required: 'Session expired. Sign in again to save your review.',
  invalid_server_configuration:
    'Review could not be saved. Set COOKIE_SECRET (32+ characters) on both the API and dashboard, restart both services, then sign in again.',
  decision_not_found: 'This decision is no longer available.',
  invalid_reason_category: 'Choose a reason before submitting.',
  suggested_decision_type_required: 'Select the action type you expected.',
  dashboard_upstream_unavailable: 'Could not reach the control layer. Try again.',
};

const ERROR_CODE_ACTIONS: Record<string, UserFacingErrorAction> = {
  session_required: { label: 'Sign in', href: '/login' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts a canonical error code from any supported API error body shape:
 * - `{ code: 'session_required' }`
 * - `{ error: 'session_required' }`
 * - `{ error: { code: 'session_required' } }`
 * - legacy `{ error: 'Invalid server configuration.' }`
 */
export function extractErrorCode(body: unknown): string | null {
  if (!isRecord(body)) return null;

  const topLevelCode = body.code;
  if (typeof topLevelCode === 'string' && topLevelCode.length > 0) {
    return topLevelCode;
  }

  if ('error' in body) {
    const err = body.error;
    if (typeof err === 'string') {
      return LEGACY_ERROR_STRING_TO_CODE[err] ?? err;
    }
    if (isRecord(err) && typeof err.code === 'string' && err.code.length > 0) {
      return err.code;
    }
  }

  return null;
}

export function getUserFacingMessageByCode(
  code: string,
  context: UserFacingErrorContext = 'default'
): string | undefined {
  if (context === 'review' && REVIEW_CONTEXT_MESSAGE_OVERRIDES[code]) {
    return REVIEW_CONTEXT_MESSAGE_OVERRIDES[code];
  }
  return USER_FACING_ERROR_MESSAGES[code];
}

/** @deprecated Prefer getUserFacingMessageByCode — kept for existing imports. */
export function getReasonCodeMessage(code: string): string | undefined {
  return getUserFacingMessageByCode(code);
}

export function formatErrorDescription(message: string, requestId: string | null): string {
  return requestId ? `${message} (${requestId})` : message;
}

export function getErrorAction(code: string | null): UserFacingErrorAction | undefined {
  if (!code) return undefined;
  return ERROR_CODE_ACTIONS[code];
}

/**
 * Resolves a safe, actionable user message plus optional sign-in action.
 * Use for toasts and inline error UI; pair with logApiError for diagnostics.
 */
export function getUserFacingError(
  error: unknown,
  options: { context?: UserFacingErrorContext; fallbackMessage?: string } = {}
): UserFacingError {
  const context = options.context ?? 'default';
  const requestId = getErrorRequestId(error);
  const status = getErrorStatus(error);
  const code = error instanceof ApiError ? extractErrorCode(error.body) : null;

  let message: string;
  if (code) {
    const mapped = getUserFacingMessageByCode(code, context);
    if (mapped) {
      message = mapped;
    } else {
      message = getSafeErrorMessage(error);
    }
  } else {
    message =
      error instanceof ApiError
        ? getSafeErrorMessage(error)
        : (options.fallbackMessage ?? 'Something went wrong.');
  }

  return {
    message,
    description: formatErrorDescription(message, requestId),
    code,
    requestId,
    status,
    action: getErrorAction(code),
  };
}

/**
 * Logs API failures with safe fields only (no body, cookies, or secrets).
 * Reference ID is included so operators can correlate with server logs.
 */
export function logApiError(context: string, error: unknown): void {
  const facing = getUserFacingError(error);
  console.error('[dashboard-api]', context, {
    status: facing.status,
    code: facing.code,
    requestId: facing.requestId,
  });
}

export function isUpstreamUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 502) return false;
  return extractErrorCode(error.body) === 'dashboard_upstream_unavailable';
}

export function getErrorRequestId(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.requestId) return error.requestId;
    if (isRecord(error.body) && typeof error.body.request_id === 'string') {
      const id = error.body.request_id;
      if (id.length > 0) return id;
    }
  }
  return null;
}

/** User-facing copy for ErrorState — never exposes keys, upstream URLs, or stack traces. */
export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = extractErrorCode(error.body);
    if (code) {
      const mapped = getUserFacingMessageByCode(code);
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
