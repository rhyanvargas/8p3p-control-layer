/**
 * PoliciesTable DynamoDB Repository
 *
 * Implements admin CRUD access patterns for the PoliciesTable per
 * docs/specs/policy-management-api.md and docs/specs/policy-storage.md.
 *
 * Key schema:
 *   PK: org_id (S)
 *   SK: policy_key (S)
 *
 * policy_version (N) is a monotonic integer auto-incremented on each PUT.
 * It is distinct from policy_json.policy_version (semver string in the content).
 */

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ScanCommand,
  QueryCommand,
  GetItemCommand,
  ConditionalCheckFailedException,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { PolicyDefinition } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';

export interface PolicyRecord {
  org_id: string;
  policy_key: string;
  policy_version: number;
  status: 'active' | 'disabled';
  updated_at: string;
  updated_by: string;
}

export interface PolicyListEntry {
  org_id: string;
  policy_key: string;
  policy_version: number;
  status: 'active' | 'disabled';
  updated_at: string;
  updated_by: string;
}

/** Thrown when a conditional write fails due to version mismatch (409) */
export class VersionConflictError extends Error {
  readonly code = ErrorCodes.VERSION_CONFLICT;
  constructor(message: string) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

/** Thrown when item not found via conditional check (404) */
export class PolicyNotFoundError extends Error {
  readonly code = ErrorCodes.POLICY_NOT_FOUND;
  constructor(org_id: string, policy_key: string) {
    super(`No policy '${policy_key}' found for org '${org_id}'`);
    this.name = 'PolicyNotFoundError';
  }
}

/** Lazily-created DynamoDB client (injectable for testing) */
let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) _client = new DynamoDBClient({});
  return _client;
}

/** Inject a DynamoDB client for testing. Pass null to reset. */
export function _setPoliciesRepoClientForTesting(client: DynamoDBClient | null): void {
  _client = client;
}

function getTableName(): string {
  return process.env.POLICIES_TABLE ?? 'PoliciesTable';
}

/**
 * Truncates the admin key to a safe prefix for updated_by.
 * Stores first 12 chars with ellipsis — never the full key.
 */
function adminKeyPrefix(adminKey: string): string {
  return adminKey.length > 12 ? `${adminKey.slice(0, 12)}…` : adminKey;
}

/**
 * PUT (create or replace) a policy item.
 *
 * - Reads current policy_version via GetItem, then writes new version = current + 1.
 * - When ifMatch is provided: ConditionExpression ensures write fails (409) if
 *   the current version does not match the expected value.
 * - policy_json is stored as a DynamoDB Map (M), not a JSON string.
 */
export async function putPolicy(
  orgId: string,
  policyKey: string,
  policyJson: PolicyDefinition,
  updatedBy: string,
  ifMatch?: number
): Promise<PolicyRecord> {
  const table = getTableName();
  const now = new Date().toISOString();
  const updatedByPrefix = adminKeyPrefix(updatedBy);

  // Read current version to determine next monotonic version
  let nextVersion = 1;
  let currentVersion: number | undefined;

  const existing = await getClient().send(
    new GetItemCommand({
      TableName: table,
      Key: marshall({ org_id: orgId, policy_key: policyKey }),
      ProjectionExpression: 'policy_version',
    })
  );

  if (existing.Item) {
    const item = unmarshall(existing.Item) as { policy_version?: number };
    currentVersion = typeof item.policy_version === 'number' ? item.policy_version : 0;
    nextVersion = currentVersion + 1;
  }

  const marshalledItem = marshall(
    {
      org_id: orgId,
      policy_key: policyKey,
      policy_json: policyJson,
      policy_version: nextVersion,
      status: 'active',
      updated_at: now,
      updated_by: updatedByPrefix,
    },
    { removeUndefinedValues: true }
  );

  const putParams: ConstructorParameters<typeof PutItemCommand>[0] = {
    TableName: table,
    Item: marshalledItem,
  };

  if (ifMatch !== undefined) {
    if (existing.Item) {
      putParams.ConditionExpression = 'policy_version = :expected';
      putParams.ExpressionAttributeValues = marshall({ ':expected': ifMatch });
    } else {
      // New item — If-Match only valid for update; allow creation unconditionally
      putParams.ConditionExpression = 'attribute_not_exists(org_id)';
    }
  }

  try {
    await getClient().send(new PutItemCommand(putParams));
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new VersionConflictError(
        `Policy version conflict. Expected version ${ifMatch}, current is ${currentVersion ?? 'unknown'}. Fetch the latest and retry.`
      );
    }
    throw err;
  }

  return {
    org_id: orgId,
    policy_key: policyKey,
    policy_version: nextVersion,
    status: 'active',
    updated_at: now,
    updated_by: updatedByPrefix,
  };
}

