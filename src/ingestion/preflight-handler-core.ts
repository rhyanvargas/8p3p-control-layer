/**
 * Ingestion Preflight Handler Core — framework-agnostic, side-effect-free
 *
 * Static analysis + optional tenant mapping simulation for raw customer samples.
 * Side-effect-free: no envelope validation, idempotency, signal log writes,
 * ingestion outcome logging, state application, or decision evaluation.
 *
 * Allowed imports: forbidden-keys, mapping-suggestions-catalog, tenant-field-mappings,
 * shared/error-codes, shared/dot-path, shared/types, ulid
 *
 * @see docs/specs/ingestion-preflight.md
 */

import { ulid } from 'ulid';
import {
  resolveTenantPayloadMappingForIngest,
  normalizeAndValidateTenantPayload,
} from '../config/tenant-field-mappings.js';
import { isRecord } from '../shared/dot-path.js';
import { ErrorCodes } from '../shared/error-codes.js';
import type { HandlerResult } from '../shared/types.js';
import {
  FORBIDDEN_PII_KEYS,
  FORBIDDEN_SEMANTIC_KEYS,
} from './forbidden-keys.js';
import { findMappingSuggestions } from './mapping-suggestions-catalog.js';

type Logger = {
  warn?: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
};

export interface PreflightRequest {
  org_id?: string;
  source_system?: string;
  payload: unknown;
}

export interface ForbiddenKeyHit {
  key: string;
  path: string;
}

export interface PreflightResponse {
  preflight_id: string;
  received_at: string;
  forbidden_pii: ForbiddenKeyHit[];
  forbidden_semantic_raw: ForbiddenKeyHit[];
  forbidden_semantic_after_mapping: ForbiddenKeyHit[] | null;
  mapping_suggestions: Array<{
    raw_key: string;
    raw_path: string;
    suggested_canonical: string | null;
    rationale: string;
    source: 'static-catalog';
  }>;
  verdict:
    | 'clean'
    | 'pii_blocking'
    | 'semantic_blocking'
    | 'semantic_resolvable_by_mapping';
  note?: string;
  mapping_error?: string;
}

type PreflightErrorBody = { error: { code: string; message: string } };

interface ForbiddenKeyHitWithCategory extends ForbiddenKeyHit {
  category: 'pii' | 'semantic';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectAllForbiddenKeys(
  obj: unknown,
  basePath: string
): ForbiddenKeyHitWithCategory[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [];
  }

  const hits: ForbiddenKeyHitWithCategory[] = [];

  for (const key of Object.keys(obj)) {
    const currentPath = `${basePath}.${key}`;

    if (FORBIDDEN_PII_KEYS.has(key)) {
      hits.push({ key, path: currentPath, category: 'pii' });
    } else if (FORBIDDEN_SEMANTIC_KEYS.has(key)) {
      hits.push({ key, path: currentPath, category: 'semantic' });
    }

    hits.push(
      ...collectAllForbiddenKeys(
        (obj as Record<string, unknown>)[key],
        currentPath
      )
    );
  }

  return hits;
}

function resolveVerdict(
  forbiddenPii: ForbiddenKeyHit[],
  forbiddenSemanticRaw: ForbiddenKeyHit[],
  forbiddenSemanticAfterMapping: ForbiddenKeyHit[] | null
): PreflightResponse['verdict'] {
  if (forbiddenPii.length > 0) {
    return 'pii_blocking';
  }
  if (forbiddenSemanticRaw.length === 0) {
    return 'clean';
  }
  if (
    forbiddenSemanticAfterMapping !== null &&
    forbiddenSemanticAfterMapping.length === 0
  ) {
    return 'semantic_resolvable_by_mapping';
  }
  return 'semantic_blocking';
}

function stripCategory(hit: ForbiddenKeyHitWithCategory): ForbiddenKeyHit {
  return { key: hit.key, path: hit.path };
}

/**
 * Framework-agnostic ingestion preflight pipeline.
 *
 * @param body - Raw request body (unknown, will be validated)
 * @param log  - Optional structured logger (Fastify log or console)
 */
