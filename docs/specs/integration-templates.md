# Integration Templates (Connector Layer — Activation UX)

> Pre-built, one-click connectors for known LMS platforms. Activate a connector, configure event types, receive a webhook URL — no custom integration code required.

## Overview

The 8P3P Control Layer has a generic transform engine (`tenant-field-mappings.md`) and a raw webhook adapter (`webhook-adapters.md`) that together can ingest signals from any LMS. But using them today requires an admin to manually construct JSON mapping config — knowing the exact source field paths, transform expressions, and envelope extraction config for their LMS. This is the **"connector tax"** that makes every pilot a custom engineering project.

Integration Templates eliminate this tax. 8P3P ships pre-built templates for known platforms (Canvas, I-Ready, Branching Minds). An admin activates a connector via a single API call; the system copies the template into `FieldMappingsTable`, returns the webhook URL, and signals start flowing.

**Architectural relationship:** This spec defines **Layer 3** of the Connector Layer stack. It does not change Layers 1 or 2 — it writes into the same `FieldMappingsTable` they already read from.

```
┌─────────────────────────────────────────────────────┐
│  LAYER 3: Connector Activation UX       ← THIS SPEC │
│  Activate → configure event types → get webhook URL │
├─────────────────────────────────────────────────────┤
│  LAYER 2: Webhook Adapter (raw payload ingestion)   │
│  POST /v1/webhooks/:source_system                   │
│  Spec: webhook-adapters.md                          │
├─────────────────────────────────────────────────────┤
│  LAYER 1: Transform Engine (payload normalization)  │
│  aliases → transforms → required → types            │
│  Spec: tenant-field-mappings.md                     │
├─────────────────────────────────────────────────────┤
│  FOUNDATION: Signal Ingestion Pipeline              │
│  POST /v1/signals → state → decision                │
│  Spec: signal-ingestion.md                          │
└─────────────────────────────────────────────────────┘
```

---

## Template Registry

Templates are **bundled JSON files** shipped with the API deployment, not stored in DynamoDB. This keeps template definitions versioned alongside application code and avoids a new DynamoDB table.

Each template is a file at `src/connector-templates/{source_system}.json` containing the full mapping config (envelope + transforms + event types) that would otherwise be manually constructed via `PUT /v1/admin/mappings`.

### Template Shape

