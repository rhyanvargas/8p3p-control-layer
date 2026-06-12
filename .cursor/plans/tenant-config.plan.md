---
name: Tenant Configuration - Central Per-Org Config Resolver
overview: "Implement a schema-validated per-org config resolver with a three-plane security boundary that keeps secrets and infra out of tenant-editable data, then wire the urs-aggregation constants as per-org overridable defaults. Sequenced after the urs-aggregation plan."
todos:
  - id: TASK-001
    content: Add tenant config types and namespace constants
    status: pending
  - id: TASK-002
    content: Add JSON Schema and reserved-key validator wired into validate:schemas
    status: pending
  - id: TASK-003
    content: Implement CODE_DEFAULTS resolver and loader with cache
    status: pending
  - id: TASK-004
    content: Add DynamoDB storage and in-memory fallback
    status: pending
  - id: TASK-005
    content: Add admin PUT and GET tenant-config routes
    status: pending
  - id: TASK-006
    content: Add TenantConfigTable to aws-deployment spec
    status: pending
  - id: TASK-007
    content: Add OpenAPI admin tenant-config endpoints
    status: pending
  - id: TASK-008
    content: Wire aggregation.* overrides into urs-aggregation code
    status: pending
  - id: TASK-009
    content: Unit tests TCFG-001 through TCFG-009 and TCFG-016
    status: pending
  - id: TASK-010
    content: Contract tests TCFG-010 through TCFG-014
    status: pending
  - id: TASK-011
    content: Integration test TCFG-015
    status: pending
isProject: false
---

# Tenant Configuration - Central Per-Org Config Resolver

**Spec**: `docs/specs/tenant-config.md`
**Sequenced after**: `.cursor/plans/urs-aggregation.plan.md` - TASK-008 here depends on `urs-aggregation` TASK-001 (the aggregation constants module) being merged, so the constants can be promoted to `CODE_DEFAULTS.aggregation` and read via `resolveTenantConfig`.

## Why this plan exists

Per-org config is scattered across policy files, routing, field mappings, subject maps, and hardcoded source constants. Onboarding a client requires editing source and redeploying. This plan adds a single schema-validated config document per org (Plane 2) layered over code defaults (Plane 3), with a hard boundary that keeps secrets and infra (Plane 1) unreachable from tenant data. After this lands, tuning a client is one admin API call.

## Sequencing rationale

`urs-aggregation` ships first with hardcoded code-default constants. This plan then makes those constants per-org overridable without any contract change to the summary response - aggregation simply reads `resolveTenantConfig(orgId).aggregation.*` with the same values as fallback. Doing aggregation first de-risks the product-critical path; config layering is additive on top.

## Scope rules

- **Three planes, hard boundary.** Tenant config (Plane 2) never contains secrets/infra (Plane 1). Enforced by schema `additionalProperties: false` + reserved-key rejection.
- **All-optional overrides.** System runs correctly on CODE_DEFAULTS alone; empty `{}` is valid.
- **Data, not code.** No executable expressions in config.
- **Fail-open.** Malformed/missing config degrades to defaults with a debug log, never 5xx.
- **No tenant self-service.** Admin-authored only (`x-admin-api-key`).
- **Federated namespaces keep their loaders.** `routing`/`subjects` wiring through the resolver is deferred; only `features` and `aggregation` are consumed in this plan.

## Spec Literals

> Verbatim from `docs/specs/tenant-config.md`. TASK details MUST quote these rather than paraphrase.

### From spec § Constants

```
RESERVED_SECRET_KEY_PATTERN = /(secret|password|token|credential|api_?key|private_key|cookie_secret|_table|_arn)/i
THRESHOLD_MIN / THRESHOLD_MAX = 0.0 / 1.0
CONFIG_NAMESPACES = ["features","aggregation","subjects","routing"]
Default config_version (first write) = 1
```

### From spec § Env vars (Plane 1)

