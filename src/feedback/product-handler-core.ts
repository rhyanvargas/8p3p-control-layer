import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  PRODUCT_FEEDBACK_CATEGORIES,
  PRODUCT_FEEDBACK_LIST_MAX_LIMIT,
  PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH,
  PRODUCT_FEEDBACK_PAGE_CONTEXT_MAX_LENGTH,
  PRODUCT_FEEDBACK_APP_VERSION_MAX_LENGTH,
  PRODUCT_FEEDBACK_TYPES,
  type CsatScoreBucket,
  type CsatSummary,
  type GetAdminProductFeedbackResponse,
  type ProductFeedbackCategory,
  type ProductFeedbackRecord,
  type ProductFeedbackType,
  type SubmitProductCsatResponse,
  type SubmitProductFeedbackResponse,
} from '../shared/types.js';
import type { FeedbackRepository, ProductFeedbackListFilters } from './repository.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function emptyCsatDistribution(): Record<CsatScoreBucket, number> {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

export function computeCsatSummary(rows: ProductFeedbackRecord[]): CsatSummary {
  const distribution = emptyCsatDistribution();
  let sum = 0;
  let count = 0;

  for (const row of rows) {
    if (row.kind !== 'csat' || row.csat_score == null) continue;
    const score = row.csat_score;
    if (!Number.isInteger(score) || score < 1 || score > 5) continue;
    const bucket = String(score) as CsatScoreBucket;
    distribution[bucket] += 1;
    sum += score;
    count += 1;
  }

  return {
    count,
    mean: count === 0 ? 0 : Math.round((sum / count) * 10) / 10,
    distribution,
  };
}

function parseOptionalString(
  value: unknown,
  maxLength: number
): { ok: true; value: string | null } | { ok: false; code: string; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, code: ErrorCodes.INVALID_TYPE, message: 'Field must be a string.' };
  }
  if (value.length > maxLength) {
    return { ok: false, code: ErrorCodes.INVALID_LENGTH, message: `Field exceeds ${maxLength} characters.` };
  }
  return { ok: true, value: value.length === 0 ? null : value };
}

function parseFeedbackType(value: unknown): ProductFeedbackType | null {
  if (typeof value !== 'string') return null;
  return PRODUCT_FEEDBACK_TYPES.includes(value as ProductFeedbackType)
    ? (value as ProductFeedbackType)
    : null;
}

function parseCategory(value: unknown): ProductFeedbackCategory | null {
  if (value === undefined || value === null) return 'other';
  if (typeof value !== 'string') return null;
  return PRODUCT_FEEDBACK_CATEGORIES.includes(value as ProductFeedbackCategory)
    ? (value as ProductFeedbackCategory)
    : null;
}

function parseCsatScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && /^-?\d+$/.test(value.trim())) {
    return parseInt(value, 10);
  }
  return null;
}

function normalizeListLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return 100;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(Math.floor(n), PRODUCT_FEEDBACK_LIST_MAX_LIMIT);
}

export async function handleSubmitGeneralFeedbackCore(input: {
  orgId: string;
  sessionId: string;
  body: unknown;
  now: string;
  repo: FeedbackRepository;
}): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const { orgId, sessionId, body, now, repo } = input;

  if (!isPlainObject(body)) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_REQUEST_BODY, message: 'Request body must be a JSON object.' },
    };
  }

  if ('csat_score' in body && body.csat_score !== undefined && body.csat_score !== null) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.CSAT_SCORE_FORBIDDEN, message: 'csat_score must be omitted on POST /v1/feedback.' },
    };
  }

  const feedbackType = parseFeedbackType(body.feedback_type);
  if (feedbackType === null) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.FEEDBACK_TYPE_REQUIRED, message: 'feedback_type is required and must be a valid value.' },
    };
  }

  const category = parseCategory(body.category);
  if (category === null) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_CATEGORY, message: 'category is not in the closed set.' },
    };
  }

  const messageRaw = body.message;
  if (messageRaw === undefined || messageRaw === null) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.MESSAGE_REQUIRED, message: 'message is required.' },
    };
  }
  if (typeof messageRaw !== 'string' || messageRaw.trim().length === 0) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.MESSAGE_REQUIRED, message: 'message must be non-empty.' },
    };
  }
  if (messageRaw.length > PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.MESSAGE_TOO_LONG, message: `message exceeds ${PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH} characters.` },
    };
  }

  const pageContext = parseOptionalString(body.page_context, PRODUCT_FEEDBACK_PAGE_CONTEXT_MAX_LENGTH);
  if (!pageContext.ok) {
    return { statusCode: 400, body: { code: pageContext.code, message: pageContext.message } };
  }

  const appVersion = parseOptionalString(body.app_version, PRODUCT_FEEDBACK_APP_VERSION_MAX_LENGTH);
  if (!appVersion.ok) {
    return { statusCode: 400, body: { code: appVersion.code, message: appVersion.message } };
  }

  const record: ProductFeedbackRecord = {
    feedback_id: randomUUID(),
    org_id: orgId,
    session_id: sessionId,
    kind: 'general',
    feedback_type: feedbackType,
    category,
    csat_score: null,
    message: messageRaw,
    page_context: pageContext.value,
    app_version: appVersion.value,
    created_at: now,
  };

  await repo.insertProductFeedback(record);

  const resBody: SubmitProductFeedbackResponse = {
    feedback_id: record.feedback_id,
    kind: 'general',
    feedback_type: feedbackType,
    category,
    created_at: now,
  };
  return { statusCode: 201, body: resBody as unknown as Record<string, unknown> };
}

