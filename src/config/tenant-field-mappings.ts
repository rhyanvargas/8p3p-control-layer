import { readFileSync } from 'fs';
import type { RejectionReason } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'object';

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
}

export interface TenantFieldMappingsConfig {
  version: 1;
  tenants: Record<string, { payload?: TenantPayloadMapping }>;
}

let tenantConfig: TenantFieldMappingsConfig | null = null;

export function setTenantFieldMappings(config: TenantFieldMappingsConfig | null): void {
  tenantConfig = config;
}

export function loadTenantFieldMappingsFromFile(filePath: string): void {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as TenantFieldMappingsConfig;
  setTenantFieldMappings(parsed);
}

export function getTenantPayloadMapping(orgId: string): TenantPayloadMapping | null {
  return tenantConfig?.tenants?.[orgId]?.payload ?? null;
}

/**
 * Resolve mapping for ingestion: DynamoDB first (when FIELD_MAPPINGS_TABLE is set), then file fallback.
 * Per docs/specs/tenant-field-mappings.md — Dynamo wins for same org+source_system.
 */
export async function resolveTenantPayloadMappingForIngest(
  orgId: string,
  sourceSystem: string
): Promise<TenantPayloadMapping | null> {
  const { getMappingFromDynamoDB } = await import('./field-mappings-dynamo.js');
  const fromDynamo = await getMappingFromDynamoDB(orgId, sourceSystem);
  if (fromDynamo) return fromDynamo;
  return getTenantPayloadMapping(orgId);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isRecord(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (!isRecord(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
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