```
TENANT_CONFIG_TABLE          no   (unset)  string  DynamoDB table; unset -> filesystem + in-memory fallback
TENANT_CONFIG_PATH           no   (unset)  string  Filesystem override; falls back to policies/{orgId}/tenant-config.json
TENANT_CONFIG_CACHE_TTL_MS   no   60000    number  Per-org resolver cache TTL
TENANT_CONFIG_MAX_BODY_BYTES no   65536    number  Max admin PUT body size (64 KB)
ADMIN_API_KEY                yes(prod) (unset) string Existing - gate for admin config routes
```

### From spec § Resolution & Precedence

```
resolveTenantConfig(orgId):
  overrides = loadTenantConfig(orgId)   // Plane 2 or null
  if (!overrides) return CODE_DEFAULTS  // fail-open
  return deepMergeValidated(CODE_DEFAULTS, overrides)
Precedence (high to low): validated tenant override -> code default
```

### From spec § HTTP behavior

```
Valid PUT                         200  application/json  x-admin-api-key (request)
Schema/reserved-key/org mismatch  400  application/json
Missing admin key                 401  application/json
GET with stored config            200  application/json  x-admin-api-key (request)
GET no stored config              404  application/json
Version conflict                  409  application/json
```

### From spec § Routes registered

```
PUT  /v1/admin/tenant-config/:org_id   no (admin key)
GET  /v1/admin/tenant-config/:org_id   no (admin key)
```

### From spec § Error Codes (new)

```
invalid_config_schema     Body fails schema, contains reserved/secret key, or org_id body != path
config_not_found          GET admin endpoint when no override stored
config_version_conflict   PUT with config_version not greater than stored
```

## Prerequisites

- [x] PREREQ-001 SATISFIED (2026-06-05) — `urs-aggregation` is fully merged; constants module exists at `src/state/aggregation-constants.ts` (commits `5b13410`..`c524b80`). All `aggregation.*` defaults this plan wraps are present and verified.

## Tasks

> **Status tracking**: Task status lives only in the YAML frontmatter `todos` list.

### TASK-001: Add tenant config types and namespace constants
- **Files**: `src/config/tenant-config-types.ts` (new)
- **Action**: Create
- **Details**: Define `TenantConfigOverride` (all namespaces optional: `features`, `aggregation`, `subjects`, `routing`, plus `org_id`, `config_version`, `updated_by`, `updated_at`) and `ResolvedTenantConfig` (all fields present). Export `CONFIG_NAMESPACES`, `RESERVED_SECRET_KEY_PATTERN`, `THRESHOLD_MIN`, `THRESHOLD_MAX` verbatim from Spec Literals § Constants. Reference (do not redefine) `PolicyRoutingConfig` from `src/shared/types.ts` and `SubjectConfig` from `src/state/subject-config.ts` for the `routing`/`subjects` namespaces.
- **Depends on**: PREREQ-001
- **Verification**: Types compile; constants match Spec Literals.

### TASK-002: Add JSON Schema and reserved-key validator wired into validate:schemas
- **Files**: `schemas/tenant-config.schema.json` (new); `scripts/validate-schemas.ts` (modify); `src/config/tenant-config-validate.ts` (new)
- **Action**: Create + Modify
- **Details**: Author a JSON Schema with `additionalProperties: false` at root and within each namespace; thresholds constrained to `0.0-1.0`; counts non-negative integers. Implement `validateTenantConfig(doc)` using AJV (existing `ajv ^8.17.1`) that runs the schema AND a recursive reserved-key check using `RESERVED_SECRET_KEY_PATTERN` at every depth, returning `{ ok: true } | { ok: false; code: 'invalid_config_schema'; message }`. Register the schema in `validate:schemas`.
- **Depends on**: TASK-001
- **Verification**: TCFG-003..007, 009, 016 pass; `npm run validate:schemas` includes the new schema.

