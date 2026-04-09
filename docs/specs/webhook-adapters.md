# Webhook Adapters

> Accept raw LMS webhook payloads directly — no client-side `SignalEnvelope` construction required. The adapter extracts envelope fields from the body using declarative config and feeds the existing ingestion pipeline unchanged.

## Overview

The current `POST /v1/signals` endpoint requires clients to construct a fully-formed `SignalEnvelope` (with `org_id`, `signal_id`, `learner_reference`, `timestamp`, etc.) before sending. For pilot customers integrating with LMS platforms like Canvas, this means building a custom transformation layer on their side — a developer task that delays onboarding and creates a maintenance burden for every new data source.

This spec introduces `POST /v1/webhooks/:source_system` — a thin adapter layer that:
1. Accepts a raw LMS webhook payload (e.g., a Canvas assignment submission POST)
2. Extracts envelope fields (`learner_reference`, `signal_id`, `timestamp`) from the raw body using a declarative config stored in `FieldMappingsTable` (same table as tenant field mappings, new `envelope` attribute)
3. Constructs a valid `SignalEnvelope` internally
4. Feeds it directly into the existing ingestion pipeline (`POST /v1/signals` core logic)

The school configures their LMS webhook to fire at `https://api.8p3p.dev/v1/webhooks/canvas-lms` with their API key. 8P3P handles the rest. No custom integration code required.

**Domain knowledge stays tenant-owned:** The adapter config (which field contains the learner ID, etc.) is declarative JSON uploaded by the operator or customer via admin API. The platform executes the extraction; it does not embed LMS-specific logic in application code.

---

## Endpoints

### `POST /v1/webhooks/:source_system`

Accept a raw LMS webhook payload and ingest it as a signal.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `source_system` | LMS identifier — must match a configured envelope mapping in `FieldMappingsTable` (e.g., `canvas-lms`, `iready`, `branching-minds`) |

**Request Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | Tenant API key (same as `POST /v1/signals`) |
| `Content-Type` | Yes | `application/json` |

**Request Body:**

Raw LMS webhook JSON. Not an 8P3P `SignalEnvelope`. Shape is LMS-specific and opaque to 8P3P — transformed via `envelope_mapping` config.

**Example (Canvas submission webhook):**

```json
{
  "submission": {
    "id": "sub_98765",
    "user_id": "canvas_student_001",
    "submitted_at": "2026-03-28T10:30:00Z",
    "score": 68,
    "assignment": { "points_possible": 100 }
  },
  "event_type": "submission_created"
}
```

**Response (202):**

```json
{
  "org_id": "springs",
  "signal_id": "sub_98765",
  "source_system": "canvas-lms",
  "status": "accepted",
  "received_at": "2026-03-28T10:30:01Z"
}
```

**Response (204) — event type filtered out (silently dropped):**

Returned when the webhook body's event type is not in the configured `allowed_event_types`. No body. No signal created, no LIU consumed.

**Response (400) — missing or misconfigured envelope mapping:**

```json
{
  "error": {
    "code": "missing_envelope_mapping",
    "message": "No envelope mapping configured for org 'springs' + source_system 'canvas-lms'. Use PUT /v1/admin/mappings/springs/canvas-lms to configure."
  }
}
```

**Response (400) — envelope field extraction failure:**

```json
{
  "error": {
    "code": "envelope_extraction_failed",
    "message": "Cannot extract learner_reference: path 'submission.user_id' not found in webhook body."
  }
}
```

**Response (409) — duplicate signal (idempotency):**

Same as `POST /v1/signals` — `status: "duplicate"`, `received_at` from original.

---

### Admin API: Envelope Mapping

Envelope extraction config lives in `FieldMappingsTable` as a new `envelope` attribute on each mapping item, managed via the existing admin mapping API:

`PUT /v1/admin/mappings/:org_id/:source_system` — body now includes optional `envelope` block alongside existing `required`, `aliases`, `types`, `transforms`.

---

## Envelope Mapping Config

The `envelope` block within a tenant mapping config defines how to extract `SignalEnvelope` fields from the raw webhook body. All paths use dot-notation into the top-level body JSON.

