---
name: Policy Management API
overview: Implement the admin HTTP API for policy lifecycle (PUT replace, PATCH status, POST validate, DELETE, GET list) against DynamoDB PoliciesTable, with x-admin-api-key auth, optimistic If-Match on PUT, validation via policy-loader, CDK/IAM wiring for AdminFunction, thin CLI scripts, and contract tests POL-ADMIN-001–008.
todos:
  - id: "TASK-001"
    content: "Add admin/policy HTTP error codes to shared ErrorCodes"
    status: "pending"
  - id: "TASK-002"
    content: "Export policy validation for admin API (policy-loader)"
    status: "pending"
  - id: "TASK-003"
    content: "Implement admin API key preHandler (x-admin-api-key)"
    status: "pending"
  - id: "TASK-004"
    content: "Implement PoliciesTable DynamoDB repository (Put/Update/Delete/Scan/Query)"
    status: "pending"
  - id: "TASK-005"
    content: "Implement Fastify admin policy routes and handlers"
    status: "pending"
  - id: "TASK-006"
    content: "Wire admin routes into server (admin auth only for /v1/admin)"
    status: "pending"
  - id: "TASK-007"
    content: "Document admin policy endpoints in OpenAPI"
    status: "pending"
  - id: "TASK-008"
    content: "CDK AdminFunction handler, IAM, API routes, ADMIN_API_KEY env"
    status: "pending"
  - id: "TASK-009"
    content: "Add thin CLI scripts upload-policy and validate-policy"
    status: "pending"
  - id: "TASK-010"
    content: "Contract tests POL-ADMIN-001 through POL-ADMIN-008"
    status: "pending"
isProject: false
---

# Policy Management API

**Spec**: `docs/specs/policy-management-api.md`

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** `PoliciesTable` schema and access patterns are available per `docs/specs/policy-storage.md` (partition `org_id`, sort `policy_key`, attributes including `policy_json` Map, `policy_version`, `status`, `updated_at`, `updated_by`).
- [ ] **PREREQ-002** CDK stack layout exists or is introduced per `docs/specs/aws-deployment.md` (`infra/`, `infra/lib/control-layer-stack.ts`, AdminFunction placeholder) so AdminFunction can receive routes, `ADMIN_API_KEY`, and `table.grantReadWriteData`.
- [ ] **PREREQ-003** For acceptance of resolution behavior (POL-ADMIN-005/006 and spec §Resolution Impact): the DynamoDB-backed policy load path in `src/decision/policy-loader.ts` (or equivalent) skips items where `status !== "active"`. If the loader is still file-only locally, contract tests may use mocks as described in the spec.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add admin/policy HTTP error codes to shared ErrorCodes
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Add codes from spec §Error Codes — New: `admin_key_required` (401), `version_conflict` (409), `invalid_status_value` (400), `invalid_policy_structure` (400). Reuse existing `policy_not_found` where applicable. Align string values with JSON examples in the spec (`snake_case` keys).
- **Depends on**: none
- **Verification**: Typecheck passes; grep confirms new constants exist and are used by admin routes.

### TASK-002: Export policy validation for admin API (policy-loader)
- **Files**: `src/decision/policy-loader.ts` (and optionally a thin `src/admin/policy-validation.ts` if you prefer not to widen policy-loader surface)
- **Action**: Modify
- **Details**: `validatePolicyStructure` is currently non-exported. Export it or export a single entry point (e.g. `validatePolicyDefinition(raw: unknown): PolicyDefinition`) that calls the same logic. Admin handlers must map validation failures to HTTP 400 with `error.code: "invalid_policy_structure"` and the thrown message (spec PUT/POST validate examples). No duplicate validation rules outside this path.
- **Depends on**: TASK-001
- **Verification**: Unit or contract test imports the exported API; invalid body returns `invalid_policy_structure` with stable messaging.

### TASK-003: Implement admin API key preHandler (x-admin-api-key)
- **Files**: `src/auth/admin-api-key-middleware.ts` (new)
- **Action**: Create
- **Details**: Constant-time compare of `x-admin-api-key` to `process.env.ADMIN_API_KEY`. If env unset or empty, choose explicit behavior (reject all admin routes vs dev no-op) and document in code comment aligned with pilot expectations. On failure return 401 with `admin_key_required`. Tenant `x-api-key` must not satisfy admin routes (spec §Auth).
- **Depends on**: TASK-001
- **Verification**: Inject request without header → 401 with `admin_key_required`; with valid admin key → passes to route handler.

