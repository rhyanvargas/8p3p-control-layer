---
name: LIU Usage Meter
overview: Implement per-org monthly LIU (Learning Intelligence Unit) metering with an atomic counter in the decision write path, a `UsageRepository` port (SQLite + DynamoDB adapters), admin endpoint `GET /v1/admin/usage` and tenant endpoint `GET /v1/usage`, plus CDK `UsageTable` and Lambda wiring. Increment is fire-and-forget after `saveDecision()` succeeds so metering never fails ingestion. Lifecycle stage: pre-Month 0 (v1.1, SBIR evidence denominator).
todos:
  - id: TASK-001
    content: Add invalid_period_format error code to shared ErrorCodes
    status: pending
  - id: TASK-002
    content: Create period utility (getCurrentPeriod, validatePeriod, comparePeriods)
    status: pending
  - id: TASK-003
    content: Define UsageRepository interface + shared Usage types
    status: pending
  - id: TASK-004
    content: Implement SqliteUsageRepository + module-level init/close/increment/query API
    status: pending
  - id: TASK-005
    content: Implement DynamoDbUsageRepository (DocumentClient; ADD liu_count; Query; Scan)
    status: pending
  - id: TASK-006
    content: Build handler-cores for admin + tenant usage queries
    status: pending
  - id: TASK-007
    content: Build Fastify handlers and route registration for /admin/usage and /usage
    status: pending
  - id: TASK-008
    content: Wire usage store init/close and routes into src/server.ts (admin + tenant scopes)
    status: pending
  - id: TASK-009
    content: Integrate counter increment into sync ingestion handler-core after saveDecision
    status: pending
  - id: TASK-010
    content: Integrate counter increment into async ingestion handler-core-async + extend DynamoIngestionPorts
    status: pending
  - id: TASK-011
    content: CDK — add UsageTable, IAM grants, API Gateway routes /v1/admin/usage and /v1/usage, USAGE_TABLE env
    status: pending
  - id: TASK-012
    content: Lambda wiring — inject DynamoDbUsageRepository into ingest + query + admin Lambdas
    status: pending
  - id: TASK-013
    content: OpenAPI — document GET /v1/admin/usage and GET /v1/usage schemas
    status: pending
  - id: TASK-014
    content: Unit tests — period utility + SqliteUsageRepository (covers LIU-008)
    status: pending
  - id: TASK-015
    content: Contract tests — admin & tenant endpoint auth + period range (LIU-003, LIU-004, LIU-005, LIU-007)
    status: pending
  - id: TASK-016
    content: Integration tests — signal → decision → counter increment (LIU-001, LIU-002)
    status: pending
  - id: TASK-017
    content: Unit test — increment failure does not fail ingestion (LIU-006)
    status: pending
isProject: false
---

# LIU Usage Meter

**Spec**: `docs/specs/liu-usage-meter.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § What Counts as an LIU

| Event | Counts as LIU? | Rationale |
|-------|-----------------|-----------|
| `POST /v1/signals` → decision produced (any type: reinforce, advance, intervene, pause) | **Yes** | Full pipeline completed: signal → state → policy → decision |
| `POST /v1/signals` → signal accepted but no decision (e.g., state update only, no policy matched) | **No** | No governed decision was produced |
| `POST /v1/signals` → rejected (validation failure, duplicate, forbidden keys) | **No** | Signal was not processed |
| `GET /v1/decisions` (query existing decisions) | **No** | Read-only — no new decision |
| `GET /v1/state` or any inspection endpoint | **No** | Read-only |
| Admin operations (PUT policy, etc.) | **No** | Configuration, not learning decisions |

**Rule:** 1 LIU = 1 new row in the decisions store. The counter increments in the same transaction/write path as `saveDecision()`.

### From spec § Data Model — Usage Counter Table (DynamoDB)

| Attribute | Type | Description |
|-----------|------|-------------|
| `org_id` (PK) | String | Organization identifier |
| `period` (SK) | String | Billing period in `YYYY-MM` format (e.g., `2026-04`) |
| `liu_count` | Number | Atomic counter — total LIUs in this period |
| `updated_at` | String (ISO 8601) | Last increment timestamp |

### From spec § Data Model — Access patterns

| Pattern | Operation | Key condition |
|---------|-----------|---------------|
| Increment counter | `UpdateItem` with `ADD liu_count :1` | `PK = org_id, SK = YYYY-MM` |
| Get current month usage | `GetItem` | `PK = org_id, SK = current YYYY-MM` |
| Get usage history | `Query` | `PK = org_id, SK BETWEEN start AND end` |
| List all orgs (admin) | `Scan` with `period` filter | Filter `SK = YYYY-MM` |

**SQLite fallback (local dev):** Single `usage_counter` table with `(org_id, period)` unique constraint, `liu_count INTEGER DEFAULT 0`. Increment via `INSERT ... ON CONFLICT DO UPDATE SET liu_count = liu_count + 1`.

### From spec § Data Model — CDK Addition

```typescript
const usageTable = new dynamodb.Table(this, 'UsageTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'period', type: dynamodb.AttributeType.STRING },
});
usageTable.grantReadWriteData(ingestFn);
usageTable.grantReadData(queryFn);
usageTable.grantReadData(adminFn);
```

### From spec § `GET /v1/admin/usage` (Admin)

**Headers:** `x-admin-api-key` required.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from_period` | No | Start period (`YYYY-MM`). Defaults to current month. |
| `to_period` | No | End period (`YYYY-MM`). Defaults to `from_period`. |
| `org_id` | No | Filter to a single org. When omitted, returns all orgs. |

