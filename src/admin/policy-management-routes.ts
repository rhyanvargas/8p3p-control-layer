/**
 * Admin Policy Management Routes
 *
 * Registers the admin policy CRUD endpoints under the /v1/admin prefix
 * (applied at registration site in server.ts).
 *
 * All routes require x-admin-api-key (enforced by adminApiKeyPreHandler at
 * the scope level — not checked here individually).
 *
 * @see docs/specs/policy-management-api.md
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validatePolicyStructure } from '../decision/policy-loader.js';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  putPolicy,
  patchPolicyStatus,
  deletePolicy,
  listPolicies,
  VersionConflictError,
  PolicyNotFoundError,
} from './policies-dynamodb.js';

// ---------------------------------------------------------------------------
// Request type helpers
// ---------------------------------------------------------------------------

interface OrgKeyParams {
  org_id: string;
  policy_key: string;
}

interface ListQuery {
  org_id?: string;
}

interface PatchBody {
  status: unknown;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getAdminKey(request: FastifyRequest): string {
  const h = request.headers['x-admin-api-key'];
  return typeof h === 'string' ? h : Array.isArray(h) ? (h[0] ?? '') : '';
}

function validationErrorResponse(message: string) {
  return {
    error: {
      code: ErrorCodes.INVALID_POLICY_STRUCTURE,
      message,
    },
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPolicyManagementRoutes(app: FastifyInstance): void {
  /**
   * PUT /policies/:org_id/:policy_key
   * Create or replace a policy. Validates body before writing.
   * Optional If-Match header for optimistic locking.
   */
  app.put(
    '/policies/:org_id/:policy_key',
    async (
      request: FastifyRequest<{ Params: OrgKeyParams }>,
      reply: FastifyReply
    ) => {
      const { org_id, policy_key } = request.params;
      const body = request.body;

      // Validate policy structure before touching DynamoDB
      try {
        validatePolicyStructure(body);
      } catch (err) {
        return reply
          .status(400)
          .send(validationErrorResponse(err instanceof Error ? err.message : String(err)));
      }

      // Parse optional If-Match header
      let ifMatch: number | undefined;
      const ifMatchHeader = request.headers['if-match'];
      if (ifMatchHeader) {
        const raw = typeof ifMatchHeader === 'string' ? ifMatchHeader : ifMatchHeader[0];
        const parsed = raw ? parseInt(raw, 10) : NaN;
        if (Number.isNaN(parsed)) {
          return reply.status(400).send({
            error: { code: ErrorCodes.INVALID_FORMAT, message: 'If-Match must be an integer policy_version' },
          });
        }
        ifMatch = parsed;
      }

      const adminKey = getAdminKey(request);

      try {
        const record = await putPolicy(org_id, policy_key, body, adminKey, ifMatch);
        return reply.status(200).send(record);
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return reply.status(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  /**
   * PATCH /policies/:org_id/:policy_key
   * Toggle policy status only (active | disabled).
   * Returns 404 if policy does not exist.
   */
  app.patch(
    '/policies/:org_id/:policy_key',
    async (
      request: FastifyRequest<{ Params: OrgKeyParams; Body: PatchBody }>,
      reply: FastifyReply
    ) => {
      const { org_id, policy_key } = request.params;
      const { status } = request.body;

      if (status !== 'active' && status !== 'disabled') {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.INVALID_STATUS_VALUE,
            message: 'status must be "active" or "disabled"',
          },
        });
      }

      const adminKey = getAdminKey(request);

      try {
        const record = await patchPolicyStatus(org_id, policy_key, status, adminKey);
        return reply.status(200).send(record);
      } catch (err) {
        if (err instanceof PolicyNotFoundError) {
          return reply.status(404).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  /**
   * POST /policies/validate
   * Validate a PolicyDefinition body without writing to DynamoDB.
   * Pure in-process validation — no side effects.
   */
  app.post(
    '/policies/validate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body;

      try {
        validatePolicyStructure(body);
        return reply.status(200).send({ valid: true });
      } catch (err) {
        return reply.status(400).send({
          valid: false,
          error: {
            code: ErrorCodes.INVALID_POLICY_STRUCTURE,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  );

  /**
   * DELETE /policies/:org_id/:policy_key
   * Permanently remove a policy record.
   * Returns 204 on success, 404 if not found.
   */
  app.delete(
    '/policies/:org_id/:policy_key',
    async (
      request: FastifyRequest<{ Params: OrgKeyParams }>,
      reply: FastifyReply
    ) => {
      const { org_id, policy_key } = request.params;

      try {
        await deletePolicy(org_id, policy_key);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof PolicyNotFoundError) {
          return reply.status(404).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  /**
   * GET /policies
   * List all policies (Scan). Supports optional org_id filter (Query).
   */
  app.get(
    '/policies',
    async (
      request: FastifyRequest<{ Querystring: ListQuery }>,
      reply: FastifyReply
    ) => {
      const { org_id } = request.query;
      const policies = await listPolicies(org_id);
      return reply.status(200).send({ policies, count: policies.length });
    }
  );
}
