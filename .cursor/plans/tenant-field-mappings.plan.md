---
name: Tenant field mappings v1.1
overview: Implement pilot (Canvas) extensions to tenant payload mappings—restricted computed transforms, DynamoDB-backed FieldMappingsTable with TTL cache and admin PUT/GET, file fallback (TENANT_FIELD_MAPPINGS_PATH), and source_system–aware resolution—without changing the POST /v1/signals envelope contract. v1 (alias, required, types) remains; ingestion resolves mapping DynamoDB-first then file, then runs the existing pipeline order with transforms after aliases.
todos:
  - id: TASK-001
    content: Extend mapping types + v2 file shape (source_system nesting, transforms, backward compat)
    status: completed
  - id: TASK-002
    content: Restricted transform expression parser/evaluator + upload-time validator
    status: completed
  - id: TASK-003
    content: Integrate transforms into normalization (after aliases, before required/types)
    status: completed
  - id: TASK-004
    content: Extend existing field-mappings-dynamo.ts (add PutItem, Query, Delete, transforms/template parsing)
    status: completed
  - id: TASK-005
    content: Verify existing TTL cache + wire PUT/DELETE invalidation
    status: completed
  - id: TASK-006
    content: Verify/extend async resolver for v2 file shape (source_system nesting)
    status: completed
  - id: TASK-007
    content: Plumb source_system + resolved mapping into Fastify handler-core.ts (Lambda path already wired)
    status: completed
  - id: TASK-008
    content: Admin HTTP routes PUT/GET mappings + ADMIN_API_KEY auth (accept optional template_id / template_version per spec v1.1.1)
    status: completed
  - id: TASK-009
    content: Env wiring + documentation (AWS SDK already installed)
    status: completed
  - id: TASK-010
    content: OpenAPI + error codes for mapping admin and runtime guard
    status: completed
  - id: TASK-011
    content: Unit tests for expression engine and mapping resolution edge cases
    status: completed
  - id: TASK-012
    content: Contract tests SIG-API-012–SIG-API-015 (regress after async + source_system)
    status: completed
  - id: TASK-013
    content: Contract test SIG-API-016 (computed transform)
    status: completed
  - id: TASK-014
    content: Contract test SIG-API-017 (invalid expression at admin PUT)
    status: completed
  - id: TASK-015
    content: Contract test SIG-API-018 (DynamoDB mapping for org + source_system)
    status: completed
  - id: TASK-016
    content: Contract test SIG-API-019 (fallback to file when DynamoDB miss/unavailable)
    status: completed
isProject: false
---

# Tenant field mappings v1.1

**Spec**: `docs/specs/tenant-field-mappings.md`

## Prerequisites

Before starting implementation:

- [x] **PREREQ-001** `FieldMappingsTable` exists in CDK stack (`infra/lib/control-layer-stack.ts`, PK=`org_id`, SK=`source_system`). `FIELD_MAPPINGS_TABLE` env var already read by `src/config/field-mappings-dynamo.ts` with graceful null return when unset. Local dev uses file-only path — no AWS creds required.
- [x] **PREREQ-002** Admin auth pattern confirmed: `adminApiKeyPreHandler` in `src/auth/admin-api-key-middleware.ts`, registered on `/v1/admin` scope in `src/server.ts` (same scope as `registerPolicyManagementRoutes`). Mapping admin routes use the same pattern.
- [x] **PREREQ-003** `@aws-sdk/client-dynamodb` (^3.1019.0) and `@aws-sdk/util-dynamodb` (^3.996.2) already in `package.json`.
- [x] **PREREQ-004** `src/config/field-mappings-dynamo.ts` exists with `getMappingFromDynamoDB` (GetItem + TTL cache), `invalidateFieldMappingCache`, `clearFieldMappingCache`. TASK-004 extends this file rather than creating a new one.
- [x] **PREREQ-005** `resolveTenantPayloadMappingForIngest` and `normalizeAndValidateTenantPayloadAsync` exist in `src/config/tenant-field-mappings.ts`. Lambda ingestion path (`handler-core-async.ts`) already calls the async resolver with `source_system`.

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

