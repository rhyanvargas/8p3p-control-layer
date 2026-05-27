---
name: Learner Trajectory API
overview: Read-only GET /v1/state/trajectory endpoint returning ordered state snapshots across a version range with per-field direction read verbatim from stored {field}_direction companions; reuses existing StateRepository and adds getStateVersionRange across SQLite, DynamoDB, Fastify, and Lambda surfaces.
todos:
  - id: TASK-001
    content: Extend StateRepository interface with getStateVersionRange
    status: completed
  - id: TASK-002
    content: Implement getStateVersionRange in SqliteStateRepository
    status: completed
  - id: TASK-003
    content: Implement getStateVersionRange in DynamoDbStateRepository
    status: completed
  - id: TASK-004
    content: Add trajectory page_token encode and decode helpers
    status: completed
  - id: TASK-005
    content: Create trajectory handler-core with validation, summary, and pagination
    status: completed
  - id: TASK-006
    content: Wire Fastify route GET /v1/state/trajectory
    status: completed
  - id: TASK-007
    content: Wire Lambda InspectFunction routing for /state/trajectory
    status: completed
  - id: TASK-008
    content: Add /v1/state/trajectory resource to CDK stack
    status: completed
  - id: TASK-009
    content: Document /v1/state/trajectory in OpenAPI
    status: completed
  - id: TASK-010
    content: Add contract tests TRAJ-001 through TRAJ-008
    status: completed
  - id: TASK-011
    content: Add unit tests for trajectory-handler-core
    status: completed
  - id: TASK-012
    content: Add unit tests for SqliteStateRepository.getStateVersionRange
    status: completed
  - id: TASK-013
    content: Update spec to mark state-delta-detection Complete and align error envelope
    status: completed
isProject: false
---

# Learner Trajectory API

