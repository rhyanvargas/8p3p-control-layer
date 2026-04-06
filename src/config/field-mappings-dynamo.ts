/**
 * DynamoDB-backed tenant field mapping resolution (FieldMappingsTable).
 * @see docs/specs/tenant-field-mappings.md — GetItem(PK=org_id, SK=source_system)
 */

import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { TenantPayloadMapping } from './tenant-field-mappings.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheTtlMs(): number {
  const raw = process.env.FIELD_MAPPINGS_CACHE_TTL_MS;
  if (!raw) return DEFAULT_CACHE_TTL_MS;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n <= 0 ? DEFAULT_CACHE_TTL_MS : n;
}

interface CacheEntry {
  mapping: TenantPayloadMapping | null;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) _client = new DynamoDBClient({});
  return _client;
}

/** Test hook */
export function _setFieldMappingsDynamoClientForTesting(client: DynamoDBClient | null): void {
  _client = client;
}

export function invalidateFieldMappingCache(orgId: string, sourceSystem: string): void {
  cache.delete(`${orgId}:${sourceSystem}`);
}

export function clearFieldMappingCache(): void {
  cache.clear();
}

function parseMappingFromItem(item: Record<string, unknown>): TenantPayloadMapping | null {
  const mapping = item.mapping as Record<string, unknown> | undefined;
  if (!mapping || typeof mapping !== 'object') return null;
  const out: TenantPayloadMapping = {};
  if (Array.isArray(mapping.required)) {
    out.required = mapping.required.filter((x): x is string => typeof x === 'string');
  }
  if (mapping.aliases && typeof mapping.aliases === 'object' && !Array.isArray(mapping.aliases)) {
    out.aliases = mapping.aliases as Record<string, string[]>;
  }
  if (mapping.types && typeof mapping.types === 'object' && !Array.isArray(mapping.types)) {
    out.types = mapping.types as TenantPayloadMapping['types'];
  }
  return out;
}

/**
 * Load mapping from DynamoDB when FIELD_MAPPINGS_TABLE is set. Uses in-memory TTL cache.
 * Returns null on miss or when table env is unset.
 */
export async function getMappingFromDynamoDB(
  orgId: string,
  sourceSystem: string
): Promise<TenantPayloadMapping | null> {
  const tableName = process.env.FIELD_MAPPINGS_TABLE;
  if (!tableName) return null;

  const cacheKey = `${orgId}:${sourceSystem}`;
  const ttl = getCacheTtlMs();
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.loadedAt < ttl) {
    return hit.mapping;
  }

  try {
    const result = await getClient().send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ org_id: orgId, source_system: sourceSystem }),
        ConsistentRead: false,
      })
    );

    if (!result.Item) {
      cache.set(cacheKey, { mapping: null, loadedAt: now });
      return null;
    }

    const item = unmarshall(result.Item) as Record<string, unknown>;
    const mapping = parseMappingFromItem(item);
    cache.set(cacheKey, { mapping, loadedAt: now });
    return mapping;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'field_mappings_dynamo_degraded',
        org_id: orgId,
        source_system: sourceSystem,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}
