import type { FastifyInstance } from 'fastify';
import { feedbackSessionPreHandler } from '../auth/feedback-session-preHandler.js';
import { productFeedbackSessionPreHandler } from '../auth/product-feedback-session-preHandler.js';
import {
  handleGetFeedback,
  handleGetPending,
  handleRecordView,
  handleSubmitFeedback,
} from './handler.js';
import {
  handleGetAdminProductFeedback,
  handleSubmitProductCsatFeedback,
  handleSubmitProductFeedback,
} from './product-handler.js';

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.get('/decisions/feedback/pending', { preHandler: feedbackSessionPreHandler }, handleGetPending);
  app.post('/decisions/:decision_id/feedback', { preHandler: feedbackSessionPreHandler }, handleSubmitFeedback);
  app.get('/decisions/:decision_id/feedback', handleGetFeedback);
  app.post('/decisions/:decision_id/view', { preHandler: feedbackSessionPreHandler }, handleRecordView);

  app.post('/feedback', { preHandler: productFeedbackSessionPreHandler }, handleSubmitProductFeedback);
  app.post('/feedback/csat', { preHandler: productFeedbackSessionPreHandler }, handleSubmitProductCsatFeedback);
}

export function registerAdminProductFeedbackRoutes(app: FastifyInstance): void {
  app.get('/feedback', handleGetAdminProductFeedback);
}