**Response (200):**

```json
{
  "periods": [
    {
      "period": "2026-04",
      "orgs": [
        {
          "org_id": "springs",
          "liu_count": 12450,
          "updated_at": "2026-04-04T18:30:00Z"
        },
        {
          "org_id": "demo",
          "liu_count": 340,
          "updated_at": "2026-04-03T12:00:00Z"
        }
      ],
      "total_liu_count": 12790
    }
  ],
  "grand_total_liu_count": 12790
}
```

### From spec § `GET /v1/usage` (Tenant)

**Headers:** `x-api-key` required.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from_period` | No | Start period (`YYYY-MM`). Defaults to current month. |
| `to_period` | No | End period (`YYYY-MM`). Defaults to `from_period`. |

**Response (200):**

```json
{
  "org_id": "springs",
  "periods": [
    {
      "period": "2026-03",
      "liu_count": 9800,
      "updated_at": "2026-03-31T23:59:00Z"
    },
    {
      "period": "2026-04",
      "liu_count": 12450,
      "updated_at": "2026-04-04T18:30:00Z"
    }
  ],
  "total_liu_count": 22250
}
```

### From spec § Integration Point

```
validateSignal → storeSignal → applyState → evaluatePolicy → saveDecision → incrementLiuCounter
                                                                               ↑ NEW
```

```typescript
// In ingestion handler-core, after decision is saved:
if (decision) {
  await usageRepository.incrementLiu(orgId, getCurrentPeriod());
}
```

`getCurrentPeriod()` returns `YYYY-MM` from the decision timestamp (not wall clock — ensures consistency if signals are processed with slight delay).

**Failure handling:** If the counter increment fails (DynamoDB throttle, transient error), log a warning but do **not** fail the signal ingestion.

### From spec § Error Codes — New

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_period_format` | 400 | `from_period` or `to_period` does not match `YYYY-MM` |

### From spec § File Structure

```
src/
├── usage/
│   ├── repository.ts              # UsageRepository interface
│   ├── store.ts                   # SqliteUsageRepository (local dev)
│   ├── dynamodb-repository.ts     # DynamoDbUsageRepository (AWS)
│   ├── handler.ts                 # Fastify route handlers
│   ├── handler-core.ts            # Framework-agnostic logic
│   └── routes.ts                  # Route registration
```

---

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** `saveDecision()` pipeline exists and is called from `src/ingestion/handler-core.ts` (sync) and `src/ingestion/handler-core-async.ts` (async) — confirmed in current tree (`src/decision/engine.ts` → `saveDecision`).
- [ ] **PREREQ-002** Admin-key middleware + `/v1/admin` scope exist (`src/auth/admin-api-key-middleware.ts`, `server.ts` admin scope) — confirmed.
- [ ] **PREREQ-003** Tenant api-key middleware runs `apiKeyPreHandler` on `/v1` scope and supports `API_KEY_ORG_ID` query override — confirmed in `src/auth/api-key-middleware.ts`.
- [ ] **PREREQ-004** `@aws-sdk/lib-dynamodb` is already installed (checked: `package.json` → `"@aws-sdk/lib-dynamodb": "^3.1027.0"`), enabling `DynamoDBDocumentClient` over raw `DynamoDBClient` per `.cursor/rules/prefer-existing-solutions/RULE.md`.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add `invalid_period_format` error code to shared ErrorCodes
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Append a new constant under a `// LIU Usage Meter (v1.1)` section header, literal value `invalid_period_format` (spec § Error Codes — New → maps to HTTP 400 for `from_period` or `to_period` not matching `YYYY-MM`). Do not reuse `INVALID_FORMAT` — spec defines a distinct code.
- **Depends on**: none
- **Verification**: `npm run typecheck`; grep confirms `ErrorCodes.INVALID_PERIOD_FORMAT === 'invalid_period_format'` and is imported by TASK-006 handlers.

### TASK-002: Create period utility (`getCurrentPeriod`, `validatePeriod`, `comparePeriods`)
- **Files**: `src/usage/period.ts` (new)
- **Action**: Create
- **Details**: Pure functions, no repository dependency.
  - `getCurrentPeriod(timestampIso: string): string` — accepts ISO 8601; returns `YYYY-MM` in UTC. Per spec § Integration Point: *"returns `YYYY-MM` from the decision timestamp (not wall clock — ensures consistency if signals are processed with slight delay)"*. Callers MUST pass `decision.decided_at`, not `new Date().toISOString()`.
  - `validatePeriod(period: string): boolean` — regex `^\d{4}-(0[1-9]|1[0-2])$` (implementation detail — spec silent on exact regex; month range 01–12 is implied by `YYYY-MM` format with concrete example `2026-04`).
  - `comparePeriods(a: string, b: string): number` — lexicographic compare (valid for `YYYY-MM`).
