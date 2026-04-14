import { readFileSync } from 'fs';
import type { RejectionReason } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { evaluateTransform } from './transform-expression.js';
import { isRecord, getAtPath, setAtPath } from '../shared/dot-path.js';

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'object';

/**
 * A single declarative computed transform rule (v1.1).
 * @see docs/specs/tenant-field-mappings.md §Restricted Transform Expression Grammar
 */
export interface TransformRule {
  /** Top-level canonical key to write the computed result into. */
  target: string;
  /** Dot-path into the payload to read the input value from. */
  source: string;
  /** Restricted arithmetic expression; only `value`, numeric literals, +, -, *, /, Math.min/max/round. */
  expression: string;
}

export interface TenantPayloadMapping {
  /**
   * Dot-paths required in payload after normalization (e.g. "stabilityScore", "metrics.score").
   */
  required?: string[];
  /**
   * Alias map from canonical dot-path → candidate alias dot-paths.
   * If canonical is missing, the first present alias is copied into canonical.
   */
  aliases?: Record<string, string[]>;
  /**
   * Expected primitive types for specific dot-paths.
   * (Optional strictness; default is no type enforcement.)
   */
  types?: Record<string, PrimitiveType>;
  /**
   * Computed transform rules evaluated after aliases, before required/types (v1.1).
   */
  transforms?: TransformRule[];
  /**
   * When true, a missing `source` path in a transform causes rejection with missing_required_field.
   * Default: false (skip the transform when source is absent).
   */
  strict_transforms?: boolean;
}

/** v1 file shape — `tenants[org_id].payload` applies to all source_system values. */
export interface TenantFieldMappingsConfigV1 {
  version: 1;
  tenants: Record<string, { payload?: TenantPayloadMapping }>;
}

/** v2 file shape — `tenants[org_id][source_system].payload` for per-source mappings (v1.1). */
export interface TenantFieldMappingsConfigV2 {
  version: 2;
  tenants: Record<string, Record<string, { payload?: TenantPayloadMapping }>>;
}

export type TenantFieldMappingsConfig = TenantFieldMappingsConfigV1 | TenantFieldMappingsConfigV2;

let tenantConfig: TenantFieldMappingsConfig | null = null;

export function setTenantFieldMappings(config: TenantFieldMappingsConfig | null): void {
  tenantConfig = config;
}

export function loadTenantFieldMappingsFromFile(filePath: string): void {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as TenantFieldMappingsConfig;
  setTenantFieldMappings(parsed);
}

/**
 * Resolve the tenant payload mapping from the in-memory file config.
 * v2: looks up `tenants[orgId][sourceSystem].payload`.
 * v1 (backward compat): `tenants[orgId].payload` applies to all source_system values.
 * Returns null when no config or no entry for the org.
 */
export function getTenantPayloadMapping(orgId: string, sourceSystem?: string): TenantPayloadMapping | null {
  if (!tenantConfig) return null;
  if (tenantConfig.version === 2) {
    if (sourceSystem) {
      const entry = tenantConfig.tenants[orgId]?.[sourceSystem];
      if (entry?.payload) return entry.payload;
    }
    return null;
  }
  // v1: payload applies to all source_system values
  return tenantConfig.tenants[orgId]?.payload ?? null;
}

/**
 * Resolve mapping for ingestion: DynamoDB first (when FIELD_MAPPINGS_TABLE is set), then file fallback.
 * Per docs/specs/tenant-field-mappings.md — Dynamo wins for same org+source_system.
 * File fallback checks v2 source_system key first, then v1 wildcard mapping.
 */
export async function resolveTenantPayloadMappingForIngest(
  orgId: string,
  sourceSystem: string
): Promise<TenantPayloadMapping | null> {
  const { getMappingFromDynamoDB } = await import('./field-mappings-dynamo.js');
  const fromDynamo = await getMappingFromDynamoDB(orgId, sourceSystem);
  if (fromDynamo) return fromDynamo;
  // v2: try source_system-specific file entry; v1: wildcard via getTenantPayloadMapping(orgId)
  return getTenantPayloadMapping(orgId, sourceSystem) ?? getTenantPayloadMapping(orgId);
}

/**
 * Async normalization using DynamoDB-aware mapping resolution (Lambda / async paths).
 */
export async function normalizeAndValidateTenantPayloadAsync(args: {
  orgId: string;
  sourceSystem: string;
  payload: unknown;
}): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; errors: RejectionReason[] }> {
  const mapping = await resolveTenantPayloadMappingForIngest(args.orgId, args.sourceSystem);
  return normalizeAndValidateTenantPayload({
    orgId: args.orgId,
    payload: args.payload,
    mappingOverride: mapping,
  });
}

