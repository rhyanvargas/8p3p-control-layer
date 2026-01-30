# Signal Ingestion Specification

> Extracted from Solo Dev Execution Playbook, Component Interface Contracts, Contract Test Matrix, and Interface Validation Ruleset.

## Overview

The Signal Ingestion component is the entry point for all external signals into the 8P3P Control Layer. It receives signals via a REST API, validates them structurally (never semantically), enforces idempotency, and forwards accepted signals to the Signal Log.

**Lifecycle Position:** Stage 1 of 5 (Ingestion → Signal Log → STATE Engine → Decision Engine → Output)

## API Endpoint

```
POST /signals
```

### Request Schema: SignalEnvelope

```json
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "string (RFC3339)",
  "schema_version": "string",
  "payload": {},
  "metadata": {
    "correlation_id": "string",
    "trace_id": "string"
  }
}
```

### Response Schema: SignalIngestResult

```json
{
  "org_id": "string",
  "signal_id": "string",
  "status": "accepted | rejected | duplicate",
  "received_at": "string (RFC3339)",
  "rejection_reason": {
    "code": "string",
    "message": "string",
    "field_path": "string"
  }
}
```

## Field Validation Rules

### Required Fields

All of the following fields are required:

| Field | Type | Constraints |
|-------|------|-------------|
| `org_id` | string | 1–128 characters |
| `signal_id` | string | 1–256 characters, charset: `[A-Za-z0-9._:-]+` |
| `source_system` | string | 1–256 characters |
| `learner_reference` | string | 1–256 characters |
| `timestamp` | string | RFC3339 format, **timezone required** |
| `schema_version` | string | Pattern: `^v[0-9]+$` (e.g., `v1`, `v2`) |
| `payload` | object | JSON object (non-null), opaque content |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `metadata.correlation_id` | string | For request tracing |
| `metadata.trace_id` | string | For distributed tracing |

### Timestamp Validation

- Must be valid RFC3339 format
- **Timezone is required** (e.g., `2026-01-30T10:00:00Z` or `2026-01-30T10:00:00-05:00`)
- `2026-01-30T10:00:00` (no timezone) → **rejected**
- `2026-01-30 10:00:00` (space separator) → **rejected**

### Schema Version Validation

- Must match pattern `^v[0-9]+$`
- Valid: `v1`, `v2`, `v10`
- Invalid: `math-v2`, `lms-v1`, `1.0` → **rejected** with `invalid_schema_version`

### Signal ID Validation

- Allowed characters: `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, `-`
- Spaces or special characters → **rejected** with `invalid_charset`

## Forbidden Semantic Keys

The following keys are **globally forbidden** in the `payload` field at any nesting depth:

```
ui, screen, view, page, route, url, link, button, cta
workflow, task, job, assignment, assignee, owner
status, step, stage, completion, progress_percent
course, lesson, module, quiz, score, grade
content_id, content_url
```

If any forbidden key is detected:
- **Status:** `rejected`
- **Error code:** `forbidden_semantic_key_detected`
- **Field path:** Points to the exact location (e.g., `payload.ui`, `payload.x.y.workflow`)

### Detection Examples

```json
// Top-level forbidden key
{ "payload": { "ui": { "screen": "home" } } }
// → rejected, field_path="payload.ui"