- **Depends on**: none
- **Verification**: Unit test in TASK-014: `getCurrentPeriod('2026-04-04T18:30:00Z') === '2026-04'`; `validatePeriod('2026-13')` false; `validatePeriod('26-04')` false.

### TASK-003: Define `UsageRepository` interface + shared Usage types
- **Files**: `src/usage/repository.ts` (new), `src/shared/types.ts` (modify — add `UsageEntry`, `PeriodUsage`, `AdminUsageResponse`, `TenantUsageResponse`)
- **Action**: Create / Modify
- **Details**: Interface follows the `DecisionRepository` pattern (`src/decision/repository.ts`). All methods sync-or-async depending on adapter; declare async `Promise<T>` in the interface so both SQLite (wrapped) and DynamoDB adapters satisfy it uniformly. Shape:
  ```typescript
  export interface UsageRepository {
    incrementLiu(orgId: string, period: string, updatedAt: string): Promise<void>;
    getUsageForOrg(orgId: string, fromPeriod: string, toPeriod: string): Promise<UsageEntry[]>;
    listUsageAllOrgs(fromPeriod: string, toPeriod: string): Promise<UsageEntry[]>;
    close(): Promise<void> | void;
  }
  export interface UsageEntry { org_id: string; period: string; liu_count: number; updated_at: string; }
  ```
  Response types (in `src/shared/types.ts`) must match spec § Response (200) exactly: admin envelope has `periods[].period`, `periods[].orgs[]`, `periods[].total_liu_count`, and top-level `grand_total_liu_count`; tenant envelope has `org_id`, `periods[]`, `total_liu_count`.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; types exported from `src/shared/types.ts` are importable by TASK-006.

