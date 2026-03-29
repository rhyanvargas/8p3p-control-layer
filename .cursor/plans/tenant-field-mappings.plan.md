---
name: Tenant field mappings v1.1
overview: Implement pilot (Canvas) extensions to tenant payload mappings—restricted computed transforms, DynamoDB-backed FieldMappingsTable with TTL cache and admin PUT/GET, file fallback (TENANT_FIELD_MAPPINGS_PATH), and source_system–aware resolution—without changing the POST /v1/signals envelope contract. v1 (alias, required, types) remains; ingestion resolves mapping DynamoDB-first then file, then runs the existing pipeline order with transforms after aliases.
todos:
  - id: "TASK-001"
    content: "Extend mapping types + v2 file shape (source_system nesting, transforms, backward compat)"
    status: "pending"
  - id: "TASK-002"
    content: "Restricted transform expression parser/evaluator + upload-time validator"
    status: "pending"
  - id: "TASK-003"
    content: "Integrate transforms into normalization (after aliases, before required/types)"
    status: "pending"
  - id: "TASK-004"
    content: "DynamoDB field-mappings repository (GetItem, PutItem, Query)"
    status: "pending"
  - id: "TASK-005"
    content: "In-memory TTL cache + PUT invalidation"
    status: "pending"
  - id: "TASK-006"
    content: "Async resolver DynamoDB → file → null (per org_id + source_system)"
    status: "pending"
  - id: "TASK-007"
    content: "Plumb source_system + resolved mapping into ingestion handler"
    status: "pending"
  - id: "TASK-008"
    content: "Admin HTTP routes PUT/GET mappings + ADMIN_API_KEY auth"
    status: "pending"
  - id: "TASK-009"
    content: "Dependencies + env wiring (AWS SDK, FIELD_MAPPINGS_*, cache TTL)"
    status: "pending"
  - id: "TASK-010"
    content: "OpenAPI + error codes for mapping admin and runtime guard"
    status: "pending"
  - id: "TASK-011"
    content: "Unit tests for expression engine and mapping resolution edge cases"
    status: "pending"
  - id: "TASK-012"
    content: "Contract tests SIG-API-012–SIG-API-015 (regress after async + source_system)"
    status: "pending"
  - id: "TASK-013"
    content: "Contract test SIG-API-016 (computed transform)"
    status: "pending"
  - id: "TASK-014"
    content: "Contract test SIG-API-017 (invalid expression at admin PUT)"
    status: "pending"
  - id: "TASK-015"
    content: "Contract test SIG-API-018 (DynamoDB mapping for org + source_system)"
    status: "pending"
  - id: "TASK-016"
    content: "Contract test SIG-API-019 (fallback to file when DynamoDB miss/unavailable)"
    status: "pending"
isProject: false
---

# Tenant field mappings v1.1

**Spec**: `docs/specs/tenant-field-mappings.md`

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** Ingestion and admin runtimes have `FIELD_MAPPINGS_TABLE` (and AWS region/credentials) where DynamoDB is used, per `docs/specs/aws-deployment.md` (FieldMappingsTable, IngestFunction, AdminFunction env). Local dev may use file-only until CDK deploy exists.
- [ ] **PREREQ-002** Confirm admin auth pattern (`x-admin-api-key` vs `ADMIN_API_KEY`) matches `docs/specs/policy-management-api.md` so mapping admin routes stay consistent with policy admin.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Extend mapping types + v2 file shape (source_system nesting, transforms, backward compat)
- **Files**: `src/config/tenant-field-mappings.ts` (types, loader, file resolution helpers)
- **Action**: Modify
- **Details**: Add `transforms[]` (`target`, `source`, `expression`), optional `strict_transforms` per spec. Support file `version: 2` with `tenants[org_id][source_system].payload` (and documented backward compatibility: v1 `tenants[org_id].payload` applies to all `source_system` values). Parse/load without breaking existing v1 files.
- **Depends on**: none
- **Verification**: Existing v1 mapping fixtures still load; v2 nested shape parses; unit test or snapshot for file shapes.