### TASK-004: Implement PoliciesTable DynamoDB repository (Put/Update/Delete/Scan/Query)
- **Files**: `src/admin/policies-repository.ts` (interface/types, optional), `src/admin/policies-dynamodb.ts` (or single module); `package.json` (add `@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb` as needed)
- **Action**: Create / Modify
- **Details**: Implement spec access patterns: `PutItem` with optional `ConditionExpression` for `If-Match` (`attribute_not_exists(org_id) OR policy_version = :expected`); `UpdateItem` for PATCH with existence condition; `DeleteItem` with existence condition; `Scan` for list-all; `Query` when `org_id` filter provided. Store `policy_json` as DynamoDB Map (M), not a string. Implement `policy_version` increment: read current version on PUT (GetItem or conditional strategy per policy-storage.md), then write new monotonic integer. Set `updated_at` (ISO 8601), `updated_by` (truncated admin key prefix, never full key). Map `ConditionalCheckFailedException` to 404 (PATCH/DELETE) or 409 (PUT with If-Match) with `version_conflict` body per spec.
- **Depends on**: PREREQ-001
- **Verification**: Repository methods covered by mocks in tests; manual or LocalStack/DynamoDB Local smoke optional.

### TASK-005: Implement Fastify admin policy routes and handlers
- **Files**: `src/admin/policy-management-routes.ts` (new), shared response helpers if consistent with existing routes
- **Action**: Create
- **Details**: Register: `PUT /policies/:org_id/:policy_key`, `PATCH /policies/:org_id/:policy_key`, `POST /policies/validate`, `DELETE /policies/:org_id/:policy_key`, `GET /policies` with optional query `org_id`. Prefix `/v1/admin` applied at registration site (TASK-006). Behaviors match spec: default `status: "active"` on PUT; PATCH body only `active` | `disabled` else `invalid_status_value`; POST validate never calls DynamoDB; response shapes for 200/400/404/409. Parse `If-Match` as integer `policy_version` when present.
- **Depends on**: TASK-002, TASK-003, TASK-004
- **Verification**: Each endpoint returns documented status codes for happy path and primary error paths (manual inject or TASK-010).

### TASK-006: Wire admin routes into server (admin auth only for /v1/admin)
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**: Register `/v1/admin` in a Fastify scope that uses **only** `adminApiKeyPreHandler` — not the tenant `apiKeyPreHandler` from `src/auth/api-key-middleware.ts`, so valid tenant keys get 401 on admin paths (spec). Import and call `registerPolicyManagementRoutes` (or equivalent) from TASK-005. Ensure route registration order/prefix does not run tenant auth first for `/v1/admin/*`.
- **Depends on**: TASK-005
- **Verification**: `npm run dev` + curl: tenant-only key rejected on `/v1/admin/...`; admin key reaches handler (with mocked or local DynamoDB as appropriate).

### TASK-007: Document admin policy endpoints in OpenAPI
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add paths, methods, headers (`x-admin-api-key`, optional `If-Match`), request/response schemas aligned with spec examples; document security scheme for admin key if applicable. Follow existing OpenAPI style in repo.
- **Depends on**: TASK-005
- **Verification**: `npm run validate:api` passes.

### TASK-008: CDK AdminFunction handler, IAM, API routes, ADMIN_API_KEY env
- **Files**: `infra/lib/control-layer-stack.ts`, `infra/...` entry/handler wiring; `src/lambda/admin-handler.ts` (or agreed Lambda entry) (new)
- **Action**: Create / Modify
- **Details**: AdminFunction bundles the same route module as local server (or a minimal Fastify/aws-lambda-fastify app exposing only admin routes). Grant read/write IAM on `PoliciesTable`. API Gateway: `PUT/PATCH/DELETE/GET` on `/v1/admin/policies/...` and `POST /v1/admin/policies/validate` — align with spec paths and aws-deployment.md routing table. Inject `ADMIN_API_KEY` from SSM/secret or env per deployment convention. If `infra/` does not exist yet, complete PREREQ-002 scaffolding first.
- **Depends on**: TASK-006, PREREQ-002
- **Verification**: `cd infra && npx cdk synth` succeeds; deployed or simulated invoke shows admin routes reachable with configured key.

### TASK-009: Add thin CLI scripts upload-policy and validate-policy
- **Files**: `scripts/upload-policy.ts`, `scripts/validate-policy.ts` (new); `package.json` scripts optional
- **Action**: Create
- **Details**: HTTP clients calling `PUT /v1/admin/policies/:org_id/:policy_key` and `POST /v1/admin/policies/validate` with `x-admin-api-key` and JSON body from file/stdin. Env vars for base URL and admin key. No business logic duplication — API remains source of truth (spec §Thin CLI Wrappers).
- **Depends on**: TASK-006
- **Verification**: Run against local server with test policy file; exit codes reflect HTTP success/failure.

