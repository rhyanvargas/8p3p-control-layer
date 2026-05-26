---
name: Integration Templates (Connector Layer — Pilot Slice)
overview: |
  Pilot slice of Layer 3 (Connector Layer). Ships three bundled connector templates (Canvas full, I-Ready stub, Branching Minds stub), a registry loader, and two admin endpoints — `GET /v1/admin/connectors` and `POST /v1/admin/connectors/activate` — plus a thin `apply-template` CLI. Activation copies the template into the existing FieldMappingsTable; Layers 1/2 (transforms + webhook adapter) consume it unchanged. Wizard UX endpoints (PUT config, GET detail, DELETE, POST test) and connection health are deferred to Phase 2 with the admin dashboard.
todos:
  - id: TASK-007
    content: Add 4 connector error codes to src/shared/error-codes.ts (template_not_found, template_not_ready, connector_already_activated, custom_mapping_exists)
    status: completed
  - id: TASK-001
    content: Create 3 connector template JSON files (canvas-lms.json full; iready.json + branching-minds.json stubs)
    status: completed
  - id: TASK-002
    content: Create template registry loader — src/connectors/template-registry.ts
    status: completed
  - id: TASK-003
    content: Add getFieldMappingRecord(orgId, sourceSystem) to existing src/config/field-mappings-dynamo.ts
    status: completed
  - id: TASK-004
    content: Create src/connectors/connector-routes.ts with GET /connectors + POST /connectors/activate
    status: completed
  - id: TASK-008
    content: Register connector routes + initTemplateRegistry in server.ts; document WEBHOOK_BASE_URL env
    status: completed
  - id: TASK-009
    content: Contract tests INT-001..007, INT-015, INT-016 in tests/contracts/connector-routes.test.ts
    status: completed
  - id: TASK-010
    content: scripts/apply-template.ts — thin CLI wrapper around POST /v1/admin/connectors/activate
    status: completed
isProject: false
---

# Integration Templates (Connector Layer — Pilot Slice)

**Spec**: `docs/specs/integration-templates.md`

## Pilot Scope Justification

Per `urs_product_readiness_55b0b52e.plan.md` TASK-W1-3 verification — *"`apply-template canvas-lms --org-id <id>` results in functional end-to-end ingest from a recorded Canvas webhook payload"* — pilot value is a one-call seed of `FieldMappingsTable`, not a 6-endpoint activation wizard. Spec `§Admin Dashboard Timing` explicitly defers the dashboard (and the wizard endpoints it consumes) to Phase 2. URS master plan `§Scope boundary` also defers dashboard work.

Deferred to Phase 2 (when dashboard ships): `PUT /:source_system/config`, `GET /:source_system` (detail with `connection_health` + `active_policy`), `DELETE /:source_system`, `POST /:source_system/test` (dry-run), and the corresponding error codes `connector_not_activated` and `invalid_event_type`.

## Prerequisites

- [x] PREREQ-001 `FieldMappingsTable` exists (`docs/specs/tenant-field-mappings.md` v1.1)
- [x] PREREQ-002 `invalidateFieldMappingCache(orgId, sourceSystem)` in `src/config/field-mappings-dynamo.ts`
- [x] PREREQ-003 `adminApiKeyPreHandler` at `src/auth/admin-api-key-middleware.ts`
- [x] PREREQ-004 `POST /v1/webhooks/:source_system` implemented (`src/routes/webhooks.ts`)
- [x] PREREQ-005 `FieldMappingsTable` items support `template_id` + `template_version` (additive; already in `FieldMappingRecord`)
- [x] PREREQ-006 `validateTransformExpression` exported from `src/config/transform-expression.ts:274`
- [x] PREREQ-007 Existing `field-mappings-dynamo.ts` already exports `putFieldMappingItem`, `listFieldMappingItemsForOrg`, `deleteFieldMappingItem`, `getMappingFromDynamoDB` (TASK-003 reuses this; no parallel module)

## Spec Literals (locked)

These values are reproduced verbatim from `docs/specs/integration-templates.md` and must appear identically in plan TASK details and implementation:

