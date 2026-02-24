/**
 * Decision Routes
 * Registers GET /decisions and GET /receipts endpoints with Fastify.
 * Follows src/signalLog/routes.ts pattern.
 */

import type { FastifyInstance } from 'fastify';
import { handleGetDecisions } from './handler.js';
import { handleGetReceipts } from './receipts-handler.js';

/**
 * Register Decision routes with Fastify
 *
 * @param app - Fastify instance
 */
export function registerDecisionRoutes(app: FastifyInstance): void {
  /**
   * GET /decisions
   * Query persisted decisions for a learner within a time range
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
   * - 200: GetDecisionsResponse with decisions and pagination
   * - 400: Validation error
   */
  app.get('/decisions', handleGetDecisions);

  /**
   * GET /receipts
   * Compliance/audit query — projection of decision trace (decision_id, decision_type, decided_at, trace).
   * Same query params and pagination as GET /decisions.
   *
   * Response:
   * - 200: GetReceiptsResponse with receipts and pagination
   * - 400: Validation error (same codes as decisions)
   */
  app.get('/receipts', handleGetReceipts);
}