### TASK-010: Contract tests POL-ADMIN-001 through POL-ADMIN-008
- **Files**: `tests/contracts/policy-management-api.test.ts` (new)
- **Action**: Create
- **Details**: Vitest + Fastify `inject`, following `tests/contracts/inspection-api.test.ts` style. Mock `@aws-sdk/client-dynamodb` (or repository boundary) per spec test strategy. Implement assertions for each test ID in §Contract Tests. POL-ADMIN-003: assert no PutItem (spy). POL-ADMIN-005/006: mock resolution / policy-loader Dynamo path as spec describes.
- **Depends on**: TASK-006
- **Verification**: `npm run test:contracts` passes; each POL-ADMIN-* has a named describe/it referencing the test ID.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/auth/admin-api-key-middleware.ts` | TASK-003 | Admin-only auth preHandler |
| `src/admin/policies-dynamodb.ts` (and/or `policies-repository.ts`) | TASK-004 | DynamoDB access for PoliciesTable |
| `src/admin/policy-management-routes.ts` | TASK-005 | HTTP handlers for admin policy API |
| `src/lambda/admin-handler.ts` | TASK-008 | Lambda entry for AdminFunction |
| `scripts/upload-policy.ts` | TASK-009 | CLI → PUT admin policy |
| `scripts/validate-policy.ts` | TASK-009 | CLI → POST validate |
| `tests/contracts/policy-management-api.test.ts` | TASK-010 | Contract coverage POL-ADMIN-001–008 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | New error constants |
| `src/decision/policy-loader.ts` | TASK-002 | Export validation API |
| `package.json` | TASK-004 | AWS SDK deps if not present |
| `src/server.ts` | TASK-006 | Register `/v1/admin` with admin auth |
| `docs/api/openapi.yaml` | TASK-007 | Admin paths and schemas |
| `infra/lib/control-layer-stack.ts` | TASK-008 | AdminFunction, IAM, routes, env |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| POL-ADMIN-001 | contract | PUT valid policy → written to DynamoDB; 200, `status: active`, response includes `policy_version` | TASK-010 |
| POL-ADMIN-002 | contract | PUT invalid policy → 400 `invalid_policy_structure`; no DynamoDB write | TASK-010 |
| POL-ADMIN-003 | contract | POST validate valid policy → 200 `{ valid: true }`; PutItem never called | TASK-010 |
| POL-ADMIN-004 | contract | DELETE existing → 204; GetItem empty after | TASK-010 |
| POL-ADMIN-005 | contract | PATCH disabled → resolution falls through (mocked loader / chain) | TASK-010 |
| POL-ADMIN-006 | contract | PATCH active → policy resumes after cache TTL (mocked) | TASK-010 |
| POL-ADMIN-007 | contract | PATCH missing policy → 404 `policy_not_found` | TASK-010 |
| POL-ADMIN-008 | contract | Tenant `x-api-key` only on `/v1/admin/*` → 401 `admin_key_required` | TASK-010 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tenant `apiKeyPreHandler` runs before admin routes | High | Register `/v1/admin` outside tenant-scoped plugin or exempt admin prefix explicitly (TASK-006). |
| `validatePolicyStructure` throws non–`invalid_policy_structure` codes | Medium | Map all validation throws to admin 400 body with `invalid_policy_structure` (TASK-002/005). |
| PUT version increment races | Medium | Document read-then-write; use `If-Match` for concurrent operators; consider TransactWrite in a later iteration if needed. |
| Full-table Scan for GET list | Low (pilot) | Accept per spec; document scale limit; defer GSI until cross-org filters matter. |
| `infra/` or PoliciesTable not landed yet | High | Complete PREREQ-001/002 before TASK-008; use mocks in TASK-010 until then. |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Matches spec requirements in `docs/specs/policy-management-api.md`

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 ─┐
                                 ├→ TASK-005 → TASK-006 → TASK-007
TASK-004 (after PREREQ-001) ────┘              ↓
                                        TASK-010 (contracts)
TASK-008 (after TASK-006 + PREREQ-002)
TASK-009 (after TASK-006; can parallel TASK-007/010)
```

## Next Steps

- Review task ordering against current repo state (especially whether `infra/` exists).
- Run `/implement-spec .cursor/plans/policy-management-api.plan.md` when ready to execute.