| Literal | Value | Source |
|---|---|---|
| Template file location | `src/connector-templates/{source_system}.json` | Spec § Template Registry |
| Canvas `template_id` | `canvas-lms-v1` | Spec § Template Shape example |
| Canvas `source_system` | `canvas-lms` | Spec § Pilot Templates |
| Canvas `template_version` | `1.0.0` | Spec § Template Shape example |
| I-Ready `template_id` | `iready-v1` (stub) | Spec § Pilot Templates |
| I-Ready `source_system` | `iready` | Spec § Pilot Templates |
| Branching Minds `template_id` | `branching-minds-v1` (stub) | Spec § Pilot Templates |
| Branching Minds `source_system` | `branching-minds` | Spec § Pilot Templates |
| Stub marker | string literal `"TODO"` in any `mapping` value (deep) | Spec § Pilot Templates note |
| `template_not_found` HTTP | 404 | Spec § Error Codes — New |
| `template_not_ready` HTTP | 400 | Spec § Error Codes — New |
| `connector_already_activated` HTTP | 409 | Spec § Error Codes — New |
| `custom_mapping_exists` HTTP | 409 | Spec § Error Codes — New |
| `ADMIN_KEY_REQUIRED` HTTP | 401 | `src/shared/error-codes.ts:144` (existing) |
| `WEBHOOK_BASE_URL` default | `http://localhost:3000` | Spec § Webhook URL Construction |
| Webhook URL pattern | `{WEBHOOK_BASE_URL}/v1/webhooks/{source_system}` | Spec § Webhook URL Construction |
| Activation request body | `{ org_id, source_system, force? }` | Spec § Notes (org resolution); spec endpoint example updated for parity |
| `mapping_version` on activation | `1` | Spec § Activation internals step 4 |
| `updated_by` on activation | admin API key value (forwarded to `putFieldMappingItem.updatedBy`) | Spec § Activation internals step 4; matches existing `field-mappings-dynamo.ts:215` pattern |
| Status: `available` | template exists, no row in `FieldMappingsTable` | Spec § GET list status values |
| Status: `activated` | row with matching `template_id` exists | Spec § GET list status values |
| Status: `not_ready` | template is a stub (`isStubTemplate` returns true) | Spec § GET list status values |

## Deviations from Spec (PR will update spec for parity)

| # | Spec text | Plan / impl divergence | Resolution |
|---|---|---|---|
| D-1 | Spec activate body example shows only `{ "source_system": "canvas-lms" }` | Plan/impl uses `{ org_id, source_system, force? }` per spec § Notes | Update spec § POST /v1/admin/connectors/activate body example in same PR |
| D-2 | Spec INT-007 expects mixed statuses including `available` for I-Ready | I-Ready ships as a stub (`not_ready`) per § Pilot Templates; no non-stub second template exists for pilot | Update spec INT-007 to expect `{ activated, not_ready, not_ready }` (Canvas + 2 stubs) |
| D-3 | Spec § Requirements includes `PUT config`, `GET detail`, `DELETE`, `POST test`, `connection_health`, `active_policy`, `upgrade_available` | Pilot defers all to Phase 2 with the dashboard | Add a § Pilot Implementation Scope note to spec; do NOT remove the deferred requirements (Phase 2 will re-pick them up) |
| D-4 | Spec § Activation internals step 4 implies `UpdateItem` semantics | Pilot uses existing `putFieldMappingItem` (full `PutCommand`) — matches existing admin field-mappings route pattern; no optimistic lock | Document as accepted pilot pattern in spec § Pilot Implementation Scope; Phase 2 will add condition expression when concurrent writers (dashboard) appear |

> **Reverted plan-only divergences**: Prior draft used `{template_id}.json` filenames; corrected to `{source_system}.json` to match spec verbatim — no spec edit needed.

## Requirements Traceability

