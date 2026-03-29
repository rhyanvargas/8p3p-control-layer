---
name: Policy Inspection API
overview: Implement read-only `GET /v1/policies` and `GET /v1/policies/:policy_key` for org-scoped policy summaries (including routing from `loadRoutingConfigForOrg`) and full policy detail (via `loadPolicyForContext`), matching existing `/v1/*` auth and inspection patterns. Listing uses `PoliciesTable` Query when configured; otherwise a filesystem enumeration fallback aligned with `policy-storage.md` active-only semantics for local dev and tests. Contract tests cover POL-API-001–POL-API-005.
todos:
  - id: TASK-001
    content: Active policy list source — DynamoDB Query + filesystem fallback
    status: pending
  - id: TASK-002
    content: Fastify handlers — list + detail, errors, response mapping
    status: pending
  - id: TASK-003
    content: Register routes and wire server (`/v1/policies`)
    status: pending
  - id: TASK-004
    content: OpenAPI — paths, params, response schemas
    status: pending
  - id: TASK-005
    content: Contract tests POL-API-001 through POL-API-005
    status: pending
  - id: TASK-006
    content: Lambda InspectFunction path routing (when handler exists)
    status: pending
isProject: false
---

# Policy Inspection API

**Spec**: `docs/specs/policy-inspection-api.md`

## Prerequisites

Before starting implementation:

- **PREREQ-001** Confirm `loadPolicyForContext` and `loadRoutingConfigForOrg` behavior matches this spec once `policy-storage.md` Dynamo resolution is implemented (detail endpoint must use the same resolution chain as the decision engine).
- **PREREQ-002** Add AWS SDK dependency (`@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb`, or equivalent) when implementing the `PoliciesTable` Query path, if not already present for policy storage work.
- **PREREQ-003** Test fixtures — `src/decision/policies/springs/` (`learner.json`, `staff.json`, `routing.json`) and `default.json` for POL-API-001/003/004-style cases; a non-existent org id (e.g. `unknown-org`) with no org directory for POL-API-002.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Active policy list source — DynamoDB Query + filesystem fallback

- **Files**: `src/policies/active-policies-source.ts` (or `src/decision/policies-table-reader.ts`), optionally `package.json` (AWS SDK), `src/shared/types.ts` (shared list/summary types only if needed)
- **Action**: Create
- **Details**: Implement listing of **active** policies for `org_id`: primary path `QueryCommand` on `PoliciesTable` partition key `org_id`, filter `status === "active"` (omit disabled). Map each item to summary fields required by the spec (`policy_id`, `policy_version`, `policy_key`, `description`, `rule_count`, `default_decision_type`) from stored `PolicyDefinition` / `policy_json`. When table name or AWS config is unset (local dev), **fallback**: enumerate org policy JSON files under `src/decision/policies/{orgId}/` (exclude `routing.json`), parse and validate enough to compute metadata; for orgs with no on-disk policies, fall through to the same default/global behavior the spec implies for POL-API-002 (single default-visible policy, no org routing file). Document env vars (e.g. `POLICIES_TABLE_NAME`, region) alongside existing deployment docs.
- **Depends on**: none
- **Verification**: Unit tests or focused integration: known org (`springs`) returns two summaries; unknown org matches POL-API-002 shape; Dynamo path covered with mocked client or local Dynamo if available.

### TASK-002: Fastify handlers — list + detail, errors, response mapping

- **Files**: `src/policies/handler.ts` (or `src/policies/policy-inspection-handler.ts`)
- **Action**: Create
- **Details**: **List**: require `org_id` (reuse same validation/error pattern as `GET /v1/state` — `missing_required_field` when absent). Call TASK-001 list source; attach `routing` from `loadRoutingConfigForOrg(org_id)` (empty/`source_system_map`/`default_policy_key` per existing loader behavior). **Detail**: `GET /v1/policies/:policy_key` — call `loadPolicyForContext(org_id, policy_key)`; map to spec JSON shape (`org_id`, `policy_key`, nested `policy` with `rules` and `conditions`). On `policy_not_found`, respond **404** with body `{ "error": { "code": "policy_not_found", "message": "..." } }` consistent with existing error envelope. Read-only, no side effects.
- **Depends on**: TASK-001
- **Verification**: Handler-level tests or inject tests: 200 list/detail shapes; 404 for missing key; 400 for missing `org_id`.

### TASK-003: Register routes and wire server (`/v1/policies`)

- **Files**: `src/policies/routes.ts`, `src/server.ts`
- **Action**: Create | Modify
- **Details**: Register `GET /policies` and `GET /policies/:policy_key` on the existing `/v1` scoped plugin (after `apiKeyPreHandler`, same as `registerStateRoutes`). Register **list route before parametric route** to avoid shadowing. Update root `GET /` endpoint advertisement array to include the new paths.
- **Depends on**: TASK-002
- **Verification**: `npm run dev` — curl with API key returns 200 for list/detail against fixtures; `npm run typecheck` clean.

### TASK-004: OpenAPI — paths, params, response schemas

- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add `GET /v1/policies` and `GET /v1/policies/{policy_key}` with `org_id` query param, security scheme aligned with other `/v1` routes, response schemas matching spec examples (200 list with `policies` + `routing`, 200 detail, 404 error object). Run `npm run validate:api` (redocly lint).
- **Depends on**: TASK-003
- **Verification**: `npm run validate:api` passes; Swagger UI shows both operations under correct tags.

### TASK-005: Contract tests POL-API-001 through POL-API-005

- **Files**: `tests/contracts/policy-inspection-api.test.ts`
- **Action**: Create
- **Details**: Follow `tests/contracts/inspection-api.test.ts` patterns (Fastify `inject`, `loadPolicy`, env `API_KEY`, org isolation). Implement: **POL-API-001** — `GET /v1/policies?org_id=springs` → 200, learner + staff present, routing matches `routing.json`; **POL-API-002** — `org_id=unknown-org` (or equivalent) → 200, single default policy list behavior, no routing (or routing object consistent with spec); **POL-API-003** — `GET /v1/policies/learner?org_id=springs` → 200, full rules/conditions; **POL-API-004** — `GET /v1/policies/admin?org_id=springs` → 404, `policy_not_found`; **POL-API-005** — list without `x-api-key` when `API_KEY` set → 401. Clear any relevant caches (`clearRoutingConfigCache`, policy context cache) between cases if needed.
- **Depends on**: TASK-003
- **Verification**: `npm run test:contracts` passes; each test name references its POL-API-ID.

### TASK-006: Lambda InspectFunction path routing (when handler exists)

- **Files**: `src/lambda/inspect.ts` (or path in `docs/specs/aws-deployment.md` / future CDK repo), IAM/route tables as applicable
- **Action**: Create | Modify
- **Details**: When the Inspect Lambda handler exists per `docs/specs/aws-deployment.md` (TASK-014 / handler refactor), ensure API Gateway (or Function URL) routes `GET /v1/policies` and `GET /v1/policies/{policy_key}` to InspectFunction and that the handler dispatches to the same core logic as Fastify. If Lambda is not yet in this repository, update the deployment spec checklist or CDK definition in-repo when added so these paths are not omitted.
- **Depends on**: TASK-003
- **Verification**: Deployed smoke test or documented manual check; local parity already covered by TASK-005.

## Files Summary

### To Create


| File                                            | Task     | Purpose                                                          |
| ----------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `src/policies/active-policies-source.ts`        | TASK-001 | Query PoliciesTable + filesystem fallback; active-only filtering |
| `src/policies/handler.ts`                       | TASK-002 | List + detail HTTP logic, error mapping                          |
| `src/policies/routes.ts`                        | TASK-003 | Fastify route registration                                       |
| `tests/contracts/policy-inspection-api.test.ts` | TASK-005 | POL-API-001–005 contract coverage                                |


### To Modify


| File                                 | Task     | Changes                                              |
| ------------------------------------ | -------- | ---------------------------------------------------- |
| `package.json`                       | TASK-001 | Add AWS SDK deps when Dynamo path is implemented     |
| `src/server.ts`                      | TASK-003 | `registerPolicyInspectionRoutes`, root endpoint list |
| `docs/api/openapi.yaml`              | TASK-004 | New paths and schemas                                |
| `src/lambda/inspect.ts` (if present) | TASK-006 | Route `/v1/policies` variants                        |


## Test Plan


| Test ID     | Type     | Description                                                                  | Task     |
| ----------- | -------- | ---------------------------------------------------------------------------- | -------- |
| POL-API-001 | contract | List policies for org with routing (`GET /v1/policies?org_id=springs`)       | TASK-005 |
| POL-API-002 | contract | List for org without routing — default only (`unknown-org`)                  | TASK-005 |
| POL-API-003 | contract | Full policy by key (`GET /v1/policies/learner?org_id=springs`)               | TASK-005 |
| POL-API-004 | contract | Not found (`GET /v1/policies/admin?org_id=springs` → 404 `policy_not_found`) | TASK-005 |
| POL-API-005 | contract | Auth required (no `x-api-key` when `API_KEY` set → 401)                      | TASK-005 |


## Risks


| Risk                                                            | Impact | Mitigation                                                                                                       |
| --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `PoliciesTable` not yet deployed or no SDK in repo              | Medium | Filesystem fallback in TASK-001 keeps local + CI green; gate Dynamo integration on env vars                      |
| List vs `loadPolicyForContext` divergence after Dynamo lands    | High   | PREREQ-001 — single source of truth for “active” policy records; reuse stored JSON shape from `PolicyDefinition` |
| POL-API-002 semantics ambiguous for filesystem-only             | Low    | Lock behavior with contract test and spec Notes (default-only, no org routing file)                              |
| Fastify route ordering (`/policies` vs `/policies/:policy_key`) | Medium | Register static path first (TASK-003)                                                                            |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Matches spec requirements (`docs/specs/policy-inspection-api.md`)

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004
                              ↘ TASK-005
TASK-006 (when Lambda/inspect handler exists in repo)
```

## Next Steps

- Review and adjust task ordering/dependencies (especially Dynamo vs filesystem-first rollout).
- Run `/implement-spec .cursor/plans/policy-inspection-api.plan.md` when ready to execute.