function typeOfPrimitive(value: unknown): PrimitiveType | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (isRecord(value)) return 'object';
  return null;
}

/**
 * Normalize + validate payload against tenant mappings.
 * - If no mapping exists for orgId, returns the original payload unchanged.
 * - Normalization only *adds* canonical fields (does not delete alias fields).
 */
export function normalizeAndValidateTenantPayload(args: {
  orgId: string;
  payload: unknown;
  /** When set (including null), skip file lookup and use this mapping; null = no tenant mapping. */
  mappingOverride?: TenantPayloadMapping | null;
}): { ok: true; payload: Record<string, unknown> } | { ok: false; errors: RejectionReason[] } {
  const mapping =
    args.mappingOverride !== undefined ? args.mappingOverride : getTenantPayloadMapping(args.orgId);
  if (!mapping) {
    if (!isRecord(args.payload)) {
      return {
        ok: false,
        errors: [
          {
            code: ErrorCodes.PAYLOAD_NOT_OBJECT,
            message: 'payload must be a JSON object',
            field_path: 'payload',
          },
        ],
      };
    }
    return { ok: true, payload: args.payload };
  }

  if (!isRecord(args.payload)) {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.PAYLOAD_NOT_OBJECT,
          message: 'payload must be a JSON object',
          field_path: 'payload',
        },
      ],
    };
  }

  const normalized: Record<string, unknown> = JSON.parse(JSON.stringify(args.payload)) as Record<string, unknown>;
  const errors: RejectionReason[] = [];

  const aliases = mapping.aliases ?? {};
  for (const [canonical, candidates] of Object.entries(aliases)) {
    const canonicalVal = getAtPath(normalized, canonical);
    if (canonicalVal !== undefined && canonicalVal !== null) continue;

    const present: Array<{ path: string; value: unknown }> = [];
    for (const c of candidates) {
      const v = getAtPath(normalized, c);
      if (v !== undefined && v !== null) present.push({ path: c, value: v });
    }
    if (present.length === 1) {
      setAtPath(normalized, canonical, present[0]!.value);
    } else if (present.length > 1) {
      errors.push({
        code: ErrorCodes.INVALID_FORMAT,
        message: `Multiple alias fields present for '${canonical}': ${present.map((p) => p.path).join(', ')}`,
        field_path: `payload.${canonical}`,
      });
    }
  }

  // Computed transforms (v1.1): evaluate after aliases, before required/types.
  const transforms = mapping.transforms ?? [];
  const strict = mapping.strict_transforms ?? false;
  for (const rule of transforms) {
    const sourceVal = getAtPath(normalized, rule.source);
    if (sourceVal === undefined || sourceVal === null) {
      if (strict) {
        errors.push({
          code: ErrorCodes.MISSING_REQUIRED_FIELD,
          message: `Transform source '${rule.source}' not found in payload for target '${rule.target}'`,
          field_path: `payload.${rule.source}`,
        });
      }
      continue;
    }
    const numeric = typeof sourceVal === 'number' ? sourceVal : Number(sourceVal);
    try {
      const result = evaluateTransform(rule.expression, numeric);
      setAtPath(normalized, rule.target, result);
    } catch (err) {
      errors.push({
        code: ErrorCodes.INVALID_MAPPING_EXPRESSION,
        message: `Transform expression failed for target '${rule.target}': ${err instanceof Error ? err.message : String(err)}`,
        field_path: `payload.${rule.target}`,
      });
    }
  }

  const required = mapping.required ?? [];
  for (const req of required) {
    const v = getAtPath(normalized, req);
    const missing =
      v === undefined ||
      v === null ||
      (typeof v === 'string' && v.trim() === '');
    if (missing) {
      errors.push({
        code: ErrorCodes.MISSING_REQUIRED_FIELD,
        message: `Missing required payload field for org '${args.orgId}': ${req}`,
        field_path: `payload.${req}`,
      });
    }
  }

  const types = mapping.types ?? {};
  for (const [fieldPath, expected] of Object.entries(types)) {
    const v = getAtPath(normalized, fieldPath);
    if (v === undefined || v === null) continue; // required check handles absence if needed
    const actual = typeOfPrimitive(v);
    if (actual !== expected) {
      errors.push({
        code: ErrorCodes.INVALID_TYPE,
        message: `payload.${fieldPath} must be of type ${expected}`,
        field_path: `payload.${fieldPath}`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, payload: normalized };
}