| Spec § Requirements item | Mapped TASK(s) | Notes |
|---|---|---|
| Template registry loads bundled JSON at startup | TASK-002 | `initTemplateRegistry` called from `server.ts` (TASK-008) |
| `GET /v1/admin/connectors` lists templates with per-org activation status | TASK-004 | Uses `listFieldMappingItemsForOrg` (existing) |
| `POST /v1/admin/connectors/activate` copies template mapping into `FieldMappingsTable` with `template_id` + `template_version` | TASK-004 | Uses `putFieldMappingItem` (existing) |
| Activation response returns `webhook_url`, `setup_instructions`, `default_event_types` | TASK-004 | |
| Activation rejects stubs with 400 `template_not_ready` | TASK-002 (`isStubTemplate`), TASK-004 | |
| Activation rejects already-activated with 409 `connector_already_activated` (unless `force`) | TASK-004 | Uses `getFieldMappingRecord` from TASK-003 |
| Activation rejects custom mapping with 409 `custom_mapping_exists` (unless `force`) | TASK-004 | |
| All endpoints require `x-admin-api-key` | TASK-008 | Scope-level `adminApiKeyPreHandler` (existing pattern from `policy-management-routes`) |
| All write ops invalidate field mapping cache | TASK-003 reuses existing | `putFieldMappingItem` already calls `invalidateFieldMappingCache` (`field-mappings-dynamo.ts:221`) |
| `webhook_url` constructed from `WEBHOOK_BASE_URL` env | TASK-004 | Default `http://localhost:3000` |
| No new DynamoDB tables | (architectural) | Activation writes into existing `FieldMappingsTable` |
| `PUT config` updates `allowed_event_types` | **DEFERRED to Phase 2** | Per § Pilot Scope Justification |
| `GET detail` returns `upgrade_available`, `connection_health`, `active_policy` | **DEFERRED to Phase 2** | Per § Pilot Scope Justification |
| `DELETE` removes row + invalidates cache | **DEFERRED to Phase 2** | Per § Pilot Scope Justification |
| `POST test` dry-run + `test_` prefixed IDs | **DEFERRED to Phase 2** | Per § Pilot Scope Justification |

## Tasks

> **Status tracking**: lives only in the YAML frontmatter `todos` list.

---

### TASK-007: Add connector error codes (pilot subset)

- **Files**: `src/shared/error-codes.ts` ← modify
- **Action**: Modify
- **Details**:
  Append after the existing Webhook Adapters block:
  ```ts
  // ==========================================================================
  // Integration Templates / Connector Layer (Layer 3 — Pilot)
  // ==========================================================================

  /** source_system does not match any bundled template (404) */
  TEMPLATE_NOT_FOUND: 'template_not_found',

  /** Template is a stub — mapping fields incomplete, cannot be activated (400) */
  TEMPLATE_NOT_READY: 'template_not_ready',

  /** A template-sourced mapping already exists for this org + source_system (409) */
  CONNECTOR_ALREADY_ACTIVATED: 'connector_already_activated',

  /** A custom (non-template) mapping exists for this org + source_system (409) */
  CUSTOM_MAPPING_EXISTS: 'custom_mapping_exists',
  ```
  Phase 2 will add `CONNECTOR_NOT_ACTIVATED` and `INVALID_EVENT_TYPE` when the deferred endpoints land.
- **Depends on**: none
- **Verification**: TypeScript compiles; `ErrorCodes.TEMPLATE_NOT_FOUND` etc. accessible.

---

### TASK-001: Create connector template JSON files

- **Files**:
  - `src/connector-templates/canvas-lms.json` ← create (full)
  - `src/connector-templates/iready.json` ← create (stub)
  - `src/connector-templates/branching-minds.json` ← create (stub)
- **Action**: Create
- **Details**:
  All three files share the shape from spec § Template Shape: `template_id`, `template_version`, `source_system`, `display_name`, `description`, `setup_instructions`, `default_event_types`, `available_event_types`, `mapping`, `test_payload` (test_payload is bundled now for forward-compatibility with Phase 2 dry-run; pilot does not consume it).

  - `canvas-lms.json` — full non-stub. `template_id: "canvas-lms-v1"`, `template_version: "1.0.0"`, `source_system: "canvas-lms"`. `mapping.envelope` populated; one `value / 100` transform on `stabilityScore`. Realistic `test_payload`.
  - `iready.json` — stub. `template_id: "iready-v1"`, `source_system: "iready"`. At least one `"TODO"` string in `mapping` so `isStubTemplate` returns `true`.
  - `branching-minds.json` — stub. `template_id: "branching-minds-v1"`, `source_system: "branching-minds"`. Same stub pattern.
