/**
 * Contract Drift Detection Tests (DRIFT-001 through DRIFT-008)
 *
 * Validates that JSON Schemas (source of truth) remain aligned with
 * their corresponding definitions in OpenAPI and AsyncAPI specs.
 *
 * Compares: required arrays, properties keys, enum values, and
 * nested required/properties on sub-objects (e.g., trace, metadata).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaShape {
  required?: string[];
  properties?: Record<string, SchemaShape & { enum?: string[] }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolve(dotPath: string, root: Record<string, unknown>): SchemaShape {
  const parts = dotPath.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`Path "${dotPath}" not found — failed at "${part}"`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as SchemaShape;
}

function sortedKeys(obj: Record<string, unknown> | undefined): string[] {
  return Object.keys(obj ?? {}).sort();
}

function sorted(arr: string[]): string[] {
  return [...arr].sort();
}

// ---------------------------------------------------------------------------
// Schema loading (shared across all tests)
// ---------------------------------------------------------------------------

let decisionJson: SchemaShape;
let signalJson: SchemaShape;
let openapiDecision: SchemaShape;
let openapiSignal: SchemaShape;
let asyncapiDecision: SchemaShape;
let asyncapiSignal: SchemaShape;

beforeAll(() => {
  const root = process.cwd();

  // JSON Schemas (source of truth)
  decisionJson = JSON.parse(
    readFileSync(join(root, 'src/contracts/schemas/decision.json'), 'utf-8'),
  );
  signalJson = JSON.parse(
    readFileSync(
      join(root, 'src/contracts/schemas/signal-envelope.json'),
      'utf-8',
    ),
  );

  // OpenAPI
  const openapi = YAML.parse(
    readFileSync(join(root, 'docs/api/openapi.yaml'), 'utf-8'),
  );
  openapiDecision = resolve('components.schemas.Decision', openapi);
  openapiSignal = resolve('components.schemas.SignalEnvelope', openapi);

  // AsyncAPI
  const asyncapi = YAML.parse(
    readFileSync(join(root, 'docs/api/asyncapi.yaml'), 'utf-8'),
  );
  asyncapiDecision = resolve('components.schemas.Decision', asyncapi);
  asyncapiSignal = resolve('components.schemas.Signal', asyncapi);
});

// ---------------------------------------------------------------------------
// Decision schema drift tests
// ---------------------------------------------------------------------------

describe('Decision contract drift', () => {
  it('DRIFT-001: Decision JSON Schema required fields match OpenAPI Decision.required', () => {
    expect(sorted(decisionJson.required ?? [])).toEqual(
      sorted(openapiDecision.required ?? []),
    );
  });

  it('DRIFT-002: Decision JSON Schema properties keys match OpenAPI Decision.properties keys', () => {
    expect(sortedKeys(decisionJson.properties)).toEqual(
      sortedKeys(openapiDecision.properties),
    );
  });

  it('DRIFT-003: Decision decision_type enum matches across JSON Schema, OpenAPI, and AsyncAPI', () => {
    const jsonEnum = sorted(
      decisionJson.properties?.decision_type?.enum ?? [],
    );
    const openapiEnum = sorted(
      openapiDecision.properties?.decision_type?.enum ?? [],
    );
    const asyncapiEnum = sorted(
      asyncapiDecision.properties?.decision_type?.enum ?? [],
    );

    expect(jsonEnum).toEqual(openapiEnum);
    expect(jsonEnum).toEqual(asyncapiEnum);
  });

  it('DRIFT-004: Decision trace.required fields match across all 3 sources', () => {
    const jsonTrace = decisionJson.properties?.trace;
    const openapiTrace = openapiDecision.properties?.trace;
    const asyncapiTrace = asyncapiDecision.properties?.trace;

    expect(jsonTrace?.required).toBeDefined();
    expect(openapiTrace?.required).toBeDefined();
    expect(asyncapiTrace?.required).toBeDefined();

    const jsonReq = sorted(jsonTrace!.required!);
    const openapiReq = sorted(openapiTrace!.required!);
    const asyncapiReq = sorted(asyncapiTrace!.required!);

    expect(jsonReq).toEqual(openapiReq);
    expect(jsonReq).toEqual(asyncapiReq);
  });
});

// ---------------------------------------------------------------------------
// Signal Envelope schema drift tests
// ---------------------------------------------------------------------------

describe('Signal Envelope contract drift', () => {
  it('DRIFT-005: Signal Envelope JSON Schema required fields match OpenAPI SignalEnvelope.required', () => {
    expect(sorted(signalJson.required ?? [])).toEqual(
      sorted(openapiSignal.required ?? []),
    );
  });

  it('DRIFT-006: Signal Envelope JSON Schema properties keys match OpenAPI SignalEnvelope.properties keys', () => {
    expect(sortedKeys(signalJson.properties)).toEqual(
      sortedKeys(openapiSignal.properties),
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-spec consistency tests (OpenAPI ↔ AsyncAPI)
// ---------------------------------------------------------------------------

describe('Cross-spec consistency', () => {
  it('DRIFT-007: AsyncAPI Decision schema matches OpenAPI Decision schema (required + properties + enums)', () => {
    // Top-level required
    expect(sorted(asyncapiDecision.required ?? [])).toEqual(
      sorted(openapiDecision.required ?? []),
    );

    // Top-level properties keys
    expect(sortedKeys(asyncapiDecision.properties)).toEqual(
      sortedKeys(openapiDecision.properties),
    );

    // decision_type enum
    expect(
      sorted(asyncapiDecision.properties?.decision_type?.enum ?? []),
    ).toEqual(
      sorted(openapiDecision.properties?.decision_type?.enum ?? []),
    );

    // trace sub-object
    const asyncTrace = asyncapiDecision.properties?.trace;
    const openapiTrace = openapiDecision.properties?.trace;
    expect(sorted(asyncTrace?.required ?? [])).toEqual(
      sorted(openapiTrace?.required ?? []),
    );
    expect(sortedKeys(asyncTrace?.properties)).toEqual(
      sortedKeys(openapiTrace?.properties),
    );
  });

  it('DRIFT-008: AsyncAPI Signal schema matches OpenAPI SignalEnvelope schema (required + properties)', () => {
    // Top-level required
    expect(sorted(asyncapiSignal.required ?? [])).toEqual(
      sorted(openapiSignal.required ?? []),
    );

    // Top-level properties keys
    expect(sortedKeys(asyncapiSignal.properties)).toEqual(
      sortedKeys(openapiSignal.properties),
    );

    // metadata sub-object (if present in both)
    const asyncMeta = asyncapiSignal.properties?.metadata;
    const openapiMeta = openapiSignal.properties?.metadata;
    if (asyncMeta && openapiMeta) {
      expect(sortedKeys(asyncMeta.properties)).toEqual(
        sortedKeys(openapiMeta.properties),
      );
    }
  });
});