```json
{
  "template_id": "canvas-lms-v1",
  "template_version": "1.0.0",
  "source_system": "canvas-lms",
  "display_name": "Canvas LMS",
  "description": "Ingests assignment submissions and grade updates from Instructure Canvas.",
  "setup_instructions": "In Canvas, navigate to Admin → Developer Keys → Webhooks. Add the webhook URL below and include your x-api-key header as a custom header.",
  "default_event_types": ["submission_created", "grade_updated"],
  "available_event_types": [
    { "event_type": "submission_created", "description": "Student submits an assignment" },
    { "event_type": "grade_updated", "description": "Instructor updates a grade" },
    { "event_type": "quiz_submitted", "description": "Student submits a quiz" }
  ],
  "mapping": {
    "envelope": {
      "learner_reference_path": "submission.user_id",
      "signal_id_path": "submission.id",
      "timestamp_path": "submission.submitted_at",
      "event_type_path": "event_type",
      "allowed_event_types": ["submission_created", "grade_updated"]
    },
    "required": ["stabilityScore"],
    "aliases": {
      "stabilityScore": ["stability_score"]
    },
    "types": {
      "stabilityScore": "number"
    },
    "transforms": [
      {
        "target": "stabilityScore",
        "source": "submission.score",
        "expression": "value / 100"
      }
    ]
  },
  "test_payload": {
    "submission": {
      "id": "test_sub_001",
      "user_id": "test_learner_001",
      "submitted_at": "2026-04-06T10:00:00Z",
      "score": 68,
      "assignment": { "points_possible": 100 }
    },
    "event_type": "submission_created"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `template_id` | string | Unique, immutable identifier (e.g. `canvas-lms-v1`) |
| `template_version` | string | Semver. Bumped when 8P3P updates the template (e.g. LMS changes webhook schema) |
| `source_system` | string | Must match the `:source_system` path param in `POST /v1/webhooks/:source_system` |
| `display_name` | string | Human-readable name for API responses / future UI |
| `description` | string | One-line description of what this connector ingests |
| `setup_instructions` | string | Plain-text instructions returned at activation time |
| `default_event_types` | string[] | Pre-selected event types applied at activation (admin can override) |
| `available_event_types` | array | All event types this connector supports, with descriptions |
| `mapping` | object | Full `FieldMappingsTable` mapping config: `envelope`, `required`, `aliases`, `types`, `transforms` |
| `test_payload` | object | Sample webhook body for this LMS — used by the test endpoint and for documentation. Must be a realistic payload that exercises the template's transforms and envelope extraction. |

### Pilot Templates

| Template ID | Source System | Status | Notes |
|---|---|---|---|
| `canvas-lms-v1` | `canvas-lms` | **Ship with pilot** | Validated against Canvas webhook JSON during Springs onboarding |
| `iready-v1` | `iready` | **Ship with pilot** | I-Ready webhook schema TBD — stub template with documented placeholders |
| `branching-minds-v1` | `branching-minds` | **Ship with pilot** | Branching Minds webhook schema TBD — stub template |

> Stub templates have `mapping` fields marked as `TODO` and cannot be activated until validated against real LMS payloads. The activation endpoint returns `400 template_not_ready` for stubs.

---

## Endpoints

All endpoints are admin-scoped and use the `x-admin-api-key` header (same auth as `docs/specs/policy-management-api.md`).

### `GET /v1/admin/connectors`

List all available connectors with per-org activation status.

**Response (200):**

```json
{
  "connectors": [
    {
      "source_system": "canvas-lms",
      "display_name": "Canvas LMS",
      "description": "Ingests assignment submissions and grade updates from Instructure Canvas.",
      "template_id": "canvas-lms-v1",
      "template_version": "1.0.0",
      "status": "activated",
      "activated_at": "2026-04-06T10:00:00Z",
      "event_types": ["submission_created", "grade_updated"],
      "webhook_url": "https://api.8p3p.dev/v1/webhooks/canvas-lms"
    },
    {
      "source_system": "iready",
      "display_name": "I-Ready",
      "description": "Ingests diagnostic and instructional data from Curriculum Associates I-Ready.",
      "template_id": "iready-v1",
      "template_version": "1.0.0",
      "status": "available",
      "activated_at": null,
      "event_types": null,
      "webhook_url": null
    }
  ]
}
```

**Status values:**

| Status | Meaning |
|---|---|
| `available` | Template exists. Not activated for this org. |
| `activated` | Template copied to `FieldMappingsTable`. Webhook URL is live. Signals will flow once the LMS fires webhooks. |
| `not_ready` | Template is a stub (mapping fields incomplete). Cannot be activated yet. |

**How status is derived:** The endpoint loads all templates from the bundled registry, then queries `FieldMappingsTable` via `Query(PK=org_id)` to check which `source_system` values have a row with a `template_id`. If a matching row exists → `activated`. If the template mapping contains `TODO` markers → `not_ready`. Otherwise → `available`.

---

### `POST /v1/admin/connectors/activate`

Activate a connector for the authenticated org. Copies the template mapping into `FieldMappingsTable` and returns the webhook URL + setup instructions.

**Request Body:**

```json
{
  "source_system": "canvas-lms"
}
```

**Response (201 Created):**

```json
{
  "source_system": "canvas-lms",
  "status": "activated",
  "webhook_url": "https://api.8p3p.dev/v1/webhooks/canvas-lms",
  "event_types": ["submission_created", "grade_updated"],
  "setup_instructions": "In Canvas, navigate to Admin → Developer Keys → Webhooks. Add the webhook URL above and include your x-api-key header as a custom header.",
  "template_id": "canvas-lms-v1",
  "template_version": "1.0.0",
  "activated_at": "2026-04-06T10:00:00Z"
}
```

**Activation internals:**

1. Load template from bundled registry by `source_system`
2. Validate template is not a stub (`not_ready` check)
3. Check `FieldMappingsTable` for existing row at `(org_id, source_system)`:
   - If row exists with `template_id` → return 409 `connector_already_activated`
   - If row exists without `template_id` (custom mapping) → return 409 `custom_mapping_exists` with a message suggesting `force: true` to override
4. Write `PutItem` to `FieldMappingsTable`:
   - `org_id`: from admin key → org resolution
   - `source_system`: from request body
   - `mapping`: deep copy of template `mapping` (including `envelope`, `transforms`, `required`, etc.)
   - `template_id`: from template
   - `template_version`: from template
   - `mapping_version`: 1
   - `updated_at`: ISO 8601 now
   - `updated_by`: admin key prefix
5. Invalidate field mapping cache for `(org_id, source_system)` — per `tenant-field-mappings.md` cache invalidation pattern
6. Construct `webhook_url` from `WEBHOOK_BASE_URL` env + `/v1/webhooks/{source_system}`
7. Return activation response with setup instructions

**Force override (optional):**

```json
{
  "source_system": "canvas-lms",
  "force": true
}
```

When `force: true`, the activation overwrites any existing `FieldMappingsTable` row for this `(org_id, source_system)`, regardless of whether it was template-sourced or custom. The previous mapping is lost. Use case: re-activating after a template upgrade or resetting a broken custom override.

---

### `PUT /v1/admin/connectors/:source_system/config`

Update the event type selection for an activated connector.

**Request Body:**

```json
{
  "event_types": ["submission_created", "grade_updated", "quiz_submitted"]
}
```

**Response (200):**

```json
{
  "source_system": "canvas-lms",
  "event_types": ["submission_created", "grade_updated", "quiz_submitted"],
  "updated_at": "2026-04-06T11:00:00Z"
}
```

**Internals:**

1. Load `FieldMappingsTable` item for `(org_id, source_system)`
2. If no item or no `template_id` → 404 `connector_not_activated`
3. Validate each `event_type` is in the template's `available_event_types` list → 400 `invalid_event_type` if unknown
4. Update the item's `mapping.envelope.allowed_event_types` array
5. `UpdateItem` with optimistic lock on `mapping_version`
6. Invalidate field mapping cache
7. Return confirmation

---

### `GET /v1/admin/connectors/:source_system`

Get details for a specific connector, including activation status and current config.

**Response (200) — activated:**

```json
{
  "source_system": "canvas-lms",
  "display_name": "Canvas LMS",
  "status": "activated",
  "template_id": "canvas-lms-v1",
  "template_version": "1.0.0",
  "activated_at": "2026-04-06T10:00:00Z",
  "event_types": ["submission_created", "grade_updated"],
  "available_event_types": [
    { "event_type": "submission_created", "description": "Student submits an assignment" },
    { "event_type": "grade_updated", "description": "Instructor updates a grade" },
    { "event_type": "quiz_submitted", "description": "Student submits a quiz" }
  ],
  "webhook_url": "https://api.8p3p.dev/v1/webhooks/canvas-lms",
  "setup_instructions": "In Canvas, navigate to Admin → Developer Keys → Webhooks. Add the webhook URL above and include your x-api-key header as a custom header.",
  "upgrade_available": false
}
```

**Response (200) — not activated:**

```json
{
  "source_system": "canvas-lms",
  "display_name": "Canvas LMS",
  "status": "available",
  "template_id": "canvas-lms-v1",
  "template_version": "1.0.0",
  "activated_at": null,
  "event_types": null,
  "webhook_url": null,
  "upgrade_available": false
}
```

**`upgrade_available`:** `true` when the bundled template's `template_version` is newer than the `template_version` stored in the org's `FieldMappingsTable` row. Signals that the admin can re-activate (with `force: true`) to pick up mapping improvements.

---

### `DELETE /v1/admin/connectors/:source_system`

Deactivate a connector. Removes the `FieldMappingsTable` row for this `(org_id, source_system)`.

**Response (200):**

```json
{
  "source_system": "canvas-lms",
  "status": "deactivated",
  "message": "Connector deactivated. Webhook URL will return 400 missing_envelope_mapping until re-activated."
}
```

**Internals:**

1. Load `FieldMappingsTable` item for `(org_id, source_system)`
2. If no item → 404 `connector_not_activated`
3. `DeleteItem` from `FieldMappingsTable`
4. Invalidate field mapping cache
5. Webhooks to `POST /v1/webhooks/{source_system}` will now return `400 missing_envelope_mapping` (handled by `webhook-adapters.md` existing logic — no change needed)

---

### `POST /v1/admin/connectors/:source_system/test`

Send a synthetic test event through the full pipeline to verify the connector works end-to-end. No real LMS webhook required — the test uses a sample payload from the template.

**Response (200) — test passed:**

```json
{
  "source_system": "canvas-lms",
  "test_result": "pass",
  "signal_id": "test_abc123",
  "learner_reference": "test_learner_001",
  "decision_type": "reinforce",
  "pipeline_steps": [
    { "step": "event_type_filter", "status": "pass", "detail": "submission_created is in allowed_event_types" },
    { "step": "envelope_extraction", "status": "pass", "detail": "learner_reference, signal_id, timestamp extracted" },
    { "step": "field_mapping", "status": "pass", "detail": "stabilityScore = 0.68 (via value / 100)" },
    { "step": "state_update", "status": "pass", "detail": "learner state updated to version 1" },
    { "step": "decision", "status": "pass", "detail": "decision_type: reinforce (default)" }
  ],
  "elapsed_ms": 42
}
```

**Response (200) — test failed (mapping issue):**

```json
{
  "source_system": "canvas-lms",
  "test_result": "fail",
  "failed_at": "field_mapping",
  "error": {
    "code": "missing_required_field",
    "message": "stabilityScore missing after transforms"
  },
  "pipeline_steps": [
    { "step": "event_type_filter", "status": "pass" },
    { "step": "envelope_extraction", "status": "pass" },
    { "step": "field_mapping", "status": "fail", "detail": "stabilityScore missing after transforms" }
  ]
}
```

**Internals:**

1. Load `FieldMappingsTable` item for `(org_id, source_system)` → 404 `connector_not_activated` if absent
2. Load the template's `test_payload` — a sample webhook body included in each template JSON (new field)
3. Run the full ingestion pipeline: event type filter → envelope extraction → field mapping → state update → decision
4. Use a reserved `learner_reference` prefix (`test_`) and a `signal_id` prefix (`test_`) so test signals are identifiable
5. Return step-by-step results regardless of pass/fail
6. Test signals are **not** persisted to the signal log — the pipeline runs in dry-run mode. No LIU consumed.

> **Template addition:** Each template JSON gains a `test_payload` field containing a realistic sample webhook body for that LMS. This is also useful for documentation and local development.

---

## Connection Status

The connector detail endpoint (`GET /v1/admin/connectors/:source_system`) includes a `connection_health` object derived from the signal log — no new infrastructure required.

```json
{
  "connection_health": {
    "status": "receiving",
    "last_signal_at": "2026-04-06T14:23:00Z",
    "signals_24h": 47,
    "errors_24h": 2
  }
}
```

| Status | Derivation | Meaning |
|---|---|---|
| `receiving` | At least one successful signal in the last 24 hours | Healthy — webhooks are flowing |
| `idle` | Connector activated but zero signals ever received | Awaiting first webhook — admin may not have configured LMS yet |
| `stale` | Last signal was >24 hours ago (but has received signals before) | May indicate LMS webhook misconfiguration or school inactivity |
| `error` | Last N signals all resulted in errors (extraction failures, type mismatches) | Mapping problem — admin should check config or re-activate |

**Data sources:** `last_signal_at` and `signals_24h` are derived from a `Query` on the signal log table filtered by `org_id` + `source_system`. `errors_24h` counts signals with `outcome: "rejected"`. This is a read at request time — no background polling, no new table.

**Constraint:** This adds a DynamoDB Query per connector detail request. Acceptable at pilot scale (low admin traffic). For Phase 2 with many connectors, pre-aggregate into a `connector_health` summary item on each signal ingestion.

---

## Admin Wizard Flow (Activation Sequence)

The API supports a multi-step wizard UX. Each step maps to an API call:

```
┌───────────────────────────────────────────────────┐
│ Step 1: Connect Source                             │
│ POST /v1/admin/connectors/activate                 │
│ → Returns: webhook_url, setup_instructions,        │
│   default event types, template mapping preview    │
├───────────────────────────────────────────────────┤
│ Step 2: Select Events                              │
│ PUT /v1/admin/connectors/:source_system/config     │
│ → Select which LMS event types become signals      │
│   (defaults pre-selected from template)            │
├───────────────────────────────────────────────────┤
│ Step 3: Review Signal Mapping (read-only preview)  │
│ GET /v1/admin/connectors/:source_system            │
│ → Shows: source fields → canonical fields,         │
│   transform expressions, required fields           │
│   (editable in Phase 2 via AI schema mapping)      │
├───────────────────────────────────────────────────┤
│ Step 4: Confirm Policy Association                 │
│ GET /v1/admin/connectors/:source_system            │
│ → Shows: active policy for this org (read from     │
│   PoliciesTable). Informational confirmation —     │
│   "Signals from Canvas will be evaluated against   │
│   the 'learner' policy."                           │
│   (Phase 1: per-source policy routing)             │
├───────────────────────────────────────────────────┤
│ Step 5: Test Connection                            │
│ POST /v1/admin/connectors/:source_system/test      │
│ → Dry-run with sample payload. Step-by-step result.│
├───────────────────────────────────────────────────┤
│ Step 6: Source Added                               │
│ Admin copies webhook_url to LMS. Signals flow.     │
│ Manage: disconnect, update config, view status.    │
└───────────────────────────────────────────────────┘
```

**Step 4 — Policy association (pilot vs. Phase 1):**

- **Pilot:** Informational only. The connector detail response includes the org's active policy metadata (from `PoliciesTable` Query on `org_id`). The UI displays: "Signals from this connector will be evaluated by policy: *Springs Charter — learner v1.1*". No new API — the frontend reads `GET /v1/admin/policies?org_id=springs` alongside the connector detail.
- **Phase 1 upgrade:** Add optional `source_systems` scope to policy items in `PoliciesTable`. Decision engine resolution: check for source-scoped policy first → fall back to org-wide default. This is additive — no migration, no breaking changes. See `docs/specs/policy-management-api.md` §Out of Scope for the forward-compatibility note.

---

## Webhook URL Construction

The `webhook_url` returned in activation and detail responses is constructed from the `WEBHOOK_BASE_URL` environment variable:

```
{WEBHOOK_BASE_URL}/v1/webhooks/{source_system}
```

| Environment | `WEBHOOK_BASE_URL` | Example URL |
|---|---|---|
| Production | `https://api.8p3p.dev` | `https://api.8p3p.dev/v1/webhooks/canvas-lms` |
| Local dev | `http://localhost:3000` | `http://localhost:3000/v1/webhooks/canvas-lms` |

