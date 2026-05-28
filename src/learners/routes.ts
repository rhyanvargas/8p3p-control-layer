/**
 * Learners Routes — GET /learners/:learner_reference/summary
 */

import type { FastifyInstance } from 'fastify';
import { handleLearnerSummary } from './handler.js';

export function registerLearnerRoutes(app: FastifyInstance): void {
  app.get('/learners/:learner_reference/summary', handleLearnerSummary);
}
