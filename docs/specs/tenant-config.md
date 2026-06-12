# Tenant Configuration — Central Per-Org Config Resolver

> A single, schema-validated configuration document per organization that unifies today's scattered per-org settings (business-rule thresholds, subject maps, feature flags, routing) behind one resolver — with a hard security boundary that keeps secrets and infrastructure config out of tenant-editable data. Makes onboarding a new client a single config write instead of editing source.

## Overview

Per-org configuration is currently spread across at least six locations: decision policy files (`policies/{orgId}/learner.json`), routing (`policies/{orgId}/routing.json`), field mappings (`FieldMappingsTable` / `TENANT_FIELD_MAPPINGS_PATH`), the proposed subject map (`policies/{orgId}/subjects.json`), tenant identity (`tenants` / `api_keys` tables), and **hardcoded business constants** in source (e.g. `LEARNING_GAP_THRESHOLD`, `GIFTED_MASTERY_THRESHOLD` in `docs/specs/urs-aggregation.md`). Onboarding a client therefore requires editing source and redeploying, and there is no single place an operator can read or set a tenant's tunable business rules.

This spec defines a **Tenant Configuration resolver** built on a three-plane separation of concerns, which is the industry-standard answer to "make business rules configurable per client while keeping security intact":

| Plane | Owns | Storage | Mutability | Examples |
|-------|------|---------|-----------|----------|
| **1. Platform / Secrets** | Infrastructure + credentials | Env vars (pilot) → AWS Secrets Manager (credentials, rotation, CloudTrail audit) + SSM Parameter Store (non-secret infra) | Deploy / ops only | `COOKIE_SECRET`, `ADMIN_API_KEY`, `*_TABLE` names, cache TTLs |
| **2. Tenant Business Config** | Per-org tunable rules | `TenantConfigTable` (DynamoDB, `PK=org_id`) → filesystem fallback for local dev | Admin API (`ADMIN_API_KEY`) | aggregation thresholds, subject map, feature flags, routing defaults |
| **3. Code Defaults** | Safe baseline so the system runs with zero tenant config | Compiled constants | Code review only | every value in Plane 2 has a default here |

**Resolution is a layered merge:** `code defaults → tenant business config overrides`. Tenant config contains **only** Plane 2 data; it can never declare a secret, an env var, a table name, or executable code. This is what keeps the security boundary intact while making business rules fully client-configurable.

