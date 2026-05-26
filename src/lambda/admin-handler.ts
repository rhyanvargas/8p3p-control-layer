/**
 * Admin Lambda Handler
 *
 * Minimal Fastify app exposing only /v1/admin routes via aws-lambda-fastify.
 * Deployed as AdminFunction in the CDK stack.
 *
 * Route coverage:
 *   PUT    /v1/admin/policies/:org_id/:policy_key
 *   PATCH  /v1/admin/policies/:org_id/:policy_key
 *   POST   /v1/admin/policies/validate
 *   DELETE /v1/admin/policies/:org_id/:policy_key
 *   GET    /v1/admin/policies
 *   PUT    /v1/admin/mappings/:org_id/:source_system
 *   GET    /v1/admin/mappings/:org_id
 *   POST   /v1/admin/ingestion/preflight
 *
 * Auth: adminApiKeyPreHandler (x-admin-api-key, checked against ADMIN_API_KEY env)
 * IAM:  AdminFunction is granted read-write on PoliciesTable in CDK stack
 *
 * @see infra/lib/control-layer-stack.ts — AdminFunction, IAM grant
 * @see docs/specs/policy-management-api.md
 */

import awsLambdaFastify from 'aws-lambda-fastify';
import Fastify from 'fastify';
import { adminApiKeyPreHandler } from '../auth/admin-api-key-middleware.js';
import { registerPolicyManagementRoutes } from '../admin/policy-management-routes.js';
import { registerAdminFieldMappingsRoutes } from '../routes/admin-field-mappings.js';
import { registerAdminIngestionPreflightRoutes } from '../routes/admin-ingestion-preflight.js';

const app = Fastify({ logger: true });

app.register(
  async (admin) => {
    admin.addHook('preHandler', adminApiKeyPreHandler);
    registerPolicyManagementRoutes(admin);
    registerAdminFieldMappingsRoutes(admin);
    registerAdminIngestionPreflightRoutes(admin);
  },
  { prefix: '/v1/admin' }
);

export const handler = awsLambdaFastify(app);
