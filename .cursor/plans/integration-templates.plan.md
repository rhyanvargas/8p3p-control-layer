---
name: Integration Templates (Connector Layer — Activation UX)
overview: >
  Implements Layer 3 of the Connector Layer stack: a pre-built connector registry
  (bundled JSON files) and six admin endpoints that let an operator activate an LMS
  connector in a single API call. Activation copies the bundled template into the
  existing FieldMappingsTable; subsequent webhook signals flow through Layers 1 and 2
  unchanged. Ships three pilot templates (Canvas, I-Ready stub, Branching Minds stub)
  and a dry-run test endpoint that exercises the full ingestion pipeline without
  persisting signals or consuming LIUs.
todos:
  - id: "TASK-001"
    content: "Create connector template JSON files (canvas-lms-v1, iready-v1, branching-minds-v1)"
    status: "pending"
  - id: "TASK-002"
    content: "Create template registry loader — src/connectors/template-registry.ts"
    status: "pending"
  - id: "TASK-003"
    content: "Extend FieldMappingsTable DynamoDB layer with connector write/read/delete ops"
    status: "pending"
  - id: "TASK-004"
    content: "Create connector routes handler file — src/connectors/connector-routes.ts"
    status: "pending"
  - id: "TASK-005"
    content: "Add dry-run mode to ingestion pipeline for /test endpoint"
    status: "pending"
  - id: "TASK-006"
    content: "Add connection health query to signal log DynamoDB repository"
    status: "pending"
  - id: "TASK-007"
    content: "Add new connector error codes to src/shared/error-codes.ts"
    status: "pending"
  - id: "TASK-008"
    content: "Register connector routes in server.ts; add WEBHOOK_BASE_URL env"
    status: "pending"
  - id: "TASK-009"
    content: "Write contract tests INT-001 through INT-023"
    status: "pending"
isProject: false
---

# Integration Templates (Connector Layer — Activation UX)

**Spec**: `docs/specs/integration-templates.md`

## Prerequisites

