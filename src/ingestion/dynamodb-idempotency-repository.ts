/**
 * DynamoDB Idempotency Repository (async)
 *
 * Table design (IdempotencyTable):
 *   PK: org_id (S)
 *   SK: signal_id (S)
 *   Attributes: received_at (S)
 *
 * checkAndStore: PutItem with attribute_not_exists condition.
 * On ConditionalCheckFailedException (duplicate): GetItem to retrieve original received_at.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { IdempotencyResult } from '../shared/types.js';

export class DynamoDbIdempotencyRepository {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    this.tableName = tableName;
    this.client = client ?? new DynamoDBClient({});
  }

  async checkAndStore(orgId: string, signalId: string): Promise<IdempotencyResult> {
    const now = new Date().toISOString();

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall({ org_id: orgId, signal_id: signalId, received_at: now }),
          ConditionExpression: 'attribute_not_exists(org_id)',
        })
      );
      return { isDuplicate: false, receivedAt: now };
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }

    const existing = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ org_id: orgId, signal_id: signalId }),
        ProjectionExpression: 'received_at',
      })
    );

    const item = existing.Item ? (unmarshall(existing.Item) as { received_at?: string }) : null;
    return { isDuplicate: true, receivedAt: item?.received_at };
  }
}
