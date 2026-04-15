/**
 * DynamoDB-backed tenant field mapping resolution (FieldMappingsTable).
 * Uses DynamoDBDocumentClient (high-level) per AWS SDK v3 best practices.
 * @see docs/specs/tenant-field-mappings.md — GetItem(PK=org_id, SK=source_system)
 */

import { DynamoDBClient, ProvisionedThroughputExceededException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { TenantPayloadMapping, TransformRule } from './tenant-field-mappings.js';

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

let _docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _docClient;
}

/** Test hook — accepts a DynamoDBDocumentClient (or any object with .send()). */
export function _setFieldMappingsDynamoClientForTesting(client: DynamoDBDocumentClient | null): void {
  _docClient = client;
}

export function invalidateFieldMappingCache(orgId: string, sourceSystem: string): void {
  cache.delete(`${orgId}:${sourceSystem}`);
}

export function clearFieldMappingCache(): void {
  cache.clear();
}

/** Metadata returned alongside the mapping for admin list/get. */
export interface FieldMappingRecord {
  org_id: string;
  source_system: string;
  mapping: TenantPayloadMapping;
  mapping_version?: number;
  template_id?: string;
  template_version?: string;
  updated_at?: string;
  updated_by?: string;
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
  if (Array.isArray(mapping.transforms)) {
    out.transforms = mapping.transforms.filter((x): x is TransformRule => {
      if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
      const o = x as Record<string, unknown>;
      if (typeof o.target !== 'string' || typeof o.expression !== 'string') return false;
      if (typeof o.source === 'string') return true;
      if (o.sources !== null && typeof o.sources === 'object' && !Array.isArray(o.sources)) {
        const entries = Object.entries(o.sources as Record<string, unknown>);
        if (entries.length === 0) return false;
        return entries.every(([, v]) => typeof v === 'string');
      }
      return false;
    });
  }
  if (typeof mapping.strict_transforms === 'boolean') {
    out.strict_transforms = mapping.strict_transforms;
  }
  return out;
}

function parseRecordFromItem(item: Record<string, unknown>): FieldMappingRecord | null {
  const orgId = typeof item.org_id === 'string' ? item.org_id : undefined;
  const sourceSystem = typeof item.source_system === 'string' ? item.source_system : undefined;
  if (!orgId || !sourceSystem) return null;
  const mapping = parseMappingFromItem(item);
  if (!mapping) return null;
  return {
    org_id: orgId,
    source_system: sourceSystem,
    mapping,
    mapping_version: typeof item.mapping_version === 'number' ? item.mapping_version : undefined,
    template_id: typeof item.template_id === 'string' ? item.template_id : undefined,
    template_version: typeof item.template_version === 'string' ? item.template_version : undefined,
    updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
    updated_by: typeof item.updated_by === 'string' ? item.updated_by : undefined,
  };
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
    const result = await getDocClient().send(
      new GetCommand({
        TableName: tableName,
        Key: { org_id: orgId, source_system: sourceSystem },
        ConsistentRead: false,
      })
    );

    if (!result.Item) {
      cache.set(cacheKey, { mapping: null, loadedAt: now });
      return null;
    }

    const mapping = parseMappingFromItem(result.Item as Record<string, unknown>);
    cache.set(cacheKey, { mapping, loadedAt: now });
    return mapping;
  } catch (err) {
    const event = err instanceof ProvisionedThroughputExceededException
      ? 'field_mappings_dynamo_throttled'
      : 'field_mappings_dynamo_degraded';
    console.warn(
      JSON.stringify({
        event,
        org_id: orgId,
        source_system: sourceSystem,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

/**
 * Upsert a mapping item in DynamoDB (admin PUT).
 * Stores the full mapping document + metadata. Invalidates the TTL cache on success.
 * @see docs/specs/tenant-field-mappings.md §DynamoDB Item Shape
 */
export async function putFieldMappingItem(args: {
  orgId: string;
  sourceSystem: string;
  mapping: TenantPayloadMapping;
  updatedBy: string;
  templateId?: string;
  templateVersion?: string;
  mappingVersion?: number;
}): Promise<FieldMappingRecord> {
  const tableName = process.env.FIELD_MAPPINGS_TABLE;
  if (!tableName) throw new Error('FIELD_MAPPINGS_TABLE env var is not set');

  const nextVersion = (args.mappingVersion ?? 0) + 1;
  const updatedAt = new Date().toISOString();

  const item: Record<string, unknown> = {
    org_id: args.orgId,
    source_system: args.sourceSystem,
    mapping: args.mapping,
    mapping_version: nextVersion,
    updated_at: updatedAt,
    updated_by: args.updatedBy,
  };
  if (args.templateId !== undefined) item.template_id = args.templateId;
  if (args.templateVersion !== undefined) item.template_version = args.templateVersion;

  await getDocClient().send(
    new PutCommand({ TableName: tableName, Item: item }),
  );

  invalidateFieldMappingCache(args.orgId, args.sourceSystem);

  return {
    org_id: args.orgId,
    source_system: args.sourceSystem,
    mapping: args.mapping,
    mapping_version: nextVersion,
    template_id: args.templateId,
    template_version: args.templateVersion,
    updated_at: updatedAt,
    updated_by: args.updatedBy,
  };
}

/**
 * List all mapping items for an org (admin GET).
 * Uses Query(PK=org_id) — returns metadata + mapping for all source systems.
 */
export async function listFieldMappingItemsForOrg(orgId: string): Promise<FieldMappingRecord[]> {
  const tableName = process.env.FIELD_MAPPINGS_TABLE;
  if (!tableName) return [];

  const result = await getDocClient().send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'org_id = :pk',
      ExpressionAttributeValues: { ':pk': orgId },
    }),
  );

  const records: FieldMappingRecord[] = [];
  for (const item of result.Items ?? []) {
    const record = parseRecordFromItem(item as Record<string, unknown>);
    if (record) records.push(record);
  }
  return records;
}

/**
 * Delete a mapping item from DynamoDB (admin DELETE).
 * Invalidates the TTL cache on success.
 */
export async function deleteFieldMappingItem(orgId: string, sourceSystem: string): Promise<void> {
  const tableName = process.env.FIELD_MAPPINGS_TABLE;
  if (!tableName) throw new Error('FIELD_MAPPINGS_TABLE env var is not set');

  await getDocClient().send(
    new DeleteCommand({
      TableName: tableName,
      Key: { org_id: orgId, source_system: sourceSystem },
    }),
  );

  invalidateFieldMappingCache(orgId, sourceSystem);
}
