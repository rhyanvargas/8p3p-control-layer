import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';
import { getDecisionById } from '../decision/store.js';
import { getFeedbackRepository } from './sqlite-repository.js';
import {
  handleGetFeedbackCore,
  handleGetPendingCore,
  handleRecordViewCore,
  handleSubmitFeedbackCore,
} from './handler-core.js';

function readOrgId(request: FastifyRequest): string | undefined {
  const override = process.env.API_KEY_ORG_ID?.trim();
  if (override) return override;
  if (request.query && typeof request.query === 'object') {
    const q = (request.query as Record<string, unknown>).org_id;
    if (typeof q === 'string' && q.trim() !== '') return q;
  }
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    const b = (request.body as Record<string, unknown>).org_id;
    if (typeof b === 'string' && b.trim() !== '') return b;
  }
  return undefined;
}

function parseOlderThanDays(raw: unknown): number {
  if (raw === undefined || raw === null) return 3;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 0) return 3;
  return n;
}

export async function handleSubmitFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const orgId = readOrgId(request);
  if (!orgId) {
    void reply.status(400).send({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
    return;
  }
  const decisionId = (request.params as { decision_id?: string }).decision_id;
  if (!decisionId) {
    void reply.status(400).send({ code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'decision_id is required.' });
    return;
  }
  const sessionId = request.feedbackSessionId;
  if (!sessionId) {
    void reply.status(401).send({ code: ErrorCodes.SESSION_REQUIRED, message: 'Dashboard session cookie required.' });
    return;
  }
  const repo = getFeedbackRepository();
  if (!repo) {
    void reply.status(500).send({ error: 'Feedback store not initialized.' });
    return;
  }
  const now = new Date().toISOString();
  const result = await handleSubmitFeedbackCore({
    orgId,
    decisionId,
    sessionId,
    body: request.body,
    now,
    repo,
    getDecisionById,
  });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'submitFeedback rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}

export async function handleGetFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const orgId = readOrgId(request);
  if (!orgId) {
    void reply.status(400).send({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
    return;
  }
  const decisionId = (request.params as { decision_id?: string }).decision_id;
  if (!decisionId) {
    void reply.status(400).send({ code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'decision_id is required.' });
    return;
  }
  const repo = getFeedbackRepository();
  if (!repo) {
    void reply.status(500).send({ error: 'Feedback store not initialized.' });
    return;
  }
  const result = await handleGetFeedbackCore({ orgId, decisionId, repo, getDecisionById });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'getFeedback rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}

export async function handleRecordView(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const orgId = readOrgId(request);
  if (!orgId) {
    void reply.status(400).send({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
    return;
  }
  const decisionId = (request.params as { decision_id?: string }).decision_id;
  if (!decisionId) {
    void reply.status(400).send({ code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'decision_id is required.' });
    return;
  }
  const sessionId = request.feedbackSessionId;
  if (!sessionId) {
    void reply.status(401).send({ code: ErrorCodes.SESSION_REQUIRED, message: 'Dashboard session cookie required.' });
    return;
  }
  const repo = getFeedbackRepository();
  if (!repo) {
    void reply.status(500).send({ error: 'Feedback store not initialized.' });
    return;
  }
  const now = new Date().toISOString();
  const result = await handleRecordViewCore({
    orgId,
    decisionId,
    sessionId,
    now,
    repo,
    getDecisionById,
  });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'recordView rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}

export async function handleGetPending(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const orgId = readOrgId(request);
  if (!orgId) {
    void reply.status(400).send({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
    return;
  }
  const sessionId = request.feedbackSessionId;
  if (!sessionId) {
    void reply.status(401).send({ code: ErrorCodes.SESSION_REQUIRED, message: 'Dashboard session cookie required.' });
    return;
  }
  const repo = getFeedbackRepository();
  if (!repo) {
    void reply.status(500).send({ error: 'Feedback store not initialized.' });
    return;
  }
  const olderThanDays = parseOlderThanDays((request.query as Record<string, unknown> | undefined)?.older_than_days);
  const now = new Date().toISOString();
  const result = await handleGetPendingCore({ orgId, olderThanDays, now, repo });
  if (result.statusCode === 501) {
    request.log.warn({ body: result.body }, 'getPending not implemented on this path');
  }
  void reply.status(result.statusCode).send(result.body);
}
