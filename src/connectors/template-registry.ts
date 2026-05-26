/**
 * Connector template registry (Layer 3 — Pilot)
 *
 * Loads bundled JSON templates from `src/connector-templates/` at startup,
 * caches them in module scope, and exposes lookups by `source_system`.
 *
 * @see docs/specs/integration-templates.md § Template Registry
 * @see docs/specs/integration-templates.md § Pilot Implementation Scope
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { validateTransformExpression } from '../config/transform-expression.js';

export interface ConnectorTemplate {
  template_id: string;
  template_version: string;
  source_system: string;
  display_name: string;
  description: string;
  setup_instructions: string;
  default_event_types: string[];
  available_event_types: Array<{ event_type: string; description: string }>;
  mapping: Record<string, unknown>;
  test_payload?: Record<string, unknown>;
}

type Logger = { warn?: (obj: unknown, msg: string) => void };

const STUB_MARKER = 'TODO';

let cached: ConnectorTemplate[] | null = null;
let cachedDir: string | null = null;

/** Resolve the templates directory.
 * Honours `CONNECTOR_TEMPLATES_DIR` for test fixtures; otherwise resolves
 * `../connector-templates/` relative to this module so it works under both
 * `tsx` (dev, .ts in src/) and compiled output (.js in dist/).
 */
function resolveTemplatesDir(): string {
  const override = process.env.CONNECTOR_TEMPLATES_DIR;
  if (override && override.trim() !== '') {
    return resolve(override.trim());
  }
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'connector-templates');
}

function isConnectorTemplate(value: unknown): value is ConnectorTemplate {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.template_id === 'string' &&
    typeof o.template_version === 'string' &&
    typeof o.source_system === 'string' &&
    typeof o.display_name === 'string' &&
    typeof o.description === 'string' &&
    typeof o.setup_instructions === 'string' &&
    Array.isArray(o.default_event_types) &&
    Array.isArray(o.available_event_types) &&
    o.mapping !== null &&
    typeof o.mapping === 'object' &&
    !Array.isArray(o.mapping)
  );
}

/** Deep-walk a value; return true if any string equals exactly `"TODO"`. */
function containsStubMarker(value: unknown): boolean {
  if (typeof value === 'string') return value === STUB_MARKER;
  if (Array.isArray(value)) return value.some(containsStubMarker);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsStubMarker);
  }
  return false;
}

/** Returns true when any value in `template.mapping` (deep) is the literal `"TODO"`. */
export function isStubTemplate(template: ConnectorTemplate): boolean {
  return containsStubMarker(template.mapping);
}

/**
 * Load (or return cached) bundled templates. Reads every `*.json` file in the
 * templates directory; ignores files that fail to parse or that lack the
 * required ConnectorTemplate shape (logs nothing — registry-loading errors are
 * surfaced via `initTemplateRegistry` which emits structured warnings).
 */
export function loadTemplateRegistry(): ConnectorTemplate[] {
  const dir = resolveTemplatesDir();
  if (cached && cachedDir === dir) return cached;

  const out: ConnectorTemplate[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    cached = [];
    cachedDir = dir;
    return cached;
  }

  for (const file of entries) {
    if (!file.endsWith('.json')) continue;
    const full = join(dir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf-8'));
    } catch {
      continue;
    }
    if (!isConnectorTemplate(parsed)) continue;
    out.push(parsed);
  }

  cached = out;
  cachedDir = dir;
  return cached;
}

/** Lookup a template by its `source_system` value. */
export function getTemplate(sourceSystem: string): ConnectorTemplate | undefined {
  return loadTemplateRegistry().find((t) => t.source_system === sourceSystem);
}

/** Test/dev hook — drop cached templates so next load re-reads from disk. */
export function _resetTemplateRegistryCacheForTesting(): void {
  cached = null;
  cachedDir = null;
}

interface TransformLike {
  expression?: unknown;
  source?: unknown;
  sources?: unknown;
}

function isTransformArray(value: unknown): value is TransformLike[] {
  return Array.isArray(value);
}

/**
 * Load templates and validate every transform expression. Validation failures
 * emit a structured warning (`event: 'template_validation_warning'`) — they do
 * NOT throw. Stub templates are skipped silently because their `mapping` values
 * are sentinel "TODO" strings that won't parse as expressions.
 */
export function initTemplateRegistry(log: Logger = {}): ConnectorTemplate[] {
  const templates = loadTemplateRegistry();
  const warn = log.warn ?? ((obj, msg) => console.warn(msg, JSON.stringify(obj)));

  for (const template of templates) {
    if (isStubTemplate(template)) continue;

    const transforms = (template.mapping as { transforms?: unknown }).transforms;
    if (!isTransformArray(transforms)) continue;

    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i] as TransformLike;
      if (typeof t?.expression !== 'string') continue;
      const sourceKeys =
        t.sources && typeof t.sources === 'object' && !Array.isArray(t.sources)
          ? Object.keys(t.sources as Record<string, unknown>)
          : undefined;
      const result = validateTransformExpression(t.expression, sourceKeys);
      if (!result.ok) {
        warn(
          {
            event: 'template_validation_warning',
            template_id: template.template_id,
            transform_index: i,
            expression: t.expression,
            error: result.message,
          },
          'connector template transform validation failed',
        );
      }
    }
  }

  return templates;
}