// Nested forbidden key
{ "payload": { "x": { "y": { "workflow": { "step": "1" } } } } }
// → rejected, field_path="payload.x.y.workflow"
```

## Idempotency

Signals are deduplicated by the composite key: `(org_id, signal_id)`

| Scenario | Response Status |
|----------|-----------------|
| First submission | `accepted` |
| Duplicate submission (same org_id + signal_id) | `duplicate` |

**Determinism guarantee:** The same signal is never accepted twice for the same `(org_id, signal_id)` pair.

## Error Codes

| Code | Description | Example Trigger |
|------|-------------|-----------------|
| `missing_required_field` | Required field is absent | Omit `learner_reference` |
| `invalid_type` | Field has wrong type | `timestamp` is a number |
| `invalid_format` | Field format is wrong | Malformed JSON |
| `invalid_timestamp` | Timestamp not RFC3339 or missing timezone | `2026-01-25 10:00:00` |
| `invalid_length` | Field exceeds length limits | `org_id` > 128 chars |
| `invalid_charset` | Field contains invalid characters | `signal_id` with spaces |
| `invalid_schema_version` | schema_version doesn't match `^v[0-9]+$` | `math-v2` |
| `payload_not_object` | Payload is not a JSON object | `payload: []` |
| `forbidden_semantic_key_detected` | Forbidden key in payload | `payload.ui` |
| `duplicate_signal_id` | Signal already ingested | Repeat submission |
| `org_scope_required` | Missing or blank org_id | `org_id: ""` |
| `request_too_large` | Request body exceeds limit | Very large payload |

## Implementation Components

### 1. JSON Schema (`src/contracts/schemas/signal-envelope.json`)

Define the structural schema for SignalEnvelope validation.

### 2. Ajv Validator (`src/contracts/validators/signal-envelope.ts`)

Compile the JSON Schema with Ajv for runtime validation.

### 3. Forbidden Key Detector (`src/ingestion/forbidden-keys.ts`)

Recursive function to scan payload for forbidden semantic keys.

### 4. Idempotency Store (`src/ingestion/idempotency.ts`)

Store and check `(org_id, signal_id)` pairs for duplicate detection.

### 5. Ingestion Handler (`src/ingestion/handler.ts`)

Fastify route handler that orchestrates:
1. Parse request body
2. Validate with Ajv
3. Check forbidden keys
4. Check idempotency
5. Store in Signal Log
6. Return response

### 6. Fastify Route (`src/ingestion/routes.ts`)

Register `POST /signals` endpoint.

## Contract Tests

Implement all tests from the Contract Test Matrix:

| Test ID | Description | Expected |
|---------|-------------|----------|
| SIG-API-001 | Accept valid signal | `status=accepted` |
| SIG-API-002 | Missing required field | `rejected`, `missing_required_field` |
| SIG-API-003 | Invalid type (payload=[]) | `rejected`, `payload_not_object` |
| SIG-API-004 | Invalid timestamp format | `rejected`, `invalid_timestamp` |
| SIG-API-005 | Missing timezone | `rejected`, `invalid_timestamp` |
| SIG-API-006 | Invalid schema_version | `rejected`, `invalid_schema_version` |
| SIG-API-007 | Forbidden key (top-level) | `rejected`, `forbidden_semantic_key_detected` |
| SIG-API-008 | Forbidden key (nested) | `rejected`, `forbidden_semantic_key_detected` |
| SIG-API-009 | Invalid signal_id charset | `rejected`, `invalid_charset` |
| SIG-API-010 | Duplicate signal_id | First: `accepted`, Second: `duplicate` |
| SIG-API-011 | Deterministic rejection | Same error on repeat |

## File Structure

```
src/
├── contracts/
│   ├── schemas/
│   │   └── signal-envelope.json      # JSON Schema
│   └── validators/
│       └── signal-envelope.ts        # Compiled Ajv validator
├── ingestion/
│   ├── handler.ts                    # POST /signals handler
│   ├── routes.ts                     # Fastify route registration
│   ├── forbidden-keys.ts             # Semantic key detector
│   └── idempotency.ts                # Duplicate detection
└── shared/
    ├── error-codes.ts                # Canonical error codes
    └── types.ts                      # TypeScript types

tests/
└── contracts/
    └── signal-ingestion.test.ts      # SIG-API-* tests
```

## Success Criteria

Implementation is complete when:

- [ ] `POST /signals` accepts valid SignalEnvelope
- [ ] All required field validations work correctly
- [ ] Timestamp validation requires RFC3339 with timezone
- [ ] schema_version matches `^v[0-9]+$` only
- [ ] signal_id charset validation works
- [ ] Forbidden semantic keys rejected at any depth
- [ ] Idempotency: duplicates return `duplicate` status
- [ ] All SIG-API-001 through SIG-API-011 tests pass
- [ ] Determinism: same input always produces same output

## Dependencies

- **Ajv** - JSON Schema validation (add to package.json)
- **Fastify** - Already installed (v5.7.2)
- **better-sqlite3** - Already installed (for idempotency store)

## Notes

- **Structural validation only** - Never inspect semantic meaning of payload
- **Opaque payload** - Any valid JSON object is accepted (except forbidden keys)
- **No domain logic** - The control layer is domain-agnostic
- **Multi-tenant** - All operations scoped by `org_id`