### TASK-003: Implement CODE_DEFAULTS resolver and loader with cache
- **Files**: `src/config/tenant-config.ts` (new)
- **Action**: Create
- **Details**: Build `CODE_DEFAULTS` sourcing `aggregation.*` from `src/state/aggregation-constants.ts` (no re-pinned literals here, per spec § Concrete Values note), `subjects.default_subject` and `routing.default_policy_key` from their owners, and `features` defaults. Implement `loadTenantConfig(orgId)` mirroring `loadRoutingConfigForOrg` (TTL cache via `TENANT_CONFIG_CACHE_TTL_MS` default 60000, stale-while-revalidate, filesystem fallback `TENANT_CONFIG_PATH` then `policies/{orgId}/tenant-config.json`, silent fail-open to null). Implement `resolveTenantConfig(orgId)` per Spec Literals § Resolution & Precedence (deep merge, tenant wins, fail-open to defaults). Add `clearTenantConfigCache()` test hook.
- **Depends on**: TASK-001, TASK-002
- **Verification**: TCFG-001, 002, 008 pass.

### TASK-004: Add DynamoDB storage and in-memory fallback
- **Files**: `src/config/tenant-config-dynamo.ts` (new)
- **Action**: Create
- **Details**: Implement `getTenantConfigItem(orgId)` and `putTenantConfigItem(doc)` using `DynamoDBDocumentClient` (existing dep, higher-level over raw client) against `TENANT_CONFIG_TABLE` with `PK=org_id` (single item, no sort key). Add in-memory `Map` fallback functions used when `TENANT_CONFIG_TABLE` is unset, mirroring `upsertTenantPayloadMappingInMemory`/`listTenantPayloadMappingsInMemory` in `src/config/tenant-field-mappings.ts`. Enforce optimistic concurrency on put (reject non-increasing `config_version` -> `config_version_conflict`).
- **Depends on**: TASK-001
- **Verification**: TCFG-010, 013 pass (in-memory mode).

### TASK-005: Add admin PUT and GET tenant-config routes
- **Files**: `src/routes/admin-tenant-config.ts` (new); route registration in `src/server.ts`
- **Action**: Create + Modify
- **Details**: Register `PUT /v1/admin/tenant-config/:org_id` and `GET /v1/admin/tenant-config/:org_id` under the existing `/v1/admin` scope guarded by `adminApiKeyPreHandler`, mirroring `src/routes/admin-field-mappings.ts`. PUT: enforce body size `TENANT_CONFIG_MAX_BODY_BYTES` (65536), validate via `validateTenantConfig`, reject `org_id` body != path with `invalid_config_schema`, server-set `updated_at`, upsert via TASK-004. GET: return stored override or 404 `config_not_found`. Status codes exactly per Spec Literals § HTTP behavior. Error envelope `{ error: { code, message } }` consistent with admin-field-mappings.
- **Depends on**: TASK-002, TASK-004
- **Verification**: TCFG-010..014 pass.

