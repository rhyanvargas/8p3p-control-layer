/**
 * Active policy list source for the Policy Inspection API.
 *
 * Primary path: DynamoDB QueryCommand on PoliciesTable (when POLICIES_TABLE env is set).
 * Fallback: filesystem enumeration under src/decision/policies/{orgId}/ (local dev / CI).
 *
 * Both paths exclude routing config items and non-active policies.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DynamoDBClient, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { PolicyDefinition } from '../shared/types.js';
import { validatePolicyStructure } from '../decision/policy-loader.js';

export interface PolicySummary {
  policy_id: string;
  policy_version: string;
  policy_key: string;
  description: string;
  rule_count: number;
  /** Present only when the stored policy still includes the deprecated field. */
  default_decision_type?: string;
}

let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) _client = new DynamoDBClient({});
  return _client;
}

/** Injectable for tests */
export function _setDynamoClientForTesting(client: DynamoDBClient | null): void {
  _client = client;
}

function toSummary(policy: PolicyDefinition, policyKey: string): PolicySummary {
  return {
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    policy_key: policyKey,
    description: policy.description,
    rule_count: policy.rules.length,
    ...(policy.default_decision_type !== undefined
      ? { default_decision_type: policy.default_decision_type }
      : {}),
  };
}

// =============================================================================
// DynamoDB paths
// =============================================================================

async function listActivePoliciesFromDynamo(orgId: string): Promise<PolicySummary[] | null> {
  const tableName = process.env.POLICIES_TABLE;
  if (!tableName) return null;

  try {
    const result = await getClient().send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'org_id = :org_id',
        ExpressionAttributeValues: { ':org_id': { S: orgId } },
      })
    );

    const summaries: PolicySummary[] = [];
    for (const rawItem of result.Items ?? []) {
      const item = unmarshall(rawItem) as Record<string, unknown>;
      if (item['policy_key'] === 'routing') continue;
      if (item['status'] !== 'active') continue;

      const policyJson = item['policy_json'];
      try {
        validatePolicyStructure(policyJson);
        summaries.push(toSummary(policyJson as PolicyDefinition, item['policy_key'] as string));
      } catch {
        // Skip structurally invalid items — degraded gracefully
      }
    }
    return summaries;
  } catch {
    return null; // DynamoDB unavailable — fall through to filesystem
  }
}

async function loadPolicyByKeyFromDynamo(
  orgId: string,
  policyKey: string
): Promise<PolicyDefinition | null> {
  const tableName = process.env.POLICIES_TABLE;
  if (!tableName) return null;

  try {
    const result = await getClient().send(
      new GetItemCommand({
        TableName: tableName,
        Key: { org_id: { S: orgId }, policy_key: { S: policyKey } },
      })
    );

    if (!result.Item) return null;
    const item = unmarshall(result.Item) as Record<string, unknown>;
    if (item['status'] !== 'active') return null;

    const policyJson = item['policy_json'];
    try {
      validatePolicyStructure(policyJson);
      return policyJson as PolicyDefinition;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// =============================================================================
// Filesystem paths
// =============================================================================

const POLICIES_ROOT = (): string =>
  path.join(process.cwd(), 'src/decision/policies');

function listActivePoliciesFromFs(orgId: string): PolicySummary[] {
  const orgDir = path.join(POLICIES_ROOT(), orgId);

  if (fs.existsSync(orgDir)) {
    const files = fs
      .readdirSync(orgDir)
      .filter((f) => f.endsWith('.json') && f !== 'routing.json');

    const summaries: PolicySummary[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(orgDir, file), 'utf-8');
        const raw = JSON.parse(content) as unknown;
        validatePolicyStructure(raw);
        summaries.push(toSummary(raw as PolicyDefinition, file.replace(/\.json$/, '')));
      } catch {
        // Skip unreadable or structurally invalid files
      }
    }
    if (summaries.length > 0) return summaries;
  }

  // Org directory absent or empty — fall back to global default
  const defaultPath = path.join(POLICIES_ROOT(), 'default.json');
  if (fs.existsSync(defaultPath)) {
    try {
      const content = fs.readFileSync(defaultPath, 'utf-8');
      const raw = JSON.parse(content) as unknown;
      validatePolicyStructure(raw);
      return [toSummary(raw as PolicyDefinition, 'default')];
    } catch {
      return [];
    }
  }

  return [];
}

function loadPolicyByKeyFromFs(orgId: string, policyKey: string): PolicyDefinition | null {
  const filePath = path.join(POLICIES_ROOT(), orgId, `${policyKey}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const raw = JSON.parse(content) as unknown;
    validatePolicyStructure(raw);
    return raw as PolicyDefinition;
  } catch {
    return null;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Returns all active policy summaries for an org.
 * Queries DynamoDB when POLICIES_TABLE is set; falls back to filesystem.
 * For orgs with no policies, returns the global default policy summary.
 */
export async function listActivePoliciesForOrg(orgId: string): Promise<PolicySummary[]> {
  const dynamoResult = await listActivePoliciesFromDynamo(orgId);
  if (dynamoResult !== null) {
    if (dynamoResult.length === 0) return listActivePoliciesFromFs(orgId);
    return dynamoResult;
  }
  return listActivePoliciesFromFs(orgId);
}

/**
 * Loads a single policy by exact key for an org — no global fallback.
 * Returns null when the policy is not found or not active.
 *
 * Used by the detail endpoint so that an explicit key request returns 404
 * rather than silently resolving to a default policy.
 */
export async function loadPolicyByKeyForOrg(
  orgId: string,
  policyKey: string
): Promise<PolicyDefinition | null> {
  const dynamoResult = await loadPolicyByKeyFromDynamo(orgId, policyKey);
  if (dynamoResult !== null) return dynamoResult;
  if (process.env.POLICIES_TABLE) return null; // DynamoDB configured but key not found
  return loadPolicyByKeyFromFs(orgId, policyKey);
}
