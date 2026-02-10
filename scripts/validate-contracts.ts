/**
 * Validate contract alignment between JSON Schemas (source of truth)
 * and their corresponding definitions in OpenAPI and AsyncAPI specs.
 *
 * Compares: required arrays, properties keys, enum values, and one
 * level of nested required/properties on sub-objects (e.g., trace, metadata).
 *
 * Exit code 0 = all aligned, 1 = mismatches detected.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaShape {
  required?: string[];
  properties?: Record<string, SchemaShape & { enum?: string[] }>;
}

interface ContractMapping {
  jsonSchemaId: string;
  openapiPath: string; // dot-path under components.schemas
  asyncapiPath: string; // dot-path under components.schemas
}

interface Mismatch {
  schema: string;
  field: string;
  source: string;
  sourceValue: string;
  target: string;
  targetValue: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAPPING: ContractMapping[] = [
  {
    jsonSchemaId: 'decision',
    openapiPath: 'Decision',
    asyncapiPath: 'Decision',
  },
  {
    jsonSchemaId: 'signal-envelope',
    openapiPath: 'SignalEnvelope',
    asyncapiPath: 'Signal',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortedJson(arr: string[]): string {
  return JSON.stringify([...arr].sort());
}

function getNestedSchema(
  root: Record<string, unknown>,
  dotPath: string,
): SchemaShape | undefined {
  const parts = dotPath.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current as SchemaShape | undefined;
}

function compareArraysAsSet(
  a: string[],
  b: string[],
  label: string,
  schemaName: string,
  sourceName: string,
  targetName: string,
  mismatches: Mismatch[],
): void {
  const sortedA = sortedJson(a);
  const sortedB = sortedJson(b);
  if (sortedA !== sortedB) {
    mismatches.push({
      schema: schemaName,
      field: label,
      source: sourceName,
      sourceValue: sortedA,
      target: targetName,
      targetValue: sortedB,
    });
  }
}

/**
 * Compare two schema shapes at one level: required, property keys, and enums.
 * Then recurse one level into sub-object properties.
 */