```json
{
  "envelope": {
    "learner_reference_path": "submission.user_id",
    "signal_id_path": "submission.id",
    "timestamp_path": "submission.submitted_at",
    "event_type_path": "event_type",
    "allowed_event_types": ["submission_created", "submission_updated"]
  },
  "required": ["stabilityScore"],
  "transforms": [
    { "target": "stabilityScore", "source": "submission.score", "expression": "value / 100" }
  ]
}
```

| Config field | Required | Fallback | Description |
|---|---|---|---|
| `learner_reference_path` | **Yes** | — | Dot-path to learner identifier in webhook body (must resolve to a string or number) |
| `signal_id_path` | No | Auto-generated UUID | Dot-path to a unique signal identifier. If absent or empty, a UUID is generated |
| `timestamp_path` | No | Server `now()` (ISO 8601) | Dot-path to a timestamp field. If absent or not a parseable ISO 8601 string, falls back to ingestion time |
| `event_type_path` | No | — | Dot-path to an event type discriminator in the webhook body (e.g. `event_type`). When set, the adapter reads this field and checks it against `allowed_event_types`. When absent, all webhooks are processed. |
| `allowed_event_types` | No | — (accept all) | Array of event type strings relevant to learning signals. Webhooks whose `event_type_path` value is **not** in this list are silently dropped with a `204 No Content` (no signal created, no error). Only evaluated when `event_type_path` is configured. LMS platforms emit many event types (e.g. Canvas fires `enrollment_created`, `grade_change`, `submission_created`, etc.); this filter ensures only pedagogically relevant events consume LIUs. |

`schema_version` is fixed at `"1.0.0"` for all webhook-ingested signals. `org_id` is derived from the `x-api-key` tenant lookup (same as all `/v1/*` routes).

---

## Adapter Pipeline

```
POST /v1/webhooks/canvas-lms
       │
       ▼
1. API key auth → resolve org_id
2. Load envelope mapping from FieldMappingsTable (GetItem org_id + source_system)
   → 400 missing_envelope_mapping if not found
3. Event type filter (if event_type_path configured):
   - Read event type from body via dot-path
   - If value is NOT in allowed_event_types → 204 No Content (silently drop; no signal, no error)
   - If value IS in allowed_event_types or no filter configured → continue
4. Extract envelope fields via dot-path:
   - learner_reference (required)
   - signal_id (optional; auto UUID)
   - timestamp (optional; fallback now())
   → 400 envelope_extraction_failed if learner_reference path missing
5. Construct SignalEnvelope:
   {
     org_id: <from key>,
     signal_id: <extracted or generated>,
     source_system: <path param>,
     learner_reference: <extracted>,
     timestamp: <extracted or now()>,
     schema_version: "1.0.0",
     payload: <full raw body>
   }
6. Pass to existing ingestion core (same logic as POST /v1/signals)
   → forbidden key detection
   → tenant field mappings (aliases, transforms) [uses same FieldMappingsTable item]
   → required field enforcement
   → type enforcement
   → idempotency check
   → signal log storage
   → state application
   → decision evaluation
7. Return SignalIngestResult (same shape as POST /v1/signals)
```

---

## Requirements

### Functional

- [ ] `POST /v1/webhooks/:source_system` accepts raw JSON body and requires `x-api-key`
- [ ] Endpoint loads envelope mapping config for `(org_id, source_system)` from `FieldMappingsTable` via `GetItem`
- [ ] If no mapping exists, returns 400 `missing_envelope_mapping` with actionable message
- [ ] **Event type filtering**: When `event_type_path` and `allowed_event_types` are configured, the adapter reads the event type from the body and drops non-matching events with `204 No Content`. When filter config is absent, all events proceed to ingestion.
- [ ] Extracts `learner_reference` from body via configured dot-path; returns 400 `envelope_extraction_failed` if path is absent or resolves to null/undefined
- [ ] Extracts `signal_id` from body if `signal_id_path` configured; otherwise generates UUID v4
- [ ] Extracts `timestamp` from body if `timestamp_path` configured and value is a valid ISO 8601 string; otherwise falls back to server `new Date().toISOString()`
- [ ] Constructs a valid `SignalEnvelope` and passes it to the existing ingestion handler core (shared logic with `POST /v1/signals` — no duplication)
- [ ] Idempotency behavior is identical to `POST /v1/signals` (same `signal_id` → `status: "duplicate"`)
- [ ] Returns the same `SignalIngestResult` shape as `POST /v1/signals` with HTTP 200/202
- [ ] Envelope config lives in `FieldMappingsTable` alongside field mapping config (same `PutItem` / `GetItem` patterns — no new DynamoDB table)
- [ ] Admin `PUT /v1/admin/mappings/:org_id/:source_system` body schema is extended to include optional `envelope` block; existing mappings without `envelope` block are not affected (backward compatible)
- [ ] Endpoint is registered under the existing `/v1` API key scope (not admin-only)