`WEBHOOK_BASE_URL` defaults to `http://localhost:3000` when unset.

---

## Requirements

### Functional

- [ ] Template registry loads bundled JSON files from `src/connector-templates/` at server startup
- [ ] `GET /v1/admin/connectors` lists all templates with per-org activation status derived from `FieldMappingsTable`
- [ ] `POST /v1/admin/connectors/activate` copies template mapping into `FieldMappingsTable` with `template_id` and `template_version` metadata
- [ ] Activation returns `webhook_url`, `setup_instructions`, and `default_event_types` in the response
- [ ] Activation rejects stub templates (`not_ready`) with `400 template_not_ready`
- [ ] Activation rejects already-activated connectors with `409 connector_already_activated` (unless `force: true`)
- [ ] Activation rejects when a custom (non-template) mapping exists with `409 custom_mapping_exists` (unless `force: true`)
- [ ] `PUT /v1/admin/connectors/:source_system/config` updates `allowed_event_types` on the `FieldMappingsTable` item
- [ ] Event type config validates against the template's `available_event_types`; rejects unknown types with `400 invalid_event_type`
- [ ] `GET /v1/admin/connectors/:source_system` returns connector details including `upgrade_available` flag
- [ ] `DELETE /v1/admin/connectors/:source_system` removes the `FieldMappingsTable` row and invalidates cache
- [ ] All endpoints use `x-admin-api-key` auth (same middleware as `policy-management-api.md`)
- [ ] All write operations invalidate the field mapping cache for `(org_id, source_system)` per `tenant-field-mappings.md` pattern
- [ ] `webhook_url` is constructed from `WEBHOOK_BASE_URL` env variable
- [ ] No new DynamoDB tables — activation writes into existing `FieldMappingsTable`
- [ ] `POST /v1/admin/connectors/:source_system/test` runs a dry-run pipeline with the template's `test_payload`; returns step-by-step results; does not persist signals or consume LIUs
- [ ] Test endpoint uses `test_` prefixed `learner_reference` and `signal_id` to identify synthetic signals
- [ ] `GET /v1/admin/connectors/:source_system` includes `connection_health` object derived from signal log (status, last_signal_at, signals_24h, errors_24h)
- [ ] Connector detail response includes active policy metadata for the org (policy_key, policy_version, description) for wizard Step 4 confirmation