**AWS-aligned secret handling (Plane 1):** Per AWS guidance, rotating credentials and API keys belong in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) (automatic rotation, per-access CloudTrail logging), while non-secret configuration data belongs in [SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html) (hierarchical, versioned, free standard tier). Parameter Store can [reference Secrets Manager secrets](https://docs.aws.amazon.com/secretsmanager/latest/userguide/integrating_parameterstore.html) so application code uses one retrieval path. For the pilot, Plane 1 remains env-var based; this spec defines the boundary so graduation to Secrets Manager / Parameter Store is a non-breaking infra change.

**Multi-tenant storage (Plane 2):** A single config item per org keyed on `PK=org_id` follows [DynamoDB partition-key best practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html) — config reads are low-throughput, per-org, and uniformly distributed — and the [SaaS Lens multi-tenant](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/multi-tenant-microservices.html) principle of resolving tenant context at the edge (the API key → `org_id` mapping already established in `docs/specs/tenant-provisioning.md`) rather than threading tenant-awareness through business logic.

**Scope boundary (v1.1):** This spec introduces the **resolver, schema, storage, and admin API**, and takes ownership of two net-new namespaces (`features`, `aggregation`). Existing loaders (`loadRoutingConfigForOrg`, field mappings, subject config) keep working unchanged; this spec documents them as **federated namespaces** and defines the migration path — it does not rip them out. No decision-engine or ingestion behavior changes.

---

## Architecture

```
                       ┌─────────────────────────────────────┐
   Admin (ADMIN_API_KEY)│  PUT /v1/admin/tenant-config/:org_id │
   ─────────────────────▶│  GET /v1/admin/tenant-config/:org_id │
                       └──────────────┬──────────────────────┘
                                      │ AJV schema validation
                                      ▼
                       ┌─────────────────────────────────────┐
                       │  TenantConfigTable (PK=org_id)        │  Plane 2
                       │  └ filesystem fallback (local dev)    │
                       └──────────────┬──────────────────────┘
                                      │ loadTenantConfig(orgId)
                                      │ (TTL cache + stale-while-revalidate)
                                      ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  resolveTenantConfig(orgId): ResolvedTenantConfig              │
   │  = deepMerge(CODE_DEFAULTS, tenantConfigOverrides)            │  Plane 3 ⊕ 2
   └───────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ (never reads from)
   ┌───────────────────────────────────────────────────────────────┐
   │  Plane 1: process.env + (future) Secrets Manager / SSM        │
   │  COOKIE_SECRET, ADMIN_API_KEY, *_TABLE, *_CACHE_TTL_MS         │
   └───────────────────────────────────────────────────────────────┘
```

**Hard boundary:** the resolver reads Plane 3 (defaults) and Plane 2 (tenant overrides) only. Plane 1 is read exclusively by infrastructure code via `process.env` / secret clients, never by the config resolver, and Plane 2 documents can never name a Plane 1 key (enforced by `additionalProperties: false` + reserved-key rejection).

---

## Configuration Schema

The tenant config document is a JSON object with a closed set of top-level namespaces. **All namespaces and all fields are optional** — an empty `{}` is valid and resolves entirely to code defaults.

```jsonc
{
  "org_id": "springs",          // must equal the path/context org_id (rejected on mismatch)
  "config_version": 3,           // integer, monotonic; required on write
  "updated_by": "admin@8p3p",    // free-form audit string; required on write
  "updated_at": "2026-06-04T20:00:00Z", // server-set on write (ignored if client-sent)

  "features": {                  // OWNED BY THIS SPEC
    "gifted_flag": true,
    "learning_gaps": true
  },

  "aggregation": {               // OWNED BY THIS SPEC — overrides urs-aggregation.md defaults
    "learning_gap_threshold": 0.10,
    "learning_gap_absolute_threshold": 0.60,
    "learning_gaps_max": 10,
    "gifted_mastery_threshold": 0.95,
    "min_skills_for_gifted": 2,
    "min_advance_decisions": 1,
    "gifted_min_evidence_count": 3
  },

  "subjects": {                  // FEDERATED — schema mirrors policies/{orgId}/subjects.json
    "default_subject": "General",
    "explicit_map": { "MATH-301": "Math" },
    "prefix_rules": [{ "prefix": "MATH", "subject": "Math" }]
  },

  "routing": {                   // FEDERATED — schema mirrors PolicyRoutingConfig
    "default_policy_key": "learner",
    "source_system_map": { "canvas-lms": "learner" }
  }
}
```

### Namespace ownership

| Namespace | Owner | v1.1 behavior |
|-----------|-------|---------------|
| `features` | **this spec** | New. Boolean flags consumed by feature gates. |
| `aggregation` | **this spec** (values defined in `docs/specs/urs-aggregation.md`) | New. Overrides the pinned aggregation constants. |
| `subjects` | `docs/specs/urs-aggregation.md` (type) | Federated: schema accepted here; `loadSubjectConfigForOrg` continues to read `subjects.json` until migrated. When both exist, **tenant-config wins** (documented precedence). |
| `routing` | `docs/specs/decision-engine.md` (`PolicyRoutingConfig`) | Federated: schema accepted here; `loadRoutingConfigForOrg` unchanged in v1.1. Precedence documented; wiring deferred. |

> **Dependency ownership:** This spec does **not** redefine `PolicyRoutingConfig` or the subject-config type — it references them. The JSON Schema for `routing`/`subjects` namespaces is generated from those source types; if they change, this schema follows.

### What is explicitly forbidden in tenant config

- Any key matching the reserved secret pattern (case-insensitive): `secret`, `password`, `token`, `credential`, `api_key`, `apikey`, `private_key`, `cookie_secret`, `_table`, `_arn` → rejected with `invalid_config_schema`.
- Unknown top-level namespaces (`additionalProperties: false` at root) → rejected.
- Non-scalar values where scalars are required, out-of-range numbers (thresholds must be `0.0–1.0`), negative counts → rejected.
- Executable expressions / code of any kind. (Computed transforms remain in the field-mapping layer's existing safe-expression evaluator; config carries data only.)

---

## Resolution & Precedence

```ts
// Pseudocode — src/config/tenant-config.ts
const CODE_DEFAULTS: ResolvedTenantConfig = { /* every value, from spec constants */ };

export function resolveTenantConfig(orgId: string): ResolvedTenantConfig {
  const overrides = loadTenantConfig(orgId);      // Plane 2 or null
  if (!overrides) return CODE_DEFAULTS;            // fail-open to defaults
  return deepMergeValidated(CODE_DEFAULTS, overrides);
}
```

**Precedence (highest to lowest):**
1. Validated tenant config override (Plane 2)
2. Code default (Plane 3)

**Fail-open posture:** a missing or malformed stored config never breaks request handling — the resolver logs a debug warning and returns code defaults. This matches the existing posture of `loadRoutingConfigForOrg` (silently degrades on parse error) and `tenant-field-mappings` ("fail open + warning").

**Caching:** `loadTenantConfig` uses a per-org TTL cache with stale-while-revalidate, identical to the DynamoDB routing-config cache in `src/decision/policy-loader.ts` (cache hit if fresh; serve stale + background refresh on TTL expiry; filesystem fallback on miss).

---

## Storage

| Mode | Resolution order |
|------|------------------|
| **DynamoDB** (when `TENANT_CONFIG_TABLE` set) | TTL cache → `GetItem(PK=org_id)` → filesystem fallback |
| **Filesystem** (local dev, table unset) | `TENANT_CONFIG_PATH` override → `src/decision/policies/{org_id}/tenant-config.json` → null (defaults) |

DynamoDB item shape: `PK = org_id` (string), no sort key (one config document per org). Attributes mirror the schema above. Low write frequency (admin only), low read frequency (cached) — a single hot-partition-free item per tenant per [partition-key best practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html).

Table is declared in `docs/specs/aws-deployment.md` (`TenantConfigTable`) — see § Dependencies.

---

## Admin API

Registered under the existing `/v1/admin` scope guarded by `adminApiKeyPreHandler` (`x-admin-api-key`), same model as `docs/specs/tenant-field-mappings.md` § Admin API and `docs/specs/policy-management-api.md`.

### `PUT /v1/admin/tenant-config/:org_id`

Upsert the full tenant config document. Body is validated against the JSON Schema **before** write. On success, increments effective `config_version` (server rejects a write whose `config_version` is not greater than the stored one → `config_version_conflict`, optimistic concurrency).

- **Auth:** `x-admin-api-key` (Plane 1 secret).
- **Validation:** AJV (already a dependency) against `schemas/tenant-config.schema.json`; reserved-key rejection; `org_id` body must equal path.
- **Response 200:** `{ org_id, config_version, updated_at }` (no secret echo).

### `GET /v1/admin/tenant-config/:org_id`

Return the **stored override document** (Plane 2 only, not the resolved merge) for operator inspection. Returns 404 `config_not_found` when no override is stored (the system is running on code defaults).

> A separate `GET /v1/admin/tenant-config/:org_id/resolved` returning the merged `CODE_DEFAULTS ⊕ overrides` view is **out of scope for v1.1** (nice-to-have for debugging onboarding).

**Tenant (non-admin) access:** tenants do **not** read or write their config via tenant API keys in v1.1. `org_id` is always derived from the authenticated context, never trusted from the body (consistent with `tenant-provisioning.md` org-injection model).

---

## Requirements

### Functional

- [ ] `resolveTenantConfig(orgId)` returns `deepMerge(CODE_DEFAULTS, storedOverride)` with tenant values winning
- [ ] `loadTenantConfig(orgId)` resolves DynamoDB (cached) → filesystem → null, failing open to defaults on error
- [ ] `CODE_DEFAULTS` contains every configurable value with the literal defaults pinned in source specs (`urs-aggregation.md` for `aggregation.*`)
- [ ] JSON Schema (`schemas/tenant-config.schema.json`) validates documents with `additionalProperties: false` at root and within each namespace
- [ ] Reserved secret-key pattern rejection enforced on every key at every depth
- [ ] `PUT /v1/admin/tenant-config/:org_id` validates then upserts; `org_id` mismatch rejected
- [ ] `GET /v1/admin/tenant-config/:org_id` returns stored override or 404
- [ ] Optimistic concurrency: write with non-increasing `config_version` rejected
- [ ] In-memory fallback for admin PUT/GET when `TENANT_CONFIG_TABLE` unset (mirrors `admin-field-mappings` local fallback)
- [ ] `aggregation.*` overrides are consumed by URS aggregation (replaces hardcoded constant reads with `resolveTenantConfig(orgId).aggregation.*`)
- [ ] Schema is wired into `npm run validate:schemas`

### Acceptance Criteria

- Given no stored config for `springs`, when `resolveTenantConfig("springs")` runs, then it returns `CODE_DEFAULTS` unchanged
- Given a stored config `{ aggregation: { gifted_mastery_threshold: 0.90 } }`, when resolved, then `aggregation.gifted_mastery_threshold === 0.90` and all other values equal defaults
- Given a `PUT` body containing key `api_key`, then 400 `invalid_config_schema` and nothing is written
- Given a `PUT` body whose `org_id` ≠ path `:org_id`, then 400 `invalid_config_schema`
- Given a `PUT` with `config_version` ≤ stored version, then 409 `config_version_conflict`
- Given a malformed stored DynamoDB item, when resolved, then defaults are returned and a debug warning is logged (no 500)
- Given `aggregation.learning_gap_threshold: 1.5` (out of `0.0–1.0`), then 400 `invalid_config_schema`
- Given `TENANT_CONFIG_TABLE` unset, when admin PUT then GET, then the in-memory override round-trips

---

## Constraints

- **Three-plane separation is mandatory** — tenant config (Plane 2) never contains secrets or infra config (Plane 1). Enforced by schema + reserved-key rejection, not convention.
- **All-optional overrides** — config is never required; the system must run correctly on `CODE_DEFAULTS` alone.
- **Data, not code** — no executable expressions in config. Safe-expression evaluation stays in the field-mapping transform layer.
- **Fail-open** — malformed/missing config degrades to defaults with a warning; it never returns 5xx or blocks a request.
- **No tenant self-service in v1.1** — config is admin-authored only.
- **Federated namespaces keep their loaders in v1.1** — `routing`/`subjects` wiring through this resolver is deferred to avoid decision-path regression; precedence (tenant-config wins) is documented but not yet enforced for those two.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Migrating `routing.json` / `subjects.json` reads to this resolver | Decision-path regression risk | v1.2 after regression suite |
| Migrating policy *rules* into tenant config | Policies have their own versioned store + admin API | Never (separate concern) |
| AWS Secrets Manager / SSM Parameter Store integration for Plane 1 | Pilot uses env vars; boundary defined now so graduation is non-breaking | Production hardening / paid GA |
| Tenant self-serve config portal | No identity platform in pilot | Admin platform |
| `GET .../resolved` merged-view endpoint | Debugging convenience | When onboarding volume grows |
| Per-environment config overlays (dev/stage/prod) | Single pilot env | Multi-env deploy |
| Config change webhooks / audit export | `updated_by` + version is sufficient for pilot | Compliance phase |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `adminApiKeyPreHandler` (`x-admin-api-key`) | `docs/specs/tenant-field-mappings.md`, `src/auth/admin-api-key-middleware.ts` | **Implemented** |
| DynamoDB TTL cache + stale-while-revalidate pattern | `src/decision/policy-loader.ts` (`loadRoutingConfigForOrg`) | **Implemented** — mirror |
| In-memory admin fallback pattern | `src/routes/admin-field-mappings.ts` | **Implemented** — mirror |
| `org_id` from auth context (not body) | `docs/specs/tenant-provisioning.md` | **Implemented** |
| AJV validation harness + `validate:schemas` | `package.json` (`ajv ^8.17.1`), `scripts/validate-schemas.ts` | **Implemented** |
| `PolicyRoutingConfig` type | `docs/specs/decision-engine.md`, `src/shared/types.ts` | **Implemented** — referenced, not redefined |
| Subject-config type + `loadSubjectConfigForOrg` | `docs/specs/urs-aggregation.md` | **Spec'd** — referenced |
| `aggregation.*` default constants | `docs/specs/urs-aggregation.md` § Concrete Values | **Spec'd** — source of `CODE_DEFAULTS.aggregation` |
| `TenantConfigTable` (DynamoDB) | `docs/specs/aws-deployment.md` | **GAP** — add table definition |
| `deepMerge` utility | `src/state/engine.ts` (existing) | **Implemented** — reuse |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `resolveTenantConfig(orgId)` | `docs/specs/urs-aggregation.md` (aggregation thresholds, gifted flag) |
| `features.*` flags | `docs/specs/decision-panel-ui.md` (gifted badge / gaps panel toggles) |
| Onboarding-via-config pattern | `docs/specs/tenant-provisioning.md` (provision script writes initial config) |
| Federated config namespace model | Future `routing`/`subjects`/`mappings` consolidation |

### Existing Solutions Check

| Option | Finding |
|--------|---------|
| **AJV + JSON Schema** | **Selected.** Already a dependency (`ajv ^8.17.1`) and wired into `validate:schemas`. No new validation lib (zod) needed. |
| **AWS Secrets Manager** | **Recommended for Plane 1 at GA** — automatic rotation + CloudTrail per-access audit ([intro](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html), [rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)). Not adopted in v1.1; env vars retained. |
| **SSM Parameter Store** | **Recommended for non-secret Plane 1 infra at GA** — free standard tier, hierarchical, versioned ([Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)); can reference Secrets Manager ([integration](https://docs.aws.amazon.com/secretsmanager/latest/userguide/integrating_parameterstore.html)). Not in v1.1. |
| **DynamoDB single-item-per-org** | **Selected for Plane 2** — consistent with `FieldMappingsTable` / `PoliciesTable`; per-org PK is hot-partition-free for low-throughput config ([partition-key best practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)). |
| **AWS AppConfig** | **Considered, deferred.** Purpose-built for feature flags + validated config rollout, but adds an external control plane and SDK; overkill for pilot. Revisit if config rollout/staged-deploy becomes a need. |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | Admin auth middleware (`x-admin-api-key`) |
| `missing_required_field` | Validation — `org_id` absent from path |

### New (add during implementation)

| Code | Description |
|------|-------------|
| `invalid_config_schema` | Body fails JSON Schema validation, contains a reserved/secret key, or `org_id` body≠path |
| `config_not_found` | `GET` admin endpoint when no override is stored for the org |
| `config_version_conflict` | `PUT` with `config_version` not greater than the stored version |

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| TCFG-001 | unit | Resolve with no override returns defaults | no stored config | `=== CODE_DEFAULTS` |
| TCFG-002 | unit | Override merges over defaults | `{ aggregation: { gifted_mastery_threshold: 0.9 } }` | that field 0.9, rest defaults |
| TCFG-003 | unit | Reserved key rejected (root) | `{ api_key: "x" }` | invalid, `invalid_config_schema` |
| TCFG-004 | unit | Reserved key rejected (nested) | `{ features: { secret_flag: true } }` | invalid (`secret`) |
| TCFG-005 | unit | Unknown top-level namespace rejected | `{ infra: {} }` | invalid (`additionalProperties:false`) |
| TCFG-006 | unit | Out-of-range threshold rejected | `{ aggregation: { learning_gap_threshold: 1.5 } }` | invalid |
| TCFG-007 | unit | Negative count rejected | `{ aggregation: { min_skills_for_gifted: -1 } }` | invalid |
| TCFG-008 | unit | Malformed stored item fails open | corrupt JSON | returns defaults, debug log, no throw |
| TCFG-009 | unit | Empty object is valid | `{}` | valid, resolves to defaults |
| TCFG-010 | contract | PUT then GET round-trips (in-memory, no table) | valid body | 200 then 200 with same override |
| TCFG-011 | contract | PUT org_id mismatch rejected | path `springs`, body `org_id:"acme"` | 400 `invalid_config_schema` |
| TCFG-012 | contract | GET with no stored config | unknown org | 404 `config_not_found` |
| TCFG-013 | contract | PUT non-increasing version rejected | stored v3, body v3 | 409 `config_version_conflict` |
| TCFG-014 | contract | PUT without admin key rejected | no `x-admin-api-key` | 401 `api_key_required` |
| TCFG-015 | integration | aggregation override flows to summary | set `gifted_mastery_threshold: 0.80`, seed skills 0.85 | learner now flagged gifted-interest |
| TCFG-016 | unit | Schema is valid + registered in validate:schemas | run validator | schema compiles, no error |

> **Test strategy:** TCFG-001–009, 016 are unit tests on the resolver/schema. TCFG-010–014 are contract tests via Fastify inject against the admin routes (in-memory fallback mode). TCFG-015 is an integration test proving Plane 2 overrides reach `urs-aggregation` behavior.

---

## Concrete Values Checklist

### Env vars (Plane 1)

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `TENANT_CONFIG_TABLE` | no | _(unset)_ | string | DynamoDB table for tenant config; unset → filesystem + in-memory fallback |
| `TENANT_CONFIG_PATH` | no | _(unset)_ | string | Filesystem override path for local dev; falls back to `policies/{orgId}/tenant-config.json` |
| `TENANT_CONFIG_CACHE_TTL_MS` | no | `60000` | number | TTL for the per-org resolver cache (matches policy cache default) |
| `TENANT_CONFIG_MAX_BODY_BYTES` | no | `65536` | number | Max admin PUT body size (64 KB) |
| `ADMIN_API_KEY` | yes (prod) | _(unset)_ | string | Existing — gate for admin config routes |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `RESERVED_SECRET_KEY_PATTERN` | `/(secret\|password\|token\|credential\|api_?key\|private_key\|cookie_secret\|_table\|_arn)/i` | Keys matching (any depth) are rejected |
| `THRESHOLD_MIN` / `THRESHOLD_MAX` | `0.0` / `1.0` | Valid range for score thresholds |
| `CONFIG_NAMESPACES` | `["features","aggregation","subjects","routing"]` | Closed set of allowed top-level namespaces |
| Default `config_version` (first write) | `1` | Monotonic integer |

> `CODE_DEFAULTS.aggregation.*` values are **not re-pinned here** — they are owned by and quoted from `docs/specs/urs-aggregation.md` § Concrete Values Checklist to avoid drift.

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Valid PUT | 200 | `application/json` | `x-admin-api-key` (request) |
| Schema/reserved-key/org mismatch | 400 | `application/json` | — |
| Missing admin key | 401 | `application/json` | — |
| GET with stored config | 200 | `application/json` | `x-admin-api-key` (request) |
| GET no stored config | 404 | `application/json` | — |
| Version conflict | 409 | `application/json` | — |

### Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| PUT | `/v1/admin/tenant-config/:org_id` | no (admin key) |
| GET | `/v1/admin/tenant-config/:org_id` | no (admin key) |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — config resolution is org-context based, not IP based.
- **CORS**: Admin endpoints are operator-only; same CORS posture as existing `/v1/admin/*` routes (no browser cross-origin use expected).
- **CSP / security headers**: N/A — JSON API, no HTML.
- **Cookie prefix vs Path scoping**: N/A — no cookies; auth via `x-admin-api-key` header.
- **Content-type parsing**: `application/json` only; admin PUT requires JSON body (Fastify default JSON parser).
- **Body size limits**: `TENANT_CONFIG_MAX_BODY_BYTES` default 64 KB — config documents are small; cap prevents abuse.
- **Rate-limit storage scope**: Admin routes are low-frequency, operator-only; rely on existing API Gateway usage-plan throttling. No per-route limiter added.
- **Error-code surface**: Only the three new codes + existing auth codes are user-visible. Validation errors return the failing JSON-path but never echo stored secrets (there are none) or stack traces.
- **Secret isolation (critical)**: The resolver imports no secret client and reads no `process.env` secret. Plane 1 values are unreachable from any tenant-config code path; reserved-key rejection prevents a malicious admin from staging a secret-shaped key into Plane 2.
- **Cache coherency**: TTL + stale-while-revalidate means a config change is visible within `TENANT_CONFIG_CACHE_TTL_MS` (default 60 s). Document this onboarding lag; a `clearTenantConfigCache()` test hook mirrors `clearRoutingConfigCache()`.

---

## Notes

- **Onboarding flow becomes:** `provision-tenant.ts` (identity + key, Plane 1) → `PUT /v1/admin/tenant-config/:org_id` (business rules, Plane 2). No source edit, no redeploy to tune a client.
- **`urs-aggregation.md` integration:** its pinned constants become `CODE_DEFAULTS.aggregation`; the aggregation/gifted code reads `resolveTenantConfig(orgId).aggregation.*` instead of module constants. A note is added to that spec pointing its constants at this override namespace.
- **Graduation path for secrets:** when moving Plane 1 to AWS, credentials → Secrets Manager (rotation + CloudTrail), non-secret infra → Parameter Store, and the app gains one secret-retrieval helper — the Plane 2 boundary defined here is unchanged.

---

*Spec created: 2026-06-04 | Phase: v1.1 (onboarding + configurability) | Depends on: tenant-field-mappings.md (admin pattern), decision-engine.md (routing type + cache pattern), urs-aggregation.md (aggregation defaults), aws-deployment.md (table — GAP). Recommended next: `/plan-impl docs/specs/tenant-config.md`*
