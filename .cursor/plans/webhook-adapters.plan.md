---
name: Webhook Adapters
overview: Implement `POST /v1/webhooks/:source_system` as a thin adapter that loads an envelope mapping from `FieldMappingsTable`, optionally filters by event type, extracts `learner_reference` / `signal_id` / `timestamp` from the raw LMS body via dot-paths, constructs a `SignalEnvelope`, then delegates **unchanged** to `handleSignalIngestionCore` (Fastify) / `handleSignalIngestionAsync` (Lambda). Critical reuse constraint per URS plan TASK-W1-2 step 4 — the webhook handler MUST funnel into the existing ingestion core so contract behavior matches `POST /v1/signals` bit-for-bit, making the just-shipped preflight gate meaningful: the same forbidden-key + tenant-mapping path runs.
todos:
  - id: "TASK-001"
    content: "Extend TenantPayloadMapping with optional `envelope` block (EnvelopeMapping type)"
    status: "pending"
  - id: "TASK-002"
    content: "Add new error codes: MISSING_ENVELOPE_MAPPING, ENVELOPE_EXTRACTION_FAILED"
    status: "pending"
  - id: "TASK-003"
    content: "Extend admin PUT /v1/admin/mappings body validation to accept + validate `envelope` block"
    status: "pending"
  - id: "TASK-004"
    content: "Extend field-mappings-dynamo.ts parseMappingFromItem to surface mapping.envelope"
    status: "pending"
  - id: "TASK-005"
    content: "Create webhook-envelope-extractor.ts (pure: mapping + body → envelope | dropped | error)"
    status: "pending"
  - id: "TASK-006"
    content: "Create webhook-handler-core.ts (sync, delegates to handleSignalIngestionCore)"
    status: "pending"
  - id: "TASK-007"
    content: "Create webhook-handler-core-async.ts (async, delegates to handleSignalIngestionAsync)"
    status: "pending"
  - id: "TASK-008"
    content: "Register Fastify route POST /webhooks/:source_system under /v1 scope in src/routes/webhooks.ts"
    status: "pending"
  - id: "TASK-009"
    content: "Create Lambda entry src/lambda/webhook.ts (DynamoIngestionPorts + path param parse)"
    status: "pending"
  - id: "TASK-010"
    content: "CDK: provision WebhookFunction Lambda + route POST /v1/webhooks/{source_system}"
    status: "pending"
  - id: "TASK-011"
    content: "OpenAPI: add /v1/webhooks/{source_system} POST operation + schema components"
    status: "pending"
  - id: "TASK-012"
    content: "Unit tests for webhook-envelope-extractor (extraction, fallbacks, filter, UUID, ISO 8601)"
    status: "pending"
  - id: "TASK-013"
    content: "Unit tests for admin envelope-block validation (extends admin-field-mappings.test.ts)"
    status: "pending"
  - id: "TASK-014"
    content: "Contract tests WHK-001..011 (Fastify inject + mocked FieldMappingsTable + idempotency store)"
    status: "pending"
  - id: "TASK-015"
    content: "Update spec to resolve deviations (schema_version literal, WHK-006 source key, 409→200) in same PR"
    status: "pending"
  - id: "TASK-016"
    content: "Mark URS plan TASK-W1-2 (wave1-webhooks) status: completed once Verification Checklist passes"
    status: "pending"
isProject: false
---

# Webhook Adapters

**Spec**: `docs/specs/webhook-adapters.md`

## Spec Literals

> Verbatim copies of normative blocks from `docs/specs/webhook-adapters.md`. TASK details MUST quote from this section rather than paraphrase. Update only if the spec itself changes.

### From spec § Endpoints — `POST /v1/webhooks/:source_system` request headers

```
| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | Tenant API key (same as `POST /v1/signals`) |
| `Content-Type` | Yes | `application/json` |
```

### From spec § Endpoints — Example Canvas request body

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

### From spec § Endpoints — Response (202) example body

```json
{
  "org_id": "springs",
  "signal_id": "sub_98765",
  "source_system": "canvas-lms",
  "status": "accepted",
  "received_at": "2026-03-28T10:30:01Z"
}
```

### From spec § Endpoints — Response (204): event type filtered out

> Returned when the webhook body's event type is not in the configured `allowed_event_types`. No body. No signal created, no LIU consumed.

### From spec § Endpoints — Response (400) missing envelope mapping body

```json
{
  "error": {
    "code": "missing_envelope_mapping",
    "message": "No envelope mapping configured for org 'springs' + source_system 'canvas-lms'. Use PUT /v1/admin/mappings/springs/canvas-lms to configure."
  }
}
```

### From spec § Endpoints — Response (400) envelope_extraction_failed body

```json
{
  "error": {
    "code": "envelope_extraction_failed",
    "message": "Cannot extract learner_reference: path 'submission.user_id' not found in webhook body."
  }
}
```

### From spec § Endpoints — Response (409) duplicate body

> Same as `POST /v1/signals` — `status: "duplicate"`, `received_at` from original.

### From spec § Envelope Mapping Config — full example

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

### From spec § Envelope Mapping Config — field table

```
| Config field            | Required | Fallback                       | Description |
| learner_reference_path  | Yes      | —                              | Dot-path to learner identifier in webhook body (must resolve to a string or number) |
| signal_id_path          | No       | Auto-generated UUID            | Dot-path to a unique signal identifier. If absent or empty, a UUID is generated |
| timestamp_path          | No       | Server `now()` (ISO 8601)      | Dot-path to a timestamp field. If absent or not a parseable ISO 8601 string, falls back to ingestion time |
| event_type_path         | No       | —                              | Dot-path to an event type discriminator in the webhook body (e.g. `event_type`). When set, the adapter reads this field and checks it against `allowed_event_types`. When absent, all webhooks are processed. |
| allowed_event_types     | No       | — (accept all)                 | Array of event type strings relevant to learning signals. Webhooks whose `event_type_path` value is **not** in this list are silently dropped with a `204 No Content` (no signal created, no error). Only evaluated when `event_type_path` is configured. |
```

> `schema_version` is fixed at `"1.0.0"` for all webhook-ingested signals. `org_id` is derived from the `x-api-key` tenant lookup.