### Acceptance Criteria

- Given the Canvas template exists and is not a stub, when `POST /v1/admin/connectors/activate { "source_system": "canvas-lms" }` is called with a valid admin key, then a `FieldMappingsTable` row is created with `template_id: "canvas-lms-v1"` and the response includes `webhook_url` and `setup_instructions`
- Given the Canvas connector is already activated for org `springs`, when `POST /v1/admin/connectors/activate { "source_system": "canvas-lms" }` is called, then 409 `connector_already_activated` is returned
- Given the Canvas connector is already activated and `force: true` is provided, then the existing mapping is overwritten and 201 is returned
- Given a custom mapping exists (no `template_id`) for `springs/canvas-lms`, when activation is called without `force`, then 409 `custom_mapping_exists` is returned
- Given the I-Ready template is a stub, when `POST /v1/admin/connectors/activate { "source_system": "iready" }` is called, then 400 `template_not_ready` is returned
- Given the Canvas connector is activated, when `PUT /v1/admin/connectors/canvas-lms/config { "event_types": ["submission_created"] }` is called, then the `FieldMappingsTable` item's `allowed_event_types` is updated
- Given the admin requests `event_types: ["nonexistent_event"]`, then 400 `invalid_event_type` is returned
- Given the Canvas connector is activated, when `DELETE /v1/admin/connectors/canvas-lms` is called, then the `FieldMappingsTable` row is removed and subsequent webhooks return `400 missing_envelope_mapping`
- Given template version `1.0.0` is activated but the bundled template is now `1.1.0`, when `GET /v1/admin/connectors/canvas-lms` is called, then `upgrade_available: true` is returned
- Given no connector is activated for a source system, when `GET /v1/admin/connectors` is called, then the connector shows `status: "available"` with `webhook_url: null`
- Given the Canvas connector is activated and the template has a valid `test_payload`, when `POST /v1/admin/connectors/canvas-lms/test` is called, then the response shows `test_result: "pass"` with step-by-step pipeline results and no signal is persisted
- Given the Canvas connector has received 47 signals in the last 24 hours, when `GET /v1/admin/connectors/canvas-lms` is called, then `connection_health.status` is `"receiving"` and `signals_24h` is `47`
- Given the Canvas connector is activated but has never received a signal, when the detail endpoint is called, then `connection_health.status` is `"idle"`
- Given the org `springs` has an active policy `learner`, when connector detail is fetched, then the response includes `active_policy: { policy_key: "learner", ... }` for wizard Step 4