**Spec**: `docs/specs/learner-trajectory-api.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Endpoint — Query Parameters

```
| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID |
| `learner_reference` | Yes | Learner identifier |
| `fields` | Yes | Comma-separated list of flat canonical field names to include (e.g., `stabilityScore,masteryScore`). Max 10 fields per request. |
| `from_version` | No | Starting state version (inclusive). Defaults to 1. |
| `to_version` | No | Ending state version (inclusive). Defaults to current (latest). |
| `page_token` | No | Opaque cursor for pagination |
| `page_size` | No | Results per page (1–100, default 50) |
```

### From spec § Endpoint — Response (200)

```json
{
  "org_id": "springs",
  "learner_reference": "learner_001",
  "fields": ["stabilityScore", "masteryScore"],
  "versions": [
    {
      "state_version": 1,
      "updated_at": "2026-03-01T10:00:00Z",
      "values": {
        "stabilityScore": 0.72,
        "masteryScore": 0.65
      },
      "directions": {
        "stabilityScore": null,
        "masteryScore": null
      }
    }
  ],
  "summary": {
    "stabilityScore": {
      "first_value": 0.72,
      "latest_value": 0.28,
      "overall_direction": "declining",
      "version_count": 3
    }
  },
  "next_page_token": null
}
```

### From spec § Endpoint — Error responses

```json
{ "error": { "code": "missing_required_field", "message": "'learner_reference' is required", "field_path": "learner_reference" } }
```

```json
{ "error": { "code": "invalid_format", "message": "Maximum 10 fields per trajectory request. Got 14." } }
```

```json
{ "error": { "code": "state_not_found", "message": "No state found for learner 'learner_001' in org 'springs'" } }
```

> NOTE: This error shape is wrapped under `error`. Existing `/v1/state` endpoints return a flat shape. See `Deviations from Spec` row #2 for resolution — the plan uses the flat shape.

### From spec § Response Shape Details — versions array

```
| Field | Type | Description |
|---|---|---|
| `state_version` | number | Version number |
| `updated_at` | string (ISO 8601) | When this state version was written |
| `values` | object | For each requested field: the field's value at this version, or `null` if the field was not present in state at this version |
| `directions` | object | For each requested field: the `{field}_direction` companion value stored in this version (`"improving"`, `"declining"`, `"stable"`, or `null` if not present — e.g. first version) |
```

### From spec § Response Shape Details — summary object

```
| Field | Description |
|---|---|
| `first_value` | Value at the earliest version in range where the field was non-null |
| `latest_value` | Value at the latest version in range where the field was non-null |
| `overall_direction` | `"improving"` if `latest_value > first_value`; `"declining"` if `latest_value < first_value`; `"stable"` if equal. `null` if field was only present in one version. |
| `version_count` | Number of versions in range where the field was non-null |
```

### From spec § Implementation Notes — `StateRepository` extension

```typescript
getStateVersionRange(
  orgId: string,
  learnerRef: string,
  fromVersion: number,
  toVersion: number,
  limit: number,
  cursor?: number   // state_version cursor for keyset pagination
): { states: LearnerState[]; nextCursor: number | null }
```

```
SQLite implementation: SELECT ... FROM learner_state WHERE org_id = ? AND learner_reference = ? AND state_version >= ? AND state_version <= ? AND state_version > ? ORDER BY state_version ASC LIMIT ?
```

```
DynamoDB implementation: Query(PK=org_id#learner_ref, SK BETWEEN fromVersion AND toVersion) using the composite SK pattern from the DynamoDB state table.
```

### From spec § Constraints

```
- Flat fields only in v1.1 — field names in `fields` parameter must be top-level keys. Dot-path fields (e.g., `skills.fractions.stabilityScore`) return 400 `invalid_format` with message "Dot-path fields are not supported in v1.1. Use top-level canonical field names."
- Direction data comes from stored state — the endpoint reads `{field}_direction` companion values from each stored state version. It does not recompute direction at query time.
- page_size max 100.
```

### From spec § Error Codes (reuse)

```
missing_required_field    — Validation — org_id or learner_reference absent
state_not_found           — State Engine — no state for given org + learner
api_key_required / api_key_invalid — Auth middleware
invalid_format            — Validation — dot-path field or too many fields
```

> Implementation also uses `page_size_out_of_range` and `invalid_page_token` (existing codes in `src/shared/error-codes.ts`) for pagination validation. The spec is silent on these; treated as implementation detail.

---

## Prerequisites

- [x] PREREQ-001 `state-delta-detection.md` implemented — `{field}_direction` persisted at apply time (`src/state/engine.ts:129–171, 270`, README marks "Implemented")
- [x] PREREQ-002 DynamoDB `StateTable` SK is numeric `state_version` — supports `BETWEEN` queries (`src/state/dynamodb-repository.ts:6–9`, `infra/lib/control-layer-stack.ts:191–195`)
- [x] PREREQ-003 API key middleware enforces `org_id` isolation on `/v1/*` (`src/auth/api-key-middleware.ts:33–68`)

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Extend StateRepository interface with getStateVersionRange

- **Files**: `src/state/repository.ts`
- **Action**: Modify
- **Details**: Add new method to the `StateRepository` interface using the verbatim signature from Spec Literals § Implementation Notes:
  ```typescript
  getStateVersionRange(
    orgId: string,
    learnerRef: string,
    fromVersion: number,
    toVersion: number,
    limit: number,
    cursor?: number
  ): { states: LearnerState[]; nextCursor: number | null }
  ```
  Document semantics in JSDoc: returns LearnerState records in `state_version` ASC order; `nextCursor` is the last returned `state_version` when more results exist beyond `limit` and within `toVersion`, otherwise `null`. SQLite is synchronous; the DynamoDB implementation provides an async counterpart on `DynamoDbStateRepository` (parallel to existing `getState` / `getStateByVersion` async signatures in `src/state/dynamodb-repository.ts:53–77`).
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; interface compiles. Any in-memory test doubles flagged by TypeScript missing-method errors.

### TASK-002: Implement getStateVersionRange in SqliteStateRepository

- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Details**: Add a method on `SqliteStateRepository` and a module-level export (matching the delegation pattern used for `getState`, `getStateByVersion`, `listLearners` in `src/state/store.ts:325–451`). Use the exact SQL from Spec Literals § Implementation Notes:
  ```sql
  SELECT id, org_id, learner_reference, state_id, state_version, updated_at,
         state, last_signal_id, last_signal_timestamp
  FROM learner_state
  WHERE org_id = ?
    AND learner_reference = ?
    AND state_version >= ?
    AND state_version <= ?
    AND state_version > ?
  ORDER BY state_version ASC
  LIMIT ?
  ```
  Use `cursor ?? 0` for the `state_version > ?` keyset predicate. Map rows via existing `rowToLearnerState` helper. Compute `nextCursor`: if returned rows count `=== limit` AND last row's `state_version < toVersion`, set `nextCursor = lastRow.state_version`; else `null`. Cap `limit` defensively at `Math.min(Math.max(1, limit), 100)`.
- **Depends on**: TASK-001
- **Verification**: TASK-012 unit tests pass; manual SQL EXPLAIN shows use of `idx_learner_state_lookup`.

### TASK-003: Implement getStateVersionRange in DynamoDbStateRepository

- **Files**: `src/state/dynamodb-repository.ts`
- **Action**: Modify
- **Details**: Add async method matching Spec Literals § Implementation Notes (`Query(PK=org_id#learner_ref, SK BETWEEN fromVersion AND toVersion)`). Use `QueryCommand` with:
  - `KeyConditionExpression: 'org_learner = :pk AND state_version BETWEEN :from AND :to'`
  - `ExpressionAttributeValues` containing `:pk = '${orgId}#${learnerRef}'`, `:from = fromVersion`, `:to = toVersion`
  - `ScanIndexForward: true` (ASC)
  - `ExclusiveStartKey` built from `cursor` when present: `{ org_learner: '${orgId}#${learnerRef}', state_version: cursor }`
  - `Limit: Math.min(Math.max(1, limit), 100)`

  Unmarshall via existing `unmarshallState` helper (`src/state/dynamodb-repository.ts:229–242`). Compute `nextCursor`: if `result.LastEvaluatedKey` present and last item's `state_version < toVersion`, return `(lastItem.state_version as number)`; else `null`. Do NOT use base64 JSON `LastEvaluatedKey` encoding (that pattern is for `listLearners`); the trajectory cursor is purely numeric to match the interface signature.
- **Depends on**: TASK-001
- **Verification**: TypeScript compiles. Integration verification deferred to deployed environment; correctness validated by SQLite contract tests (TASK-010) which exercise the same handler-core path.

### TASK-004: Add trajectory page_token encode and decode helpers

- **Files**: `src/state/trajectory-pagination.ts` (new)
- **Action**: Create
- **Details**: Mirror the pattern in `src/signalLog/store.ts:382–409`:
  ```typescript
  export function encodeTrajectoryPageToken(cursorVersion: number): string {
    return Buffer.from(`v1:${cursorVersion}`).toString('base64url');
  }

  export function decodeTrajectoryPageToken(token: string): number | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      if (!decoded.startsWith('v1:')) return null;
      const n = parseInt(decoded.substring(3), 10);
      if (isNaN(n) || n < 0) return null;
      return n;
    } catch {
      return null;
    }
  }
  ```
  Return `null` (not `0`) on malformed tokens so the handler can emit `invalid_page_token` 400 instead of silently restarting pagination.
- **Depends on**: none
- **Verification**: Unit tests in TASK-011 cover round-trip and malformed cases.

### TASK-005: Create trajectory handler-core with validation, summary, and pagination

- **Files**: `src/state/trajectory-handler-core.ts` (new)
- **Action**: Create
- **Details**: Framework-agnostic core matching `src/state/handler-core.ts` style. Export `handleTrajectoryQueryCore(params: Record<string, unknown>): Promise<HandlerResult<TrajectoryResponse | StateErrorResponse>>`.

  **Validation (manual, no Zod — matches existing `validateStateParams`):**
  - `org_id`: required, non-empty, 1–128 chars → `org_scope_required` or `invalid_length`
  - `learner_reference`: required, non-empty, 1–256 chars → `missing_required_field` or `invalid_length`
  - `fields`: required, comma-split, trimmed, deduplicated. Validate per field name:
    - Reject any containing `.` → 400 `invalid_format` with message `Dot-path fields are not supported in v1.1. Use top-level canonical field names.` (verbatim from Spec Literals § Constraints)
    - Reject empty token or `>` 128 chars per field → 400 `invalid_format`
    - If parsed count `> 10` → 400 `invalid_format` with message `Maximum 10 fields per trajectory request. Got {count}.` (verbatim from Spec Literals § Endpoint — Error responses)
  - `from_version`: optional, positive integer, default 1 → `invalid_type` on failure
  - `to_version`: optional, positive integer → `invalid_type` on failure; if omitted, resolve via `getState(orgId, learnerRef)` and use its `state_version`, falling back to 404 `state_not_found` if no state exists
  - If `from_version > to_version` → 400 `invalid_format` with field_path `from_version`
  - `page_size`: optional, integer 1–100, default 50 → `page_size_out_of_range` on failure (use existing code `src/shared/error-codes.ts:54`)
  - `page_token`: optional; if present, decode via TASK-004 helper. `null` result → 400 `invalid_page_token` (existing code `src/shared/error-codes.ts:51`)

  **Fetch:** Call module-level `getStateVersionRange(orgId, learnerRef, fromVersion, toVersion, pageSize, decodedCursor)` from `src/state/store.ts`.

  **404 logic:** If the first page (no `page_token`) returns zero states AND `getState(orgId, learnerRef)` is also `null`, return 404 with code `state_not_found` and message `No state found for learner '{learnerRef}' in org '{orgId}'` (verbatim from Spec Literals § Endpoint — Error responses, flattened envelope per Deviation #2).

  **Versions assembly:** For each `LearnerState` row:
  - `state_version`, `updated_at` from envelope
  - `values[field]` = `state[field]` if `field in state`, else `null`
  - `directions[field]` = `state['{field}_direction']` if present AND value is one of `'improving' | 'declining' | 'stable'`, else `null`

  **Summary assembly:** For each requested field, iterate the returned versions array (current page only — see Deviation #3):
  - `version_count` = number of versions where `values[field]` is not `null` AND is `typeof === 'number'`
  - `first_value` = the value at the earliest version where the field was non-null and numeric
  - `latest_value` = the value at the latest version where the field was non-null and numeric
  - `overall_direction`:
    - `null` if `version_count < 2`
    - `'improving'` if `latest_value > first_value`
    - `'declining'` if `latest_value < first_value`
    - `'stable'` if `latest_value === first_value`

  **Pagination response:** `next_page_token` = `encodeTrajectoryPageToken(nextCursor)` if non-null, else `null`.

  **Error envelope:** Flat `{ code, message, field_path? }` per Deviation #2.

- **Depends on**: TASK-002, TASK-004
- **Verification**: TASK-011 unit tests pass.

### TASK-006: Wire Fastify route GET /v1/state/trajectory

- **Files**: `src/state/handler.ts`, `src/state/routes.ts`
- **Action**: Modify
- **Details**:
  - In `src/state/handler.ts`, add thin wrapper `handleTrajectoryQuery(request, reply)` mirroring `handleStateQuery` (`src/state/handler.ts:11–18`): call `handleTrajectoryQueryCore(request.query as Record<string, unknown>)`, set `reply.status(result.statusCode)`, return `result.body`.
  - In `src/state/routes.ts`, register `app.get('/state/trajectory', handleTrajectoryQuery)`. Fastify path ordering does not matter for static routes; place the registration after `/state/list` for readability.

  No new module export needed beyond the handler. Authentication is enforced by the parent `/v1/*` `apiKeyPreHandler` (`src/server.ts:326–336`).
- **Depends on**: TASK-005
- **Verification**: TASK-010 contract tests pass against the Fastify app.

### TASK-007: Wire Lambda InspectFunction routing for /state/trajectory

- **Files**: `src/lambda/inspect.ts`
- **Action**: Modify
- **Details**: Add an async `handleGetStateTrajectory(params)` that mirrors `handleGetState` (`src/lambda/inspect.ts:30–56`) but delegates to a small wrapper around the trajectory handler-core. Two options:

  **Option A (preferred):** Reuse `handleTrajectoryQueryCore` directly by passing `params` as-is. The handler-core calls the synchronous module-level `getStateVersionRange` from `src/state/store.ts`, which is wired to the SQLite repository in local dev. In Lambda we need the **async** path: directly query `stateRepo.getStateVersionRange(...)` (the new method from TASK-003) and inline the validation + assembly logic, copying from handler-core. This duplication is consistent with how `handleGetState` duplicates `handleStateQueryCore` (`src/lambda/inspect.ts:30–56`) to avoid coupling Lambda to the sync SQLite store.

  Add the route check **before** `/state` to prevent the existing `path.endsWith('/state')` from shadowing it (`src/lambda/inspect.ts:160–161`):
  ```typescript
  if (path.endsWith('/state/trajectory')) return handleGetStateTrajectory(params);
  if (path.endsWith('/state/list')) return handleGetStateList(params);
  if (path.endsWith('/state')) return handleGetState(params);
  ```
- **Depends on**: TASK-003, TASK-005
- **Verification**: Manual review of route ordering; `npm run typecheck` passes.

### TASK-008: Add /v1/state/trajectory resource to CDK stack

- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: Insert directly after the `stateList` block (`infra/lib/control-layer-stack.ts:392–394`):
  ```typescript
  const stateTrajectory = state.addResource('trajectory');
  stateTrajectory.addMethod('GET', new apigateway.LambdaIntegration(this.inspectFunction));
  ```
  Update the `InspectFunction.description` (`infra/lib/control-layer-stack.ts:228`) to include `/v1/state/trajectory`.
- **Depends on**: TASK-007
- **Verification**: `cd infra && npm run build` succeeds; `cdk synth` shows the new API Gateway resource.

### TASK-009: Document /v1/state/trajectory in OpenAPI

- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add a new path `/v1/state/trajectory` under `paths:`, after `/v1/state/list` (`docs/api/openapi.yaml:455`). Match the style of `/v1/state` (`docs/api/openapi.yaml:388–453`):
  - All query params from Spec Literals § Endpoint — Query Parameters (use `style: form, explode: false` for `fields` to match `?fields=stabilityScore,masteryScore`)
  - 200 response: new `TrajectoryResponse` schema in `components.schemas` matching Spec Literals § Endpoint — Response (200)
  - 400/401/404 responses: reuse existing `StateError` schema (`docs/api/openapi.yaml:1719–1728`) — flat envelope per Deviation #2
  - Description references `docs/specs/learner-trajectory-api.md`
- **Depends on**: TASK-006
- **Verification**: `npm run dev` then open `/docs` and confirm the new endpoint renders in Swagger UI without YAML parse errors.

### TASK-010: Add contract tests TRAJ-001 through TRAJ-008

- **Files**: `tests/contracts/learner-trajectory-api.test.ts` (new)
- **Action**: Create
- **Details**: Pattern from `tests/contracts/inspection-api.test.ts:77–95`. Setup uses `initStateStore(':memory:')`, registers `registerStateRoutes(v1)` under `/v1`. Seed state versions via `saveStateWithAppliedSignals(state, [])` with explicit `state_version` values and pre-built `state` objects that include `{field}_direction` companions where needed.

  For TRAJ-008 (auth required), register `apiKeyPreHandler` and set `process.env.API_KEY` for the test. All other tests can skip auth setup (existing inspection tests do not register the preHandler).

  Tests:
  - **TRAJ-001**: Seed 3 versions for `learner_001` in `springs` with `stabilityScore` and `stabilityScore_direction` populated on v2/v3 (`null` companion on v1). `GET /v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore` → 200; `versions.length === 3`, ASC order, `directions.stabilityScore` matches seeded values.
  - **TRAJ-002**: v1 has no `stabilityScore_direction`. Assert `versions[0].directions.stabilityScore === null`.
  - **TRAJ-003**: Seed 5 versions, query `from_version=2&to_version=3` → `versions.length === 2`, versions `[2, 3]`.
  - **TRAJ-004**: Query non-existent `learner_reference=nonexistent` → 404 with `body.code === 'state_not_found'` (flat envelope per Deviation #2).
  - **TRAJ-005**: `fields=a,b,c,d,e,f,g,h,i,j,k` (11 fields) → 400 `invalid_format` with message containing `Maximum 10 fields per trajectory request. Got 11.`
  - **TRAJ-006**: `fields=skills.fractions.stabilityScore` → 400 `invalid_format` with message `Dot-path fields are not supported in v1.1. Use top-level canonical field names.` (verbatim from Spec Literals § Constraints)
  - **TRAJ-007**: Seed `stabilityScore` values 0.72 → 0.55 → 0.28 across 3 versions. Assert `body.summary.stabilityScore.first_value === 0.72`, `latest_value === 0.28`, `overall_direction === 'declining'`, `version_count === 3`.
  - **TRAJ-008**: With `apiKeyPreHandler` registered and `process.env.API_KEY` set, request without `x-api-key` → 401.

  Use `contractHttp(app, {...})` helper from `tests/helpers/contract-http.ts`.
- **Depends on**: TASK-006
- **Verification**: `npm test -- tests/contracts/learner-trajectory-api.test.ts` — all 8 tests pass.

### TASK-011: Add unit tests for trajectory-handler-core

- **Files**: `tests/unit/trajectory-handler-core.test.ts` (new), `tests/unit/trajectory-pagination.test.ts` (new)
- **Action**: Create
- **Details**:
  - `trajectory-pagination.test.ts`: round-trip `encodeTrajectoryPageToken` / `decodeTrajectoryPageToken`; assert `null` on malformed input (empty, non-base64, missing `v1:` prefix, non-numeric suffix).
  - `trajectory-handler-core.test.ts`: validation table tests — missing `org_id`, missing `learner_reference`, missing `fields`, empty `fields`, 11 fields, dot-path field, `from_version > to_version`, malformed `page_token`, `page_size = 0`, `page_size = 101`. Plus summary computation isolation: feed a known versions array and assert summary values for `first_value`, `latest_value`, `overall_direction` (improving, declining, stable, single-value `null`).
- **Depends on**: TASK-004, TASK-005
- **Verification**: `npm test -- tests/unit/trajectory-handler-core.test.ts tests/unit/trajectory-pagination.test.ts` passes.

### TASK-012: Add unit tests for SqliteStateRepository.getStateVersionRange

- **Files**: `tests/unit/state-store.test.ts`
- **Action**: Modify
- **Details**: Append a `describe('getStateVersionRange')` block:
  - Seed 5 versions for one learner; query `(1, 5, 50, undefined)` → 5 states ASC, `nextCursor === null`
  - Query `(2, 4, 50, undefined)` → 3 states, versions [2,3,4]
  - Query `(1, 5, 2, undefined)` → 2 states [1,2], `nextCursor === 2`
  - Query `(1, 5, 2, 2)` → 2 states [3,4], `nextCursor === 4`
  - Query `(1, 5, 2, 4)` → 1 state [5], `nextCursor === null`
  - Org isolation: seed a second org with the same `learner_reference`; query for org A returns only org A's versions
  - Empty result: query for non-existent learner → `{ states: [], nextCursor: null }`

  Also fix any in-memory test doubles that fail TypeScript compile after TASK-001 (likely `tests/unit/state-store.test.ts:470–490` per exploration report — the stub repo missing `listLearners`). Add `getStateVersionRange: () => ({ states: [], nextCursor: null })` to those stubs.
- **Depends on**: TASK-002
- **Verification**: `npm test -- tests/unit/state-store.test.ts` passes.

### TASK-013: Update spec to mark state-delta-detection Complete and align error envelope

- **Files**: `docs/specs/learner-trajectory-api.md`
- **Action**: Modify
- **Details**:
  - Change `docs/specs/learner-trajectory-api.md` line 11 from "state-delta-detection.md must be implemented before this spec" to "state-delta-detection.md is implemented (PREREQ-001 satisfied)".
  - Change dependency table row at line 202: status `**Spec'd — MUST be implemented first**` → `**Complete**`.
  - Update the three error response JSON examples (lines 96–118) to use the flat envelope `{ "code": "...", "message": "...", "field_path": "..." }` matching existing `/v1/state` endpoints and OpenAPI `StateError` schema (`docs/api/openapi.yaml:1719–1728`).
  - Add a one-paragraph note under `## Response Shape Details` clarifying that `summary` is computed across the versions returned in the current page (see Deviation #3).
  - Add a note under `## Error Codes — Existing (reuse)` that `page_size_out_of_range` and `invalid_page_token` (from `src/shared/error-codes.ts:51, 54`) are also reused for pagination validation.
- **Depends on**: TASK-010 (do this last so the spec reflects implemented reality)
- **Verification**: `git diff docs/specs/learner-trajectory-api.md` shows the four edits; spec error examples match the contract test assertions.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/state/trajectory-pagination.ts` | TASK-004 | Encode/decode `page_token` as base64url `v1:{state_version}` |
| `src/state/trajectory-handler-core.ts` | TASK-005 | Framework-agnostic validation, fetch, summary, pagination |
| `tests/contracts/learner-trajectory-api.test.ts` | TASK-010 | TRAJ-001..008 contract tests |
| `tests/unit/trajectory-handler-core.test.ts` | TASK-011 | Validation + summary unit tests |
| `tests/unit/trajectory-pagination.test.ts` | TASK-011 | Page token round-trip + malformed cases |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/state/repository.ts` | TASK-001 | Add `getStateVersionRange` to interface |
| `src/state/store.ts` | TASK-002 | `SqliteStateRepository.getStateVersionRange` + module export |
| `src/state/dynamodb-repository.ts` | TASK-003 | Async `getStateVersionRange` on `DynamoDbStateRepository` |
| `src/state/handler.ts` | TASK-006 | `handleTrajectoryQuery` Fastify wrapper |
| `src/state/routes.ts` | TASK-006 | Register `GET /state/trajectory` |
| `src/lambda/inspect.ts` | TASK-007 | `handleGetStateTrajectory` + route ordering |
| `infra/lib/control-layer-stack.ts` | TASK-008 | API Gateway resource `state.addResource('trajectory')` |
| `docs/api/openapi.yaml` | TASK-009 | Path `/v1/state/trajectory` + `TrajectoryResponse` schema |
| `tests/unit/state-store.test.ts` | TASK-012 | Unit tests for new repo method + fix existing stubs |
| `docs/specs/learner-trajectory-api.md` | TASK-013 | Status update + error envelope alignment + summary pagination note |

---

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `GET /v1/state/trajectory` returns ordered state version entries for the requested learner and fields | spec § Requirements — Functional | TASK-005, TASK-006, TASK-010 (TRAJ-001) |
| `from_version` and `to_version` are inclusive bounds; when omitted, the full history is returned (up to pagination limit) | spec § Requirements — Functional | TASK-005, TASK-010 (TRAJ-003) |
| For each version in range, the response includes the field value from `state` at that version (or `null` if absent) and the `{field}_direction` companion value (or `null` if absent) | spec § Requirements — Functional | TASK-005, TASK-010 (TRAJ-001, TRAJ-002) |
| `summary` object computes `first_value`, `latest_value`, and `overall_direction` across the requested range | spec § Requirements — Functional | TASK-005, TASK-010 (TRAJ-007), TASK-011 |
| Maximum 10 fields per request; exceeding returns 400 `invalid_format` | spec § Requirements — Functional | TASK-005, TASK-010 (TRAJ-005) |
| Pagination via `page_token` (keyset on `state_version` ASC); `page_size` default 50, max 100 | spec § Requirements — Functional | TASK-002, TASK-003, TASK-004, TASK-005, TASK-012 |
| `org_id` isolation is enforced — tenant cannot retrieve another org's data | spec § Requirements — Functional | TASK-002 (SQL WHERE clause), TASK-012 (org isolation unit test) |
| Auth: `x-api-key` required (same as all `/v1/*` endpoints) | spec § Requirements — Functional | TASK-006 (inherits `apiKeyPreHandler` from `/v1/*`), TASK-010 (TRAJ-008) |
| Read-only — no mutations | spec § Requirements — Functional | TASK-005 (handler uses only `getState*` reads), TASK-006 (only `app.get` registered) |
| `StateRepository` gains `getStateVersionRange(orgId, learnerRef, fromVersion, toVersion, limit, cursor)` | spec § Requirements — Functional | TASK-001, TASK-002, TASK-003 |
| Given 3 state versions, GET trajectory returns all 3 in ASC order with `directions.stabilityScore` from stored companion | spec § Acceptance Criteria | TASK-010 (TRAJ-001) |
| Given v1 has no `stabilityScore_direction`, then `directions.stabilityScore` is `null` for v1 | spec § Acceptance Criteria | TASK-010 (TRAJ-002) |
| Given learner does not exist, then 404 `state_not_found` is returned | spec § Acceptance Criteria | TASK-005, TASK-010 (TRAJ-004) |
| Given 11 fields, then 400 `invalid_format` is returned | spec § Acceptance Criteria | TASK-010 (TRAJ-005) |
| Given `from_version=2&to_version=3` on learner with 5 versions, then only versions 2 and 3 are returned | spec § Acceptance Criteria | TASK-010 (TRAJ-003), TASK-012 |
| Given summary first=0.72, latest=0.28, then `overall_direction: declining` | spec § Acceptance Criteria | TASK-010 (TRAJ-007), TASK-011 |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TRAJ-001 | contract | Full trajectory for learner with 3 versions; directions populated | TASK-010 |
| TRAJ-002 | contract | Direction `null` for first version (no prior state) | TASK-010 |
| TRAJ-003 | contract | Version range filter `from_version=2&to_version=3` on 5-version learner | TASK-010 |
| TRAJ-004 | contract | Learner not found → 404 `state_not_found` | TASK-010 |
| TRAJ-005 | contract | 11 fields → 400 `invalid_format` | TASK-010 |
| TRAJ-006 | contract | Dot-path field → 400 `invalid_format` with v1.1 message | TASK-010 |
| TRAJ-007 | contract | Summary accuracy (first/latest/overall_direction) | TASK-010 |
| TRAJ-008 | contract | Auth required — no `x-api-key` → 401 | TASK-010 |
| UNIT-RANGE-01 | unit | `getStateVersionRange` returns ASC ordered states in [from, to] | TASK-012 |
| UNIT-RANGE-02 | unit | `getStateVersionRange` keyset pagination via cursor | TASK-012 |
| UNIT-RANGE-03 | unit | `getStateVersionRange` org isolation | TASK-012 |
| UNIT-RANGE-04 | unit | `getStateVersionRange` empty learner → empty result | TASK-012 |
| UNIT-PAGE-01 | unit | `encodeTrajectoryPageToken` / `decodeTrajectoryPageToken` round-trip | TASK-011 |
| UNIT-PAGE-02 | unit | `decodeTrajectoryPageToken` returns `null` on malformed input | TASK-011 |
| UNIT-CORE-01 | unit | Validation rejects missing/invalid params with correct error codes | TASK-011 |
| UNIT-CORE-02 | unit | Summary computation: improving / declining / stable / single-value `null` | TASK-011 |

---

## Deviations from Spec

> Every divergence from spec literals must appear here.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Endpoint — Error responses (lines 96–118) | Error envelope `{ "error": { "code", "message", "field_path" } }` (wrapped) | Flat `{ "code", "message", "field_path" }` matching existing `/v1/state` endpoints and OpenAPI `StateError` schema (`docs/api/openapi.yaml:1719–1728`) | Update spec in same PR (TASK-013) |
| § Dependencies — Required from Other Specs | `state-delta-detection.md` status `**Spec'd — MUST be implemented first**` | Treats as `**Complete**` — already implemented in `src/state/engine.ts:129–171` and called at apply time (line 270); README marks "Implemented" | Update spec in same PR (TASK-013) |
| § Response Shape Details — `summary` object | Silent on summary semantics under pagination | Plan computes `summary` across versions returned in the **current page only** | Implementation detail — spec silent (note added to spec in TASK-013) |
| § Implementation Notes — `StateRepository` extension | TypeScript sketch uses raw `cursor?: number` | Repository interface accepts `cursor?: number` as specified; handler-core encodes/decodes the public `page_token` string via base64url `v1:{state_version}` (matches `src/signalLog/store.ts:382–409`) | Implementation detail — spec silent on wire encoding |
| § Error Codes — Existing (reuse) | Lists 4 reused codes; says "No new codes" | Also reuses `page_size_out_of_range` and `invalid_page_token` (both already exist in `src/shared/error-codes.ts:51, 54`) for pagination validation | Implementation detail — spec silent (note added to spec in TASK-013) |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lambda path routing: `path.endsWith('/state')` shadows `/state/trajectory` if order is wrong | High — endpoint returns wrong handler in production | TASK-007 places `/state/trajectory` check **before** `/state` and `/state/list`; reviewer must verify ordering |
| Summary across paginated results is semantically ambiguous and may surprise consumers | Medium — `learner-summary-api.md` will consume this and could compute incorrect aggregates | Document explicitly in spec (TASK-013) and OpenAPI (TASK-009); for v1.1 most learners fit in default page_size 50 |
| Historical state versions (written before delta detection deployment) return `null` direction | Low — already documented in spec § Notes; TRAJ-002 asserts this is expected | No additional action; behavior is spec-aligned |
| DynamoDB `getStateVersionRange` correctness not exercised by SQLite-based contract tests | Medium — DynamoDB-specific bugs (e.g. KeyConditionExpression typo) only surface in deployed env | TASK-003 mirrors the proven shape of existing `getState`/`getStateByVersion` Query patterns (`src/state/dynamodb-repository.ts:53–77`); manual smoke test post-deploy |
| `from_version > to_version` or `from_version = 0` produces empty result silently in SQLite if not pre-validated | Low — confusing 200 empty response instead of clear 400 | TASK-005 validates explicitly and returns 400 `invalid_format` with `field_path: 'from_version'` |
| `to_version` default requires a separate `getState` round-trip per request | Low — extra read per request when `to_version` is omitted | Acceptable — same cost as `GET /v1/state` today; could be optimized via repository-level `getLatestVersion()` in a future iteration |

---

## Verification Checklist

- [ ] All tasks TASK-001 through TASK-013 completed
- [ ] All contract tests TRAJ-001..008 pass (`npm test -- tests/contracts/learner-trajectory-api.test.ts`)
- [ ] All unit tests pass (`npm test -- tests/unit/trajectory-handler-core.test.ts tests/unit/trajectory-pagination.test.ts tests/unit/state-store.test.ts`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] `cd infra && npm run build` passes; `cdk synth` shows new API Gateway resource
- [ ] Swagger UI renders `/v1/state/trajectory` correctly at local `/docs`
- [ ] Spec deviations in TASK-013 committed alongside implementation (no doc drift)
- [ ] Local manual smoke: seed 3 versions via existing test harness, curl trajectory endpoint, verify response shape matches Spec Literals

---

## Implementation Order

```
TASK-001 (interface)
    ├── TASK-002 (SQLite impl) ──┬── TASK-012 (SQLite unit tests)
    │                            └── TASK-005 (handler-core) ──┬── TASK-006 (Fastify route) ── TASK-010 (contract tests) ── TASK-013 (spec update)
    │                                                          └── TASK-011 (handler-core unit tests)
    └── TASK-003 (DynamoDB impl) ── TASK-007 (Lambda routing) ── TASK-008 (CDK)

TASK-004 (page_token helpers) ──┘ (feeds TASK-005 and TASK-011)
TASK-009 (OpenAPI) follows TASK-006
```
