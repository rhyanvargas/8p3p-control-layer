/**
 * FastifyRequest augmentation for educator feedback session id (opaque).
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `feedbackSessionPreHandler` after valid `fb_session` cookie. */
    feedbackSessionId?: string;
  }
}