function compareSchemas(
  jsonSchema: SchemaShape,
  apiSchema: SchemaShape,
  schemaName: string,
  sourceName: string,
  targetName: string,
  mismatches: Mismatch[],
  prefix = '',
): void {
  const fieldPrefix = prefix ? `${prefix}.` : '';

  // Compare required arrays
  const jsonRequired = jsonSchema.required ?? [];
  const apiRequired = apiSchema.required ?? [];
  compareArraysAsSet(
    jsonRequired,
    apiRequired,
    `${fieldPrefix}required`,
    schemaName,
    sourceName,
    targetName,
    mismatches,
  );

  // Compare properties keys
  const jsonProps = Object.keys(jsonSchema.properties ?? {});
  const apiProps = Object.keys(apiSchema.properties ?? {});
  compareArraysAsSet(
    jsonProps,
    apiProps,
    `${fieldPrefix}properties`,
    schemaName,
    sourceName,
    targetName,
    mismatches,
  );

  // Compare enum values on matching properties
  const jsonProperties = jsonSchema.properties ?? {};
  const apiProperties = apiSchema.properties ?? {};
  const allPropKeys = new Set([...jsonProps, ...apiProps]);

  for (const key of allPropKeys) {
    const jsonProp = jsonProperties[key];
    const apiProp = apiProperties[key];
    if (!jsonProp || !apiProp) continue;

    // Enum comparison
    if (jsonProp.enum || apiProp.enum) {
      const jsonEnum = jsonProp.enum ?? [];
      const apiEnum = apiProp.enum ?? [];
      compareArraysAsSet(
        jsonEnum,
        apiEnum,
        `${fieldPrefix}${key}.enum`,
        schemaName,
        sourceName,
        targetName,
        mismatches,
      );
    }

    // One-level nesting: if the property has its own required/properties, compare those too
    if (
      (jsonProp.required || jsonProp.properties) &&
      (apiProp.required || apiProp.properties)
    ) {
      compareSchemas(
        jsonProp,
        apiProp,
        schemaName,
        sourceName,
        targetName,
        mismatches,
        `${fieldPrefix}${key}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const schemasDir = join(process.cwd(), 'src', 'contracts', 'schemas');
const openapiPath = join(process.cwd(), 'docs', 'api', 'openapi.yaml');
const asyncapiPath = join(process.cwd(), 'docs', 'api', 'asyncapi.yaml');

// Load JSON Schemas keyed by $id
const jsonSchemas = new Map<string, SchemaShape>();
const schemaFiles = readdirSync(schemasDir).filter((f) => f.endsWith('.json'));

if (schemaFiles.length === 0) {
  console.log('No JSON schema files found in src/contracts/schemas/');
  process.exit(0);
}

for (const file of schemaFiles) {
  const content = JSON.parse(readFileSync(join(schemasDir, file), 'utf-8'));
  const id = content.$id as string;
  if (id) {
    jsonSchemas.set(id, content);
  }
}

// Load API specs
const openapi = YAML.parse(readFileSync(openapiPath, 'utf-8'));
const asyncapi = YAML.parse(readFileSync(asyncapiPath, 'utf-8'));

// Validate
const mismatches: Mismatch[] = [];
const warnings: string[] = [];

for (const mapping of MAPPING) {
  const jsonSchema = jsonSchemas.get(mapping.jsonSchemaId);
  if (!jsonSchema) {
    warnings.push(
      `⚠ No JSON Schema found with $id="${mapping.jsonSchemaId}" — skipping`,
    );
    continue;
  }

  // OpenAPI comparison
  const openapiSchema = getNestedSchema(
    openapi,
    `components.schemas.${mapping.openapiPath}`,
  );
  if (!openapiSchema) {
    mismatches.push({
      schema: mapping.jsonSchemaId,
      field: 'schema',
      source: `src/contracts/schemas/${mapping.jsonSchemaId}.json`,
      sourceValue: 'exists',
      target: `docs/api/openapi.yaml → components.schemas.${mapping.openapiPath}`,
      targetValue: 'missing',
    });
  } else {
    compareSchemas(
      jsonSchema,
      openapiSchema,
      mapping.jsonSchemaId,
      `src/contracts/schemas/${mapping.jsonSchemaId}.json`,
      `openapi.yaml → ${mapping.openapiPath}`,
      mismatches,
    );
    console.log(
      `✓ ${mapping.jsonSchemaId} ↔ openapi.yaml (${mapping.openapiPath})`,
    );
  }

  // AsyncAPI comparison
  const asyncapiSchema = getNestedSchema(
    asyncapi,
    `components.schemas.${mapping.asyncapiPath}`,
  );
  if (!asyncapiSchema) {
    mismatches.push({
      schema: mapping.jsonSchemaId,
      field: 'schema',
      source: `src/contracts/schemas/${mapping.jsonSchemaId}.json`,
      sourceValue: 'exists',
      target: `docs/api/asyncapi.yaml → components.schemas.${mapping.asyncapiPath}`,
      targetValue: 'missing',
    });
  } else {
    compareSchemas(
      jsonSchema,
      asyncapiSchema,
      mapping.jsonSchemaId,
      `src/contracts/schemas/${mapping.jsonSchemaId}.json`,
      `asyncapi.yaml → ${mapping.asyncapiPath}`,
      mismatches,
    );
    console.log(
      `✓ ${mapping.jsonSchemaId} ↔ asyncapi.yaml (${mapping.asyncapiPath})`,
    );
  }
}

// Check for unmapped JSON Schemas
for (const [id] of jsonSchemas) {
  if (!MAPPING.some((m) => m.jsonSchemaId === id)) {
    warnings.push(
      `⚠ JSON Schema "$id=${id}" has no mapping to OpenAPI/AsyncAPI — consider adding one`,
    );
  }
}

// Report
if (warnings.length > 0) {
  console.log('');
  for (const w of warnings) {
    console.log(w);
  }
}

if (mismatches.length > 0) {
  console.error('\n✗ Contract mismatches detected:\n');
  for (const m of mismatches) {
    console.error(`  Schema: ${m.schema}`);
    console.error(`  Field:  ${m.field}`);
    console.error(`  Source: ${m.source} → ${m.sourceValue}`);
    console.error(`  Target: ${m.target} → ${m.targetValue}`);
    console.error('');
  }
  console.error(`${mismatches.length} mismatch(es) found.`);
  process.exit(1);
} else {
  console.log(`\nAll contracts aligned (${MAPPING.length} mappings verified).`);
  process.exit(0);
}
