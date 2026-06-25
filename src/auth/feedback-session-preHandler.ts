import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  FEEDBACK_SESSION_COOKIE_NAME,
  verifySession,
} from './session-cookie.js';

export async function feedbackSessionPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const secret = process.env.COOKIE_SECRET ?? '';
  if (!secret || secret.length < 32) {
    request.log.error('COOKIE_SECRET missing or shorter than 32 characters');
    void reply.status(500).send({
      code: ErrorCodes.INVALID_SERVER_CONFIGURATION,
      message: 'Server session secret is not configured.',
    });
    return;
  }

  const raw = request.cookies?.[FEEDBACK_SESSION_COOKIE_NAME];
  const value = typeof raw === 'string' ? raw : '';
  if (!value) {
    void reply.status(401).send({
      code: ErrorCodes.SESSION_REQUIRED,
      message: 'Dashboard session cookie required.',
    });
    return;
  }

  const { valid } = verifySession(secret, value);
  if (!valid) {
    void reply.status(401).send({
      code: ErrorCodes.SESSION_REQUIRED,
      message: 'Dashboard session cookie required.',
    });
    return;
  }

  const dot = value.indexOf('.');
  const sigHex = dot > 0 ? value.slice(0, dot) : '';
  const sessionId = sigHex.length >= 32 ? sigHex.slice(0, 32) : sigHex;
  request.feedbackSessionId = sessionId;
}