### TASK-004: Extend DynamoDB field-mappings repository (add PutItem, Query, transforms/template parsing)
- **Files**: `src/config/field-mappings-dynamo.ts` (exists — extend)
- **Action**: Modify (file already exists with `GetItem` + TTL cache + `invalidateFieldMappingCache`)
- **Details**:
  The existing `src/config/field-mappings-dynamo.ts` already implements `getMappingFromDynamoDB` (GetItem + TTL cache), `invalidateFieldMappingCache`, and `clearFieldMappingCache`. Extend it with:
  1. **`putFieldMappingItem`** — `PutItem` storing full mapping document + `template_id`, `template_version`, `mapping_version`, `updated_at`, `updated_by`.
  2. **`listFieldMappingItemsForOrg`** — `Query(PK=org_id)` for admin list endpoint.
  3. **`deleteFieldMappingItem`** — `DeleteItem` + cache invalidation (needed by integration-templates plan TASK-003).
  4. **Update `parseMappingFromItem`** — currently only extracts `required`, `aliases`, `types`. Must also extract `transforms[]` from the DynamoDB item to match the extended `TenantPayloadMapping` type from TASK-001, plus return `template_id` and `template_version` metadata.
  After `putFieldMappingItem` or `deleteFieldMappingItem`, call existing `invalidateFieldMappingCache(orgId, sourceSystem)`.
- **Depends on**: TASK-001
- **Verification**: Unit/integration tests with mocked DynamoDB client; item shape matches spec §DynamoDB Item Shape; existing `getMappingFromDynamoDB` tests still pass.

### TASK-005: Verify existing TTL cache + wire PUT invalidation
- **Files**: `src/config/field-mappings-dynamo.ts` (exists — verify)
- **Action**: Verify (already implemented)
- **Details**:
  The TTL cache already exists in `src/config/field-mappings-dynamo.ts`: `Map<string, CacheEntry>` keyed by `orgId:sourceSystem`, configurable via `FIELD_MAPPINGS_CACHE_TTL_MS` (default 300s), negative caching for misses. `invalidateFieldMappingCache(orgId, sourceSystem)` is already exported.
  **Remaining work**: Verify TASK-004's new `putFieldMappingItem` and `deleteFieldMappingItem` call `invalidateFieldMappingCache` after successful writes. No new file or cache implementation needed.
- **Depends on**: TASK-004
- **Verification**: Existing cache behavior unchanged; confirm invalidation is called in TASK-004's new write paths.

### TASK-006: Verify/extend existing async resolver for v2 file shape
- **Files**: `src/config/tenant-field-mappings.ts` (exists — verify + extend)
- **Action**: Verify / Modify
- **Details**:
  `resolveTenantPayloadMappingForIngest(orgId, sourceSystem)` already exists in `tenant-field-mappings.ts` and implements DynamoDB → file → null resolution. `normalizeAndValidateTenantPayloadAsync` already wires this into the Lambda ingestion path.
  **Remaining work**: After TASK-001 adds v2 file shape with `source_system` nesting, update the file fallback in `getTenantPayloadMapping` (currently only `tenants[orgId].payload`) to also check `tenants[orgId][sourceSystem].payload` for v2 files. DynamoDB degradation warning log already exists (`field_mappings_dynamo_degraded` event). Verify DynamoDB-wins-over-file precedence is maintained.
- **Depends on**: TASK-001
- **Verification**: Mock DynamoDB success/miss/failure scenarios; v2 file lookup by `source_system` works; existing precedence unchanged.

