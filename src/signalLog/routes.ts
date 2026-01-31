/**
 * Signal Log Routes
 * Registers GET /signals endpoint with Fastify
 */

import type { FastifyInstance } from 'fastify';
import { handleSignalLogQuery } from './handler.js';

/**
 * Register Signal Log routes with Fastify
 * 
 * @param app - Fastify instance
 */
export function registerSignalLogRoutes(app: FastifyInstance): void {
  /**
   * GET /signals
   * Query the signal log for a learner's signals within a time range
   * 
   * Query Parameters:
   * - org_id (required): Organization ID
   * - learner_reference (required): Learner identifier
   * - from_time (required): Start of time range (RFC3339)
   * - to_time (required): End of time range (RFC3339)
   * - page_token (optional): Pagination token from previous response
   * - page_size (optional): Number of results per page (1-1000, default 100)
   * 
   * Response:
   * - 200: SignalLogReadResponse with signals and pagination
   * - 400: Validation error
   */
  app.get('/signals', handleSignalLogQuery);
}
