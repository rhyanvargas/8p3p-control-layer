/**
 * Lambda: QueryFunction — GET /v1/signals, /v1/decisions, /v1/receipts, educator feedback routes
 *
 * Routes by path; calls async DynamoDB adapters then delegates validation+formatting
 * to handler-core functions (reusing the framework-agnostic business logic).
 *
 * Handler: dist/lambda/query.handler
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { FEEDBACK_SESSION_COOKIE_NAME, verifySession } from '../auth/session-cookie.js';
import { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import { DynamoDbFeedbackRepository } from '../feedback/dynamodb-repository.js';
import { validateSignalLogQuery } from '../signalLog/validator.js';
import { validateGetDecisionsRequest } from '../decision/validator.js';
import type { Decision } from '../shared/types.js';
import type { SignalLogReadResponse, GetDecisionsResponse, GetReceiptsResponse, Receipt } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  handleGetFeedbackCore,
  handleGetPendingCore,
  handleRecordViewCore,
  handleSubmitFeedbackCore,
} from '../feedback/handler-core.js';

let initialized = false;
let signalLogRepo: DynamoDbSignalLogRepository;
let decisionRepo: DynamoDbDecisionRepository;
let feedbackRepo: DynamoDbFeedbackRepository | null = null;

function init(): void {
  if (initialized) return;
  signalLogRepo = new DynamoDbSignalLogRepository(process.env.SIGNALS_TABLE!);
  decisionRepo = new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!);
  const ft = process.env.FEEDBACK_TABLE?.trim();
  if (ft) {
    feedbackRepo = new DynamoDbFeedbackRepository(ft);
  }
  initialized = true;
}

function errorResponse(statusCode: number, error: string, code: string, field_path?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, code, field_path }),
  };
}

function jsonResult(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function parseCookieHeader(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function readCookie(event: APIGatewayProxyEvent, name: string): string {
  const single = event.headers?.Cookie ?? event.headers?.cookie;
  const fromSingle = single ? parseCookieHeader(single)[name] : '';
  if (fromSingle) return fromSingle;
  const multi = event.multiValueHeaders?.Cookie ?? event.multiValueHeaders?.cookie;
  if (multi) {
    for (const line of multi) {
      const v = parseCookieHeader(line)[name];
      if (v) return v;
    }
  }
  return '';
}

function effectiveOrgId(event: APIGatewayProxyEvent, query: Record<string, string | undefined>): string | undefined {
  const o = process.env.API_KEY_ORG_ID?.trim();
  if (o) return o;
  const q = query.org_id;
  return q && q.trim() !== '' ? q : undefined;
}

function feedbackSessionId(event: APIGatewayProxyEvent): { ok: true; sessionId: string } | { ok: false; status: number; body: unknown } {
  const secret = process.env.COOKIE_SECRET ?? '';
  if (!secret || secret.length < 32) {
    return { ok: false, status: 500, body: { error: 'Invalid server configuration.' } };
  }
  const raw = readCookie(event, FEEDBACK_SESSION_COOKIE_NAME);
  if (!raw) {
    return {
      ok: false,
      status: 401,
      body: { code: ErrorCodes.SESSION_REQUIRED, message: 'Dashboard session cookie required.' },
    };
  }
  const { valid } = verifySession(secret, raw);
  if (!valid) {
    return {
      ok: false,
      status: 401,
      body: { code: ErrorCodes.SESSION_REQUIRED, message: 'Dashboard session cookie required.' },
    };
  }
  const dot = raw.indexOf('.');
  const sigHex = dot > 0 ? raw.slice(0, dot) : '';
  const sessionId = sigHex.length >= 32 ? sigHex.slice(0, 32) : sigHex;
  return { ok: true, sessionId };
}

function normalizeApiPath(path: string): string {
  const i = path.indexOf('/v1/');
  return i >= 0 ? path.slice(i) : path;
}

async function handleGetSignals(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateSignalLogQuery(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await signalLogRepo.querySignals(validation.parsed!);
  const response: SignalLogReadResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    signals: result.signals,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

async function handleGetDecisions(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateGetDecisionsRequest(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await decisionRepo.getDecisions(validation.parsed!);
  const response: GetDecisionsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    decisions: result.decisions,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

async function handleGetReceipts(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateGetDecisionsRequest(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await decisionRepo.getDecisions(validation.parsed!);
  const receipts: Receipt[] = result.decisions.map((d) => ({
    decision_id: d.decision_id,
    decision_type: d.decision_type,
    decided_at: d.decided_at,
    trace: d.trace,
  }));

  const response: GetReceiptsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    receipts,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

function getDecisionByIdLambda(orgId: string, decisionId: string): Promise<Decision | null> {
  return decisionRepo.getDecisionById(orgId, decisionId);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  init();

  const params = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
  const path = normalizeApiPath(event.path);
  const method = event.httpMethod.toUpperCase();

  if (path.match(/^\/v1\/signals$/) && method === 'GET') return handleGetSignals(params);
  if (path.match(/^\/v1\/decisions$/) && method === 'GET') return handleGetDecisions(params);
  if (path.match(/^\/v1\/receipts$/) && method === 'GET') return handleGetReceipts(params);

  if (feedbackRepo) {
    if (method === 'GET' && path.endsWith('/decisions/feedback/pending')) {
      const orgId = effectiveOrgId(event, params);
      if (!orgId) {
        return jsonResult(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
      }
      const sess = feedbackSessionId(event);
      if (!sess.ok) return jsonResult(sess.status, sess.body);
      const olderRaw = params.older_than_days;
      const olderThanDays =
        olderRaw === undefined
          ? 3
          : (() => {
              const n = parseInt(olderRaw, 10);
              return Number.isFinite(n) && n >= 0 ? n : 3;
            })();
      const now = new Date().toISOString();
      const result = await handleGetPendingCore({
        orgId,
        olderThanDays,
        now,
        repo: feedbackRepo,
      });
      return jsonResult(result.statusCode, result.body);
    }

    const viewMatch = path.match(/^\/v1\/decisions\/([^/]+)\/view$/);
    if (viewMatch && method === 'POST') {
      const orgId = effectiveOrgId(event, params);
      if (!orgId) {
        return jsonResult(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
      }
      const decisionId = viewMatch[1]!;
      const sess = feedbackSessionId(event);
      if (!sess.ok) return jsonResult(sess.status, sess.body);
      const now = new Date().toISOString();
      const result = await handleRecordViewCore({
        orgId,
        decisionId,
        sessionId: sess.sessionId,
        now,
        repo: feedbackRepo,
        getDecisionById: getDecisionByIdLambda,
      });
      return jsonResult(result.statusCode, result.body);
    }

    const fbMatch = path.match(/^\/v1\/decisions\/([^/]+)\/feedback$/);
    if (fbMatch) {
      const decisionId = fbMatch[1]!;
      const orgId = effectiveOrgId(event, params);
      if (!orgId) {
        return jsonResult(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
      }
      if (method === 'GET') {
        const result = await handleGetFeedbackCore({
          orgId,
          decisionId,
          repo: feedbackRepo,
          getDecisionById: getDecisionByIdLambda,
        });
        return jsonResult(result.statusCode, result.body);
      }
      if (method === 'POST') {
        const sess = feedbackSessionId(event);
        if (!sess.ok) return jsonResult(sess.status, sess.body);
        let body: unknown = {};
        if (event.body) {
          try {
            body = JSON.parse(event.body) as unknown;
          } catch {
            return jsonResult(400, { code: ErrorCodes.INVALID_ACTION, message: 'Invalid JSON body.' });
          }
        }
        const now = new Date().toISOString();
        const result = await handleSubmitFeedbackCore({
          orgId,
          decisionId,
          sessionId: sess.sessionId,
          body,
          now,
          repo: feedbackRepo,
          getDecisionById: getDecisionByIdLambda,
        });
        return jsonResult(result.statusCode, result.body);
      }
    }
  }

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Not Found' }),
  };
};