### From spec § Adapter Pipeline

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

### From spec § Error Codes — new codes

```
| Code                          | HTTP Status | Description |
| missing_envelope_mapping      | 400         | No envelope mapping configured for the org + source_system combination. Admin must upload config via `PUT /v1/admin/mappings/:org_id/:source_system`. |
| envelope_extraction_failed    | 400         | A required envelope field (e.g., `learner_reference`) could not be extracted from the webhook body using the configured dot-path. |
| filtered_event_type           | 204         | Webhook event type not in `allowed_event_types` — silently dropped. Logged at `debug` level for observability; not surfaced to caller. |
```

### From spec § Constraints

- Single endpoint, no LMS-specific code — all LMS adaptation is configuration, not code branches.
- Payload is the full raw body — `SignalEnvelope.payload` receives the entire webhook body. Existing field mapping transforms run on this payload. No pre-filtering or trimming in the adapter.
- `schema_version` is fixed — `"1.0.0"` for all webhook-ingested signals.
- No webhook verification (v1.1) — rely on API key auth.
- No fan-out — one webhook call produces one signal.

---

## Prerequisites

Before starting implementation:
- [x] **PREREQ-001** URS Wave 1 TASK-W1-1 (`ingestion-preflight`) is complete — preflight handler-core is shipped, FieldMappingsTable Dynamo read path exists, forbidden-key categorization (`pii` vs `semantic`) is in place. (URS plan `wave1-preflight` is `status: completed`.)
- [ ] **PREREQ-002** `handleSignalIngestionCore` (sync) and `handleSignalIngestionAsync` (Lambda + DynamoDB ports) exist and are imported as the **only** signal-ingestion entry points. **Critical reuse constraint** — no duplication of forbidden-key / mapping / idempotency / signal-log / state / decision logic in the webhook layer.
- [ ] **PREREQ-003** `_setFieldMappingsDynamoClientForTesting` + `clearFieldMappingCache` test hooks exist on `src/config/field-mappings-dynamo.ts` so contract tests can mock the Dynamo client.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Extend `TenantPayloadMapping` with optional `envelope` block
- **Files**: `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**:
  - Add new exported interface `EnvelopeMapping` with fields matching the Spec Literals § Envelope Mapping Config field table:
    - `learner_reference_path: string` (required)
    - `signal_id_path?: string`
    - `timestamp_path?: string`
    - `event_type_path?: string`
    - `allowed_event_types?: string[]`
  - Add optional `envelope?: EnvelopeMapping` to `TenantPayloadMapping`.
  - Do **not** change `normalizeAndValidateTenantPayload(...)` behavior — `envelope` is consumed by the webhook adapter only; the canonical ingestion pipeline ignores it. Comment this invariant where the interface is declared.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; existing `/v1/signals` contract tests stay green (zero behavior change); new field is visible to importers.

### TASK-002: Add new error codes
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**:
  - Append to `ErrorCodes`:
    - `MISSING_ENVELOPE_MAPPING: 'missing_envelope_mapping'`
    - `ENVELOPE_EXTRACTION_FAILED: 'envelope_extraction_failed'`
  - Match the literal strings from Spec Literals § Error Codes verbatim.
  - `filtered_event_type` is **not** added to `ErrorCodes` (per spec it is "Logged at `debug` level; not surfaced to caller" — wire is 204 with no body, so no `error.code` is sent).
- **Depends on**: none
- **Verification**: `npm run typecheck` clean; grep for both new identifiers in `src/`.

### TASK-003: Extend admin PUT body validation for `envelope` block
- **Files**: `src/routes/admin-field-mappings.ts`
- **Action**: Modify
- **Details**:
  - In `validateMappingBody(body)`, after the existing `transforms` block, accept optional `envelope` field. When present, validate:
    - Must be a JSON object (not array, not null).
    - `learner_reference_path` is **required** and must be a non-empty string.
    - `signal_id_path`, `timestamp_path`, `event_type_path` (when present) must be non-empty strings.
    - `allowed_event_types` (when present) must be an array of non-empty strings.
    - If `allowed_event_types` is set but `event_type_path` is **not** set → return `{ ok: false, code: ErrorCodes.INVALID_FORMAT, message: 'envelope.allowed_event_types requires envelope.event_type_path to be configured' }` (defensive: the spec says "Only evaluated when `event_type_path` is configured" — surface the misconfig at write time rather than silently ignoring).
  - Reject unknown keys inside `envelope` with `INVALID_FORMAT` to keep the wire surface tight (matches the strictness pattern already applied to `transforms` rule validation).
- **Depends on**: TASK-001, TASK-002
- **Verification**: TASK-013 unit tests cover invalid + valid bodies; existing admin-field-mappings.test.ts stays green.

### TASK-004: Extend `parseMappingFromItem` to surface `mapping.envelope`
- **Files**: `src/config/field-mappings-dynamo.ts`
- **Action**: Modify
- **Details**:
  - In `parseMappingFromItem(item)`, after `strict_transforms`, parse `mapping.envelope` defensively (mirror the `transforms` defensive-parse style). Only populate the field when:
    - It is a non-null, non-array object.
    - `learner_reference_path` is a non-empty string.
  - Other envelope fields are copied across only when they are the correct shape; invalid sub-fields are dropped silently (Dynamo read is read-only; the admin PUT validator is the gatekeeper, so this layer should be tolerant).
  - No other behavioral change. The TTL cache, `getMappingFromDynamoDB`, `putFieldMappingItem`, `listFieldMappingItemsForOrg`, and `_setFieldMappingsDynamoClientForTesting` stay unchanged.
- **Depends on**: TASK-001
- **Verification**: TASK-014 contract tests for WHK-001 / WHK-006 / WHK-009 / WHK-010 read mapping with `envelope` from mocked `GetCommand` response and route through this code path.

### TASK-005: Create `webhook-envelope-extractor.ts`
- **Files**: `src/ingestion/webhook-envelope-extractor.ts` (create)
- **Action**: Create
- **Details**:
  - Pure framework-agnostic module. **Allowed imports**: `crypto` (for `randomUUID`), `../shared/dot-path.js`, `../shared/error-codes.js`, `../shared/types.js`, `../config/tenant-field-mappings.js` (types only). **No** imports from `handler-core*`, `idempotency`, `signalLog`, `state`, `decision`.
  - Public function:

    ```ts
    export type WebhookExtractionResult =
      | { kind: 'envelope'; envelope: SignalEnvelope }
      | { kind: 'dropped' } // 204
      | { kind: 'error'; statusCode: 400; body: { error: { code: string; message: string } } };

    export function extractWebhookEnvelope(args: {
      orgId: string;
      sourceSystem: string;
      mapping: TenantPayloadMapping | null;
      body: Record<string, unknown>;
      now?: () => string; // dependency-inject for testability
    }): WebhookExtractionResult;
    ```

  - Behavior, in order (mirrors Spec Literals § Adapter Pipeline steps 2-5):
    1. If `mapping?.envelope?.learner_reference_path` is missing → return
       `{ kind: 'error', statusCode: 400, body: { error: { code: 'missing_envelope_mapping', message: \`No envelope mapping configured for org '${orgId}' + source_system '${sourceSystem}'. Use PUT /v1/admin/mappings/${orgId}/${sourceSystem} to configure.\` } } }`.
    2. **Event-type filter** — if `envelope.event_type_path` is configured:
       - Read value at that dot-path; if value is missing OR not a string OR not in `allowed_event_types` (when `allowed_event_types` is configured) → return `{ kind: 'dropped' }`.
       - If `allowed_event_types` is absent, any string value passes.
    3. **Extract `learner_reference`** — read `envelope.learner_reference_path`. If undefined / null / empty string → return `{ kind: 'error', ..., code: 'envelope_extraction_failed', message: \`Cannot extract learner_reference: path '${envelope.learner_reference_path}' not found in webhook body.\` }`. Coerce numbers to strings.
    4. **Extract `signal_id`** — read `envelope.signal_id_path` if present; coerce to string. If absent / null / empty → generate via `crypto.randomUUID()`.
    5. **Extract `timestamp`** — read `envelope.timestamp_path` if present. Validate via `Date.parse(...)` → if `Number.isNaN(parsed)` or the original string lacks ISO 8601 form → fall back to `(now ?? () => new Date().toISOString())()`. Spec § Envelope Mapping Config: *"if absent or not a parseable ISO 8601 string, falls back to ingestion time."*
    6. **Construct envelope** — exactly:

       ```ts
       const envelope: SignalEnvelope = {
         org_id: orgId,
         signal_id: signalId,
         source_system: sourceSystem,
         learner_reference: learnerReference,
         timestamp: ts,
         schema_version: 'v1', // see Deviations from Spec — uses validator-compatible literal
         payload: body, // FULL raw webhook body, per spec § Constraints
       };
       ```

    7. Return `{ kind: 'envelope', envelope }`.
  - **No side effects** — no logging beyond what the caller passes; no DynamoDB reads (mapping is injected); no clock except via `now`.
- **Depends on**: TASK-001, TASK-002
- **Verification**: TASK-012 unit tests; pure-function, no I/O, deterministic when `now` is injected.

### TASK-006: Create `webhook-handler-core.ts` (sync, Fastify)
- **Files**: `src/ingestion/webhook-handler-core.ts` (create)
- **Action**: Create
- **Details**:
  - Framework-agnostic; mirrors the shape of `handler-core.ts` and `preflight-handler-core.ts`.
  - Public function:

    ```ts
    export async function handleWebhookCore(args: {
      orgId: string;
      sourceSystem: string;
      body: unknown;
      log?: Logger;
    }): Promise<HandlerResult<SignalIngestResult | { error: { code: string; message: string } } | undefined>>;
    ```

  - Flow:
    1. If `body` is not a JSON object → return `{ statusCode: 400, body: { error: { code: ErrorCodes.PAYLOAD_NOT_OBJECT, message: 'webhook body must be a JSON object' } } }`.
    2. Resolve mapping: `const mapping = await resolveTenantPayloadMappingForIngest(orgId, sourceSystem)`. **Important** — reuses the *exact* DynamoDB-first / file-fallback resolver that the existing ingestion pipeline uses, so the "same `FieldMappingsTable` item" promise from spec § Adapter Pipeline step 2 holds.
    3. Call `extractWebhookEnvelope({ orgId, sourceSystem, mapping, body })`.
    4. Switch on the result:
       - `dropped` → return `{ statusCode: 204, body: undefined }`. **Logged at `debug` level** per spec § Error Codes `filtered_event_type` row.
       - `error` → return as-is.
       - `envelope` → **delegate** to `handleSignalIngestionCore(envelope, log)` and return its `HandlerResult<SignalIngestResult>` **unchanged**. No status-code translation, no body mutation. This is the bit-for-bit guarantee.
- **Depends on**: TASK-005, PREREQ-002
- **Verification**: WHK-001..008 contract tests in TASK-014 pass via this path; static check that the module imports `handleSignalIngestionCore` from `handler-core.js` and re-exports nothing else.

### TASK-007: Create `webhook-handler-core-async.ts` (Lambda + DynamoDB ports)
- **Files**: `src/ingestion/webhook-handler-core-async.ts` (create)
- **Action**: Create
- **Details**:
  - Mirrors TASK-006 but delegates to `handleSignalIngestionAsync(envelope, ports, log)` from `handler-core-async.js`.
  - Same signature plus a `ports: DynamoIngestionPorts` argument.
  - Calls `resolveTenantPayloadMappingForIngest` (which already does DynamoDB-first via the same shared module) — no extra port plumbing required.
- **Depends on**: TASK-005, PREREQ-002
- **Verification**: Smoke-tested end-to-end via TASK-014 once Lambda entry exists; static import check shows only `handleSignalIngestionAsync` from `handler-core-async.js` as the ingestion entry point.

### TASK-008: Register Fastify route `POST /webhooks/:source_system`
- **Files**: `src/routes/webhooks.ts` (create), `src/server.ts` (modify)
- **Action**: Create + Modify
- **Details**:
  - New module `src/routes/webhooks.ts`:

    ```ts
    export function registerWebhookRoutes(app: FastifyInstance): void;
    ```

    Inside, register `POST /webhooks/:source_system` with body limit `parseInt(process.env.WEBHOOK_BODY_LIMIT ?? '1048576', 10)` (default 1 MB; spec § Constraints: "Payload is the full raw body" — match `/v1/signals` default).
  - Handler reads `:source_system` from path params and resolves `org_id` from `process.env.API_KEY_ORG_ID` (matches the existing v1-scope auth scheme; the `apiKeyPreHandler` already gates the request). Then calls `handleWebhookCore({ orgId, sourceSystem, body: request.body, log: request.log })`. Sets `reply.status(result.statusCode)`; sends body when present; sends bodiless `reply.send()` for 204.
  - In `src/server.ts`, import `registerWebhookRoutes` and call it inside the existing `v1` scope (the same `server.register(async (v1) => { v1.addHook('preHandler', apiKeyPreHandler); ... }, { prefix: '/v1' })` block). Webhook routes are **tenant-scoped, not admin-scoped** — spec § Requirements: *"Endpoint is registered under the existing `/v1` API key scope (not admin-only)"*.
- **Depends on**: TASK-006
- **Verification**: `curl -X POST http://localhost:3000/v1/webhooks/canvas-lms -H 'x-api-key: ...' -d '<canvas body>'` returns 200 with `status: "accepted"` after configuring an envelope mapping in a local dev fixture; contract tests in TASK-014 mount the same route via Fastify inject.

### TASK-009: Create Lambda entry `src/lambda/webhook.ts`
- **Files**: `src/lambda/webhook.ts` (create)
- **Action**: Create
- **Details**:
  - Mirrors `src/lambda/ingest.ts` but:
    - Reads `source_system` from `event.pathParameters?.source_system` (API Gateway path param).
    - Returns `400 missing_source_system_param` if the path param is absent (defensive — API Gateway routing should guarantee its presence, but stay tolerant).
    - Resolves `orgId` from `process.env.API_KEY_ORG_ID` (matches the `IngestFunction` pattern).
    - Calls `handleWebhookCore` swapped to the async core: `handleWebhookCoreAsync({ orgId, sourceSystem, body: rawBody, ports, log })`.
  - Returns API Gateway response shape: `{ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.body) }`. For 204, omits the `body` field per AWS API Gateway 204 conventions (or sends empty string; verify with integration smoke test).
  - Reuses the same `DynamoIngestionPorts` initialization as `ingest.ts` (idempotency, signalLog, state, decision, ingestionLog) — initialized **once per Lambda warm container** (module-level singleton, per Vercel React Best Practices § 3.5 Hoist Static I/O equivalent for serverless).
- **Depends on**: TASK-007
- **Verification**: TASK-010 CDK wires this to `POST /v1/webhooks/{source_system}`; manual smoke test against deployed stack.

### TASK-010: CDK — provision `WebhookFunction` + API Gateway route
- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**:
  - Add new public readonly field `webhookFunction: lambda.Function`.
  - In the constructor, after `IngestFunction`, provision:

    ```ts
    this.webhookFunction = new lambda.Function(this, 'WebhookFunction', {
      ...commonProps,
      functionName: `control-layer-webhook-${stage}`,
      handler: 'webhook.handler',
      description: 'Webhook adapter — POST /v1/webhooks/{source_system}',
      environment: { ...commonEnv },
    });
    ```

  - IAM grants — match `IngestFunction` exactly (webhook funnels into the same ingestion core, therefore needs the same data-table writes + config-table reads):
    - `signalsTable.grantReadWriteData(this.webhookFunction)`
    - `stateTable.grantReadWriteData(this.webhookFunction)`
    - `appliedSignalsTable.grantReadWriteData(this.webhookFunction)`
    - `decisionsTable.grantReadWriteData(this.webhookFunction)`
    - `idempotencyTable.grantReadWriteData(this.webhookFunction)`
    - `ingestionLogTable.grantReadWriteData(this.webhookFunction)`
    - `policiesTable.grantReadData(this.webhookFunction)`
    - `fieldMappingsTable.grantReadData(this.webhookFunction)`
    - `tenantsTable.grantReadData(this.webhookFunction)`
  - API Gateway route (after the existing `/v1/signals` resource block):

    ```ts
    const webhooks = v1.addResource('webhooks');
    const webhookSource = webhooks.addResource('{source_system}');
    webhookSource.addMethod('POST', new apigateway.LambdaIntegration(this.webhookFunction));
    ```

  - Emit a `cdk.CfnOutput` for `WebhookFunctionName` so deploy scripts can target it.
- **Depends on**: TASK-009
- **Verification**: `npm run synth` succeeds; `cdk diff` shows the new function + route only (no drift to existing resources); `npm run validate:contracts` clean.

### TASK-011: OpenAPI — add `/v1/webhooks/{source_system}` POST
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**:
  - Add a new `paths['/v1/webhooks/{source_system}']` block with `post` operation:
    - `tags: [Ingest]`, `operationId: ingestWebhook`, summary "Ingest a raw LMS webhook".
    - Path parameter `source_system: { in: path, required: true, schema: { type: string, minLength: 1, maxLength: 64 } }`.
    - `requestBody`: `application/json`, schema `type: object, additionalProperties: true` (raw LMS body is opaque to 8P3P).
    - Responses:
      - `200`: schema `$ref: '#/components/schemas/SignalIngestResult'` (accepted + duplicate share the bit-for-bit body from `/v1/signals`).
      - `204`: description "Event type filtered out (silently dropped). No body."
      - `400`: schema object with `error: { code, message }`, with `enum: [missing_envelope_mapping, envelope_extraction_failed, payload_not_object]` on `code`.
      - `401`: same shape as `/v1/signals` `401` (api_key_required / api_key_invalid).
  - Re-use the existing `SignalIngestResult` and `SignalEnvelope` schema components — do not duplicate.
  - Add an example block under the 200 response matching the Spec Literals § Response (202) example body **but** with `status: "accepted"` and a 200-coded example block (see Deviations from Spec re. 202→200).
- **Depends on**: TASK-002
- **Verification**: `npm run validate:api` passes; Swagger UI at `/docs` renders the new operation.

### TASK-012: Unit tests for `webhook-envelope-extractor`
- **Files**: `tests/unit/webhook-envelope-extractor.test.ts` (create)
- **Action**: Create
- **Details**: Direct (no Fastify) tests of `extractWebhookEnvelope` covering:
  - Missing mapping → `kind: 'error'`, code `missing_envelope_mapping`.
  - Missing `envelope.learner_reference_path` (mapping present but envelope absent) → `kind: 'error'`, code `missing_envelope_mapping`.
  - `learner_reference` path missing in body → `kind: 'error'`, code `envelope_extraction_failed`, message includes the configured dot-path.
  - `signal_id_path` configured + present → exact string used.
  - `signal_id_path` configured + absent → UUID v4 generated (assert regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`).
  - `signal_id_path` not configured → UUID v4 generated.
  - `timestamp_path` configured + valid ISO 8601 → used verbatim.
  - `timestamp_path` configured + invalid string → falls back to injected `now()`.
  - `timestamp_path` not configured → injected `now()`.
  - `event_type_path` configured + value in `allowed_event_types` → `kind: 'envelope'`.
  - `event_type_path` configured + value NOT in `allowed_event_types` → `kind: 'dropped'`.
  - `event_type_path` not configured → `kind: 'envelope'` regardless of body.
  - `allowed_event_types` absent but `event_type_path` configured → any string value passes; missing/null value drops.
  - `learner_reference` is a number in body → coerced to string in constructed envelope.
  - Constructed envelope's `payload` is **referentially the full raw body** (no field deletions, no clone).
  - Constructed envelope's `schema_version` is exactly `'v1'` (see Deviations).
- **Depends on**: TASK-005
- **Verification**: 15+ assertions covering each spec acceptance criterion at extractor level; runs in <500ms; no I/O.

### TASK-013: Unit tests for admin envelope-block validation
- **Files**: `tests/contracts/admin-field-mappings.test.ts` (modify) **or** `tests/unit/admin-envelope-validation.test.ts` (create)
- **Action**: Modify or Create
- **Details**: Add a new `describe('envelope block validation')` group covering:
  - Valid envelope (all fields set) → 200.
  - Valid minimal envelope (only `learner_reference_path`) → 200.
  - Missing `learner_reference_path` when `envelope` is present → 400 `invalid_format`.
  - `allowed_event_types` set without `event_type_path` → 400 `invalid_format`.
  - Unknown key inside `envelope` (e.g. `foo: 1`) → 400 `invalid_format`.
  - `learner_reference_path: ""` → 400 `invalid_format`.
  - `allowed_event_types` containing non-strings → 400 `invalid_format`.
- **Depends on**: TASK-003
- **Verification**: All existing admin-field-mappings tests stay green; new tests cover each branch of the validator.

### TASK-014: Contract tests WHK-001..011
- **Files**: `tests/contracts/webhook-adapters.test.ts` (create)
- **Action**: Create
- **Details**:
  - Pattern matches `tests/contracts/ingestion-preflight.test.ts` and `tests/contracts/signal-ingestion.test.ts`:
    - Mount Fastify app, register `apiKeyPreHandler` + `registerWebhookRoutes` under `/v1` prefix.
    - Init in-memory SQLite for `initIdempotencyStore`, `initSignalLogStore`, `initStateStore`, `initIngestionLogStore`.
    - Mock DynamoDB via `_setFieldMappingsDynamoClientForTesting` with `GetCommand` returns shaped per WHK fixture (see WHK-001 mapping below).
    - Clear all stores + field-mapping cache in `beforeEach`.
  - Implement one test per WHK ID; see Test Plan table for IDs.
  - Canvas mapping fixture (used by WHK-001..006, WHK-008..011):

    ```ts
    {
      Item: {
        org_id: 'springs',
        source_system: 'canvas-lms',
        mapping: {
          required: ['stabilityScore'],
          transforms: [{ target: 'stabilityScore', source: 'submission.points', expression: 'value / 100' }],
          envelope: {
            learner_reference_path: 'submission.user_id',
            signal_id_path: 'submission.id',
            timestamp_path: 'submission.submitted_at',
            event_type_path: 'event_type',
            allowed_event_types: ['submission_created', 'submission_updated']
          }
        },
        mapping_version: 1
      }
    }
    ```

    Note: `source: 'submission.points'` is **deliberately not `submission.score`** — see Deviations from Spec for WHK-006 rationale. The body fixture uses `submission.points: 65` (non-forbidden semantic key) so the test passes via bit-for-bit `handleSignalIngestionCore` delegation.
- **Depends on**: TASK-006, TASK-008, TASK-005, TASK-004
- **Verification**: All 11 WHK-* tests green; `npm test` total count climbs to ≥ 678 (+11 from 666 baseline + 1 admin envelope group).

### TASK-015: Update spec to resolve deviations
- **Files**: `docs/specs/webhook-adapters.md`
- **Action**: Modify
- **Details**: In the same PR as the implementation, apply three edits to make the spec literal-compatible with the implementation:
  1. § Envelope Mapping Config — change `schema_version` clause from `"1.0.0"` to `"v1"`. Add a sentence: *"Matches the validator pattern `^v[0-9]+$` enforced by `src/contracts/schemas/signal-envelope.json`."*
  2. § Adapter Pipeline step 5 — change `schema_version: "1.0.0"` to `schema_version: "v1"`.
  3. § Endpoints — relabel the duplicate response heading from `**Response (409) — duplicate signal (idempotency)**` to `**Response (200) — duplicate signal (idempotency)**` (the body already says "Same as `POST /v1/signals`", which is 200).
  4. § Contract Tests WHK-006 row — change *"Body: `{ submission: { score: 65 } }`"* to *"Body: `{ submission: { points: 65 } }`"* and change the transform to *"`value/100 → stabilityScore`"* with `source: "submission.points"`. Add a note under the table: *"WHK-006 deliberately uses `submission.points` (not a forbidden semantic key) so it can ingest via the bit-for-bit `handleSignalIngestionCore` delegation. Customers whose LMS body contains forbidden keys at the source path (e.g. raw `score`, `grade`) must run preflight first (`POST /v1/admin/ingestion/preflight`) and either remap the source path or strip the forbidden keys upstream."*
  5. § Endpoints — the `Response (202)` heading stays as the spec example, but add a sentence: *"Implementation returns HTTP 200 (matches `POST /v1/signals` bit-for-bit per § Adapter Pipeline step 7). `200` and `202` are interchangeable for the FR `'with HTTP 200/202'` acceptance criterion."* (Or change the heading to `Response (200)`. Prefer the latter to remove ambiguity.)
- **Depends on**: TASK-005, TASK-006 (so the chosen literals are the ones actually shipped)
- **Verification**: `git diff docs/specs/webhook-adapters.md` shows only the four edits; `/review --spec` (or equivalent) finds zero remaining drift between plan and spec.

### TASK-016: Mark URS plan TASK-W1-2 complete
- **Files**: `.cursor/plans/urs_product_readiness_55b0b52e.plan.md`
- **Action**: Modify
- **Details**: In the YAML frontmatter, change `wave1-webhooks` from `status: pending` to `status: completed` **after** Verification Checklist passes. Do **not** mark complete while any TASK-* in this plan is still `pending`.
- **Depends on**: TASK-001..TASK-015
- **Verification**: Verification Checklist below shows all boxes checked; URS plan diff is a single status flip.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/ingestion/webhook-envelope-extractor.ts` | TASK-005 | Pure mapping + body → envelope/dropped/error result |
| `src/ingestion/webhook-handler-core.ts` | TASK-006 | Sync framework-agnostic core; delegates to `handleSignalIngestionCore` |
| `src/ingestion/webhook-handler-core-async.ts` | TASK-007 | Async Lambda core; delegates to `handleSignalIngestionAsync` |
| `src/routes/webhooks.ts` | TASK-008 | Fastify route registration `POST /webhooks/:source_system` |
| `src/lambda/webhook.ts` | TASK-009 | Lambda entry; module-init DynamoDB ports; calls async core |
| `tests/unit/webhook-envelope-extractor.test.ts` | TASK-012 | Direct unit tests of envelope extractor |
| `tests/contracts/webhook-adapters.test.ts` | TASK-014 | WHK-001..011 contract tests |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/config/tenant-field-mappings.ts` | TASK-001 | Add `EnvelopeMapping` interface; add optional `envelope` field on `TenantPayloadMapping` |
| `src/shared/error-codes.ts` | TASK-002 | Add `MISSING_ENVELOPE_MAPPING`, `ENVELOPE_EXTRACTION_FAILED` |
| `src/routes/admin-field-mappings.ts` | TASK-003 | Extend `validateMappingBody` to validate optional `envelope` block |
| `src/config/field-mappings-dynamo.ts` | TASK-004 | Extend `parseMappingFromItem` to surface `mapping.envelope` |
| `src/server.ts` | TASK-008 | Import `registerWebhookRoutes`; call inside existing `/v1` scope |
| `infra/lib/control-layer-stack.ts` | TASK-010 | Provision `WebhookFunction`; IAM grants; API Gateway route + CfnOutput |
| `docs/api/openapi.yaml` | TASK-011 | New `paths['/v1/webhooks/{source_system}']` POST operation |
| `tests/contracts/admin-field-mappings.test.ts` | TASK-013 | Add envelope-block validation tests (or new file) |
| `docs/specs/webhook-adapters.md` | TASK-015 | Resolve deviations (schema_version literal, WHK-006 source, 202/409 codes) |
| `.cursor/plans/urs_product_readiness_55b0b52e.plan.md` | TASK-016 | Flip `wave1-webhooks` to `status: completed` |

---

## Requirements Traceability

> Every `- [ ]` bullet under spec § Functional Requirements and every `Given/When/Then` under spec § Acceptance Criteria maps to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `POST /v1/webhooks/:source_system` accepts raw JSON body and requires `x-api-key` | spec § Functional | TASK-008, TASK-009, TASK-010 |
| Endpoint loads envelope mapping config for `(org_id, source_system)` from `FieldMappingsTable` via `GetItem` | spec § Functional | TASK-004, TASK-006, TASK-007 |
| If no mapping exists, returns 400 `missing_envelope_mapping` with actionable message | spec § Functional | TASK-005, TASK-006, TASK-002 |
| Event type filtering: when `event_type_path` + `allowed_event_types` are configured, the adapter reads the event type and drops non-matching events with `204 No Content`; when absent, all events proceed | spec § Functional | TASK-005, TASK-006 |
| Extracts `learner_reference` from body via configured dot-path; returns 400 `envelope_extraction_failed` if path is absent or resolves to null/undefined | spec § Functional | TASK-005, TASK-002 |
| Extracts `signal_id` from body if `signal_id_path` configured; otherwise generates UUID v4 | spec § Functional | TASK-005 |
| Extracts `timestamp` from body if `timestamp_path` configured and value is a valid ISO 8601 string; otherwise falls back to server `new Date().toISOString()` | spec § Functional | TASK-005 |
| Constructs a valid `SignalEnvelope` and passes it to the existing ingestion handler core (shared logic with `POST /v1/signals` — no duplication) | spec § Functional | TASK-006, TASK-007 (delegation), PREREQ-002 |
| Idempotency behavior is identical to `POST /v1/signals` (same `signal_id` → `status: "duplicate"`) | spec § Functional | TASK-006 (via delegation), TASK-014 WHK-005 |
| Returns the same `SignalIngestResult` shape as `POST /v1/signals` with HTTP 200/202 | spec § Functional | TASK-006 (passes through `HandlerResult` unchanged) |
| Envelope config lives in `FieldMappingsTable` alongside field mapping config (same `PutItem` / `GetItem` patterns — no new DynamoDB table) | spec § Functional | TASK-001, TASK-003, TASK-004 |
| Admin `PUT /v1/admin/mappings/:org_id/:source_system` body schema is extended to include optional `envelope` block; existing mappings without `envelope` block are not affected (backward compatible) | spec § Functional | TASK-003, TASK-013 |
| Endpoint is registered under the existing `/v1` API key scope (not admin-only) | spec § Functional | TASK-008 |
| Given a Canvas webhook body with `submission.user_id: "canvas_student_001"`, when `POST /v1/webhooks/canvas-lms` is called with a valid API key, then a signal is created with `learner_reference: "canvas_student_001"` and the pipeline produces a decision | spec § Acceptance Criteria | TASK-014 WHK-001 |
| Given no envelope mapping is configured for `springs/canvas-lms`, when `POST /v1/webhooks/canvas-lms` is called, then 400 `missing_envelope_mapping` is returned | spec § Acceptance Criteria | TASK-014 WHK-002 |
| Given `signal_id_path` is not configured, when the endpoint is called, then `signal_id` is an auto-generated UUID and the signal is accepted | spec § Acceptance Criteria | TASK-014 WHK-004 |
| Given the same raw webhook body is sent twice (same extracted `signal_id`), then the second call returns `status: "duplicate"` with the original `received_at` | spec § Acceptance Criteria | TASK-014 WHK-005 |
| Given `learner_reference_path: "submission.user_id"` but the body has no `submission.user_id`, then 400 `envelope_extraction_failed` is returned | spec § Acceptance Criteria | TASK-014 WHK-003 |
| Given a valid call, the raw body flows into the tenant field mapping pipeline so configured transforms execute on the payload | spec § Acceptance Criteria | TASK-014 WHK-006 |
| Given `event_type_path: "event_type"` and `allowed_event_types: ["submission_created"]`, when a webhook with `event_type: "enrollment_created"` is received, then `204 No Content` is returned and no signal is created | spec § Acceptance Criteria | TASK-014 WHK-010 |
| Given `event_type_path: "event_type"` and `allowed_event_types: ["submission_created"]`, when a webhook with `event_type: "submission_created"` is received, then the signal is ingested normally | spec § Acceptance Criteria | TASK-014 WHK-009 |
| Given no `event_type_path` is configured in the mapping, all webhook events proceed to ingestion regardless of body content | spec § Acceptance Criteria | TASK-014 WHK-011 |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| WHK-001 | contract | Happy path — valid webhook + envelope mapping → 200 `accepted`; `learner_reference: "canvas_student_001"` | TASK-014 |
| WHK-002 | contract | Missing envelope mapping → 400 `missing_envelope_mapping` | TASK-014 |
| WHK-003 | contract | Envelope extraction failure — `learner_reference_path` missing in body → 400 `envelope_extraction_failed` | TASK-014 |
| WHK-004 | contract | Auto-generated `signal_id` when `signal_id_path` absent; response `signal_id` matches UUID v4 regex | TASK-014 |
| WHK-005 | contract | Idempotency — same extracted `signal_id` sent twice; second call returns 200 + `status: "duplicate"` + original `received_at` | TASK-014 |
| WHK-006 | contract | Tenant field mapping transforms execute on payload — body `{ submission: { points: 65 } }` + transform `value/100 → stabilityScore` → signal accepted, state contains `stabilityScore: 0.65` (see Deviations re. source key) | TASK-014 |
| WHK-007 | contract | Auth required — no `x-api-key` → 401 | TASK-014 |
| WHK-008 | contract | Timestamp fallback — `timestamp_path` absent; response/state shows valid ISO 8601 server-time | TASK-014 |
| WHK-009 | contract | Event type filter — allowed event proceeds → 200 `accepted` | TASK-014 |
| WHK-010 | contract | Event type filter — disallowed event silently dropped → 204 No Content; no signal created (verified by zero `PutCommand` on signal log mock + ingestion outcome mock) | TASK-014 |
| WHK-011 | contract | Event type filter not configured — all events pass to ingestion | TASK-014 |
| TEST-WEBHOOK-EXTRACT-001..015 | unit | Direct unit tests of `extractWebhookEnvelope` for each spec acceptance row at extractor level | TASK-012 |
| TEST-ADMIN-ENV-VAL-001..007 | unit | Admin PUT envelope-block validation branches | TASK-013 |

---

## Deviations from Spec

> Three deviations are required because the spec was authored before `handler-core.ts` / `signal-envelope.json` constraints were finalized. The "bit-for-bit reuse of `handleSignalIngestionCore`" constraint from URS plan TASK-W1-2 step 4 is non-negotiable; all four deviations resolve in favor of the implementation, with matching spec edits applied in TASK-015 (same PR).

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Envelope Mapping Config + § Adapter Pipeline step 5 | `schema_version: "1.0.0"` for all webhook-ingested signals | `schema_version: "v1"` | Update spec in same PR — current validator (`src/contracts/schemas/signal-envelope.json`) enforces pattern `^v[0-9]+$`; `"1.0.0"` would fail `validateSignalEnvelope` inside `handleSignalIngestionCore`, breaking the bit-for-bit reuse constraint. `"v1"` is what `/v1/signals` already uses (see `tests/contracts/signal-ingestion.test.ts:52`). |
| § Endpoints — Response (409) — duplicate signal | HTTP 409 for duplicates | HTTP 200 with `status: "duplicate"` | Update spec in same PR — the spec body for the 409 row explicitly says *"Same as `POST /v1/signals`"*, and `/v1/signals` returns 200 for duplicates (see `handleSignalIngestionCore` `statusCode: 200, body.status: 'duplicate'`). The 409 header is a doc typo; bit-for-bit dictates 200. |
| § Endpoints — Response (202) — accepted | HTTP 202 for accepted | HTTP 200 with `status: "accepted"` | Update spec in same PR — § Functional Requirements already says *"with HTTP 200/202"*, so 200 satisfies the FR. Bit-for-bit reuse of `handleSignalIngestionCore` (which returns 200) is the deciding factor. The spec's 202 example response will be relabeled `Response (200)`. |
| § Contract Tests WHK-006 | Body `{ submission: { score: 65 } }` + transform `value/100 → stabilityScore` → signal accepted | Body `{ submission: { points: 65 } }` + transform `value/100 → stabilityScore` with `source: "submission.points"` → signal accepted | Update spec in same PR — `score` is in `FORBIDDEN_SEMANTIC_KEYS` (see `src/ingestion/forbidden-keys.ts`); `handleSignalIngestionCore`'s `detectForbiddenKeys` step would reject **before** running tenant transforms. The bit-for-bit constraint means the test fixture must use a non-forbidden source path. `points` is not in `FORBIDDEN_SEMANTIC_KEYS` and is the natural Canvas field for `assignment.points_possible`-scaled scores. Customers whose LMS body contains forbidden source keys are exactly what the preflight gate (TASK-W1-1) catches; the README/integration-guide will direct them to run preflight first. |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Customers ship webhooks containing PII keys (`firstName`, `email`, etc.) at deep paths — `handleSignalIngestionCore`'s forbidden-key detector rejects, surface error is confusing because it points at `payload.<deep.path>` rather than the webhook concept | High — onboarding friction | Pilot onboarding flow (TASK-W1-3 integration-templates) ships pre-vetted mappings; preflight gate already catches this on a real customer sample. Webhook 400 response includes `field_path` from the delegated handler-core unchanged, which is enough for a Springs operator + 8P3P engineer to triage. |
| Different LMS vendors emit the same `event_type` string with conflicting semantics (e.g. Canvas `submission_created` vs i-Ready `submission_created`) — operator confusion | Medium | `allowed_event_types` is per `(org_id, source_system)` so no cross-vendor leakage; integration-templates (TASK-W1-3) bakes the vetted set per LMS template. |
| `WebhookFunction` cold start adds latency on first webhook of a quiet day (~600-800 ms with Node.js 22 + arm64) | Low — pilot scale | Module-level DynamoDB port init (`init()` once per warm container) keeps warm latency under 50 ms. Provisioned concurrency optional post-pilot. |
| Spec's `schema_version: "1.0.0"` lingers in customer-facing docs / integration guide after TASK-015 spec edit, causing confusion | Low | TASK-015 also covers a grep for `1.0.0` in `docs/` and amends the integration template README (`internal-docs/pilot-operations/pilot-readiness-definition.md`) if the literal appears there. |
| Test count regression — adding 11 WHK contract tests + 15+ extractor unit tests + 7 admin envelope tests should not cause flakiness in existing 666-test suite | Low | All new tests use the same in-memory SQLite + mocked DynamoDB pattern as `ingestion-preflight.test.ts` and `signal-ingestion.test.ts` (proven stable). New test count target: ≥ 700 (matches URS Wave 1 Gate). |
| WHK-006 deviation (forbidden `score` → `points` in test fixture) hides a real production failure mode — customer's actual Canvas body uses `submission.score`, not `submission.points` | Medium — onboarding friction | Integration-templates (TASK-W1-3) **must** ship a Canvas template that maps the actual Canvas field (which the Canvas docs call `submission.score`). That template will require pre-ingestion preflight to confirm the customer's payload shape and a transform path that doesn't re-introduce a top-level `score` key. Document in integration template README. |
| Lambda `WebhookFunction` shares write grants with `IngestFunction` but not test isolation between the two functions could lead to cross-pollution of in-flight signals | Low | Both functions write to the **same** tables intentionally — they are interchangeable producers of the same signal log. Idempotency via `(org_id, signal_id)` guarantees no double-apply even if the same signal arrives via both paths. |

---

## Verification Checklist

- [ ] All TASK-001..TASK-016 completed (todos in YAML frontmatter)
- [ ] `npm test` passes; total test count ≥ 700 (baseline 666 + 11 WHK + 15+ extractor + 7+ admin envelope)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run validate:contracts` passes
- [ ] `npm run validate:api` passes (OpenAPI lint clean after TASK-011)
- [ ] `cdk synth` succeeds; `cdk diff` against deployed dev stage shows only the new `WebhookFunction` + API Gateway route (no drift to other resources)
- [ ] Manual smoke test against the deployed dev stage:
  - Configure Canvas envelope mapping via `PUT /v1/admin/mappings/springs/canvas-lms` with `envelope.learner_reference_path: "submission.user_id"`.
  - `POST /v1/webhooks/canvas-lms` with a recorded Canvas submission body → 200 `accepted`.
  - Same call with a body whose `submission.user_id` is missing → 400 `envelope_extraction_failed`.
  - Same call with `event_type: "enrollment_created"` (not in `allowed_event_types`) → 204.
- [ ] Wave 1 Gate row in `internal-docs/pilot-operations/pilot-readiness-definition.md` references webhook adapter status if the gate definition expects it.
- [ ] URS plan TASK-W1-2 (`wave1-webhooks`) flipped to `status: completed` (TASK-016).
- [ ] No new write paths added to STATE Store, Signal Log, or Decision Store outside the existing `handleSignalIngestionCore` / `handleSignalIngestionAsync` (STATE Authority preserved — per URS master plan verification checklist).
- [ ] Static import audit: `src/ingestion/webhook-handler-core.ts` imports **exactly one** signal-ingestion entry point (`handleSignalIngestionCore`); `src/ingestion/webhook-handler-core-async.ts` imports **exactly one** entry point (`handleSignalIngestionAsync`); neither imports `idempotency`, `signalLog`, `state.engine`, or `decision.engine` directly. (Enforces the bit-for-bit reuse constraint.)

---

## Implementation Order

```
TASK-001 (envelope mapping type)
   │
   ├─► TASK-002 (error codes)              ─────────────┐
   │                                                    │
   ├─► TASK-003 (admin PUT validator)  ──► TASK-013 (admin tests)
   │
   ├─► TASK-004 (Dynamo parse)
   │
   └─► TASK-005 (envelope extractor)  ──► TASK-012 (extractor unit tests)
           │
           ├─► TASK-006 (sync core) ──► TASK-008 (Fastify route)
           │                                │
           │                                └─► TASK-014 (contract tests WHK-001..011)
           │
           └─► TASK-007 (async core) ──► TASK-009 (Lambda entry) ──► TASK-010 (CDK)
                                                                       │
                                                                       └─► TASK-011 (OpenAPI)
                                                                              │
                                                                              └─► TASK-015 (spec deviations resolved)
                                                                                     │
                                                                                     └─► TASK-016 (URS status flip)
```

W1-2 and W1-3 (integration-templates) can overlap once TASK-005 ships the envelope extractor and TASK-008 ships the Fastify route — that's the public contract templates need to seed against. Recommend kicking off W1-3 sub-plan no earlier than TASK-008 verification.
