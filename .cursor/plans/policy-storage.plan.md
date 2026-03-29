---
name: Policy Storage (DynamoDB)
overview: Add DynamoDB-backed PoliciesTable as the primary policy and routing source ahead of bundled JSON in policy-loader.ts, with per-item status (active/disabled), in-memory TTL caching, structured degradation logging, and CDK wiring (POLICIES_TABLE env + IAM) for Ingest, Inspect, and Admin Lambdas. Local dev remains filesystem-only when POLICIES_TABLE is unset.
todos:
  - id: TASK-001
    content: Add AWS DynamoDB client dependencies
    status: completed
  - id: TASK-002
    content: CDK PoliciesTable, POLICIES_TABLE env, and Lambda IAM
    status: completed
  - id: TASK-003
    content: Register policy_dynamo_degraded and policy_skipped_disabled codes/logging
    status: completed
  - id: TASK-004
    content: DynamoDB read path, status-aware resolution, TTL cache, routing item in policy-loader
    status: completed
  - id: TASK-005
    content: Unit contract tests POL-S3-001 through POL-S3-006
    status: completed
isProject: false
---

# Policy Storage (DynamoDB)

**Spec**: `docs/specs/policy-storage.md`

## Prerequisites

Before starting implementation:

- **PREREQ-001** `PolicyDefinition` validation and loader entrypoints exist (`docs/specs/decision-engine.md`, `src/decision/policy-loader.ts`) — spec marks **Complete**
- **PREREQ-002** Align CDK resource naming and Lambda env injection with `docs/specs/aws-deployment.md` (stack path below may be created by that workstream if not present in repo)
- **PREREQ-003** Admin write path (`PutItem` / conditional writes) is specified in `docs/specs/policy-management-api.md` and implemented on AdminFunction — **out of scope for TASK-004** (read path + CDK permissions only here); loader tests use mocked DynamoDB

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add AWS DynamoDB client dependencies

- **Files**: `package.json`, `package-lock.json`
- **Action**: Modify
- **Details**: Add `@aws-sdk/client-dynamodb` and `@aws-sdk/util-dynamodb` (for `unmarshall` of `policy_json` Map `M` into plain objects). Ensure versions match any existing AWS SDK v3 packages if present.
- **Depends on**: none
- **Verification**: `npm install` succeeds; `npm run typecheck` passes on a minimal import site (or after TASK-004 compiles)

### TASK-002: CDK PoliciesTable, POLICIES_TABLE env, and Lambda IAM

- **Files**: `infra/lib/control-layer-stack.ts` (and entrypoint under `infra/bin/` or equivalent per `docs/specs/aws-deployment.md`), optionally `docs/specs/aws-deployment.md` if spec and code must stay aligned
- **Action**: Create | Modify
- **Details**: Define `PoliciesTable` with partition key `org_id` (S) and sort key `policy_key` (S). Grant `dynamodb:GetItem` (and `Query` for future list paths) to IngestFunction and InspectFunction; grant read-write (`GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan` as required by policy-management API) to AdminFunction. Set `POLICIES_TABLE` to the table name (or table ARN-derived name) on all three Lambdas. Repository may not yet contain `infra/` — create layout consistent with aws-deployment spec.
- **Depends on**: none (coordinate with aws-deployment tasks to avoid duplicate stacks)
- **Verification**: `cdk synth` (or project’s CDK command) succeeds; IAM policies reference only the new table; env var present on targeted Lambdas

### TASK-003: Register policy_dynamo_degraded and policy_skipped_disabled codes/logging

- **Files**: `src/shared/error-codes.ts`, `src/decision/policy-loader.ts` (logging calls)
- **Action**: Modify
- **Details**: Add canonical string constants for `policy_dynamo_degraded` and `policy_skipped_disabled` per spec §Error Codes. Emit structured logs on DynamoDB read failure (degraded path) and when `status !== "active"` (skip with `event: "policy_skipped"` / fields `org_id`, `policy_key`, `status` per spec §Resolution Read).
- **Depends on**: none
- **Verification**: Grep confirms codes used from `ErrorCodes` (or shared const); log shape documented in code or matches spec

### TASK-004: DynamoDB read path, status-aware resolution, TTL cache, routing item in policy-loader