### TASK-004: Implement `SqliteUsageRepository` + module-level DI API
- **Files**: `src/usage/store.ts` (new)
- **Action**: Create
- **Details**: Mirrors `src/decision/store.ts` module pattern: class + `initUsageStore(dbPath)` + `setUsageRepository(repo)` + `closeUsageStore()` + module-level `incrementLiu()`, `getUsageForOrg()`, `listUsageAllOrgs()` wrappers. Quote spec literal verbatim:
  > *Single `usage_counter` table with `(org_id, period)` unique constraint, `liu_count INTEGER DEFAULT 0`. Increment via `INSERT ... ON CONFLICT DO UPDATE SET liu_count = liu_count + 1`.*

  Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS usage_counter (
    org_id TEXT NOT NULL,
    period TEXT NOT NULL,
    liu_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (org_id, period)
  );
  ```
  Increment SQL: `INSERT INTO usage_counter (org_id, period, liu_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(org_id, period) DO UPDATE SET liu_count = liu_count + 1, updated_at = excluded.updated_at`. Query range uses `WHERE period >= ? AND period <= ?`. List-all uses the same WHERE with no `org_id` filter and orders by `period ASC, org_id ASC`. Wrap sync SQLite in `Promise.resolve(...)` to match async interface.
- **Depends on**: TASK-003
- **Verification**: Unit test in TASK-014 validates increment idempotency-per-ADD (3 calls → `liu_count: 3`); range query returns entries sorted by period then org_id.

### TASK-005: Implement `DynamoDbUsageRepository` using `DynamoDBDocumentClient`
- **Files**: `src/usage/dynamodb-repository.ts` (new)
- **Action**: Create
- **Details**: Prefer `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` (see PREREQ-004 + `.cursor/rules/prefer-existing-solutions/RULE.md` → *"Use `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` instead of raw `DynamoDBClient` + `marshall`/`unmarshall`"*). Methods:
  - `incrementLiu(orgId, period, updatedAt)` — `UpdateCommand` with `UpdateExpression: 'ADD liu_count :one SET updated_at = :ts'`, keyed on `{ org_id: orgId, period: period }`. Quote spec literal verbatim:
    > *Increment counter | `UpdateItem` with `ADD liu_count :1` | `PK = org_id, SK = YYYY-MM`*
  - `getUsageForOrg(orgId, from, to)` — `QueryCommand` with `KeyConditionExpression: 'org_id = :org AND #p BETWEEN :from AND :to'`, `ExpressionAttributeNames: { '#p': 'period' }` (period is not reserved but using `#p` defends against future reservation). Quote spec literal verbatim:
    > *Get usage history | `Query` | `PK = org_id, SK BETWEEN start AND end`*
  - `listUsageAllOrgs(from, to)` — `ScanCommand` with `FilterExpression: '#p BETWEEN :from AND :to'`. Quote spec literal verbatim:
    > *List all orgs (admin) | `Scan` with `period` filter | Filter `SK = YYYY-MM`*
    (spec's "Filter `SK = YYYY-MM`" is interpreted as range filter when `from != to`; single-period case collapses to equality). Accept pilot-scale Scan per §Out of Scope "Scale beyond 3 customers".
  - `close()` — `client.destroy()`.
  - Constructor: `constructor(tableName: string, client?: DynamoDBClient)` — construct `DynamoDBDocumentClient.from(client ?? new DynamoDBClient({}))`. Mirrors `DynamoDbDecisionRepository` constructor shape for DI/testability.
- **Depends on**: TASK-003
- **Verification**: Unit test with mocked DocumentClient `send` spy asserts `UpdateExpression` literal `'ADD liu_count :one SET updated_at = :ts'` and `Key: { org_id, period }`; Query assertion confirms `BETWEEN :from AND :to`.

### TASK-006: Build handler-cores for admin + tenant usage queries
- **Files**: `src/usage/handler-core.ts` (new)
- **Action**: Create
- **Details**: Two framework-agnostic functions returning `HandlerResult<T>` (same pattern as `src/decision/handler-core.ts`). Both share a `parseAndValidatePeriods(query)` helper that:
  1. Defaults `from_period` to `getCurrentPeriod(new Date().toISOString())` when absent (spec § Query Parameters: *"Defaults to current month."*).
  2. Defaults `to_period` to `from_period` when absent (spec: *"Defaults to `from_period`."*).
  3. If either fails `validatePeriod`, returns 400 with body `{ error: { code: 'invalid_period_format', message: '...', field_path: 'from_period' | 'to_period' } }` (code literal matches TASK-001).
  4. If `from_period > to_period`, returns 400 with same `invalid_period_format` code (spec silent on this — implementation detail; noted in Deviations).

  `handleGetAdminUsageCore(query)`:
  - After period parse, call `listUsageAllOrgs(from, to)` or `getUsageForOrg(org_id, from, to)` when `org_id` query param provided.
  - Group results by `period` into `periods[].orgs[]`; compute `periods[].total_liu_count` (sum) and top-level `grand_total_liu_count`. Response keys MUST match spec § Response (200) verbatim: `periods`, `orgs`, `org_id`, `liu_count`, `updated_at`, `total_liu_count`, `grand_total_liu_count`.

  `handleGetTenantUsageCore(query)`:
  - Requires `org_id` in query (populated by tenant `apiKeyPreHandler` via `API_KEY_ORG_ID` override — pattern reused from `handleGetDecisionsCore`).
  - Call `getUsageForOrg(org_id, from, to)`. Response: `{ org_id, periods: [{period, liu_count, updated_at}], total_liu_count }`.

  Both handlers depend only on the module-level wrappers from TASK-004/TASK-005 (swapped via `setUsageRepository`).
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005
- **Verification**: Contract test TASK-015 asserts response shapes; unit test asserts grouping correctness (2 orgs × 2 periods → 2 `periods` entries, each with 2 `orgs`).

### TASK-007: Build Fastify handlers and route registration
- **Files**: `src/usage/handler.ts` (new), `src/usage/routes.ts` (new)
- **Action**: Create
- **Details**: Thin Fastify wrappers matching `src/decision/handler.ts` + `src/decision/routes.ts` pattern.
  - `handler.ts` exports `handleGetAdminUsage(request, reply)` and `handleGetTenantUsage(request, reply)` — each calls the corresponding core with `request.query as Record<string, unknown>`, sets `reply.status(result.statusCode)`, returns `result.body`.
  - `routes.ts` exports two separate registrars so they can be mounted under different auth scopes in server.ts:
    - `registerAdminUsageRoutes(app)` → `app.get('/usage', handleGetAdminUsage)` (prefix `/v1/admin` applied at registration site per existing convention).
    - `registerTenantUsageRoutes(app)` → `app.get('/usage', handleGetTenantUsage)` (prefix `/v1`).
- **Depends on**: TASK-006
- **Verification**: Contract tests inject GET requests and assert status + body.

### TASK-008: Wire usage store init/close and routes into `src/server.ts`
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  1. Import `initUsageStore`, `closeUsageStore` from `./usage/store.js`.
  2. Add `USAGE_DB_PATH` env var with default `./data/usage.db`; ensure data dir via `mkdirSync`.
  3. Call `initUsageStore(usageDbPath)` after `initDecisionStore(...)`, before `loadPolicy()`.
  4. Register `registerTenantUsageRoutes(v1)` inside the existing `/v1` scope (tenant auth).
  5. Register `registerAdminUsageRoutes(admin)` inside the existing `/v1/admin` scope (admin auth). Admin scope MUST remain separate from tenant scope so a valid tenant `x-api-key` returns 401 on `/v1/admin/usage` (spec § Headers: `x-admin-api-key` required; see LIU-004).
  6. Append `closeUsageStore()` to the `onClose` hook (before `closeDecisionStore()` is fine — independent store).
  7. Add `/v1/admin/usage`, `/v1/usage` to the root endpoint list returned by `GET /`.
- **Depends on**: TASK-004, TASK-007
- **Verification**: `npm run dev` + curl `GET /v1/usage` with valid `x-api-key` → 200 (empty periods OK); `GET /v1/admin/usage` without `x-admin-api-key` → 401 `admin_key_required`.

### TASK-009: Integrate counter increment into sync `handleSignalIngestionCore`
- **Files**: `src/ingestion/handler-core.ts`
- **Action**: Modify
- **Details**: Quote spec § Integration Point literal:
  > ```
  > validateSignal → storeSignal → applyState → evaluatePolicy → saveDecision → incrementLiuCounter
  >                                                                                ↑ NEW
  > ```
  > ```typescript
  > if (decision) {
  >   await usageRepository.incrementLiu(orgId, getCurrentPeriod());
  > }
  > ```

  `evaluateState(evalRequest)` returns `EvaluateDecisionOutcome`. When `decisionOutcome.ok && decisionOutcome.matched` (and `decisionOutcome.result` is the `Decision`), call the module-level `incrementLiu(decision.org_id, getCurrentPeriod(decision.decided_at), new Date().toISOString())` from `src/usage/store.js`. Wrap in `try { await ... } catch (err) { log.warn?.(...) }` — spec § Integration Point: *"If the counter increment fails (DynamoDB throttle, transient error), log a warning but do **not** fail the signal ingestion."* (AC-5 / LIU-006).

  `getCurrentPeriod` argument MUST be `decision.decided_at`, not wall clock (spec: *"returns `YYYY-MM` from the decision timestamp (not wall clock — ensures consistency if signals are processed with slight delay)"*).
- **Depends on**: TASK-002, TASK-004
- **Verification**: Integration test LIU-001 (TASK-016): 3 signals → 3 decisions → `liu_count: 3`. Unit test LIU-006 (TASK-017): simulated throw → response still 200 with decision.

### TASK-010: Integrate counter increment into async `handleSignalIngestionAsync` + extend `DynamoIngestionPorts`
- **Files**: `src/ingestion/handler-core-async.ts`
- **Action**: Modify
- **Details**:
  1. Extend `DynamoIngestionPorts` interface: add `usage: DynamoDbUsageRepository`.
  2. `evaluateStateAsync` currently receives `{ getState, saveDecision }`. Capture the `Decision` returned on success (`decisionOutcome.result`) and after it resolves, call `ports.usage.incrementLiu(decision.org_id, getCurrentPeriod(decision.decided_at), new Date().toISOString())` inside the same `try/catch` that already wraps `evaluateStateAsync` — so an increment throw is logged via the existing `log.warn?.` pattern and does not bubble.
  3. Imports: `getCurrentPeriod` from `../usage/period.js`; `type { DynamoDbUsageRepository }` from `../usage/dynamodb-repository.js`.
- **Depends on**: TASK-002, TASK-005
- **Verification**: Typecheck; Lambda ingest wiring (TASK-012) compiles; LIU-001 passes against async path when integration harness runs in Lambda mode.

### TASK-011: CDK — add `UsageTable`, IAM grants, API Gateway routes, `USAGE_TABLE` env
- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**:
  1. Declare `readonly usageTable: dynamodb.Table;`.
  2. Quote spec § CDK Addition verbatim (adapted to follow existing table naming convention `control-layer-usage-${stage}` + `billingMode: PAY_PER_REQUEST` + `removalPolicy: RETAIN` + `pointInTimeRecovery: true` for consistency with sibling tables — spec silent on those; see Deviations):
     ```typescript
     this.usageTable = new dynamodb.Table(this, 'UsageTable', {
       tableName: `control-layer-usage-${stage}`,
       partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
       sortKey: { name: 'period', type: dynamodb.AttributeType.STRING },
       billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
       pointInTimeRecovery: true,
       removalPolicy: cdk.RemovalPolicy.RETAIN,
     });
     ```
  3. IAM grants (verbatim from spec § CDK Addition): `usageTable.grantReadWriteData(this.ingestFunction);` `usageTable.grantReadData(this.queryFunction);` `usageTable.grantReadData(this.adminFunction);`.
  4. Add `USAGE_TABLE: this.usageTable.tableName` to `commonEnv`.
  5. API Gateway: add `GET /v1/usage` → `QueryFunction` (tenant, `apiKeyRequired: true` via default), and `GET /v1/admin/usage` → `AdminFunction` (admin-key checked in Lambda, `apiKeyRequired: true` via default). Use `v1.addResource('usage')` and the existing `admin` resource plus `admin.addResource('usage')`.
  6. `CfnOutput` for `UsageTableName` following existing pattern.
- **Depends on**: (parallel with TASK-010)
- **Verification**: `npm run cdk:synth` succeeds; CloudFormation diff shows new `UsageTable` + API methods; grants visible on respective Lambda roles.

### TASK-012: Lambda wiring — inject `DynamoDbUsageRepository` into ingest / query / admin Lambdas
- **Files**: `src/lambda/ingest.ts`, `src/lambda/query.ts`, `src/lambda/admin.ts`
- **Action**: Modify
- **Details**:
  - `ingest.ts`: Add `USAGE_TABLE` to `REQUIRED_ENV_VARS`. Instantiate `new DynamoDbUsageRepository(process.env.USAGE_TABLE!)` in `init()` and pass as `ports.usage` to `handleSignalIngestionAsync`.
  - `query.ts`: On init, call `setUsageRepository(new DynamoDbUsageRepository(process.env.USAGE_TABLE!))` from `src/usage/store.js` so `handleGetTenantUsage` uses the DynamoDB adapter. Register `registerTenantUsageRoutes` on the Fastify instance this Lambda owns.
  - `admin.ts`: Same DI pattern; register `registerAdminUsageRoutes` under `/v1/admin` scope in the admin Lambda's Fastify instance.
- **Depends on**: TASK-010, TASK-011
- **Verification**: `npm run build` + deployed invoke: `curl -H "x-api-key: $KEY" .../v1/usage` returns 200; `curl -H "x-admin-api-key: $ADMIN" .../v1/admin/usage` returns 200.

### TASK-013: OpenAPI — document `GET /v1/admin/usage` and `GET /v1/usage`
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add both paths with query parameters `from_period`, `to_period`, `org_id` (admin only). Request/response schemas match the JSON response literals from Spec Literals block (admin: `periods`, `orgs`, `org_id`, `liu_count`, `updated_at`, `total_liu_count`, `grand_total_liu_count`; tenant: `org_id`, `periods`, `total_liu_count`). Document 400 error code `invalid_period_format`, 401 admin `admin_key_required` / tenant `api_key_required`. Security scheme references existing `x-api-key` / `x-admin-api-key` (already in spec for other admin paths).
- **Depends on**: TASK-007
- **Verification**: `npm run validate:api` passes; swagger-ui at `/docs` renders both endpoints with correct schemas.

### TASK-014: Unit tests — period utility + `SqliteUsageRepository`
- **Files**: `tests/unit/usage-period.test.ts` (new), `tests/unit/usage-store.test.ts` (new)
- **Action**: Create
- **Details**:
  - `usage-period.test.ts`: Covers **LIU-008** (`getCurrentPeriod(timestamp)` returns correct `YYYY-MM`). Cases: `2026-04-04T18:30:00Z` → `'2026-04'`; boundary `2026-12-31T23:59:59Z` → `'2026-12'`; `validatePeriod('2026-04')` true, `'2026-13'` / `'26-04'` / `'2026-4'` false.
  - `usage-store.test.ts`: In-memory SQLite (`:memory:`). Increment 3 times → `liu_count: 3`; two orgs same period → independent counters; range query `from=2026-03 to=2026-04` returns both months.
- **Depends on**: TASK-002, TASK-004
- **Verification**: `npm run test:unit` passes; LIU-008 test name references the test ID.

### TASK-015: Contract tests — admin & tenant endpoint auth + period range
- **Files**: `tests/contracts/liu-usage-meter.test.ts` (new)
- **Action**: Create
- **Details**: Vitest + Fastify `inject`, mock repository boundary via `setUsageRepository(fakeRepo)` (SqliteUsageRepository with `:memory:` is simplest and deterministic). Cover:
  - **LIU-003**: `GET /v1/usage` with tenant key scoped to `springs` returns only `springs` data (seed two orgs; assert response `org_id === 'springs'` and no `demo` rows).
  - **LIU-004**: `GET /v1/admin/usage` without `x-admin-api-key` → 401 body `{ code: 'admin_key_required', ... }`.
  - **LIU-005**: `GET /v1/usage` without `x-api-key` → 401 body `{ code: 'api_key_required', ... }`.
  - **LIU-007**: `GET /v1/admin/usage?from_period=2026-03&to_period=2026-04` returns 200 with `periods` array length ≥ 2 (seed both months).
  - Bonus: `from_period=2026-13` → 400 `invalid_period_format`.
- **Depends on**: TASK-008
- **Verification**: `npm run test:contracts` passes; each LIU-* ID named in describe/it.

### TASK-016: Integration tests — signal → decision → counter increment
- **Files**: `tests/integration/liu-counter.test.ts` (new)
- **Action**: Create
- **Details**: Boot full sync pipeline (SQLite stores). Post 3 valid signals that match an intervene/reinforce rule for `springs` in April 2026 (freeze time via dependency-injected clock or `Date` mock as other integration tests do).
  - **LIU-001**: After 3 accepted+decided signals, `GET /v1/admin/usage?org_id=springs&from_period=2026-04` → `periods[0].orgs[0].liu_count === 3`.
  - **LIU-002**: Post 1 rejected signal (validation failure) → counter unchanged from prior value.
  - Negative (accepted-but-no-decision): Post a signal against a policy config where no rule matches → counter unchanged (AC: *"signal accepted but no decision produced → `liu_count` is unchanged"*).
- **Depends on**: TASK-009
- **Verification**: `npm run test:integration` passes.

### TASK-017: Unit test — increment failure does not fail ingestion (LIU-006)
- **Files**: `tests/unit/ingestion-liu-failure.test.ts` (new)
- **Action**: Create
- **Details**: Inject a `UsageRepository` double whose `incrementLiu` throws. Run `handleSignalIngestionCore` on a signal that produces a decision. Assert:
  1. Response is `{ statusCode: 200, body: { status: 'accepted', ... } }`.
  2. `log.warn` spy invoked with a message referencing the increment failure.
  3. `saveDecision` effect observed (decision row exists in decisions store).
- **Depends on**: TASK-009
- **Verification**: `npm run test:unit` passes; test describe/it references LIU-006.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/usage/period.ts` | TASK-002 | `getCurrentPeriod`, `validatePeriod`, `comparePeriods` |
| `src/usage/repository.ts` | TASK-003 | `UsageRepository` interface |
| `src/usage/store.ts` | TASK-004 | `SqliteUsageRepository` + module-level DI |
| `src/usage/dynamodb-repository.ts` | TASK-005 | `DynamoDbUsageRepository` (DocumentClient) |
| `src/usage/handler-core.ts` | TASK-006 | Framework-agnostic admin + tenant handlers |
| `src/usage/handler.ts` | TASK-007 | Thin Fastify wrappers |
| `src/usage/routes.ts` | TASK-007 | `registerAdminUsageRoutes`, `registerTenantUsageRoutes` |
| `tests/unit/usage-period.test.ts` | TASK-014 | LIU-008 |
| `tests/unit/usage-store.test.ts` | TASK-014 | SQLite increment semantics |
| `tests/contracts/liu-usage-meter.test.ts` | TASK-015 | LIU-003, LIU-004, LIU-005, LIU-007 |
| `tests/integration/liu-counter.test.ts` | TASK-016 | LIU-001, LIU-002 |
| `tests/unit/ingestion-liu-failure.test.ts` | TASK-017 | LIU-006 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | Add `INVALID_PERIOD_FORMAT = 'invalid_period_format'` |
| `src/shared/types.ts` | TASK-003 | Add `UsageEntry`, `PeriodUsage`, `AdminUsageResponse`, `TenantUsageResponse` |
| `src/server.ts` | TASK-008 | Init/close usage store; register admin + tenant routes |
| `src/ingestion/handler-core.ts` | TASK-009 | Increment counter after `evaluateState` matched |
| `src/ingestion/handler-core-async.ts` | TASK-010 | Extend `DynamoIngestionPorts` with `usage`; increment after `evaluateStateAsync` matched |
| `infra/lib/control-layer-stack.ts` | TASK-011 | Add `UsageTable`, IAM grants, API routes, `USAGE_TABLE` env, CfnOutput |
| `src/lambda/ingest.ts` | TASK-012 | Instantiate `DynamoDbUsageRepository`; pass in ports |
| `src/lambda/query.ts` | TASK-012 | `setUsageRepository(...)`; register tenant usage route |
| `src/lambda/admin.ts` | TASK-012 | `setUsageRepository(...)`; register admin usage route |
| `docs/api/openapi.yaml` | TASK-013 | Document both endpoints + schemas + error codes |

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` must map to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| FR-1: Each successful decision increments the LIU counter for the org's current billing period | spec § Requirements → Functional | TASK-009, TASK-010 |
| FR-2: `GET /v1/admin/usage` returns LIU counts per org per period (admin-only, `x-admin-api-key`) | spec § Requirements → Functional | TASK-006, TASK-007, TASK-008 |
| FR-3: `GET /v1/usage` returns the calling org's LIU counts (tenant API key, org-scoped) | spec § Requirements → Functional | TASK-006, TASK-007, TASK-008 |
| FR-4: Counter uses atomic increment (`ADD` in DynamoDB, `ON CONFLICT DO UPDATE` in SQLite) | spec § Requirements → Functional | TASK-004, TASK-005 |
| FR-5: Period format is `YYYY-MM` derived from the decision timestamp | spec § Requirements → Functional | TASK-002, TASK-009, TASK-010 |
| FR-6: Counter increment failure does not fail the signal ingestion pipeline | spec § Requirements → Functional | TASK-009, TASK-010, TASK-017 |
| FR-7: Historical periods are queryable (not just current month) | spec § Requirements → Functional | TASK-004, TASK-005, TASK-006 |
| AC-1: Given 5 signals that each produce a decision for org `springs` in April 2026, when `GET /v1/admin/usage?org_id=springs&from_period=2026-04` is called, then `liu_count` is 5 | spec § Acceptance Criteria | TASK-009, TASK-016 |
| AC-2: Given a signal that is rejected (validation failure), when usage is queried, then `liu_count` is unchanged | spec § Acceptance Criteria | TASK-009, TASK-016 |
| AC-3: Given a signal accepted but no decision produced (no policy match), when usage is queried, then `liu_count` is unchanged | spec § Acceptance Criteria | TASK-009, TASK-016 |
| AC-4: Given `GET /v1/usage` called with org `springs` API key, then only `springs` usage is returned (no cross-org leakage) | spec § Acceptance Criteria | TASK-006, TASK-015 |
| AC-5: Given the counter increment fails (simulated DynamoDB error), then the signal ingestion still returns 200 with the decision | spec § Acceptance Criteria | TASK-009, TASK-017 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| LIU-001 | integration | 3 signals → 3 decisions → `GET /v1/admin/usage` returns `liu_count: 3` | TASK-016 |
| LIU-002 | integration | Rejected signal → count unchanged | TASK-016 |
| LIU-003 | contract | `GET /v1/usage` returns only calling org's data | TASK-015 |
| LIU-004 | contract | `GET /v1/admin/usage` without admin key → 401 `admin_key_required` | TASK-015 |
| LIU-005 | contract | `GET /v1/usage` without API key → 401 `api_key_required` | TASK-015 |
| LIU-006 | unit | `incrementLiu` failure does not fail ingestion | TASK-017 |
| LIU-007 | contract | Period range query returns multiple months | TASK-015 |
| LIU-008 | unit | `getCurrentPeriod(timestamp)` returns correct `YYYY-MM` | TASK-014 |

## Deviations from Spec

> List every place the plan's literal values differ from the spec, or where the spec is silent and the plan adds an implementation decision.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § CDK Addition | `new dynamodb.Table(this, 'UsageTable', { billingMode, partitionKey, sortKey })` — no `tableName`, no `pointInTimeRecovery`, no `removalPolicy` | Adds `tableName: control-layer-usage-${stage}`, `pointInTimeRecovery: true`, `removalPolicy: RETAIN` | Implementation detail — spec silent. Aligns with sibling tables (`SignalsTable`, `StateTable`, `DecisionsTable`, `PoliciesTable`) for ops consistency (pilot retention + PITR). |
| § Data Model (DynamoDB SDK) | Spec shows no SDK specifics | Uses `DynamoDBDocumentClient` (from `@aws-sdk/lib-dynamodb`) instead of raw `DynamoDBClient` + `marshall/unmarshall` | Implementation detail — spec silent. Mandated by `.cursor/rules/prefer-existing-solutions/RULE.md` → *"Use `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` instead of raw `DynamoDBClient` + `marshall`/`unmarshall`"*. Minor inconsistency with sibling repos (`DynamoDbDecisionRepository` uses raw client); acceptable since usage is a new module and the rule is project-wide policy. |
| § Error Codes — New | `invalid_period_format` → 400 for `from_period` or `to_period` not matching `YYYY-MM` | Also returns `invalid_period_format` when `from_period > to_period` (range inversion) | Implementation detail — spec silent on inversion. Chosen over adding a new code to keep surface minimal; update spec in same PR if reviewer prefers a distinct code. |
| § Integration Point code block | `await usageRepository.incrementLiu(orgId, getCurrentPeriod());` — `getCurrentPeriod()` with no arg | Calls `getCurrentPeriod(decision.decided_at, ...)` passing the decision timestamp explicitly | Reverted — plan now matches spec. Spec prose explicitly requires decision timestamp (*"returns `YYYY-MM` from the decision timestamp (not wall clock …)"*); pseudocode arg-less form is shorthand. Plan uses the prose-mandated form. |
| § Data Model — Counter row `updated_at` | Spec lists `updated_at` as ISO 8601 attribute | Plan passes `new Date().toISOString()` at increment call site (wall-clock ts-of-increment, not `decision.decided_at`) | Implementation detail — spec silent on whether `updated_at` tracks the decision time or increment time. "Last increment timestamp" language in the data-model table implies increment wall-clock, which matches. |
| § Access patterns — List all orgs | `Scan` with `period` filter — `Filter SK = YYYY-MM` (single-period equality implied) | Plan uses `FilterExpression: '#p BETWEEN :from AND :to'` to support the admin range query (`from_period` / `to_period`) | Implementation detail — spec silent on how the admin range query maps to the List-all pattern. BETWEEN degenerates to equality when `from == to`, preserving the literal for the default case. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cross-org data leakage via `/v1/usage` if tenant middleware does not override `org_id` | **High** | Tenant handler reads `org_id` only from `request.query.org_id` after `apiKeyPreHandler` populated it (same pattern as `handleGetDecisionsCore`). TASK-015 LIU-003 asserts no cross-org rows. If `API_KEY_ORG_ID` env is unset, handler treats request as unauthenticated and returns 400 `org_scope_required`. |
| Counter drift under DynamoDB throttling | Medium | Per spec: counter is eventually consistent; failures logged as warnings; reconciliation from `DecisionsTable` is the manual recovery path (spec § Constraints + § Out of Scope). |
| Scan cost for admin range query as org count grows | Low at pilot, Medium at scale | Accept per spec § Out of Scope ("Scale beyond 3 customers"). Document in ops runbook; add GSI or projection table in a later iteration if admin dashboard polling becomes expensive. |
| `DocumentClient` inconsistency with sibling repos | Low | Documented in Deviations. New module justifies choosing the higher-level abstraction per `.cursor/rules/prefer-existing-solutions`. Existing repos can migrate incrementally. |
| `getCurrentPeriod` using wall clock on boundary (e.g. Apr 30 23:59 UTC decision recorded Apr 30 but increment runs May 1) | Low | Plan pins `getCurrentPeriod(decision.decided_at)` — decision timestamp is the source of truth for the period attribution (matches spec prose). Covered by LIU-008. |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] OpenAPI validates (`npm run validate:api`)
- [ ] CDK synth passes (`npm run cdk:synth`)
- [ ] Matches spec requirements in `docs/specs/liu-usage-meter.md`

## Implementation Order

```
TASK-001 ─┐
TASK-002 ─┼→ TASK-003 ─┬→ TASK-004 ─┐
          │             └→ TASK-005 ─┤
          │                          ├→ TASK-006 → TASK-007 → TASK-008
          │                          │
          └──────── TASK-009 (sync) ◄┘         ↘ TASK-015 (contract)
                    TASK-010 (async) ───────────→ TASK-012 (Lambdas)
                    TASK-011 (CDK, parallel after TASK-010)
                    TASK-013 (OpenAPI, after TASK-007)

Tests: TASK-014 (after 002, 004) · TASK-015 (after 008) · TASK-016 (after 009) · TASK-017 (after 009)
```

## Next Steps

After generating the plan:
- Review task ordering; TASK-011 (CDK) + TASK-013 (OpenAPI) can run in parallel with TASK-009/010 once TASK-007 lands.
- Confirm `API_KEY_ORG_ID` pilot convention is acceptable for tenant `/v1/usage` (risks table). If not, gate TASK-008 on adding multi-tenant key→org mapping in `src/auth/api-key-middleware.ts`.
- Run `/implement-spec .cursor/plans/liu-usage-meter.plan.md` when ready to execute.