---

## Constraints

- **No LMS-specific code in the application** — all LMS knowledge is in the template JSON files. Adding a new connector = adding a new JSON file. No code changes.
- **Templates are read-only at runtime** — bundled with the deployment. Admins cannot modify templates; they modify the tenant mapping after activation (via `PUT /v1/admin/mappings` or event type config).
- **Single org per activation** — each activation is scoped to the org derived from the admin API key. No cross-org template operations.
- **No DynamoDB table for templates** — template definitions are bundled files. Template *activations* (the resulting mappings) live in `FieldMappingsTable`.
- **Webhook URL is informational** — the activation response tells the admin what URL to configure in their LMS. The webhook endpoint itself (`POST /v1/webhooks/:source_system`) is defined by `webhook-adapters.md` and already exists.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Admin dashboard UI for connector management | API-first for pilot; UI is Phase 2. Separate repo (`8p3p-admin`), consumes this API via OpenAPI client. | Phase 2 — see §Admin Dashboard Timing below |
| OAuth-based connector auth (e.g., Canvas REST API pull) | Pilot receives webhooks only — push model. Pulling data from LMS APIs is a different product surface. | Phase 2 if LMS data pull is required |
| Per-source policy routing (`source_systems` scope on policies) | Pilot: org-wide policy. Phase 1: add optional `source_systems` array to `PoliciesTable` items for scoped evaluation. See `policy-management-api.md` §Out of Scope. | Phase 1 — connector wizard Step 4 becomes a real association |
| Connector pause / resume (temporarily stop signal processing) | Pilot: deactivate and re-activate. Phase 1: add `status: "paused"` flag on `FieldMappingsTable` — webhook adapter checks and returns 204. | Phase 1 |
| Per-connector LIU activity metrics (signals/day breakdown) | Pilot: total LIU meter. Phase 1: break down by `source_system` in usage endpoint. | Phase 1 — builds on `liu-usage-meter.md` |
| Custom template creation by tenants | Tenants can create custom mappings via `PUT /v1/admin/mappings`. Template *authoring* is an 8P3P operator task. | Partner SDK / developer ecosystem (Phase 4) |
| Template auto-upgrade (migrate activated mappings to new template version) | Upgrade is manual: admin re-activates with `force: true`. Auto-migration risks breaking custom overrides. | Customer feedback on upgrade friction |
| DynamoDB-backed template registry | Bundled files are sufficient for pilot scale (3–5 connectors). DynamoDB registry adds operational complexity. | Connector count exceeds ~20 or third-party template contributions |
| Webhook signature verification per-connector (e.g., Canvas HMAC) | Deferred in `webhook-adapters.md` — rely on API key auth for pilot | Post-pilot security hardening |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `FieldMappingsTable` — DynamoDB table + `PutItem` / `GetItem` / `DeleteItem` / `Query` patterns | `docs/specs/tenant-field-mappings.md` | Spec'd (v1.1) |
| `template_id` / `template_version` attributes on `FieldMappingsTable` items | `docs/specs/tenant-field-mappings.md` (v1.1.1) | **Spec'd** |
| Field mapping cache invalidation (`invalidateFieldMappingCache()`) | `docs/specs/tenant-field-mappings.md`, `src/config/field-mappings-dynamo.ts` | **Implemented** |
| `POST /v1/webhooks/:source_system` endpoint | `docs/specs/webhook-adapters.md` | Spec'd (v1.1) |
| Event type filtering (`event_type_path` + `allowed_event_types`) | `docs/specs/webhook-adapters.md` (v1.1.1) | **Spec'd** |
| Admin API key middleware (`x-admin-api-key` → auth) | `src/auth/admin-api-key-middleware.ts` | **Implemented** |
| `WEBHOOK_BASE_URL` env (new) | This spec | **New — must be added to env config** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Connector catalog API (`GET /v1/admin/connectors`) | Pilot integration guide (replaces manual mapping instructions) |
| One-click activation (template → `FieldMappingsTable` row) | Pilot onboarding — eliminates connector tax |
| Template versioning + `upgrade_available` flag | Future admin dashboard, notification system |
| `WEBHOOK_BASE_URL` construction | Webhook URL in activation responses |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `admin_key_required` | Admin API key middleware (`src/auth/admin-api-key-middleware.ts`) |
| `missing_envelope_mapping` | Webhook adapter — returned after connector deactivation |