### Acceptance Criteria

- Given a Canvas webhook body with `submission.user_id: "canvas_student_001"`, when `POST /v1/webhooks/canvas-lms` is called with a valid API key, then a signal is created with `learner_reference: "canvas_student_001"` and the pipeline produces a decision
- Given no envelope mapping is configured for `springs/canvas-lms`, when `POST /v1/webhooks/canvas-lms` is called, then 400 `missing_envelope_mapping` is returned
- Given `signal_id_path` is not configured, when the endpoint is called, then `signal_id` is an auto-generated UUID and the signal is accepted
- Given the same raw webhook body is sent twice (same extracted `signal_id`), then the second call returns `status: "duplicate"` with the original `received_at`
- Given `learner_reference_path: "submission.user_id"` but the body has no `submission.user_id`, then 400 `envelope_extraction_failed` is returned
- Given a valid call, the raw body flows into the tenant field mapping pipeline so configured transforms execute on the payload
- Given `event_type_path: "event_type"` and `allowed_event_types: ["submission_created"]`, when a webhook with `event_type: "enrollment_created"` is received, then `204 No Content` is returned and no signal is created
- Given `event_type_path: "event_type"` and `allowed_event_types: ["submission_created"]`, when a webhook with `event_type: "submission_created"` is received, then the signal is ingested normally
- Given no `event_type_path` is configured in the mapping, all webhook events proceed to ingestion regardless of body content

---

## Constraints

- **Single endpoint, no LMS-specific code** — all LMS adaptation is configuration, not code branches. Canvas, iReady, Branching Minds, etc. are all handled identically via their respective config.
- **Payload is the full raw body** — `SignalEnvelope.payload` receives the entire webhook body. Existing field mapping transforms run on this payload. No pre-filtering or trimming in the adapter.
- **`schema_version` is fixed** — `"1.0.0"` for all webhook-ingested signals. If schema versioning per LMS is needed, defer to a future micro-spec.
- **No webhook verification (v1.1)** — LMS-specific HMAC signature verification (e.g., Canvas webhook shared secret) is out of scope for pilot. Rely on API key auth.
- **No fan-out** — one webhook call produces one signal. LMS batched webhook events (multiple submissions in one body) are not supported in v1.1.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| LMS HMAC signature verification (Canvas `x-canvas-signature`) | Rely on API key for pilot security | Customer security requirement raised |
| Batched webhook bodies (array of events) | One call = one signal for simplicity | High-volume LMS batch mode required |
| Async webhook processing (queue → Lambda) | Synchronous is sufficient for pilot | Webhook volume exceeds Lambda timeout tolerance |
| Multi-field `learner_reference` composition (e.g., `course_id` + `user_id`) | Single dot-path for v1.1 | Customer needs composite learner ID namespace |
| Webhook replay / retry tracking | Covered by idempotency (same `signal_id` = duplicate) | LMS delivery guarantees analysis |
| S3 raw payload archive | Store raw webhook bodies in S3 before transformation for audit trail and replay. Adds cost and latency for pilot; defer to Phase 2 when volume/compliance justifies it. | Phase 2 — compliance requirement or customer replay request |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `POST /v1/signals` ingestion core (handler-core extraction) | `docs/specs/signal-ingestion.md`, `docs/specs/aws-deployment.md` TASK-001 | **Required — TASK-001 must be complete** |
| `FieldMappingsTable` + `GetItem` patterns | `docs/specs/tenant-field-mappings.md` | Spec'd (v1.1) |
| `normalizeAndValidateTenantPayload()` (alias + transform pipeline) | `docs/specs/tenant-field-mappings.md` | Spec'd (v1.1) |
| API key middleware (`x-api-key` → `org_id`) | `docs/specs/api-key-middleware.md` | **Complete** |
| `SignalEnvelope` type | `src/shared/types.ts` | **Complete** |
| Idempotency check | `docs/specs/signal-ingestion.md` | **Complete** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Raw LMS webhook ingestion | Pilot integration guide, customer onboarding quickstart |
| `envelope` attribute on `FieldMappingsTable` items | `docs/specs/tenant-field-mappings.md` (extended admin `PUT` body) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | Auth middleware |
| `missing_required_field` | Signal ingestion + tenant field mappings |
| `invalid_type` | Tenant field mappings |
| `invalid_format` | Ingestion validation |