export async function handleSubmitCsatFeedbackCore(input: {
  orgId: string;
  sessionId: string;
  body: unknown;
  now: string;
  repo: FeedbackRepository;
}): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const { orgId, sessionId, body, now, repo } = input;

  if (!isPlainObject(body)) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_REQUEST_BODY, message: 'Request body must be a JSON object.' },
    };
  }

  if (body.feedback_type !== undefined && body.feedback_type !== null) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.INVALID_REQUEST_BODY,
        message: 'feedback_type must be omitted on POST /v1/feedback/csat.',
      },
    };
  }
  if (body.category !== undefined && body.category !== null) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.INVALID_REQUEST_BODY,
        message: 'category must be omitted on POST /v1/feedback/csat.',
      },
    };
  }

  const csatScore = parseCsatScore(body.csat_score);
  if (csatScore === null || csatScore < 1 || csatScore > 5) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_CSAT_SCORE, message: 'csat_score must be an integer from 1 to 5.' },
    };
  }

  const messageRaw = body.message;
  if (messageRaw !== undefined && messageRaw !== null) {
    if (typeof messageRaw !== 'string') {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_TYPE, message: 'message must be a string when present.' },
      };
    }
    if (messageRaw.length > PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH) {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.MESSAGE_TOO_LONG, message: `message exceeds ${PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH} characters.` },
      };
    }
  }

  const pageContext = parseOptionalString(body.page_context, PRODUCT_FEEDBACK_PAGE_CONTEXT_MAX_LENGTH);
  if (!pageContext.ok) {
    return { statusCode: 400, body: { code: pageContext.code, message: pageContext.message } };
  }

  const appVersion = parseOptionalString(body.app_version, PRODUCT_FEEDBACK_APP_VERSION_MAX_LENGTH);
  if (!appVersion.ok) {
    return { statusCode: 400, body: { code: appVersion.code, message: appVersion.message } };
  }

  const message =
    messageRaw === undefined || messageRaw === null
      ? null
      : typeof messageRaw === 'string' && messageRaw.length === 0
        ? null
        : (messageRaw as string);

  const record: ProductFeedbackRecord = {
    feedback_id: randomUUID(),
    org_id: orgId,
    session_id: sessionId,
    kind: 'csat',
    feedback_type: null,
    category: null,
    csat_score: csatScore,
    message,
    page_context: pageContext.value,
    app_version: appVersion.value,
    created_at: now,
  };

  await repo.insertProductFeedback(record);

  const resBody: SubmitProductCsatResponse = {
    feedback_id: record.feedback_id,
    kind: 'csat',
    csat_score: csatScore,
    created_at: now,
  };
  return { statusCode: 201, body: resBody as unknown as Record<string, unknown> };
}

export async function handleListAdminProductFeedbackCore(input: {
  orgId: string;
  query: Record<string, unknown>;
  repo: FeedbackRepository;
}): Promise<{ statusCode: number; body: GetAdminProductFeedbackResponse | Record<string, unknown> }> {
  const { orgId, query, repo } = input;

  const filters: ProductFeedbackListFilters = {
    limit: normalizeListLimit(query.limit),
  };

  if (query.kind !== undefined && query.kind !== null && query.kind !== '') {
    if (query.kind !== 'general' && query.kind !== 'csat') {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_TYPE, message: 'kind must be general or csat.' },
      };
    }
    filters.kind = query.kind;
  }

  if (query.feedback_type !== undefined && query.feedback_type !== null && query.feedback_type !== '') {
    const ft = parseFeedbackType(query.feedback_type);
    if (ft === null) {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.FEEDBACK_TYPE_REQUIRED, message: 'feedback_type filter is not valid.' },
      };
    }
    filters.feedback_type = ft;
  }

  if (query.category !== undefined && query.category !== null && query.category !== '') {
    const cat = parseCategory(query.category);
    if (cat === null) {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_CATEGORY, message: 'category filter is not valid.' },
      };
    }
    filters.category = cat;
  }

  if (query.since !== undefined && query.since !== null && query.since !== '') {
    if (typeof query.since !== 'string') {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_TIMESTAMP, message: 'since must be an RFC3339 timestamp string.' },
      };
    }
    filters.since = query.since;
  }

  const items = await repo.listProductFeedback(orgId, filters);

  const summaryFilters: ProductFeedbackListFilters = {
    kind: 'csat',
    category: filters.category,
    since: filters.since,
    limit: PRODUCT_FEEDBACK_LIST_MAX_LIMIT,
  };
  if (filters.kind === 'general') {
    return {
      statusCode: 200,
      body: { org_id: orgId, items, csat_summary: computeCsatSummary([]) },
    };
  }
  if (filters.kind === 'csat') {
    return {
      statusCode: 200,
      body: { org_id: orgId, items, csat_summary: computeCsatSummary(items) },
    };
  }

  const csatRows = await repo.listProductFeedback(orgId, summaryFilters);
  return {
    statusCode: 200,
    body: { org_id: orgId, items, csat_summary: computeCsatSummary(csatRows) },
  };
}
