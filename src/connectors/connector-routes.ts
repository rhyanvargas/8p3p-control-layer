/**
 * Connector Routes (Layer 3 — Pilot)
 *
 * GET  /connectors              — list templates with per-org activation status
 * POST /connectors/activate     — copy template mapping into FieldMappingsTable
 *
 * Registered inside the /v1/admin scope; adminApiKeyPreHandler enforces auth
 * at the scope level — no per-route auth check.
 *
 * @see docs/specs/integration-templates.md
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  loadTemplateRegistry,
  getTemplate,
  isStubTemplate,
} from './template-registry.js';
import {
  listFieldMappingItemsForOrg,
  getFieldMappingRecord,
  putFieldMappingItem,
} from '../config/field-mappings-dynamo.js';
import type { FieldMappingRecord } from '../config/field-mappings-dynamo.js';

// ---------------------------------------------------------------------------
// Request type helpers
// ---------------------------------------------------------------------------

interface ListQuery {
  org_id?: string;
}

interface ActivateBody {
  org_id?: string;
  source_system?: string;
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function getAdminKey(request: FastifyRequest): string {
  const h = request.headers['x-admin-api-key'];
  return typeof h === 'string' ? h : Array.isArray(h) ? (h[0] ?? '') : '';
}

function webhookBaseUrl(): string {
  return process.env.WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
}

function buildWebhookUrl(sourceSystem: string): string {
  return `${webhookBaseUrl()}/v1/webhooks/${sourceSystem}`;
}

function errorResponse(code: string, message: string) {
  return { error: { code, message } };
}

/**
 * Derive event_types from an activated record: prefer the stored
 * envelope.allowed_event_types, fall back to the template defaults.
 */
function deriveEventTypes(
  record: FieldMappingRecord,
  templateDefaults: string[],
): string[] {
  const envelope = record.mapping?.envelope;
  if (envelope && Array.isArray(envelope.allowed_event_types) && envelope.allowed_event_types.length > 0) {
    return envelope.allowed_event_types;
  }
  return templateDefaults;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerConnectorRoutes(app: FastifyInstance): void {
  /**
   * GET /connectors?org_id=<id>
   * List all bundled templates with per-org activation status.
   */
  app.get(
    '/connectors',
    async (
      request: FastifyRequest<{ Querystring: ListQuery }>,
      reply: FastifyReply,
    ) => {
      const orgId = request.query.org_id?.trim();
      if (!orgId) {
        return reply.status(400).send(
          errorResponse(ErrorCodes.ORG_SCOPE_REQUIRED, 'org_id query parameter is required'),
        );
      }

      const templates = loadTemplateRegistry();
      const existingRecords = await listFieldMappingItemsForOrg(orgId);

      const recordBySource = new Map<string, FieldMappingRecord>();
      for (const rec of existingRecords) {
        recordBySource.set(rec.source_system, rec);
      }

      const connectors = templates.map((template) => {
        const record = recordBySource.get(template.source_system);
        const hasMatchingTemplate = record?.template_id === template.template_id;

        let status: 'activated' | 'not_ready' | 'available';
        if (hasMatchingTemplate) {
          status = 'activated';
        } else if (isStubTemplate(template)) {
          status = 'not_ready';
        } else {
          status = 'available';
        }

        return {
          source_system: template.source_system,
          display_name: template.display_name,
          description: template.description,
          template_id: template.template_id,
          template_version: template.template_version,
          status,
          event_types: status === 'activated'
            ? deriveEventTypes(record!, template.default_event_types)
            : null,
          activated_at: status === 'activated' ? (record!.updated_at ?? null) : null,
          webhook_url: status === 'activated'
            ? buildWebhookUrl(template.source_system)
            : null,
        };
      });

      return reply.status(200).send({ connectors });
    },
  );

  /**
   * POST /connectors/activate
   * Copy a template's mapping into FieldMappingsTable for an org.
   * Body: { org_id, source_system, force? }
   */
  app.post(
    '/connectors/activate',
    async (
      request: FastifyRequest<{ Body: ActivateBody }>,
      reply: FastifyReply,
    ) => {
      const body = request.body as ActivateBody | null | undefined;
      const orgId = (typeof body?.org_id === 'string' ? body.org_id : '').trim();
      const sourceSystem = (typeof body?.source_system === 'string' ? body.source_system : '').trim();
      const force = body?.force === true;

      if (!orgId) {
        return reply.status(400).send(
          errorResponse(ErrorCodes.ORG_SCOPE_REQUIRED, 'org_id is required'),
        );
      }
      if (!sourceSystem) {
        return reply.status(400).send(
          errorResponse(ErrorCodes.MISSING_REQUIRED_FIELD, 'source_system is required'),
        );
      }

      const template = getTemplate(sourceSystem);
      if (!template) {
        return reply.status(404).send(
          errorResponse(ErrorCodes.TEMPLATE_NOT_FOUND, `No template found for source_system "${sourceSystem}"`),
        );
      }

      if (isStubTemplate(template)) {
        return reply.status(400).send(
          errorResponse(ErrorCodes.TEMPLATE_NOT_READY, `Template "${template.template_id}" is a stub and cannot be activated`),
        );
      }

      const existing = await getFieldMappingRecord(orgId, sourceSystem);
      if (existing && !force) {
        if (existing.template_id) {
          return reply.status(409).send(
            errorResponse(ErrorCodes.CONNECTOR_ALREADY_ACTIVATED, `Connector "${sourceSystem}" is already activated for org "${orgId}". Use force=true to overwrite.`),
          );
        }
        return reply.status(409).send(
          errorResponse(ErrorCodes.CUSTOM_MAPPING_EXISTS, `A custom mapping exists for org "${orgId}" + source_system "${sourceSystem}". Use force=true to overwrite.`),
        );
      }

      const adminKey = getAdminKey(request);
      const mappingCopy = JSON.parse(JSON.stringify(template.mapping)) as Record<string, unknown>;

      const record = await putFieldMappingItem({
        orgId,
        sourceSystem,
        mapping: mappingCopy,
        updatedBy: adminKey,
        templateId: template.template_id,
        templateVersion: template.template_version,
        mappingVersion: existing?.mapping_version ?? 0,
      });

      return reply.status(201).send({
        source_system: sourceSystem,
        status: 'activated',
        webhook_url: buildWebhookUrl(sourceSystem),
        event_types: template.default_event_types,
        setup_instructions: template.setup_instructions,
        template_id: template.template_id,
        template_version: template.template_version,
        activated_at: record.updated_at,
      });
    },
  );
}