### New (add during implementation)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `template_not_found` | 404 | `source_system` does not match any bundled template |
| `template_not_ready` | 400 | Template is a stub (mapping fields incomplete). Cannot be activated. |
| `connector_already_activated` | 409 | A template-sourced mapping already exists for this org + source_system. Use `force: true` to override. |
| `custom_mapping_exists` | 409 | A custom (non-template) mapping exists for this org + source_system. Use `force: true` to override. |
| `connector_not_activated` | 404 | No activated connector exists for this org + source_system (on config update or deactivation). |
| `invalid_event_type` | 400 | One or more event types in the request are not in the template's `available_event_types`. |

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| INT-001 | Happy path — activate Canvas connector | `POST /v1/admin/connectors/activate { "source_system": "canvas-lms" }` with valid admin key | 201; `FieldMappingsTable` row created with `template_id`, `template_version`; response has `webhook_url`, `setup_instructions` |
| INT-002 | Activate already-activated connector (no force) | Same as INT-001, called twice | Second call: 409 `connector_already_activated` |
| INT-003 | Activate with force override | `force: true` on already-activated connector | 201; existing row overwritten; response has updated `activated_at` |
| INT-004 | Activate when custom mapping exists (no force) | Pre-existing `FieldMappingsTable` row without `template_id` | 409 `custom_mapping_exists` |
| INT-005 | Activate stub template | `POST /v1/admin/connectors/activate { "source_system": "iready" }` (stub template) | 400 `template_not_ready` |
| INT-006 | Activate unknown source_system | `POST /v1/admin/connectors/activate { "source_system": "unknown-lms" }` | 404 `template_not_found` |
| INT-007 | List connectors — mixed statuses | Canvas activated, I-Ready available, Branching Minds not_ready | 200; array with `status: "activated"`, `status: "available"`, `status: "not_ready"` respectively |
| INT-008 | Configure event types — valid | `PUT /v1/admin/connectors/canvas-lms/config { "event_types": ["submission_created"] }` | 200; `FieldMappingsTable` `allowed_event_types` updated |
| INT-009 | Configure event types — invalid type | `event_types: ["nonexistent_event"]` | 400 `invalid_event_type` |
| INT-010 | Configure event types — not activated | `PUT /v1/admin/connectors/iready/config` (not activated) | 404 `connector_not_activated` |
| INT-011 | Deactivate connector | `DELETE /v1/admin/connectors/canvas-lms` | 200; `FieldMappingsTable` row removed; subsequent `POST /v1/webhooks/canvas-lms` returns 400 `missing_envelope_mapping` |
| INT-012 | Deactivate — not activated | `DELETE /v1/admin/connectors/iready` (never activated) | 404 `connector_not_activated` |
| INT-013 | Get connector detail — activated | `GET /v1/admin/connectors/canvas-lms` (activated) | 200; includes `webhook_url`, `event_types`, `upgrade_available` |
| INT-014 | Get connector detail — upgrade available | Activated with `template_version: "1.0.0"`; bundled template is `"1.1.0"` | 200; `upgrade_available: true` |
| INT-015 | Auth required on all endpoints | Any connector endpoint without `x-admin-api-key` | 401 `admin_key_required` |
| INT-016 | End-to-end: activate → webhook → signal | Activate Canvas, then `POST /v1/webhooks/canvas-lms` with Canvas-shaped body | Signal created with `learner_reference` extracted; decision produced |
| INT-017 | Test webhook — pass | `POST /v1/admin/connectors/canvas-lms/test` (activated, valid template) | 200; `test_result: "pass"`; all pipeline_steps pass; no signal persisted in signal log |
| INT-018 | Test webhook — mapping failure | Template test_payload missing a required source field | 200; `test_result: "fail"`; `failed_at: "field_mapping"` with error detail |
| INT-019 | Test webhook — not activated | `POST /v1/admin/connectors/iready/test` (not activated) | 404 `connector_not_activated` |
| INT-020 | Connection health — receiving | Canvas activated; signal log has signals in last 24h | `connection_health.status: "receiving"`; `signals_24h > 0` |
| INT-021 | Connection health — idle | Canvas activated; zero signals ever | `connection_health.status: "idle"` |
| INT-022 | Connection health — stale | Canvas activated; last signal >24h ago | `connection_health.status: "stale"` |
| INT-023 | Policy association in detail | Canvas activated; org has active policy `learner` | Response includes `active_policy: { policy_key: "learner", description: "..." }` |