export async function handlePreflightCore(
  body: unknown,
  log: Logger = {}
): Promise<
  HandlerResult<PreflightResponse | PreflightErrorBody>
> {
  if (!isJsonObject(body)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: ErrorCodes.PAYLOAD_NOT_OBJECT,
          message: 'payload must be a JSON object',
        },
      },
    };
  }

  if (!('payload' in body) || !isRecord(body.payload)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: ErrorCodes.PAYLOAD_NOT_OBJECT,
          message: 'payload must be a JSON object',
        },
      },
    };
  }

  const orgId =
    typeof body.org_id === 'string' && body.org_id.length > 0
      ? body.org_id
      : undefined;
  const sourceSystem =
    typeof body.source_system === 'string' && body.source_system.length > 0
      ? body.source_system
      : undefined;

  if (Boolean(orgId) !== Boolean(sourceSystem)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: ErrorCodes.PREFLIGHT_MISSING_SCOPE_PAIR,
          message:
            'org_id and source_system must both be present or both absent',
        },
      },
    };
  }

  const payload = body.payload;
  const allHits = collectAllForbiddenKeys(payload, 'payload');
  const forbiddenPii = allHits
    .filter((h) => h.category === 'pii')
    .map(stripCategory);
  const forbiddenSemanticRaw = allHits
    .filter((h) => h.category === 'semantic')
    .map(stripCategory);

  const mappingSuggestions = forbiddenSemanticRaw.flatMap((hit) =>
    findMappingSuggestions(hit.key, sourceSystem ?? null).map((suggestion) => ({
      raw_key: hit.key,
      raw_path: hit.path,
      suggested_canonical: suggestion.suggested_canonical,
      rationale: suggestion.rationale,
      source: 'static-catalog' as const,
    }))
  );

  let forbiddenSemanticAfterMapping: ForbiddenKeyHit[] | null = null;
  let note: string | undefined;
  let mappingError: string | undefined;

  if (orgId !== undefined && sourceSystem !== undefined) {
    const mapping = await resolveTenantPayloadMappingForIngest(
      orgId,
      sourceSystem
    );

    if (mapping === null) {
      forbiddenSemanticAfterMapping = null;
      note =
        'No mapping exists for (org_id, source_system). Register one via PUT /v1/admin/mappings/:org_id/:source_system.';
    } else {
      try {
        const normalized = normalizeAndValidateTenantPayload({
          orgId,
          payload,
          mappingOverride: mapping,
        });

        if (!normalized.ok) {
          forbiddenSemanticAfterMapping = null;
          mappingError = normalized.errors[0]?.message;
        } else {
          forbiddenSemanticAfterMapping = collectAllForbiddenKeys(
            normalized.payload,
            'payload'
          )
            .filter((h) => h.category === 'semantic')
            .map(stripCategory);
        }
      } catch (err) {
        forbiddenSemanticAfterMapping = null;
        mappingError =
          err instanceof Error ? err.message : 'Mapping simulation failed';
        log.warn?.({ err, org_id: orgId, source_system: sourceSystem }, 'preflight mapping simulation error');
      }
    }
  }

  const verdict = resolveVerdict(
    forbiddenPii,
    forbiddenSemanticRaw,
    forbiddenSemanticAfterMapping
  );

  const preflightId = `pf_${ulid()}`;
  const receivedAt = new Date().toISOString();

  log.info?.(
    {
      preflight_id: preflightId,
      org_id: orgId ?? null,
      source_system: sourceSystem ?? null,
      verdict,
      pii_hits: forbiddenPii.length,
      semantic_hits_raw: forbiddenSemanticRaw.length,
    },
    'preflight complete'
  );

  const response: PreflightResponse = {
    preflight_id: preflightId,
    received_at: receivedAt,
    forbidden_pii: forbiddenPii,
    forbidden_semantic_raw: forbiddenSemanticRaw,
    forbidden_semantic_after_mapping: forbiddenSemanticAfterMapping,
    mapping_suggestions: mappingSuggestions,
    verdict,
  };

  if (note !== undefined) {
    response.note = note;
  }
  if (mappingError !== undefined) {
    response.mapping_error = mappingError;
  }

  return { statusCode: 200, body: response };
}