### TASK-002: Restricted transform expression parser/evaluator + upload-time validator
- **Files**: `src/config/transform-expression.ts` (new), re-exports from `tenant-field-mappings` or admin module as needed
- **Action**: Create
- **Details**: Whitelist grammar (literals, `value`, `+ - * /`, parentheses, `Math.min`/`Math.max`/`Math.round` only). Export `validateTransformExpression(expr: string): { ok: true } | { ok: false; message }` and `evaluateTransform(expression, value: number): number` (or equivalent). Reject `eval`, unknown identifiers, bracket access, etc.
- **Depends on**: none
- **Verification**: Unit tests cover allowed/forbidden forms; matches spec §Restricted Transform Expression Grammar.

### TASK-003: Integrate transforms into normalization (after aliases, before required/types)
- **Files**: `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**: For each transform, read `source` via dot-path from payload; coerce/bind `value`; evaluate expression; write `target` (top-level canonical key per spec). Honor `strict_transforms` when source missing. Order: aliases → transforms → required → types.
- **Depends on**: TASK-001, TASK-002
- **Verification**: Manual or unit test—payload `{ raw_score: 65 }` with `value/100` → `stabilityScore === 0.65`.

### TASK-004: DynamoDB field-mappings repository (GetItem, PutItem, Query)
- **Files**: `src/config/field-mappings-dynamo.ts` or `src/storage/field-mappings-store.ts` (new)
- **Action**: Create
- **Details**: `GetItem(PK=org_id, SK=source_system)` returns `mapping` map + metadata. `PutItem` stores full mapping document + `updated_at` / `updated_by` (key prefix). `Query(PK=org_id)` for admin list. Use `@aws-sdk/client-dynamodb` (or Document Client) consistent with future policy storage patterns.
- **Depends on**: TASK-001
- **Verification**: Unit/integration tests with mocked DynamoDB client; item shape matches spec §DynamoDB Item Shape.

### TASK-005: In-memory TTL cache + PUT invalidation
- **Files**: same module as TASK-004 or `src/config/field-mappings-cache.ts` (new)
- **Action**: Create / Modify
- **Details**: Cache key `(org_id, source_system)`, default TTL 300s, override `FIELD_MAPPINGS_CACHE_TTL_MS`. On successful admin `PutItem`, invalidate that key. Negative caching for misses optional (document if implemented).
- **Depends on**: TASK-004
- **Verification**: Unit test: second load within TTL does not call DynamoDB mock; after invalidate, calls again.

### TASK-006: Async resolver DynamoDB → file → null (per org_id + source_system)
- **Files**: `src/config/tenant-field-mappings.ts` or `src/config/resolve-field-mapping.ts` (new)
- **Action**: Create / Modify
- **Details**: If `FIELD_MAPPINGS_TABLE` set, try cached/DynamoDB first; on miss or transport error, fall back to file (log warning on DynamoDB unavailable per SIG-API-019). If both miss, return null (Phase 1). Dynamo wins when both define same org+source.
- **Depends on**: TASK-001, TASK-004, TASK-005
- **Verification**: Mock DynamoDB success/miss/failure scenarios; assert precedence and logging.

### TASK-007: Plumb source_system + resolved mapping into ingestion handler
- **Files**: `src/ingestion/handler.ts`, `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**: After forbidden keys, `await resolveTenantFieldMapping(signal.org_id, signal.source_system)` then `normalizeAndValidateTenantPayload({ orgId, payload, mapping })` (or equivalent) so mapping is optional/null. Preserve idempotency and downstream use of normalized payload.
- **Depends on**: TASK-003, TASK-006
- **Verification**: `npm run typecheck`; handler tests pass; no duplicate DynamoDB calls without cache reason.