/**
 * PATCH policy status (active | disabled).
 * Uses ConditionExpression to ensure item exists — throws PolicyNotFoundError if not.
 */
export async function patchPolicyStatus(
  orgId: string,
  policyKey: string,
  status: 'active' | 'disabled',
  updatedBy: string
): Promise<PolicyRecord> {
  const table = getTableName();
  const now = new Date().toISOString();
  const updatedByPrefix = adminKeyPrefix(updatedBy);

  try {
    const result = await getClient().send(
      new UpdateItemCommand({
        TableName: table,
        Key: marshall({ org_id: orgId, policy_key: policyKey }),
        UpdateExpression: 'SET #s = :status, updated_at = :now, updated_by = :who',
        ConditionExpression: 'attribute_exists(org_id) AND attribute_exists(policy_key)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({
          ':status': status,
          ':now': now,
          ':who': updatedByPrefix,
        }),
        ReturnValues: 'ALL_NEW',
      })
    );

    const updated = unmarshall(result.Attributes ?? {}) as PolicyRecord;
    return {
      org_id: updated.org_id,
      policy_key: updated.policy_key,
      policy_version: updated.policy_version,
      status: updated.status,
      updated_at: updated.updated_at,
      updated_by: updated.updated_by,
    };
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new PolicyNotFoundError(orgId, policyKey);
    }
    throw err;
  }
}

/**
 * DELETE a policy item. Void return (204 semantics).
 * Throws PolicyNotFoundError if the item does not exist.
 */
export async function deletePolicy(orgId: string, policyKey: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteItemCommand({
        TableName: getTableName(),
        Key: marshall({ org_id: orgId, policy_key: policyKey }),
        ConditionExpression: 'attribute_exists(org_id) AND attribute_exists(policy_key)',
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new PolicyNotFoundError(orgId, policyKey);
    }
    throw err;
  }
}

/**
 * LIST policies. Full Scan when no org_id provided; Query on PK when org_id given.
 * Returns list entries (policy_json excluded to keep response lean).
 *
 * Full Scan is acceptable for pilot — low org count, admin-only, low frequency.
 * Reference: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html
 */
export async function listPolicies(orgId?: string): Promise<PolicyListEntry[]> {
  const table = getTableName();
  const entries: PolicyListEntry[] = [];

  if (orgId) {
    const result = await getClient().send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'org_id = :org',
        ExpressionAttributeValues: marshall({ ':org': orgId }),
        ProjectionExpression: 'org_id, policy_key, policy_version, #s, updated_at, updated_by',
        ExpressionAttributeNames: { '#s': 'status' },
      })
    );

    for (const raw of result.Items ?? []) {
      entries.push(unmarshall(raw) as PolicyListEntry);
    }
  } else {
    let lastKey: Record<string, AttributeValue> | undefined;
    do {
      const result = await getClient().send(
        new ScanCommand({
          TableName: table,
          ProjectionExpression: 'org_id, policy_key, policy_version, #s, updated_at, updated_by',
          ExpressionAttributeNames: { '#s': 'status' },
          ExclusiveStartKey: lastKey,
        })
      );

      for (const raw of result.Items ?? []) {
        entries.push(unmarshall(raw) as PolicyListEntry);
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }

  return entries;
}
