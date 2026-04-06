/**
 * DynamoDB Signal Log Repository (async)
 *
 * Table design (SignalsTable):
 *   PK: org_id (S)
 *   SK: signal_id (S)
 *   GSI1 (gsi1-learner-time): PK = org_id (S), SK = learner_timestamp (S = learner_reference#accepted_at)
 *
 * Immutable append-only: PutItem with attribute_not_exists condition.
 * Pagination: ExclusiveStartKey serialized as base64url JSON page_token.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  BatchGetItemCommand,
  ConditionalCheckFailedException,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  SignalEnvelope,
  SignalRecord,
  SignalLogReadRequest,
} from '../shared/types.js';

export interface DynamoSignalLogQueryResult {
  signals: SignalRecord[];
  hasMore: boolean;
  nextPageToken: string | null;
}

export class DynamoDbSignalLogRepository {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    this.tableName = tableName;
    this.client = client ?? new DynamoDBClient({});
  }

  async appendSignal(signal: SignalEnvelope, acceptedAt: string): Promise<SignalRecord> {
    const item = marshall(
      {
        org_id: signal.org_id,
        signal_id: signal.signal_id,
        source_system: signal.source_system,
        learner_reference: signal.learner_reference,
        timestamp: signal.timestamp,
        schema_version: signal.schema_version,
        payload: signal.payload,
        ...(signal.metadata ? { metadata: signal.metadata } : {}),
        accepted_at: acceptedAt,
        learner_timestamp: `${signal.learner_reference}#${acceptedAt}`,
      },
      { removeUndefinedValues: true }
    );

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(signal_id)',
        })
      );
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }

    return { ...signal, accepted_at: acceptedAt };
  }

  async querySignals(request: SignalLogReadRequest): Promise<DynamoSignalLogQueryResult> {
    const pageSize = Math.min(Math.max(1, request.page_size ?? 100), 1000);
    const learnerFrom = `${request.learner_reference}#${request.from_time}`;
    const learnerTo = `${request.learner_reference}#${request.to_time}`;

    const exclusiveStartKey = request.page_token
      ? decodePageToken(request.page_token)
      : undefined;

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi1-learner-time',
        KeyConditionExpression: 'org_id = :org AND learner_timestamp BETWEEN :from AND :to',
        ExpressionAttributeValues: marshall({
          ':org': request.org_id,
          ':from': learnerFrom,
          ':to': learnerTo,
        }),
        Limit: pageSize + 1,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items = result.Items ?? [];
    const hasMore = items.length > pageSize;
    const pageItems = hasMore ? items.slice(0, pageSize) : items;
    const signals = pageItems.map((item) => unmarshallSignalRecord(unmarshall(item)));

    const nextToken =
      hasMore && result.LastEvaluatedKey
        ? encodePageToken(result.LastEvaluatedKey)
        : null;

    return { signals, hasMore, nextPageToken: nextToken };
  }

  async getSignalsByIds(orgId: string, signalIds: string[]): Promise<SignalRecord[]> {
    if (signalIds.length === 0) return [];

    const BATCH_LIMIT = 100;
    const allRecords: SignalRecord[] = [];

    for (let i = 0; i < signalIds.length; i += BATCH_LIMIT) {
      const chunk = signalIds.slice(i, i + BATCH_LIMIT);
      const keys = chunk.map((id) => marshall({ org_id: orgId, signal_id: id }));
      const result = await this.client.send(
        new BatchGetItemCommand({ RequestItems: { [this.tableName]: { Keys: keys } } })
      );
      const items = result.Responses?.[this.tableName] ?? [];
      allRecords.push(...items.map((item) => unmarshallSignalRecord(unmarshall(item))));
    }

    const foundIds = new Set(allRecords.map((r) => r.signal_id));
    for (const id of signalIds) {
      if (!foundIds.has(id)) {
        const err = new Error(`Signal ${id} not found in org ${orgId}`) as Error & { code: string };
        err.code = 'unknown_signal_id';
        throw err;
      }
    }

    return allRecords;
  }
}

function unmarshallSignalRecord(item: Record<string, unknown>): SignalRecord {
  return {
    org_id: item.org_id as string,
    signal_id: item.signal_id as string,
    source_system: item.source_system as string,
    learner_reference: item.learner_reference as string,
    timestamp: item.timestamp as string,
    schema_version: item.schema_version as string,
    payload: item.payload as Record<string, unknown>,
    metadata: item.metadata as SignalRecord['metadata'],
    accepted_at: item.accepted_at as string,
  };
}

function encodePageToken(lastKey: Record<string, AttributeValue>): string {
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url');
}

function decodePageToken(token: string): Record<string, AttributeValue> | undefined {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as Record<string, AttributeValue>;
  } catch {
    return undefined;
  }
}