### New (add during implementation)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `missing_envelope_mapping` | 400 | No envelope mapping configured for the org + source_system combination. Admin must upload config via `PUT /v1/admin/mappings/:org_id/:source_system`. |
| `envelope_extraction_failed` | 400 | A required envelope field (e.g., `learner_reference`) could not be extracted from the webhook body using the configured dot-path. |
| `filtered_event_type` | 204 | Webhook event type not in `allowed_event_types` — silently dropped. Logged at `debug` level for observability; not surfaced to caller. |

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| WHK-001 | Happy path — valid webhook, envelope mapping configured | Canvas-shaped body, mapping with `learner_reference_path: "submission.user_id"` | 200 `accepted`, signal created with `learner_reference: "canvas_student_001"` |
| WHK-002 | Missing envelope mapping | Valid body, no FieldMappingsTable item for org + source_system | 400 `missing_envelope_mapping` |
| WHK-003 | Envelope extraction failure — learner_reference path missing | Body has no `submission.user_id`; mapping expects it | 400 `envelope_extraction_failed` |
| WHK-004 | Auto-generated signal_id | Mapping has no `signal_id_path`; valid body | 200 `accepted`; `signal_id` in response is a valid UUID v4 |
| WHK-005 | Idempotency — duplicate webhook | Same body sent twice (same extracted `signal_id`) | Second response: 200 `status: "duplicate"`, `received_at` from first call |
| WHK-006 | Tenant field mapping transforms execute on payload | Body: `{ submission: { score: 65 } }`; mapping has transform `value/100 → stabilityScore` | Signal accepted; state contains `stabilityScore: 0.65` |
| WHK-007 | Auth required | No `x-api-key` header | 401 |
| WHK-008 | Timestamp fallback | Mapping has no `timestamp_path`; valid body | Signal accepted; `timestamp` in stored signal is a valid ISO 8601 server-time |
| WHK-009 | Event type filter — allowed event proceeds | `event_type_path: "event_type"`, `allowed_event_types: ["submission_created"]`; body `event_type: "submission_created"` | 200 `accepted` — signal created |
| WHK-010 | Event type filter — disallowed event silently dropped | Same config; body `event_type: "enrollment_created"` | 204 No Content — no signal created, no error |
| WHK-011 | Event type filter — no filter configured, all events pass | No `event_type_path` in mapping config; any body | Signal proceeds to ingestion normally |

> **Test strategy:** WHK-001 through WHK-011 are integration tests using Fastify `inject` with mocked `FieldMappingsTable` GetItem. WHK-005 requires inserting a signal into the idempotency store before the second call. WHK-006 requires a matching tenant field mapping with a transform fixture. WHK-009 through WHK-011 test event type filtering at the adapter layer before envelope extraction.

---

## Notes

- **Implementation note:** The webhook adapter shares the `handleSignalIngestion` core with `POST /v1/signals` once the handler-core extraction (aws-deployment TASK-001) is complete. The adapter is a thin Fastify route that builds a `SignalEnvelope` and delegates to the same core — zero duplication.
- **Operator onboarding:** After this spec is implemented, the pilot onboarding process becomes: (1) configure LMS webhook URL in Canvas admin → `POST /v1/webhooks/canvas-lms`, (2) upload envelope mapping via admin API, (3) signals flow automatically.
- **Security note:** For production (post-pilot), implement Canvas webhook HMAC verification using the `x-canvas-signature` header and the shared secret from the Canvas webhook subscription. Store the secret in SSM alongside `ADMIN_API_KEY`.

---

*Spec updated: 2026-04-06 — v1.1.1 adds event type filtering (`event_type_path` + `allowed_event_types`), 204 silent drop for non-learning events, S3 raw archive deferred to Phase 2. Original v1.1 spec created: 2026-03-28. Depends on: signal-ingestion.md, tenant-field-mappings.md, api-key-middleware.md, aws-deployment.md (handler-core extraction)*