- **Depends on**: none
- **Verification**: All three parse as JSON; `iready.json` and `branching-minds.json` contain `"TODO"` strings; `canvas-lms.json` does NOT contain `"TODO"`.

---

### TASK-002: Create template registry loader

- **Files**: `src/connectors/template-registry.ts` ← create
- **Action**: Create
- **Details**:
  Exports:
  ```ts
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
  export function loadTemplateRegistry(): ConnectorTemplate[];
  export function getTemplate(sourceSystem: string): ConnectorTemplate | undefined;
  export function isStubTemplate(template: ConnectorTemplate): boolean;
  export function initTemplateRegistry(log?: { warn?: (obj: unknown, msg: string) => void }): ConnectorTemplate[];
  ```
  - Resolve `src/connector-templates/` relative to the module (`import.meta.url`) so it works under `tsx` (dev) and compiled `dist/` (build).
  - `loadTemplateRegistry()` uses `fs.readdirSync` + `JSON.parse`; results cached at module scope on first call.
  - `isStubTemplate()` performs a deep walk of `template.mapping`; returns `true` if any string value equals `"TODO"` exactly.
  - `initTemplateRegistry()` loads + walks every template's `mapping.transforms[].expression` (when present) through `validateTransformExpression(expr, sourceKeys?)`. On failure, log a structured warning `event: 'template_validation_warning'` and do NOT throw. Returns the loaded array.
- **Depends on**: TASK-001
- **Verification**:
  - `getTemplate('canvas-lms')?.template_id === 'canvas-lms-v1'`
  - `isStubTemplate(iready)` === `true`; `isStubTemplate(canvas)` === `false`
  - `initTemplateRegistry()` produces no warnings for `canvas-lms.json`

---

### TASK-003: Add `getFieldMappingRecord` to existing field-mappings-dynamo

- **Files**: `src/config/field-mappings-dynamo.ts` ← modify
- **Action**: Modify
- **Details**:
  Add (do NOT create a parallel module; the existing module already exports `putFieldMappingItem`, `listFieldMappingItemsForOrg`, `deleteFieldMappingItem`, and `FieldMappingRecord` with `template_id`/`template_version`):
  ```ts
  export async function getFieldMappingRecord(
    orgId: string,
    sourceSystem: string
  ): Promise<FieldMappingRecord | null>
  ```
  Implementation mirrors `getMappingFromDynamoDB` but returns the full `FieldMappingRecord` (mapping + metadata) instead of only the mapping. Uses `GetCommand`. Does NOT use the TTL cache (callers need fresh template_id state for conflict checks).
- **Depends on**: none
- **Verification**:
  - Unit test (mocked `DynamoDBDocumentClient`): returns `null` when `Item` is absent or `FIELD_MAPPINGS_TABLE` is unset
  - Returns `FieldMappingRecord` with `template_id`/`template_version` when present in the item

---

### TASK-004: Create connector routes (pilot — 2 endpoints)

