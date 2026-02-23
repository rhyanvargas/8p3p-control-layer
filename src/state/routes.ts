/**
 * State Query Routes
 * Registers GET /state and GET /state/list for Inspection API
 */

import type { FastifyInstance } from 'fastify';
import { handleStateQuery, handleStateListQuery } from './handler.js';

/**
 * Register State query routes with Fastify
 *
 * Routes:
 * - GET /state - Get learner state (single learner, optional version)
 * - GET /state/list - List learners for an org (paginated)
 */
export function registerStateRoutes(app: FastifyInstance): void {
  app.get('/state', handleStateQuery);
  app.get('/state/list', handleStateListQuery);
}