### TASK-008: Admin HTTP routes PUT/GET mappings + ADMIN_API_KEY auth
- **Files**: `src/server.ts`, new route module e.g. `src/routes/admin-field-mappings.ts` (or align with future admin router), Lambda handler entry if split per deployment
- **Action**: Create / Modify
- **Details**: `PUT /v1/admin/mappings/:org_id/:source_system` (body: full mapping JSON), `GET /v1/admin/mappings/:org_id` (list SKs + metadata). Validate all `transforms[].expression` with TASK-002 before write; 400 on invalid (SIG-API-017). On PUT success, TASK-005 invalidation + optional `mapping_version` condition.
- **Depends on**: TASK-002, TASK-004, TASK-005, PREREQ-002
- **Verification**: Integration tests with Fastify inject + mocked DynamoDB; unauthorized request rejected.

### TASK-009: Dependencies + env wiring (AWS SDK, FIELD_MAPPINGS_*, cache TTL)
- **Files**: `package.json`, `src/server.ts`, `.env.example` (if repo uses it), `README.md` only if already documents env vars
- **Action**: Modify
- **Details**: Add AWS SDK dependency; document `FIELD_MAPPINGS_TABLE`, `FIELD_MAPPINGS_CACHE_TTL_MS`, existing `TENANT_FIELD_MAPPINGS_PATH`. Avoid starting DynamoDB clients when table unset (local file-only).
- **Depends on**: TASK-004
- **Verification**: `npm install`, `npm run build`, cold start without AWS creds when table unset does not throw.

### TASK-010: OpenAPI + error codes for mapping admin and runtime guard
- **Files**: `docs/api/openapi.yaml`, `src/shared/error-codes.ts` (if `invalid_mapping_expression` added)
- **Action**: Modify
- **Details**: Document admin paths, auth header, request/response schemas. Add runtime error code only if spec’s rare safe-eval failure path is implemented.
- **Depends on**: TASK-008
- **Verification**: `npm run validate:api`; error codes align with `docs/specs/tenant-field-mappings.md` §Error Codes.

### TASK-011: Unit tests for expression engine and mapping resolution edge cases
- **Files**: `tests/unit/transform-expression.test.ts` (new), `tests/unit/field-mappings-resolve.test.ts` (new) or equivalent
- **Action**: Create
- **Details**: Cover grammar edge cases, file v1/v2 resolution, `strict_transforms`, dot-path read/write for transforms.
- **Depends on**: TASK-002, TASK-006
- **Verification**: `npm run test:unit` passes.

### TASK-012: Contract tests SIG-API-012–SIG-API-015 (regress after async + source_system)
- **Files**: `tests/contracts/signal-ingestion.test.ts`
- **Action**: Modify
- **Details**: Ensure existing scenarios still pass when normalization becomes async and mapping key includes `source_system` (use matching `source_system` in envelope vs file/Dynamo SK). Adjust fixtures if wildcard v1 mapping behavior applies.
- **Depends on**: TASK-007
- **Verification**: `npm run test:contracts` includes green SIG-API-012–015.

### TASK-013: Contract test SIG-API-016 (computed transform)
- **Files**: `tests/contracts/signal-ingestion.test.ts` (or dedicated file)
- **Action**: Modify / Create
- **Details**: DynamoDB or file mapping with transform `target=stabilityScore`, `source=raw_score`, `expression=value/100`, payload `{ raw_score: 65 }` → accepted with `stabilityScore === 0.65` when other rules pass.
- **Depends on**: TASK-007, TASK-003
- **Verification**: Test tagged/labeled SIG-API-016 passes.

### TASK-014: Contract test SIG-API-017 (invalid expression at admin PUT)
- **Files**: `tests/integration/` or `tests/contracts/` (admin mapping suite)
- **Action**: Create
- **Details**: `PUT` body containing `eval(...)` or forbidden token → 400, validation error body per project conventions.
- **Depends on**: TASK-008
- **Verification**: SIG-API-017 passes.

### TASK-015: Contract test SIG-API-018 (DynamoDB mapping for org + source_system)
- **Files**: `tests/contracts/signal-ingestion.test.ts` or integration tests with mocked AWS
- **Action**: Create / Modify
- **Details**: Given item for org `springs` + `canvas-lms`, ingestion with `source_system=canvas-lms` uses that mapping (not file default).
- **Depends on**: TASK-006, TASK-007
- **Verification**: SIG-API-018 passes with DynamoDB mock.