### TASK-006: Add TenantConfigTable to aws-deployment spec
- **Files**: `docs/specs/aws-deployment.md`; `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: Add `TenantConfigTable` definition (`PK=org_id`, on-demand billing) to the deployment spec and CDK stack, mirroring `FieldMappingsTable`. Closes the GAP noted in spec § Dependencies. Add `TENANT_CONFIG_TABLE` env wiring to the admin/inspect functions that register the routes.
- **Depends on**: TASK-004
- **Verification**: `npm run cdk:synth` succeeds; table present in synth output.

### TASK-007: Add OpenAPI admin tenant-config endpoints
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Document `PUT`/`GET /v1/admin/tenant-config/{org_id}` with `x-admin-api-key` security, request/response schemas, and the three new error codes. Constrain top-level config to `CONFIG_NAMESPACES`.
- **Depends on**: TASK-005
- **Verification**: `npm run validate:api` passes.

### TASK-008: Wire aggregation.* overrides into urs-aggregation code
- **Files**: `src/learners/summary-handler-core.ts`; `src/lambda/inspect.ts`; `src/state/aggregation.ts`
- **Action**: Modify
- **Details**: Replace direct reads of `aggregation-constants` in learning-gap and gifted-flag logic with `resolveTenantConfig(orgId).aggregation.*`, keeping the constants as the resolved fallback. No response contract change. This is the payoff task that makes business rules per-client configurable.
- **Depends on**: TASK-003, (urs-aggregation TASK-008)
- **Verification**: TCFG-015 passes (override changes gifted flag outcome); urs-aggregation AGG-009..013 still pass with defaults.

### TASK-009: Unit tests TCFG-001 through TCFG-009 and TCFG-016
- **Files**: `tests/unit/tenant-config.test.ts` (new)
- **Action**: Create
- **Details**: Cover resolver merge/fail-open (001, 002, 008, 009), reserved-key + schema rejection (003..007), and schema-registration (016) per spec § Contract Tests.
- **Depends on**: TASK-002, TASK-003
- **Verification**: TCFG-001..009, 016 green.

### TASK-010: Contract tests TCFG-010 through TCFG-014
- **Files**: `tests/contracts/admin-tenant-config.test.ts` (new)
- **Action**: Create
- **Details**: Fastify inject against admin routes in in-memory fallback mode: round-trip (010), org mismatch (011), not-found (012), version conflict (013), missing admin key (014).
- **Depends on**: TASK-005
- **Verification**: TCFG-010..014 green.

### TASK-011: Integration test TCFG-015
- **Files**: `tests/integration/tenant-config-aggregation.test.ts` (new)
- **Action**: Create
- **Details**: Set `aggregation.gifted_mastery_threshold: 0.80` via admin PUT, seed a learner with skills at 0.85, assert summary now flags `gifted_interest`. Proves Plane 2 override reaches aggregation behavior.
- **Depends on**: TASK-008
- **Verification**: TCFG-015 green.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/config/tenant-config-types.ts` | TASK-001 | Types + namespace/reserved constants |
| `schemas/tenant-config.schema.json` | TASK-002 | JSON Schema |
| `src/config/tenant-config-validate.ts` | TASK-002 | AJV + reserved-key validator |
| `src/config/tenant-config.ts` | TASK-003 | CODE_DEFAULTS + resolver + loader |
| `src/config/tenant-config-dynamo.ts` | TASK-004 | Dynamo storage + in-memory fallback |
| `src/routes/admin-tenant-config.ts` | TASK-005 | Admin PUT/GET routes |
| `tests/unit/tenant-config.test.ts` | TASK-009 | Unit tests |
| `tests/contracts/admin-tenant-config.test.ts` | TASK-010 | Contract tests |
| `tests/integration/tenant-config-aggregation.test.ts` | TASK-011 | Integration test |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `scripts/validate-schemas.ts` | TASK-002 | Register tenant-config schema |
| `src/server.ts` | TASK-005 | Register admin routes |
| `docs/specs/aws-deployment.md` | TASK-006 | TenantConfigTable definition |
| `infra/lib/control-layer-stack.ts` | TASK-006 | TenantConfigTable + env wiring |
| `docs/api/openapi.yaml` | TASK-007 | Admin endpoints + error codes |
| `src/learners/summary-handler-core.ts` | TASK-008 | Read aggregation.* via resolver |
| `src/lambda/inspect.ts` | TASK-008 | Lambda parity for resolver reads |
| `src/state/aggregation.ts` | TASK-008 | Resolver-sourced constants |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| resolveTenantConfig returns deepMerge(defaults, override) | § Functional | TASK-003 |
| loadTenantConfig Dynamo->fs->null fail-open | § Functional | TASK-003, TASK-004 |
| CODE_DEFAULTS contains every configurable value | § Functional | TASK-003 |
| JSON Schema additionalProperties false | § Functional | TASK-002 |
| Reserved secret-key rejection at every depth | § Functional | TASK-002 |
| PUT validates then upserts; org mismatch rejected | § Functional | TASK-005 |
| GET returns stored override or 404 | § Functional | TASK-005 |
| Optimistic concurrency on version | § Functional | TASK-004, TASK-005 |
| In-memory fallback when table unset | § Functional | TASK-004 |
| aggregation.* overrides consumed by URS aggregation | § Functional | TASK-008 |
| Schema wired into validate:schemas | § Functional | TASK-002 |
| AC no config -> defaults | § Acceptance | TASK-003, TASK-009 |
| AC partial override merges | § Acceptance | TASK-003, TASK-009 |
| AC api_key key -> 400 | § Acceptance | TASK-002, TASK-009 |
| AC org mismatch -> 400 | § Acceptance | TASK-005, TASK-010 |
| AC version <= stored -> 409 | § Acceptance | TASK-004, TASK-010 |
| AC malformed item -> defaults no 500 | § Acceptance | TASK-003, TASK-009 |
| AC out-of-range threshold -> 400 | § Acceptance | TASK-002, TASK-009 |
| AC table unset round-trips in memory | § Acceptance | TASK-004, TASK-010 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TCFG-001 | unit | Resolve no override returns defaults | TASK-009 |
| TCFG-002 | unit | Override merges over defaults | TASK-009 |
| TCFG-003 | unit | Reserved key rejected root | TASK-009 |
| TCFG-004 | unit | Reserved key rejected nested | TASK-009 |
| TCFG-005 | unit | Unknown top-level namespace rejected | TASK-009 |
| TCFG-006 | unit | Out-of-range threshold rejected | TASK-009 |
| TCFG-007 | unit | Negative count rejected | TASK-009 |
| TCFG-008 | unit | Malformed stored item fails open | TASK-009 |
| TCFG-009 | unit | Empty object valid | TASK-009 |
| TCFG-010 | contract | PUT then GET round-trips in-memory | TASK-010 |
| TCFG-011 | contract | PUT org_id mismatch rejected | TASK-010 |
| TCFG-012 | contract | GET no stored config 404 | TASK-010 |
| TCFG-013 | contract | PUT non-increasing version 409 | TASK-010 |
| TCFG-014 | contract | PUT without admin key 401 | TASK-010 |
| TCFG-015 | integration | aggregation override flows to summary | TASK-011 |
| TCFG-016 | unit | Schema valid + registered | TASK-009 |

