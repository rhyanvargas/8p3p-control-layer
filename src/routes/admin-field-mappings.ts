/**
 * Admin Field Mappings Routes
 *
 * Registers admin CRUD endpoints for tenant field mappings under /v1/admin prefix.
 * All routes require x-admin-api-key (enforced by adminApiKeyPreHandler at scope level).
 *
 * PUT /mappings/:org_id/:source_system — upsert mapping (validates expressions before write)
 * GET /mappings/:org_id               — list all mappings for an org
 *
 * @see docs/specs/tenant-field-mappings.md §Admin API
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateTransformExpression, RESERVED_IDENTIFIERS } from '../config/transform-expression.js';
import {
  putFieldMappingItem,
  listFieldMappingItemsForOrg,
} from '../config/field-mappings-dynamo.js';
import type { TenantPayloadMapping, TransformRule } from '../config/tenant-field-mappings.js';

// ---------------------------------------------------------------------------
// Request type helpers
// ---------------------------------------------------------------------------

interface OrgSourceParams {
  org_id: string;
  source_system: string;
}

interface OrgParams {
  org_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAdminKey(request: FastifyRequest): string {
  const h = request.headers['x-admin-api-key'];
  return typeof h === 'string' ? h : Array.isArray(h) ? (h[0] ?? '') : '';
}

function validationErrorResponse(code: string, message: string) {
  return { error: { code, message } };
}

function isMappingBody(body: unknown): body is TenantPayloadMapping {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}

type ValidationFailure = { ok: false; code: string; message: string };
type ValidationSuccess = { ok: true; mapping: TenantPayloadMapping };
type ValidationResult = ValidationSuccess | ValidationFailure;

const MAX_SOURCES_PER_TRANSFORM = 10;
const SOURCE_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateMappingBody(body: unknown): ValidationResult {
  if (!isMappingBody(body)) {
    return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: 'Request body must be a JSON object representing a TenantPayloadMapping' };
  }

  const mapping = body as TenantPayloadMapping;

  if (mapping.required !== undefined && !Array.isArray(mapping.required)) {
    return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: '"required" must be an array of strings when present' };
  }
  if (mapping.aliases !== undefined && (typeof mapping.aliases !== 'object' || Array.isArray(mapping.aliases))) {
    return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: '"aliases" must be an object when present' };
  }
  if (mapping.types !== undefined && (typeof mapping.types !== 'object' || Array.isArray(mapping.types))) {
    return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: '"types" must be an object when present' };
  }
  if (mapping.transforms !== undefined) {
    if (!Array.isArray(mapping.transforms)) {
      return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: '"transforms" must be an array when present' };
    }
    for (let i = 0; i < mapping.transforms.length; i++) {
      const rule = mapping.transforms[i] as unknown;
      if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
        return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: `transforms[${i}] must be an object` };
      }
      const r = rule as Partial<TransformRule>;
      if (typeof r.target !== 'string' || r.target.trim() === '') {
        return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: `transforms[${i}].target must be a non-empty string` };
      }
      if (typeof r.expression !== 'string' || r.expression.trim() === '') {
        return { ok: false, code: ErrorCodes.INVALID_FORMAT, message: `transforms[${i}].expression must be a non-empty string` };
      }

      const hasSource = typeof r.source === 'string' && r.source.trim() !== '';
      const sourcesRaw = r.sources;
      const hasSourcesKey = sourcesRaw !== undefined && sourcesRaw !== null;
      const sourcesObj =
        hasSourcesKey && typeof sourcesRaw === 'object' && !Array.isArray(sourcesRaw)
          ? (sourcesRaw as Record<string, unknown>)
          : null;
      const sourceKeys = sourcesObj ? Object.keys(sourcesObj) : [];
      const hasMulti = sourcesObj !== null && sourceKeys.length > 0;

      if (hasSource && hasSourcesKey) {
        return {
          ok: false,
          code: ErrorCodes.INVALID_FORMAT,
          message: `transforms[${i}] must have exactly one of "source" or "sources", not both`,
        };
      }
      if (!hasSource && !hasMulti) {
        return {
          ok: false,
          code: ErrorCodes.INVALID_FORMAT,
          message: `transforms[${i}] must have exactly one of "source" or non-empty "sources"`,
        };
      }

      if (hasMulti) {
        if (sourceKeys.length > MAX_SOURCES_PER_TRANSFORM) {
          return {
            ok: false,
            code: ErrorCodes.INVALID_FORMAT,
            message: `transforms[${i}].sources must have at most ${MAX_SOURCES_PER_TRANSFORM} entries`,
          };
        }
        for (const key of sourceKeys) {
          if (!SOURCE_KEY_PATTERN.test(key)) {
            return {
              ok: false,
              code: ErrorCodes.INVALID_FORMAT,
              message: `transforms[${i}].sources key "${key}" must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`,
            };
          }
          if (RESERVED_IDENTIFIERS.has(key)) {
            return {
              ok: false,
              code: ErrorCodes.INVALID_FORMAT,
              message: `transforms[${i}].sources key "${key}" is reserved`,
            };
          }
          const pathVal = sourcesObj![key];
          if (typeof pathVal !== 'string' || pathVal.trim() === '') {
            return {
              ok: false,
              code: ErrorCodes.INVALID_FORMAT,
              message: `transforms[${i}].sources["${key}"] must be a non-empty string (dot-path)`,
            };
          }
        }
        const exprResult = validateTransformExpression(r.expression, sourceKeys);
        if (!exprResult.ok) {
          return {
            ok: false,
            code: ErrorCodes.INVALID_MAPPING_EXPRESSION,
            message: `transforms[${i}].expression is invalid: ${exprResult.message}`,
          };
        }
      } else {
        const exprResult = validateTransformExpression(r.expression);
        if (!exprResult.ok) {
          return {
            ok: false,
            code: ErrorCodes.INVALID_MAPPING_EXPRESSION,
            message: `transforms[${i}].expression is invalid: ${exprResult.message}`,
          };
        }
      }
    }
  }

  return { ok: true, mapping };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdminFieldMappingsRoutes(app: FastifyInstance): void {
  /**
   * PUT /mappings/:org_id/:source_system
   * Upsert a tenant field mapping.
   * Body is a TenantPayloadMapping JSON object.
   * Optional query params: template_id, template_version (per spec v1.1.1).
   * All transform expressions are validated before write; returns 400 on invalid expression (SIG-API-017).
   */
  app.put(
    '/mappings/:org_id/:source_system',
    async (
      request: FastifyRequest<{
        Params: OrgSourceParams;
        Querystring: { template_id?: string; template_version?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { org_id, source_system } = request.params;
      const { template_id, template_version } = request.query;

      const validation = validateMappingBody(request.body);
      if (!validation.ok) {
        return reply.status(400).send(
          validationErrorResponse(validation.code, validation.message),
        );
      }

      const adminKey = getAdminKey(request);

      const record = await putFieldMappingItem({
        orgId: org_id,
        sourceSystem: source_system,
        mapping: validation.mapping,
        updatedBy: adminKey,
        templateId: template_id,
        templateVersion: template_version,
      });
      return reply.status(200).send(record);
    },
  );

  /**
   * GET /mappings/:org_id
   * List all mapping items for an org (Query by PK).
   * Returns metadata + mapping document for each source_system.
   */
  app.get(
    '/mappings/:org_id',
    async (
      request: FastifyRequest<{ Params: OrgParams }>,
      reply: FastifyReply,
    ) => {
      const { org_id } = request.params;
      const records = await listFieldMappingItemsForOrg(org_id);
      return reply.status(200).send({ mappings: records, count: records.length });
    },
  );
}
