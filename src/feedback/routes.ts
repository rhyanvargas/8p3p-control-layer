import type { FastifyInstance } from 'fastify';
import { feedbackSessionPreHandler } from '../auth/feedback-session-preHandler.js';
import {
  handleGetFeedback,
  handleGetPending,
  handleRecordView,
  handleSubmitFeedback,
} from './handler.js';

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.get('/decisions/feedback/pending', { preHandler: feedbackSessionPreHandler }, handleGetPending);
  app.post('/decisions/:decision_id/feedback', { preHandler: feedbackSessionPreHandler }, handleSubmitFeedback);
  app.get('/decisions/:decision_id/feedback', handleGetFeedback);
  app.post('/decisions/:decision_id/view', { preHandler: feedbackSessionPreHandler }, handleRecordView);
}