> **Test strategy:** INT-001 through INT-016 are integration tests using Fastify `inject` with mocked `FieldMappingsTable`. Template registry is loaded from test fixtures (not production files) to isolate tests from template content changes. INT-016 is an end-to-end test requiring the full ingestion pipeline (webhook adapter + tenant mappings + state + decision). INT-017/018 run the pipeline in dry-run mode and assert no DynamoDB write to the signal log. INT-020 through INT-022 require mocked signal log queries. INT-023 requires a mocked PoliciesTable query.

---

## Notes

- **Org resolution for admin routes**: The current admin auth model uses a single `ADMIN_API_KEY` (operator-level). For connector activation, the `org_id` must be provided in the request or derived from a separate mechanism. **Pilot approach:** add `org_id` as a required field in the activation request body (alongside `source_system`). Post-pilot, per-org admin keys will eliminate the need for explicit `org_id`.
- **Template validation at startup**: The server should validate all bundled templates at startup (schema check, expression validation via `validateTransformExpression()` from `tenant-field-mappings.md`). Invalid templates → startup warning, template marked as `not_ready`.
- **Cache behavior**: Activation and deactivation call `invalidateFieldMappingCache(orgId, sourceSystem)` from `src/config/field-mappings-dynamo.ts`. The next webhook hit will reload from DynamoDB.
- **No migration path needed**: `FieldMappingsTable` rows created by template activation are structurally identical to manually-created rows — only the `template_id` / `template_version` metadata distinguishes them. Layers 1 and 2 are unaware of templates.
- **Test pipeline dry-run**: The test endpoint reuses the full ingestion pipeline but wraps it in a mode that captures step results without writing to the signal log, state table, or decision table. Implementation: add an optional `dryRun: true` flag to the `handleSignalIngestion` core and return intermediate results instead of persisting.

