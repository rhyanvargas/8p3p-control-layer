/**
 * DynamoDB Ingestion Log Repository (async)
 *
 * Table design (IngestionLogTable):
 *   PK: org_id (S)
 *   SK: received_at_signal_id (S) = received_at#signal_id  (for time-descending order and pagination)
 *   Attributes: source_system, learner_reference, timestamp, schema_version,
 *               outcome, rejection_code, rejection_message, rejection_field_path
 *
 * Append-only: PutItem only; no UPDATE or DELETE.
 * Pagination: ExclusiveStartKey serialized as base64url JSON.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type QueryCommandInput,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { IngestionOutcomeEntry, IngestionOutcome, GetIngestionOutcomesRequest } from '../shared/types.js';

export class DynamoDbIngestionLogRepository {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    this.tableName = tableName;
    this.client = client ?? new DynamoDBClient({});
  }

  async appendIngestionOutcome(entry: IngestionOutcomeEntry): Promise<void> {
    const sk = `${entry.received_at}#${entry.signal_id}`;

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(
          {
            org_id: entry.org_id,
            received_at_signal_id: sk,
            signal_id: entry.signal_id,
            source_system: entry.source_system,
            learner_reference: entry.learner_reference,
            timestamp: entry.timestamp,
            schema_version: entry.schema_version,
            outcome: entry.outcome,
            received_at: entry.received_at,
            ...(entry.rejection_reason
              ? {
                  rejection_code: entry.rejection_reason.code,
                  rejection_message: entry.rejection_reason.message,
                  rejection_field_path: entry.rejection_reason.field_path ?? null,
                }
              : {}),
          },
          { removeUndefinedValues: true }
        ),
      })
    );
  }

  async getIngestionOutcomes(
    request: GetIngestionOutcomesRequest
  ): Promise<{ entries: IngestionOutcome[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(1, request.limit ?? 50), 500);
    const exclusiveStartKey = request.cursor ? decodePageToken(request.cursor) : undefined;

    const queryParams: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'org_id = :org',
      ExpressionAttributeValues: marshall({ ':org': request.org_id }),
      ScanIndexForward: false,
      Limit: limit + 1,
      ExclusiveStartKey: exclusiveStartKey,
    };

    if (request.outcome) {
      queryParams.FilterExpression = 'outcome = :outcome';
      queryParams.ExpressionAttributeValues = {
        ...queryParams.ExpressionAttributeValues,
        ...marshall({ ':outcome': request.outcome }),
      };
    }

    const result = await this.client.send(new QueryCommand(queryParams));
    const items = result.Items ?? [];
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    const entries = pageItems.map((item) => unmarshallIngestionOutcome(unmarshall(item)));
    const nextCursor = hasMore && result.LastEvaluatedKey
      ? encodePageToken(result.LastEvaluatedKey)
      : null;

    return { entries, nextCursor };
  }
}

function unmarshallIngestionOutcome(item: Record<string, unknown>): IngestionOutcome {
  const rejectionCode = item.rejection_code as string | null | undefined;

  return {
    signal_id: item.signal_id as string,
    source_system: item.source_system as string,
    learner_reference: item.learner_reference as string,
    timestamp: item.timestamp as string,
    schema_version: item.schema_version as string,
    outcome: item.outcome as IngestionOutcome['outcome'],
    received_at: item.received_at as string,
    rejection_reason: rejectionCode
      ? {
          code: rejectionCode,
          message: (item.rejection_message as string) ?? '',
          field_path: (item.rejection_field_path as string | undefined) ?? undefined,
        }
      : null,
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