### TASK-007: Plumb source_system + resolved mapping into ingestion handler
- **Files**: `src/ingestion/handler-core.ts` (sync/Fastify path), `src/ingestion/handler-core-async.ts` (async/Lambda path — verify only), `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**:
  **Lambda path (`handler-core-async.ts`)**: Already calls `normalizeAndValidateTenantPayloadAsync({ orgId, sourceSystem, payload })` which resolves DynamoDB → file → null. Verify it works with the extended `TenantPayloadMapping` (transforms) after TASK-001/TASK-003 — no code changes expected.
  **Fastify path (`handler-core.ts`)**: Currently calls sync `normalizeAndValidateTenantPayload({ orgId, payload })` without `source_system`. Must be updated to either: (a) call `normalizeAndValidateTenantPayloadAsync` (making the Fastify handler async-aware for DynamoDB resolution), or (b) pass `source_system` and a pre-resolved mapping via `mappingOverride`. Option (a) is preferred for consistency with Lambda path.
  Preserve idempotency and downstream use of normalized payload.
- **Depends on**: TASK-003, TASK-006
- **Verification**: `npm run typecheck`; handler tests pass; Fastify path resolves mapping with `source_system`; Lambda path unchanged.

### TASK-008: Admin HTTP routes PUT/GET mappings + ADMIN_API_KEY auth
- **Files**: `src/server.ts`, new route module e.g. `src/routes/admin-field-mappings.ts` (or align with future admin router), Lambda handler entry if split per deployment
- **Action**: Create / Modify
- **Details**: `PUT /v1/admin/mappings/:org_id/:source_system` (body: full mapping JSON; optional `template_id` and `template_version` stored alongside mapping per spec v1.1.1), `GET /v1/admin/mappings/:org_id` (list SKs + metadata, include template provenance when present). Validate all `transforms[].expression` with TASK-002 before write; 400 on invalid (SIG-API-017). On PUT success, TASK-005 invalidation + optional `mapping_version` condition.
- **Depends on**: TASK-002, TASK-004, TASK-005, PREREQ-002
- **Verification**: Integration tests with Fastify inject + mocked DynamoDB; unauthorized request rejected.

### TASK-009: Env wiring + documentation (AWS SDK already installed)
- **Files**: `src/server.ts`, `.env.example` (if repo uses it), `README.md` only if already documents env vars
- **Action**: Verify / Modify
- **Details**:
  `@aws-sdk/client-dynamodb` (^3.1019.0) and `@aws-sdk/util-dynamodb` (^3.996.2) are already in `package.json` — no new dependency install needed. `FIELD_MAPPINGS_TABLE` env var is already read by `field-mappings-dynamo.ts` with graceful null return when unset.
  **Remaining work**: Document `FIELD_MAPPINGS_CACHE_TTL_MS` in `.env.example` if it exists. Verify `src/server.ts` startup does not create a DynamoDB client when `FIELD_MAPPINGS_TABLE` is unset (already the case — lazy client init behind `getClient()`).
- **Depends on**: TASK-004
- **Verification**: `npm run build` succeeds; cold start without AWS creds when table unset does not throw.

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
| `src/routes/admin-field-mappings.ts` (or equivalent) | TASK-008 | Admin PUT/GET handlers |
| `tests/unit/transform-expression.test.ts` | TASK-011 | Expression grammar tests |
| `tests/unit/field-mappings-resolve.test.ts` (optional) | TASK-011 | Resolver unit tests |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/config/tenant-field-mappings.ts` | TASK-001, TASK-003, TASK-006, TASK-007 | v2 types, transforms, v2 file resolver, normalize signature |
| `src/config/field-mappings-dynamo.ts` | TASK-004, TASK-005 | Add PutItem/Query/Delete, parse transforms + template metadata, wire invalidation |
| `src/ingestion/handler-core.ts` | TASK-007 | Fastify path: switch to async mapping resolution with source_system |
| `src/ingestion/handler-core-async.ts` | TASK-007 | Lambda path: verify only (already wired) |
| `src/server.ts` | TASK-008, TASK-009 | Register admin routes, env documentation |
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