## Deviations from Spec

None - plan is literal-compatible with spec.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reserved-key regex over-blocks legitimate keys | Low | Pattern scoped to secret-shaped tokens; namespaces are closed set; unit tests assert legitimate keys pass |
| Resolver read added to hot summary path | Low | Per-org TTL cache (60s) + stale-while-revalidate identical to routing cache |
| Federated routing/subjects precedence not enforced yet causes confusion | Medium | Documented as deferred in spec + plan scope rules; only features/aggregation consumed now |
| Depends on urs-aggregation landing first | Medium | PREREQ-001 gate; TASK-008 explicitly depends on urs-aggregation TASK-001/008 |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Schemas valid (`npm run validate:schemas`)
- [ ] OpenAPI valid (`npm run validate:api`)
- [ ] CDK synth succeeds (`npm run cdk:synth`)
- [ ] No secret reachable from resolver code path

## Implementation Order

```
PREREQ-001 (urs-aggregation TASK-001 merged)
TASK-001 → TASK-002 → TASK-003 → TASK-008 → TASK-011
TASK-001 → TASK-004 → TASK-005 → TASK-007
                      TASK-004 → TASK-006
TASK-002,003 → TASK-009
TASK-005 → TASK-010
```

## Next Steps

- Complete `.cursor/plans/urs-aggregation.plan.md` first (at minimum TASK-001).
- Run `/implement-spec .cursor/plans/tenant-config.plan.md`.
