import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';
import { getFeedbackRepository } from './sqlite-repository.js';
import {
  handleListAdminProductFeedbackCore,
  handleSubmitCsatFeedbackCore,
  handleSubmitGeneralFeedbackCore,
} from './product-handler-core.js';

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

export async function handleSubmitProductFeedback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
  const now = new Date().toISOString();
  const result = await handleSubmitGeneralFeedbackCore({
    orgId,
    sessionId,
    body: request.body,
    now,
    repo,
  });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'submitProductFeedback rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}

export async function handleSubmitProductCsatFeedback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
  const now = new Date().toISOString();
  const result = await handleSubmitCsatFeedbackCore({
    orgId,
    sessionId,
    body: request.body,
    now,
    repo,
  });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'submitProductCsatFeedback rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}

export async function handleGetAdminProductFeedback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const orgId = readOrgId(request);
  if (!orgId) {
    void reply.status(400).send({ code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required.' });
    return;
  }
  const repo = getFeedbackRepository();
  if (!repo) {
    void reply.status(500).send({ error: 'Feedback store not initialized.' });
    return;
  }
  const query =
    request.query && typeof request.query === 'object' && !Array.isArray(request.query)
      ? (request.query as Record<string, unknown>)
      : {};
  const result = await handleListAdminProductFeedbackCore({ orgId, query, repo });
  if (result.statusCode >= 400) {
    request.log.warn({ statusCode: result.statusCode, body: result.body }, 'getAdminProductFeedback rejected');
  }
  void reply.status(result.statusCode).send(result.body);
}