- **Files**: `src/decision/policy-loader.ts`
- **Action**: Modify
- **Details**:
  - When `process.env.POLICIES_TABLE` is set, resolve policies via three ordered `GetItem` calls: `(org_id, userType)`, `(org_id, "default")`, `("global", "default")`. Skip item if missing or `status !== "active"` (log `policy_skipped_disabled` / structured warning). On successful active item, use `policy_json` (unmarshalled Map) through existing `validatePolicyStructure`.
  - Fall back to current filesystem resolution when DynamoDB is unset, all candidates skipped, or read errors — on read errors log `policy_dynamo_degraded` and use bundled/cached per acceptance criteria.
  - Implement in-memory cache with configurable TTL (env e.g. `POLICY_CACHE_TTL_MS`, default 5 minutes). Key: `{orgId}:{policyKey}` for resolved **context** outcomes per spec Notes; respect TTL so stale entries refresh (spec POL-S3-003; use testable clock or exported `clear`* for tests).
  - `loadRoutingConfigForOrg`: read routing from DynamoDB first (same table; use a dedicated `policy_key` such as `routing` — document in code comment; item shape must deserialize to `PolicyRoutingConfig`) before `policies/{orgId}/routing.json`.
  - Optional “stale-while-revalidate” behavior per spec Notes: document chosen behavior in implementation so tests match.
- **Depends on**: TASK-001, TASK-003
- **Verification**: Manual or test: with env unset, existing filesystem behavior unchanged; with mock client, resolution order and status skipping behave as spec §Resolution Order

### TASK-005: Unit contract tests POL-S3-001 through POL-S3-006

- **Files**: `tests/unit/policy-loader.test.ts` (primary); add mocks via `vi.mock('@aws-sdk/client-dynamodb')` or injectable client if refactored
- **Action**: Modify
- **Details**: Implement one focused test (or describe block) per contract row below. Mock `GetItemCommand` responses for policies and routing; simulate errors and TTL expiry per POL-S3-002/003/004. Assert decision source (DynamoDB vs bundled), warning logs, and routing resolution.
- **Depends on**: TASK-004
- **Verification**: `npm run test:unit -- tests/unit/policy-loader.test.ts` passes; each POL-S3 ID traceable in test names or comments

---

## Files Summary

### To Create


| File                                            | Task     | Purpose                                |
| ----------------------------------------------- | -------- | -------------------------------------- |
| `infra/lib/control-layer-stack.ts` (if missing) | TASK-002 | PoliciesTable + Lambda grants per spec |
| `infra/bin/*.ts` (if missing)                   | TASK-002 | CDK app entry per aws-deployment       |


### To Modify


| File                                 | Task               | Changes                                                             |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------- |
| `package.json` / `package-lock.json` | TASK-001           | AWS SDK v3 DynamoDB dependencies                                    |
| `src/shared/error-codes.ts`          | TASK-003           | New degradation/skip codes                                          |
| `src/decision/policy-loader.ts`      | TASK-003, TASK-004 | DynamoDB client usage, resolution, cache TTL, routing read, logging |
| `tests/unit/policy-loader.test.ts`   | TASK-005           | POL-S3-001 … POL-S3-006                                             |
| `infra/...` stack                    | TASK-002           | Table + `POLICIES_TABLE` + IAM                                      |


---

## Test Plan


| Test ID    | Type     | Description                                                                                   | Task     |
| ---------- | -------- | --------------------------------------------------------------------------------------------- | -------- |
| POL-S3-001 | contract | DynamoDB active policy wins over bundled for org context                                      | TASK-005 |
| POL-S3-002 | contract | DynamoDB read failure → bundled default; `policy_dynamo_degraded` logged                      | TASK-005 |
| POL-S3-003 | contract | After TTL, policy re-fetched from DynamoDB                                                    | TASK-005 |
| POL-S3-004 | contract | Malformed DynamoDB policy Map → graceful degradation / cached policy; degraded logged         | TASK-005 |
| POL-S3-005 | contract | Routing config from DynamoDB drives userType resolution                                       | TASK-005 |
| POL-S3-006 | contract | `status: disabled` skipped; falls through to next candidate; `policy_skipped_disabled` logged | TASK-005 |


---

## Risks


| Risk                                                | Impact | Mitigation                                                                                           |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| DynamoDB Map shape diverges from `PolicyDefinition` | High   | Reuse `validatePolicyStructure` after `unmarshall`; fail soft with degraded log per POL-S3-004       |
| No `infra/` in repo yet                             | Medium | TASK-002 follows `docs/specs/aws-deployment.md`; avoid duplicating stack definitions across branches |
| Synchronous DynamoDB adds latency                   | Medium | Keep `GetItem` chain minimal; implement TTL cache and optional stale-while-revalidate per spec Notes |
| Cache hides admin updates                           | Low    | Document TTL; tests prove refresh after expiry (POL-S3-003)                                          |


---

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Matches spec requirements (`docs/specs/policy-storage.md` §Requirements and §Acceptance Criteria)

---

## Implementation Order

```
TASK-001 ──┬──> TASK-004 ──> TASK-005
TASK-003 ──┘
TASK-002 (parallel track: infra deploy readiness)
```

After CDK exists, validate TASK-002 in the target account with a synthetic table item or integration smoke test as your pipeline allows.

---

## Next Steps

- Review task ordering and merge TASK-002 with any in-flight `aws-deployment` plan to avoid conflicting stack edits
- Run `/implement-spec .cursor/plans/policy-storage.plan.md` when ready to execute