---

## Admin Dashboard Timing

The admin dashboard (Platform UI) is a **Phase 2 deliverable** — not needed for pilot. Evidence:

1. **Pilot admin workflow is API + CLI**: connector activation, policy upload, and signal monitoring are all achievable via the admin API + thin CLI wrappers (`scripts/upload-policy.ts`, etc.). Pilot customers (Springs) interact with 8P3P through their LMS; they don't need a UI.
2. **API-first design pays off**: every admin endpoint in this spec is designed for a future UI consumer. The wizard flow (Steps 1–6) maps directly to API calls. Building the API correctly now means the dashboard is a presentation layer, not a new product surface.
3. **Premature UI investment diverts from pilot**: the control layer needs 3 specs built (integration-templates, webhook-adapters, tenant-field-mappings) before Month 0. A dashboard adds a second deployment pipeline, a JS framework, and a testing surface that doesn't accelerate pilot delivery.

**Repo structure recommendation: separate repo (`8p3p-admin`).**

| Factor | Separate Repo | Monorepo |
|---|---|---|
| Deployment | S3 + CloudFront (static hosting) — completely different from Lambda/API Gateway | Same CI, different deploy targets |
| Tech stack | React/Next.js — different toolchain from Fastify/Node backend | Shared TypeScript, but different dependencies |
| Team scaling | Frontend/backend split naturally | Requires workspace tooling (Turborepo/Nx) |
| API contract | OpenAPI spec is the contract — UI is just a consumer | Shared types tempting but couples releases |
| CI/CD | Independent pipelines, faster builds | Single pipeline, slower, more complex |

**Recommendation**: Start the dashboard as `8p3p-admin` (separate repo) in Phase 2. Generate an API client from `docs/api/openapi.yaml` (using `openapi-typescript` or similar) to keep the UI type-safe against the API contract without coupling repos. Shared types (like `PolicyDefinition`) can be extracted to an `8p3p-types` package if duplication becomes painful, but this is unlikely before Phase 3.

**Phase 2 dashboard scope (connector management features to surface):**
- Connector catalog (browse, activate, deactivate)
- Activation wizard (the 6-step flow documented above)
- Connection health dashboard (status, signals/day, errors)
- Policy management (view, toggle, lock)
- Signal log viewer (recent signals per connector)
- LIU usage dashboard (consumption by source system)

---

*Spec updated: 2026-04-06 (v2) — adds test webhook endpoint, connection health status, admin wizard flow (6-step), policy association (pilot: confirmation-only), Phase 1 roadmap items. Original spec created: 2026-04-06. Phase: Pre-Month 0 (pilot-blocking). Depends on: tenant-field-mappings.md (v1.1.1), webhook-adapters.md (v1.1.1), admin-api-key-middleware. Recommended next: `/plan-impl docs/specs/integration-templates.md`*