Before starting implementation:
- [x] PREREQ-001 `FieldMappingsTable` DynamoDB table exists (`docs/specs/tenant-field-mappings.md` v1.1 — spec'd)
- [x] PREREQ-002 `invalidateFieldMappingCache(orgId, sourceSystem)` implemented in `src/config/field-mappings-dynamo.ts`
- [x] PREREQ-003 Admin API key middleware exists at `src/auth/admin-api-key-middleware.ts`
- [x] PREREQ-004 `POST /v1/webhooks/:source_system` defined in `docs/specs/webhook-adapters.md` (may not yet be implemented — see TASK-003 note)
- [ ] PREREQ-005 `FieldMappingsTable` items support `template_id` + `template_version` attributes (additive — no migration needed per spec)
- [ ] PREREQ-006 Signal log DynamoDB repository supports Query by `org_id + source_system` with `outcome` filter (needed for connection health — TASK-006)

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

---

### TASK-001: Create connector template JSON files

- **Files**:
  - `src/connector-templates/canvas-lms-v1.json` ← create
  - `src/connector-templates/iready-v1.json` ← create
  - `src/connector-templates/branching-minds-v1.json` ← create
- **Action**: Create
- **Details**:
  - `canvas-lms-v1.json` — fully populated, non-stub. Includes `envelope`, `transforms`, `required`, `types`, `aliases`, `available_event_types`, `default_event_types`, `setup_instructions`, and a realistic `test_payload`. Matches the shape defined in `docs/specs/integration-templates.md §Template Shape`.
  - `iready-v1.json` and `branching-minds-v1.json` — stub templates: `mapping` fields use `"TODO"` markers (string literal) so the stub check fires. `available_event_types` may be empty or placeholder. Activation of stubs returns `400 template_not_ready`.
  - All three files: `template_id`, `template_version`, `source_system`, `display_name`, `description` must be present.
- **Depends on**: none
- **Verification**:
  - `canvas-lms-v1.json` passes a local JSON parse without errors.
  - `iready-v1.json` and `branching-minds-v1.json` contain at least one `"TODO"` string in the `mapping` object.
  - Running `node -e "import('./src/connector-templates/canvas-lms-v1.json', {assert:{type:'json'}}).then(m => console.log(m.default.template_id))"` prints `canvas-lms-v1`.

---

### TASK-002: Create template registry loader

- **Files**: `src/connectors/template-registry.ts` ← create
- **Action**: Create
- **Details**:
  Implement and export:
  ```ts
  export interface ConnectorTemplate { /* all fields from spec */ }
  export function loadTemplateRegistry(): ConnectorTemplate[]
  export function getTemplate(sourceSystem: string): ConnectorTemplate | undefined
  export function isStubTemplate(template: ConnectorTemplate): boolean
  ```
  - `loadTemplateRegistry()` reads all `*.json` files from `src/connector-templates/` using `fs.readdirSync` + `JSON.parse`. Called once at server startup; results cached in module-level variable.
  - `isStubTemplate()` returns `true` if any value in the `mapping` object (deep) is the string `"TODO"`.
  - Add startup validation: for each template, call `validateTransformExpression()` from `src/config/tenant-field-mappings.ts` on each transform expression. Log a structured warning (`event: 'template_validation_warning'`) and mark the template as `not_ready` if validation fails — do NOT throw / crash.
  - Export `initTemplateRegistry()` that wraps `loadTemplateRegistry()` with the startup warning logic; called from `server.ts`.
- **Depends on**: TASK-001
- **Verification**:
  - Unit test: `getTemplate('canvas-lms')` returns the Canvas template object.
  - Unit test: `isStubTemplate(ireadyTemplate)` returns `true`.
  - Unit test: `isStubTemplate(canvasTemplate)` returns `false`.

---

### TASK-003: Extend FieldMappingsTable DynamoDB layer for connector operations

- **Files**: `src/connectors/connector-dynamo.ts` ← create
- **Action**: Create
- **Details**:
  New module wrapping DynamoDB calls needed by connector routes. Keeps connector logic separate from the existing `src/config/field-mappings-dynamo.ts` (which handles the read path for signal ingestion).

  Export:
  ```ts
  export interface FieldMappingsItem {
    org_id: string;
    source_system: string;
    mapping: Record<string, unknown>;
    template_id?: string;
    template_version?: string;
    mapping_version: number;
    updated_at: string;
    updated_by: string;
  }

  export async function getFieldMappingItem(orgId: string, sourceSystem: string): Promise<FieldMappingsItem | null>
  export async function putFieldMappingItem(item: FieldMappingsItem): Promise<void>
  export async function deleteFieldMappingItem(orgId: string, sourceSystem: string): Promise<void>
  export async function listFieldMappingItemsForOrg(orgId: string): Promise<FieldMappingsItem[]>
  ```

  - `putFieldMappingItem` uses `PutItem` (full overwrite — no condition expression needed because callers handle conflict logic before writing).
  - `listFieldMappingItemsForOrg` uses `Query(PK=org_id)` — needed to derive per-org activation status in `GET /v1/admin/connectors`.
  - Use `FIELD_MAPPINGS_TABLE` env var (same as the existing read layer).
  - After `putFieldMappingItem` or `deleteFieldMappingItem`, call `invalidateFieldMappingCache(orgId, sourceSystem)` from `src/config/field-mappings-dynamo.ts`.

  > **Note**: The webhook adapter endpoint (`POST /v1/webhooks/:source_system`) is defined in `docs/specs/webhook-adapters.md`. If it is not yet implemented in `src/`, the connector routes depend on it existing at runtime (status after deactivation: `400 missing_envelope_mapping`). The connector implementation itself does not call the webhook adapter; the dependency is behavioural only.

- **Depends on**: none (uses existing AWS SDK already in project)
- **Verification**:
  - Unit tests with mocked DynamoDB client: `putFieldMappingItem` calls `PutItemCommand`; `getFieldMappingItem` calls `GetItemCommand`; `deleteFieldMappingItem` calls `DeleteItemCommand`; `listFieldMappingItemsForOrg` calls `QueryCommand`.
  - `invalidateFieldMappingCache` is called after put and delete.

---

### TASK-004: Create connector routes

- **Files**: `src/connectors/connector-routes.ts` ← create
- **Action**: Create
- **Details**:
  Register all six connector endpoints. All require `x-admin-api-key` (enforced at the scope level in `server.ts` — same pattern as `registerPolicyManagementRoutes`).

  **Org resolution (pilot approach per spec §Notes)**: Extract `org_id` from the request body (for POST activate) or from a query param / path-derived lookup. Per spec, pilot adds `org_id` as a required field in the activation request body. For other endpoints (PUT, GET, DELETE), derive `org_id` from the admin key using a helper — if a single `ADMIN_API_KEY` is in use, require `org_id` as a query param on those routes too. Alternatively, store the org_id in the `FieldMappingsTable` row at activation time and look it up. **Decision**: require `org_id` query param on all connector routes for pilot simplicity; document this as pilot behaviour.

  **Endpoints to implement**:

  1. **`GET /connectors`** — list all templates with per-org activation status.
     - `loadTemplateRegistry()` → array of templates.
     - `listFieldMappingItemsForOrg(orgId)` → existing rows.
     - Derive status per template: if matching row with `template_id` → `activated`; if template `isStubTemplate` → `not_ready`; else → `available`.
     - Return `connectors[]` with `webhook_url` (non-null for activated), `event_types` (non-null for activated).

  2. **`POST /connectors/activate`** — activate a connector.
     - Body: `{ org_id, source_system, force?: boolean }`.
     - Template lookup → 404 `template_not_found` if missing.
     - Stub check → 400 `template_not_ready`.
     - Existing row check: if `template_id` present → 409 `connector_already_activated` (unless `force`). If row has no `template_id` → 409 `custom_mapping_exists` (unless `force`).
     - `putFieldMappingItem(...)` with full template mapping, `mapping_version: 1`, `updated_by: adminKeyPrefix`.
     - Construct `webhook_url` from `WEBHOOK_BASE_URL` env (default `http://localhost:3000`).
     - Return 201 with activation response.

  3. **`PUT /connectors/:source_system/config`** — update event types.
     - Load existing row → 404 `connector_not_activated` if absent or no `template_id`.
     - Validate each event type against template's `available_event_types` → 400 `invalid_event_type`.
     - Update `mapping.envelope.allowed_event_types`.
     - Optimistic lock on `mapping_version` (increment).
     - `putFieldMappingItem(...)` → `invalidateFieldMappingCache`.
     - Return 200.

  4. **`GET /connectors/:source_system`** — connector detail.
     - Load template (404 `template_not_found` if missing).
     - Load row from `FieldMappingsTable`.
     - Derive `upgrade_available`: `semver.gt(bundledVersion, rowVersion)`.
     - Query signal log for `connection_health` (via TASK-006 helper).
     - Query PoliciesTable for active org policy (read via `listPolicies(orgId)` from `src/admin/policies-dynamodb.ts`).
     - Return full detail response.

  5. **`DELETE /connectors/:source_system`** — deactivate connector.
     - Load row → 404 `connector_not_activated` if absent.
     - `deleteFieldMappingItem(orgId, sourceSystem)`.
     - Return 200.

  6. **`POST /connectors/:source_system/test`** — dry-run test.
     - Load row → 404 `connector_not_activated`.
     - Load template's `test_payload`.
     - Run ingestion pipeline in dry-run mode (TASK-005).
     - Return step-by-step result, pass/fail, `elapsed_ms`.

- **Depends on**: TASK-002, TASK-003, TASK-005, TASK-006, TASK-007
- **Verification**:
  - Integration tests (Fastify `inject`) for all six endpoints covering the happy paths listed in `§Acceptance Criteria`.
  - Auth missing → 401 (via scope-level middleware, not tested here per middleware test).

---

### TASK-005: Add dry-run mode to ingestion pipeline

- **Files**: `src/ingestion/handler-core.ts` ← modify
- **Action**: Modify
- **Details**:
  The test endpoint must run the full pipeline without writing to signal log, state, decisions, or consuming idempotency slots.

  Add optional `dryRun?: boolean` to the options parameter of `handleSignalIngestionCore`:

  ```ts
  export async function handleSignalIngestionCore(
    body: unknown,
    log: Logger,
    options?: { dryRun?: boolean }
  ): Promise<HandlerResult<SignalIngestResult> | DryRunResult>
  ```

  When `dryRun: true`:
  - Run all validation steps (envelope, forbidden keys, tenant field mapping/transforms).
  - **Skip**: `checkAndStore`, `appendSignal`, `appendIngestionOutcome`, `applySignals`, `evaluateState` persist calls.
  - Capture each step result (pass/fail, detail) in a `pipeline_steps` array.
  - Return a `DryRunResult` shape (not `HandlerResult`) with `test_result: "pass" | "fail"`, `failed_at`, `pipeline_steps`, `elapsed_ms`.

  Define `DryRunResult` in `src/connectors/types.ts` (new file, see TASK-004 files).

  The dry-run path wraps the existing pipeline steps as a sequential check list, capturing step outcome at each stage, and short-circuits on first failure (still returns all steps attempted with their status).

  > **Non-breaking constraint**: existing callers pass no third argument — `options` defaults to `undefined`, behaviour is identical to current.

- **Depends on**: none (modifies existing file)
- **Verification**:
  - Unit test: `handleSignalIngestionCore(validBody, {}, { dryRun: true })` returns `test_result: "pass"` with `pipeline_steps` array; no writes to SQLite signal log (mock or check store is empty).
  - Unit test: body with a missing required field in dry-run returns `test_result: "fail"` at `field_mapping` step.
  - Existing ingestion tests still pass (no regression).

---

### TASK-006: Add connection health query to signal log DynamoDB repository

- **Files**: `src/connectors/connection-health.ts` ← create
- **Action**: Create
- **Details**:
  Implement:
  ```ts
  export interface ConnectionHealth {
    status: 'receiving' | 'idle' | 'stale' | 'error';
    last_signal_at: string | null;
    signals_24h: number;
    errors_24h: number;
  }

  export async function getConnectionHealth(orgId: string, sourceSystem: string): Promise<ConnectionHealth>
  ```

  Logic:
  - Query signal log DynamoDB table (env: `SIGNAL_LOG_TABLE`) filtered by `org_id` + `source_system`, last 24 hours.
  - If `SIGNAL_LOG_TABLE` not set → return `{ status: 'idle', last_signal_at: null, signals_24h: 0, errors_24h: 0 }` (local dev graceful degradation).
  - Count rows where `outcome = 'rejected'` → `errors_24h`.
  - Count total rows → `signals_24h`.
  - Most recent `received_at` → `last_signal_at`.
  - Status derivation per spec:
    - `signals_24h > 0` → `receiving`
    - `signals_24h === 0` AND `last_signal_at !== null` (historical signals exist outside 24h window — need a secondary query or flag) → `stale`
    - `last_signal_at === null` (never received any) → `idle`
    - Last N signals all rejected → `error`
  - Use `SIGNAL_LOG_TABLE` GSI or scan — check existing `src/signalLog/dynamodb-repository.ts` for the available index structure.

- **Depends on**: none
- **Verification**:
  - Unit test with mocked DynamoDB: 47 signals in last 24h → `status: 'receiving'`, `signals_24h: 47`.
  - Unit test: zero rows ever → `status: 'idle'`.
  - Unit test: rows exist but all older than 24h → `status: 'stale'`.
  - Unit test: `SIGNAL_LOG_TABLE` unset → graceful degradation returns `idle`.

---

### TASK-007: Add connector error codes to shared/error-codes.ts

- **Files**: `src/shared/error-codes.ts` ← modify
- **Action**: Modify
- **Details**:
  Add the following new error codes (all from spec `§Error Codes — New`):

  ```ts
  // ==========================================================================
  // Integration Templates / Connector Layer (Layer 3)
  // ==========================================================================

  /** source_system does not match any bundled template (404) */
  TEMPLATE_NOT_FOUND: 'template_not_found',

  /** Template is a stub — mapping fields incomplete, cannot be activated (400) */
  TEMPLATE_NOT_READY: 'template_not_ready',

  /** A template-sourced mapping already exists for this org + source_system (409) */
  CONNECTOR_ALREADY_ACTIVATED: 'connector_already_activated',

  /** A custom (non-template) mapping exists for this org + source_system (409) */
  CUSTOM_MAPPING_EXISTS: 'custom_mapping_exists',

  /** No activated connector exists for this org + source_system (404) */
  CONNECTOR_NOT_ACTIVATED: 'connector_not_activated',

  /** One or more event types in the request are not in the template's available_event_types (400) */
  INVALID_EVENT_TYPE: 'invalid_event_type',
  ```

- **Depends on**: none
- **Verification**:
  - TypeScript compiles without errors after addition.
  - All new codes are accessible as `ErrorCodes.TEMPLATE_NOT_FOUND` etc.

---

### TASK-008: Register connector routes in server.ts; add WEBHOOK_BASE_URL env

- **Files**: `src/server.ts` ← modify
- **Action**: Modify
- **Details**:
  1. Import `registerConnectorRoutes` from `src/connectors/connector-routes.ts`.
  2. Import `initTemplateRegistry` from `src/connectors/template-registry.ts`.
  3. Call `initTemplateRegistry()` before route registration (after existing store inits) — logs any template validation warnings at startup.
  4. Register routes inside the existing `/v1/admin` scope (same scope that runs `adminApiKeyPreHandler`):
     ```ts
     server.register(async (admin) => {
       admin.addHook('preHandler', adminApiKeyPreHandler);
       registerPolicyManagementRoutes(admin);
       registerConnectorRoutes(admin);   // ← add
     }, { prefix: '/v1/admin' });
     ```
  5. Add `WEBHOOK_BASE_URL` to `.env.example` (if it exists) or document in README. The env var has a default of `http://localhost:3000` — no startup error if unset.
  6. Update `GET /` endpoints list to include `/v1/admin/connectors`.

- **Depends on**: TASK-004
- **Verification**:
  - `npm run build` succeeds with no TypeScript errors.
  - `GET /v1/admin/connectors?org_id=springs` returns 401 without admin key; returns 200 with valid key.
  - Server starts without warnings from template registry for `canvas-lms-v1.json`.

---

### TASK-009: Write contract tests INT-001 through INT-023

- **Files**: `src/connectors/__tests__/connector-routes.test.ts` ← create
- **Action**: Create
- **Details**:
  Using Fastify `inject` with mocked DynamoDB (same pattern as existing admin policy tests).
  Template registry loaded from test fixtures (`src/connector-templates/`) to isolate from production templates.

  Cover all 23 contract tests from `docs/specs/integration-templates.md §Contract Tests`:

  | Test ID | Focus |
  |---------|-------|
  | INT-001 | Happy path activate Canvas |
  | INT-002 | Activate already-activated (no force) → 409 |
  | INT-003 | Activate with force override → 201 |
  | INT-004 | Activate with custom mapping (no force) → 409 |
  | INT-005 | Activate stub template → 400 |
  | INT-006 | Activate unknown source_system → 404 |
  | INT-007 | List connectors — mixed statuses |
  | INT-008 | Configure event types — valid |
  | INT-009 | Configure event types — invalid type → 400 |
  | INT-010 | Configure event types — not activated → 404 |
  | INT-011 | Deactivate connector |
  | INT-012 | Deactivate — not activated → 404 |
  | INT-013 | Get connector detail — activated |
  | INT-014 | Get connector detail — upgrade available |
  | INT-015 | Auth required on all endpoints → 401 |
  | INT-016 | End-to-end: activate → webhook → signal (requires full ingestion pipeline) |
  | INT-017 | Test webhook — pass (dry-run, no signal persisted) |
  | INT-018 | Test webhook — mapping failure (dry-run fail) |
  | INT-019 | Test webhook — not activated → 404 |
  | INT-020 | Connection health — receiving |
  | INT-021 | Connection health — idle |
  | INT-022 | Connection health — stale |
  | INT-023 | Policy association in detail response |

  INT-016 is an end-to-end test that requires the webhook adapter (`POST /v1/webhooks/:source_system`) to be implemented. If not available, mark as `skip` with a TODO comment.

  INT-017 and INT-018: assert no DynamoDB write to signal log table (mock and verify `PutItemCommand` was NOT called).

  INT-020–022: mock `getConnectionHealth` or the underlying DynamoDB query.

- **Depends on**: TASK-001 through TASK-008
- **Verification**:
  - `npm test -- --grep "INT-"` runs all 23 tests; INT-016 may be skipped if webhook adapter is absent.
  - All non-skipped tests pass.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/connector-templates/canvas-lms-v1.json` | TASK-001 | Canvas LMS connector template (full, non-stub) |
| `src/connector-templates/iready-v1.json` | TASK-001 | I-Ready stub template |
| `src/connector-templates/branching-minds-v1.json` | TASK-001 | Branching Minds stub template |
| `src/connectors/template-registry.ts` | TASK-002 | Loads + caches bundled templates; startup validation |
| `src/connectors/connector-dynamo.ts` | TASK-003 | DynamoDB ops for FieldMappingsTable (connector write path) |
| `src/connectors/connector-routes.ts` | TASK-004 | All 6 connector admin endpoints |
| `src/connectors/types.ts` | TASK-005 | `DryRunResult`, `ConnectorStatus`, shared connector types |
| `src/connectors/connection-health.ts` | TASK-006 | Signal log query → `ConnectionHealth` |
| `src/connectors/__tests__/connector-routes.test.ts` | TASK-009 | INT-001 through INT-023 contract tests |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/ingestion/handler-core.ts` | TASK-005 | Add optional `dryRun` mode; return `DryRunResult` |
| `src/shared/error-codes.ts` | TASK-007 | Add 6 new connector error codes |
| `src/server.ts` | TASK-008 | Import + register `initTemplateRegistry` + `registerConnectorRoutes` |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| INT-001 | contract | Happy path activate Canvas — 201, row created, webhook_url returned | TASK-009 |
| INT-002 | contract | Activate already-activated (no force) → 409 connector_already_activated | TASK-009 |
| INT-003 | contract | Activate with force override — 201, row overwritten | TASK-009 |
| INT-004 | contract | Activate with custom mapping (no force) → 409 custom_mapping_exists | TASK-009 |
| INT-005 | contract | Activate stub template → 400 template_not_ready | TASK-009 |
| INT-006 | contract | Activate unknown source_system → 404 template_not_found | TASK-009 |
| INT-007 | contract | List connectors — mixed statuses (activated, available, not_ready) | TASK-009 |
| INT-008 | contract | Configure event types — valid update | TASK-009 |
| INT-009 | contract | Configure event types — invalid type → 400 | TASK-009 |
| INT-010 | contract | Configure event types — connector not activated → 404 | TASK-009 |
| INT-011 | contract | Deactivate connector — row removed | TASK-009 |
| INT-012 | contract | Deactivate not-activated → 404 | TASK-009 |
| INT-013 | contract | Get detail — activated, includes webhook_url + upgrade_available | TASK-009 |
| INT-014 | contract | Get detail — upgrade_available: true when bundled version > row version | TASK-009 |
| INT-015 | contract | Auth required on all endpoints → 401 | TASK-009 |
| INT-016 | e2e | Activate → POST /v1/webhooks/canvas-lms → signal created | TASK-009 |
| INT-017 | contract | Test endpoint — dry-run pass, no signal persisted | TASK-009 |
| INT-018 | contract | Test endpoint — dry-run fail at field_mapping | TASK-009 |
| INT-019 | contract | Test endpoint — not activated → 404 | TASK-009 |
| INT-020 | contract | Connection health: receiving (47 signals in 24h) | TASK-009 |
| INT-021 | contract | Connection health: idle (never received) | TASK-009 |
| INT-022 | contract | Connection health: stale (last signal >24h ago) | TASK-009 |
| INT-023 | contract | Policy association in connector detail response | TASK-009 |
| unit | unit | isStubTemplate() returns true for iready stub | TASK-002 |
| unit | unit | getTemplate() returns Canvas template | TASK-002 |
| unit | unit | DryRun mode: no writes, pipeline_steps returned | TASK-005 |
| unit | unit | ConnectionHealth: graceful degradation when SIGNAL_LOG_TABLE unset | TASK-006 |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Webhook adapter (`POST /v1/webhooks/:source_system`) not yet implemented | High — INT-016 blocked; connector activation works but signals won't flow | Mark INT-016 as skip with TODO; confirm webhook adapter status before pilot |
| Signal log DynamoDB table GSI structure unknown — may not support efficient `org_id + source_system` query for connection health | Medium — `getConnectionHealth` may require a Scan fallback | Check `src/signalLog/dynamodb-repository.ts` GSI config in TASK-006; add Scan fallback with filter |
| Org resolution from admin key: pilot uses single `ADMIN_API_KEY` — no per-org key mapping | Medium — all connector ops require explicit `org_id` param | Per spec §Notes, require `org_id` in request body (activate) / query param (other endpoints). Document as pilot limitation |
| `validateTransformExpression()` not yet exported from `tenant-field-mappings.ts` | Low — startup validation in TASK-002 may need to stub it | Check export surface before TASK-002; add export if missing |
| Semver comparison for `upgrade_available` — no `semver` package in project | Low — simple string compare may be wrong for edge cases | Install `semver` package or implement basic semver compare (split by `.`) |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] All contract tests pass (INT-001 through INT-023, except INT-016 if webhook adapter absent)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] `npm run build` succeeds
- [ ] Server starts without errors; `GET /health` returns 200
- [ ] `GET /v1/admin/connectors?org_id=springs` returns connector list with Canvas `available`, stubs `not_ready`
- [ ] Matches spec `§Requirements` functional requirements checklist

---

## Implementation Order

```
TASK-007 → TASK-001 → TASK-002
                            ↓
         TASK-003 → TASK-004 ← TASK-005
                    TASK-006 ↗
                            ↓
                       TASK-008
                            ↓
                       TASK-009
```

Parallelisable:
- TASK-007 (error codes) — no dependencies, do first
- TASK-001 (templates) + TASK-003 (dynamo layer) — independent, can be done in parallel
- TASK-005 (dry-run) + TASK-006 (connection health) — independent, can be done in parallel with TASK-002/003