### TASK-016: Contract test SIG-API-019 (fallback to file when DynamoDB miss/unavailable)
- **Files**: same as TASK-015
- **Action**: Create / Modify
- **Details**: Simulate DynamoDB unreachable or error; valid file mapping exists → ingestion uses file; assert warning log (spy on logger).
- **Depends on**: TASK-006
- **Verification**: SIG-API-019 passes.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/config/transform-expression.ts` | TASK-002 | Safe parse/eval + upload validation |
| `src/config/field-mappings-dynamo.ts` or `src/storage/field-mappings-store.ts` | TASK-004 | DynamoDB access patterns 1–3 |
| `src/config/field-mappings-cache.ts` (optional) | TASK-005 | TTL cache + invalidation |
| `src/routes/admin-field-mappings.ts` (or equivalent) | TASK-008 | Admin PUT/GET handlers |
| `tests/unit/transform-expression.test.ts` | TASK-011 | Expression grammar tests |
| `tests/unit/field-mappings-resolve.test.ts` (optional) | TASK-011 | Resolver unit tests |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/config/tenant-field-mappings.ts` | TASK-001, TASK-003, TASK-006, TASK-007 | v2 types, transforms, resolver hooks, normalize signature |
| `src/ingestion/handler.ts` | TASK-007 | Async mapping resolution + normalized payload |
| `src/server.ts` | TASK-008, TASK-009 | Register admin routes, env/bootstrap |
| `package.json` | TASK-009 | `@aws-sdk/*` dependency |
| `docs/api/openapi.yaml` | TASK-010 | Admin mapping paths |
| `src/shared/error-codes.ts` | TASK-010 | `invalid_mapping_expression` if used |
| `tests/contracts/signal-ingestion.test.ts` | TASK-012, TASK-013, TASK-015, TASK-016 | Contract coverage SIG-API-012–016, 018, 019 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| SIG-API-012 | contract | Required canonical enforced after aliases/transforms | TASK-012 |
| SIG-API-013 | contract | Alias normalization non-destructive | TASK-012 |
| SIG-API-014 | contract | Alias conflict → invalid_format | TASK-012 |
| SIG-API-015 | contract | Type enforcement | TASK-012 |
| SIG-API-016 | contract | Computed transform produces canonical field (e.g. value/100) | TASK-013 |
| SIG-API-017 | contract | Invalid expression rejected at admin PUT | TASK-014 |
| SIG-API-018 | contract | DynamoDB mapping wins for org + source_system | TASK-015 |
| SIG-API-019 | contract | Fallback to file when DynamoDB miss/unavailable + warning | TASK-016 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ingestion path becomes async and slower on cold DynamoDB | Medium | TTL cache; optional in-process negative cache; keep file fast path |
| Admin-only code paths diverge between Fastify monolith and future AdminFunction Lambda | Medium | Isolate handlers in reusable modules; single auth + store layer |
| Expression parser bugs (security or correctness) | High | Strict whitelist only; fuzz unit tests; no `eval`/`Function` |
| Multi-source transforms requested mid-pilot | Low | Spec defers to v1.1.1; document out of scope in PRs |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Matches spec requirements in `docs/specs/tenant-field-mappings.md` (v1.1 functional checklist)

## Implementation Order

```
TASK-001 ──→ TASK-003 ──┐
TASK-002 ─────────────┤
                        ├──→ TASK-007 ──→ TASK-012 … TASK-016
TASK-004 ──→ TASK-005 ──┤
         └─→ TASK-006 ──┘
TASK-009 (parallel with TASK-004)
TASK-007 ──→ TASK-008 ──→ TASK-010
TASK-002 ──→ TASK-008
TASK-011 after TASK-002 + TASK-006
```

## Next Steps

- Review task ordering (especially admin routes vs resolver).
- Run `/implement-spec .cursor/plans/tenant-field-mappings.plan.md` when ready to execute.
