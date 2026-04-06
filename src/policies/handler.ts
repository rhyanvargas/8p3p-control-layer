/**
 * Policy Inspection Handlers — GET /v1/policies and GET /v1/policies/:policy_key
 * Read-only, org-scoped. Auth handled by apiKeyPreHandler upstream.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { loadRoutingConfigForOrg } from '../decision/policy-loader.js';
import { listActivePoliciesForOrg, loadPolicyByKeyForOrg } from './active-policies-source.js';
import { ErrorCodes } from '../shared/error-codes.js';

export async function handlePolicyList(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as Record<string, unknown>;
  const orgId = query['org_id'];

  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    reply.status(400);
    await reply.send({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'org_id is required',
      field_path: 'org_id',
    });
    return;
  }

  const [policies, routing] = await Promise.all([
    listActivePoliciesForOrg(orgId),
    Promise.resolve(loadRoutingConfigForOrg(orgId)),
  ]);

  reply.status(200);
  await reply.send({
    org_id: orgId,
    policies,
    routing: routing ?? null,
  });
}

export async function handlePolicyDetail(
  request: FastifyRequest<{ Params: { policy_key: string } }>,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as Record<string, unknown>;
  const orgId = query['org_id'];

  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    reply.status(400);
    await reply.send({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: 'org_id is required',
      field_path: 'org_id',
    });
    return;
  }

  const policyKey = request.params.policy_key;
  const policy = await loadPolicyByKeyForOrg(orgId, policyKey);

  if (!policy) {
    reply.status(404);
    await reply.send({
      error: {
        code: ErrorCodes.POLICY_NOT_FOUND,
        message: `No policy '${policyKey}' found for org '${orgId}'`,
      },
    });
    return;
  }

  reply.status(200);
  await reply.send({
    org_id: orgId,
    policy_key: policyKey,
    policy: {
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      description: policy.description,
      rules: policy.rules,
      default_decision_type: policy.default_decision_type,
    },
  });
}