- **Files**: `src/connectors/connector-routes.ts` ← create
- **Action**: Create
- **Details**:
  Export `registerConnectorRoutes(app: FastifyInstance): void`. Routes are registered inside the existing `/v1/admin` scope (TASK-008), so `adminApiKeyPreHandler` enforces auth at the scope level — no per-route auth check.

  **Org resolution (pilot)**: `org_id` is required on every connector route — query param for `GET /connectors`, body field for `POST /connectors/activate`. Matches spec § Notes.

  1. **`GET /connectors?org_id=<id>`** — list all templates with per-org activation status.
     - 400 if `org_id` missing or empty.
     - `loadTemplateRegistry()` → array of templates.
     - `listFieldMappingItemsForOrg(orgId)` → existing rows.
     - For each template, derive status:
       - matching row with same `template_id` → `activated`
       - `isStubTemplate(template)` → `not_ready`
       - else → `available`
     - For activated entries: include `template_version`, `event_types` (from `row.mapping.envelope.allowed_event_types` or template's `default_event_types`), `activated_at` (from `row.updated_at`), `webhook_url` (`${WEBHOOK_BASE_URL}/v1/webhooks/${source_system}`).
     - For non-activated entries: `event_types: null`, `activated_at: null`, `webhook_url: null`.
     - Response: `{ connectors: [...] }` matching spec § GET response shape (excluding deferred wizard fields).

  2. **`POST /connectors/activate`** body `{ org_id, source_system, force? }`:
     - 400 if `org_id` or `source_system` missing/blank.
     - `getTemplate(source_system)` → 404 `template_not_found` if `undefined`.
     - `isStubTemplate(template)` → 400 `template_not_ready`.
     - `getFieldMappingRecord(orgId, sourceSystem)`:
       - if record exists with `template_id` set AND `!force` → 409 `connector_already_activated`
       - if record exists without `template_id` AND `!force` → 409 `custom_mapping_exists`
       - if `force` or no record → proceed
     - `putFieldMappingItem({ orgId, sourceSystem, mapping: <deep copy of template.mapping>, updatedBy: <admin key value>, templateId: template.template_id, templateVersion: template.template_version, mappingVersion: 0 })` — `nextVersion` becomes `1` per existing implementation (`field-mappings-dynamo.ts:203`).
     - Construct `webhook_url` = `${process.env.WEBHOOK_BASE_URL ?? 'http://localhost:3000'}/v1/webhooks/${source_system}`.
     - Respond 201 with `{ source_system, status: "activated", webhook_url, event_types: template.default_event_types, setup_instructions: template.setup_instructions, template_id: template.template_id, template_version: template.template_version, activated_at: <record.updated_at> }`.

  Helpers (module-private): `getAdminKey(request)` mirroring `policy-management-routes.ts:46`; `webhookBaseUrl()` returning `process.env.WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'`.

  > Deferred to Phase 2: `PUT /:source_system/config`, `GET /:source_system` (detail), `DELETE /:source_system`, `POST /:source_system/test`. Do not stub these — leaving them out keeps the auth/registration surface narrow.
- **Depends on**: TASK-002, TASK-003, TASK-007
- **Verification**: Covered by TASK-009.

---

### TASK-008: Wire connector routes into server.ts

- **Files**: `src/server.ts` ← modify
- **Action**: Modify
- **Details**:
  1. Add imports near the existing route imports:
     ```ts
     import { initTemplateRegistry } from './connectors/template-registry.js';
     import { registerConnectorRoutes } from './connectors/connector-routes.js';
     ```
  2. Call `initTemplateRegistry(server.log)` after `loadPolicy()` and after the optional `loadTenantFieldMappingsFromFile(...)` block (so Fastify's logger exists). The function MUST NOT throw on warning; it logs and continues.
  3. Inside the existing `/v1/admin` scope registration:
     ```ts
     server.register(async (admin) => {
       admin.addHook('preHandler', adminApiKeyPreHandler);
       registerPolicyManagementRoutes(admin);
       registerAdminFieldMappingsRoutes(admin);
       registerAdminIngestionPreflightRoutes(admin);
       registerConnectorRoutes(admin);   // ← add
     }, { prefix: '/v1/admin' });
     ```
  4. `WEBHOOK_BASE_URL` env var: no schema validation, no fail-on-missing — just reads `process.env.WEBHOOK_BASE_URL` at call-site with the `http://localhost:3000` default (per spec § Webhook URL Construction). Add a single-line comment in `server.ts` documenting the env var.

  > **Note**: `initTemplateRegistry` MUST be called after `loadPolicy()` because `server.log` is created when Fastify is instantiated; the function accepts an optional logger and falls back to `console.warn`.
- **Depends on**: TASK-002, TASK-004
- **Verification**:
  - `npm run build` clean; `npm run typecheck` clean
  - `GET /v1/admin/connectors?org_id=springs` returns 401 without admin key; 200 with valid key
  - Server starts without warning on `canvas-lms.json`

---

### TASK-009: Contract tests (pilot subset)

- **Files**: `tests/contracts/connector-routes.test.ts` ← create
- **Action**: Create
- **Details**:
  Mirror the established pattern from `tests/contracts/admin-field-mappings.test.ts`: Fastify `inject`, mocked `DynamoDBDocumentClient` via `_setFieldMappingsDynamoClientForTesting`, `clearFieldMappingCache()` in `beforeEach`/`afterEach`.

  Override the template registry for tests by setting `process.env.CONNECTOR_TEMPLATES_DIR` to a fixtures directory under `tests/fixtures/connector-templates/` containing test-only copies of all three templates — keeps production templates immutable from tests. (Add this env override in `template-registry.ts`: if set and non-empty, use it; else resolve relative to `import.meta.url`.)

  Tests (numbered per spec § Contract Tests, pilot subset):
  | Test ID | Focus |
  |---|---|
  | INT-001 | Happy path: `POST /activate { org_id: "springs", source_system: "canvas-lms" }` → 201; `PutCommand` called with `template_id: "canvas-lms-v1"`, `mapping_version: 1`; response has `webhook_url`, `setup_instructions`, `event_types` |
  | INT-002 | Already-activated (no `force`): existing record with `template_id` set → 409 `connector_already_activated`; no `PutCommand` issued |
  | INT-003 | `force: true` over existing activated row → 201; `PutCommand` called with new `mapping_version` (current `+ 1` per existing put logic) |
  | INT-004 | Custom mapping (existing row without `template_id`) without `force` → 409 `custom_mapping_exists` |
  | INT-005 | Stub template (`source_system: "iready"`) → 400 `template_not_ready`; no DynamoDB call |
  | INT-006 | Unknown `source_system: "unknown-lms"` → 404 `template_not_found`; no DynamoDB call |
  | INT-007 | `GET /connectors?org_id=springs` with Canvas activated, I-Ready + Branching Minds stubs → 200; statuses `{ activated, not_ready, not_ready }`; Canvas entry has `webhook_url`, others have `webhook_url: null` |
  | INT-015 | Auth: `GET /connectors` and `POST /connectors/activate` without `x-admin-api-key` → 401 `admin_key_required` |
  | INT-016 | E2E: activate Canvas → `POST /v1/webhooks/canvas-lms` with Canvas-shaped body → accepted signal appears in signal log (matches URS TASK-W1-3 verification). Mocks: webhook adapter pipeline through to `appendSignal`; verify call. |

  Deferred to Phase 2 (not in this PR): INT-008..014, INT-017..023.
- **Depends on**: TASK-001..008
- **Verification**: `npm test -- tests/contracts/connector-routes.test.ts` all green.

---

### TASK-010: `apply-template` CLI

- **Files**: `scripts/apply-template.ts` ← create
- **Action**: Create
- **Details**:
  Thin wrapper mirroring `scripts/upload-policy.ts:1-77` (HTTP POST + exit-code reporting). Usage:
  ```
  ADMIN_API_KEY=<key> CONTROL_LAYER_URL=http://localhost:3000 \
    npx tsx scripts/apply-template.ts <source_system> --org-id <org_id> [--force]
  ```
  - Defaults: `CONTROL_LAYER_URL` = `http://localhost:3000`
  - Sends `POST /v1/admin/connectors/activate` with body `{ org_id, source_system, force? }` and header `x-admin-api-key: $ADMIN_API_KEY`.
  - Prints response JSON; exits 0 on 2xx, 1 otherwise.
  - This is the artifact called out in URS TASK-W1-3 verification (`apply-template canvas-lms --org-id <id>`).
- **Depends on**: TASK-004, TASK-008
- **Verification**: Manual: with server running, `npx tsx scripts/apply-template.ts canvas-lms --org-id springs` returns 201 JSON; second run returns 409 `connector_already_activated`; with `--force` returns 201.

---

## Files Summary

### To Create

| File | Task | Purpose |
|---|---|---|
| `src/connector-templates/canvas-lms.json` | TASK-001 | Canvas LMS connector template (full, non-stub) |
| `src/connector-templates/iready.json` | TASK-001 | I-Ready stub template |
| `src/connector-templates/branching-minds.json` | TASK-001 | Branching Minds stub template |
| `src/connectors/template-registry.ts` | TASK-002 | Loads + caches bundled templates; startup validation |
| `src/connectors/connector-routes.ts` | TASK-004 | `GET /connectors` + `POST /connectors/activate` |
| `tests/contracts/connector-routes.test.ts` | TASK-009 | INT-001..007, INT-015, INT-016 |
| `tests/fixtures/connector-templates/*.json` | TASK-009 | Test-only template copies |
| `scripts/apply-template.ts` | TASK-010 | CLI wrapper for activation endpoint |

### To Modify

| File | Task | Change |
|---|---|---|
| `src/shared/error-codes.ts` | TASK-007 | Add 4 new connector error codes |
| `src/config/field-mappings-dynamo.ts` | TASK-003 | Add `getFieldMappingRecord()` |
| `src/server.ts` | TASK-008 | Import + call `initTemplateRegistry`, register routes |
| `docs/specs/integration-templates.md` | TASK-004/009 | Spec parity edits (D-1, D-2, D-3, D-4 in Deviations table) |

---

## Spec Edits Required (Same PR)

Per `.cursor/skills/implement-spec/SKILL.md` § Deviations: every row in the Deviations table marked "Update spec in same PR" must land with this PR.

1. **D-1**: Spec § `POST /v1/admin/connectors/activate` — Request Body example becomes `{ "org_id": "springs", "source_system": "canvas-lms" }`.
2. **D-2**: Spec § Contract Tests INT-007 row — change input/expected to match `{ activated, not_ready, not_ready }` (Canvas + I-Ready stub + Branching Minds stub).
3. **D-3**: Add a new § Pilot Implementation Scope subsection at the top of § Requirements documenting which functional requirements are in pilot vs Phase 2 (mirror this plan's Requirements Traceability).
4. **D-4**: In § Activation internals step 4, add a parenthetical: *"Pilot writes a full `PutItem`; Phase 2 will add a `mapping_version` condition expression when concurrent writers (admin dashboard) appear."*

---

## Test Plan

| Test ID | Type | Description | Task |
|---|---|---|---|
| INT-001 | contract | Happy path activate Canvas | TASK-009 |
| INT-002 | contract | Activate already-activated (no force) → 409 | TASK-009 |
| INT-003 | contract | Activate with force → 201, overwrites | TASK-009 |
| INT-004 | contract | Activate when custom mapping exists (no force) → 409 | TASK-009 |
| INT-005 | contract | Activate stub → 400 | TASK-009 |
| INT-006 | contract | Activate unknown source_system → 404 | TASK-009 |
| INT-007 | contract | GET list — mixed statuses (1 activated, 2 not_ready) | TASK-009 |
| INT-015 | contract | Auth required → 401 | TASK-009 |
| INT-016 | e2e | Activate Canvas → webhook → signal | TASK-009 |
| unit | unit | `isStubTemplate` returns true for iready stub, false for canvas | TASK-002 |
| unit | unit | `getTemplate('canvas-lms')` returns the loaded record | TASK-002 |
| unit | unit | `getFieldMappingRecord` returns full record with `template_id` | TASK-003 |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| INT-016 E2E test couples connector logic to webhook adapter implementation | Medium — refactor in webhook layer breaks this test | Mock at `appendSignal` level (already used in `webhooks.ts` tests); do not assert on internal pipeline structure |
| Template registry path resolution differs between `tsx` dev and `dist/` build | Medium — runtime breakage in prod only | Use `import.meta.url` based resolution + `CONNECTOR_TEMPLATES_DIR` env override; smoke-test in `npm run build && npm start` |
| `validateTransformExpression` on multi-source transforms needs `sourceKeys` | Low — Canvas template is single-source only | Detect `transforms[].sources` shape and pass `Object.keys(...)` accordingly; both branches already exist in `transform-expression.ts` |
| Existing `putFieldMappingItem` increments `mappingVersion` by 1; activation passes 0 and we want stored value to be 1 | Low — already verified in field-mappings-dynamo.ts:203 | Tests assert `mapping_version === 1` on first activation |

---

## Implementation Order

```
TASK-007 (errors)
    ↓
TASK-001 (templates) → TASK-002 (registry) → TASK-003 (getFieldMappingRecord)
                                                       ↓
                                                   TASK-004 (routes)
                                                       ↓
                                                   TASK-008 (server wire)
                                                       ↓
                                                   TASK-009 (tests) → TASK-010 (CLI)
```
