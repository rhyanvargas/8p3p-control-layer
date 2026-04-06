/**
 * DynamoDB State Repository (async)
 *
 * Table design:
 *
 * StateTable:
 *   PK: org_learner (S) = org_id#learner_reference
 *   SK: state_version (N)
 *   Attributes: state_id, updated_at, state (M), last_signal_id, last_signal_timestamp
 *
 * AppliedSignalsTable:
 *   PK: org_learner (S) = org_id#learner_reference
 *   SK: signal_id (S)
 *   Attributes: state_version (N), applied_at (S)
 *
 * Optimistic locking: saveStateWithAppliedSignals uses TransactWriteItems with
 * ConditionExpression on state_version to reject concurrent stale writes.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  type AttributeValue,
  type TransactWriteItem,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { LearnerState } from '../shared/types.js';

export class StateVersionConflictError extends Error {
  readonly code = 'state_version_conflict';
  constructor() {
    super('State version conflict — concurrent write detected');
    this.name = 'StateVersionConflictError';
  }
}

export class DynamoDbStateRepository {
  private readonly client: DynamoDBClient;
  private readonly stateTableName: string;
  private readonly appliedSignalsTableName: string;

  constructor(stateTableName: string, appliedSignalsTableName: string, client?: DynamoDBClient) {
    this.stateTableName = stateTableName;
    this.appliedSignalsTableName = appliedSignalsTableName;
    this.client = client ?? new DynamoDBClient({});
  }

  async getState(orgId: string, learnerReference: string): Promise<LearnerState | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.stateTableName,
        KeyConditionExpression: 'org_learner = :pk',
        ExpressionAttributeValues: marshall({ ':pk': `${orgId}#${learnerReference}` }),
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const item = result.Items?.[0];
    return item ? unmarshallState(unmarshall(item)) : null;
  }

  async getStateByVersion(orgId: string, learnerReference: string, version: number): Promise<LearnerState | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.stateTableName,
        Key: marshall({ org_learner: `${orgId}#${learnerReference}`, state_version: version }),
      })
    );

    return result.Item ? unmarshallState(unmarshall(result.Item)) : null;
  }

  async saveState(state: LearnerState): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.stateTableName,
        Item: marshallState(state),
        ConditionExpression: 'attribute_not_exists(state_version)',
      })
    );
  }

  async saveStateWithAppliedSignals(
    state: LearnerState,
    appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): Promise<void> {
    const transactItems: TransactWriteItem[] = [
      {
        Put: {
          TableName: this.stateTableName,
          Item: marshallState(state),
          ConditionExpression: 'attribute_not_exists(state_version)',
        },
      },
      ...appliedEntries.map((entry) => ({
        Put: {
          TableName: this.appliedSignalsTableName,
          Item: marshall({
            org_learner: `${state.org_id}#${state.learner_reference}`,
            signal_id: entry.signal_id,
            state_version: entry.state_version,
            applied_at: entry.applied_at,
          }),
          ConditionExpression: 'attribute_not_exists(signal_id)',
        },
      })),
    ];

    try {
      await this.client.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        throw new StateVersionConflictError();
      }
      throw err;
    }
  }

  async isSignalApplied(orgId: string, learnerReference: string, signalId: string): Promise<boolean> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.appliedSignalsTableName,
        Key: marshall({ org_learner: `${orgId}#${learnerReference}`, signal_id: signalId }),
        ProjectionExpression: 'signal_id',
      })
    );

    return !!result.Item;
  }

  async recordAppliedSignals(
    orgId: string,
    learnerReference: string,
    entries: Array<{ signal_id: string; state_version: number; applied_at: string }>
  ): Promise<void> {
    if (entries.length === 0) return;

    const transactItems: TransactWriteItem[] = entries.map((entry) => ({
      Put: {
        TableName: this.appliedSignalsTableName,
        Item: marshall({
          org_learner: `${orgId}#${learnerReference}`,
          signal_id: entry.signal_id,
          state_version: entry.state_version,
          applied_at: entry.applied_at,
        }),
        ConditionExpression: 'attribute_not_exists(signal_id)',
      },
    }));

    try {
      await this.client.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
    } catch (err) {
      if (err instanceof TransactionCanceledException) return; // duplicate signals already applied
      throw err;
    }
  }

  async listLearners(
    orgId: string,
    limit: number,
    cursor?: string
  ): Promise<{ learners: Array<{ learner_reference: string; state_version: number; updated_at: string }>; nextCursor: string | null }> {
    const cappedLimit = Math.min(Math.max(1, limit), 500);
    const exclusiveStartKey = cursor ? decodeListCursor(cursor) : undefined;

    // org_learner is the PK — DynamoDB Query requires equality on PK, so we
    // use Scan + FilterExpression for the org prefix. This is acceptable for
    // the /v1/state/list inspection endpoint (low-frequency, bounded by limit).
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.stateTableName,
        FilterExpression: 'begins_with(org_learner, :prefix)',
        ExpressionAttributeValues: marshall({ ':prefix': `${orgId}#` }),
        Limit: (cappedLimit + 1) * 3, // over-fetch to compensate for filter
        ExclusiveStartKey: exclusiveStartKey,
        ProjectionExpression: 'org_learner, state_version, updated_at',
      })
    );

    const items = result.Items ?? [];

    const seen = new Set<string>();
    const learners: Array<{ learner_reference: string; state_version: number; updated_at: string }> = [];

    for (const item of items) {
      if (learners.length >= cappedLimit) break;
      const raw = unmarshall(item) as { org_learner: string; state_version: number; updated_at: string };
      const orgLearner = raw.org_learner;
      const learnerRef = orgLearner.substring(orgId.length + 1);
      if (!seen.has(learnerRef)) {
        seen.add(learnerRef);
        learners.push({ learner_reference: learnerRef, state_version: raw.state_version, updated_at: raw.updated_at });
      }
    }

    const hasMore = learners.length >= cappedLimit && !!result.LastEvaluatedKey;
    const nextCursor = hasMore
      ? encodeListCursor(result.LastEvaluatedKey!)
      : null;

    return { learners, nextCursor };
  }
}

function marshallState(state: LearnerState): Record<string, AttributeValue> {
  return marshall(
    {
      org_learner: `${state.org_id}#${state.learner_reference}`,
      state_version: state.state_version,
      org_id: state.org_id,
      learner_reference: state.learner_reference,
      state_id: state.state_id,
      updated_at: state.updated_at,
      state: state.state,
      last_signal_id: state.provenance.last_signal_id,
      last_signal_timestamp: state.provenance.last_signal_timestamp,
    },
    { removeUndefinedValues: true }
  );
}

function unmarshallState(item: Record<string, unknown>): LearnerState {
  return {
    org_id: item.org_id as string,
    learner_reference: item.learner_reference as string,
    state_id: item.state_id as string,
    state_version: item.state_version as number,
    updated_at: item.updated_at as string,
    state: item.state as Record<string, unknown>,
    provenance: {
      last_signal_id: item.last_signal_id as string,
      last_signal_timestamp: item.last_signal_timestamp as string,
    },
  };
}

function encodeListCursor(lastKey: Record<string, AttributeValue>): string {
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url');
}

function decodeListCursor(cursor: string): Record<string, AttributeValue> | undefined {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as Record<string, AttributeValue>;
  } catch {
    return undefined;
  }
}
