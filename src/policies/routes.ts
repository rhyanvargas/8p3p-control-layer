/**
 * Policy Inspection Routes — GET /policies and GET /policies/:policy_key
 * Registered under the /v1 prefix in server.ts.
 * Static route is registered before the parametric route to prevent shadowing.
 */

import type { FastifyInstance } from 'fastify';
import { handlePolicyList, handlePolicyDetail } from './handler.js';

export function registerPolicyInspectionRoutes(app: FastifyInstance): void {
  app.get('/policies', handlePolicyList);
  app.get('/policies/:policy_key', handlePolicyDetail);
}
