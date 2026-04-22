# Ingestion Preflight (Forbidden-Key Categorization + Dry-Run Endpoint)

> Split the global `FORBIDDEN_KEYS` set into **PII** and **semantic** categories, and expose a `POST /v1/admin/ingestion/preflight` dry-run endpoint that solutions/CS can run against a raw customer sample during pilot intake. Catches forbidden-semantic hits **before** a live feed is enabled, points operators at the tenant field-mapping escape hatch, and keeps PII rejection non-negotiable.

## Overview

`src/ingestion/forbidden-keys.ts` currently conflates two independent concerns in a single `FORBIDDEN_KEYS` set (the file comment at lines 10–16 acknowledges this but treats them identically at runtime):

| Category | Examples | Purpose of the gate | Correct resolution path |
|----------|----------|---------------------|-------------------------|
| **PII** (CEO directive 2026-02-24, `DEF-DEC-008-PII`) | `firstName`, `email`, `phone`, `dob`, `address`, `ssn`, … | Prevent personal data from ever entering STATE or receipts. Non-negotiable. | Remove the key from the source export. Never map. |
| **Semantic / workflow coupling** | `score`, `grade`, `completion`, `status`, `course`, `module`, `ui`, `workflow`, … | Prevent architectural coupling to vendor concepts in the **canonical** payload layer. | Register a tenant field mapping (`docs/specs/tenant-field-mappings.md`) that transforms the raw key into a canonical one (e.g. `masteryScore = submission.score / submission.total`). |

Because both categories reject with the same `forbidden_semantic_key_detected` error and run **before** the tenant mapping layer (`src/ingestion/handler-core.ts:91` → `:114`), a school's raw LMS export with top-level `score: 85` is rejected with no signal to CS that a mapping would have resolved it cleanly. During Springs pilot intake, this shows up as a silent blocker: the integration engineer sees a generic rejection and cannot tell whether the field is PII (remove it) or semantic (map it).

This spec does three surgical things:

1. **Refactor** `forbidden-keys.ts` to split the set into `FORBIDDEN_PII_KEYS` and `FORBIDDEN_SEMANTIC_KEYS`, export both, keep `FORBIDDEN_KEYS` as a union for backward compatibility, and extend `detectForbiddenKeys` to report which category fired. **Zero behavior change in live ingestion.**
2. **Add** `POST /v1/admin/ingestion/preflight`, a read-only dry-run endpoint that accepts a raw sample payload (plus optional `org_id` + `source_system`) and returns `{ forbidden_pii[], forbidden_semantic[], mapping_suggestions[] }` without writing, applying idempotency, or persisting anything. Auth: `ADMIN_API_KEY` (same model as `docs/specs/policy-management-api.md`).
3. **Add** one gate to `internal-docs/pilot-operations/pilot-readiness-definition.md` § Integration: "Raw sample payload preflight passes (no unresolved `forbidden_semantic` hits after mapping)." This is the new Solutions Engineering acceptance criterion before a pilot feed is enabled.

What this is **not**: a per-tenant semantic-key allowlist, a relaxation of PII rejection, or any change to live `POST /v1/signals` behavior. The mapping layer remains the only escape hatch for legitimate raw shapes.

---

## Requirements

### Functional

#### Forbidden-key categorization (zero live-behavior change)

- [ ] `src/ingestion/forbidden-keys.ts` exports three constants:
  - `FORBIDDEN_PII_KEYS: Set<string>` — exactly the PII keys currently at lines 58–86 (`firstName`, `lastName`, `first_name`, `last_name`, `fullName`, `full_name`, `email`, `emailAddress`, `email_address`, `phone`, `phoneNumber`, `phone_number`, `ssn`, `social_security`, `socialSecurity`, `birthdate`, `birthday`, `birth_date`, `date_of_birth`, `dateOfBirth`, `dob`, `address`, `streetAddress`, `street_address`, `zipCode`, `zip_code`, `postalCode`, `postal_code`).
  - `FORBIDDEN_SEMANTIC_KEYS: Set<string>` — exactly the non-PII keys currently at lines 20–56 (`ui`, `screen`, `view`, `page`, `route`, `url`, `link`, `button`, `cta`, `workflow`, `task`, `job`, `assignment`, `assignee`, `owner`, `status`, `step`, `stage`, `completion`, `progress_percent`, `course`, `lesson`, `module`, `quiz`, `score`, `grade`, `content_id`, `content_url`).
  - `FORBIDDEN_KEYS: Set<string>` — union `new Set([...FORBIDDEN_PII_KEYS, ...FORBIDDEN_SEMANTIC_KEYS])`. Existing import sites must compile unchanged.
- [ ] `detectForbiddenKeys(obj, basePath)` signature extended to return `ForbiddenKeyResult | null` where `ForbiddenKeyResult` now includes `category: 'pii' | 'semantic'` in addition to the existing `key` + `path`. The category is resolved by set membership of the matched `key`.
- [ ] `handler-core.ts:91`–`:114` continues to call `detectForbiddenKeys` on the raw payload **before** tenant mapping and continues to reject with `FORBIDDEN_SEMANTIC_KEY_DETECTED` (no new error code surfaced to callers — the v1 live behavior is preserved; category is used internally for logging and by the preflight endpoint).
- [ ] Structured log line emitted on rejection SHOULD include `forbidden_key_category: "pii" | "semantic"` so operator dashboards can distinguish.

#### Preflight endpoint

- [ ] `POST /v1/admin/ingestion/preflight` registered on the admin route scope (same scope as `src/routes/admin-field-mappings.ts`). Auth: `x-admin-api-key` matching `ADMIN_API_KEY` env; enforced by the existing `adminApiKeyPreHandler`.
- [ ] Request body shape:
  ```json
  {
    "org_id": "springs",            // optional; enables post-mapping analysis
    "source_system": "canvas-lms",  // optional; required if org_id is set
    "payload": { "...": "..." }     // required; the raw sample to inspect
  }
  ```
- [ ] Endpoint performs **only** static analysis + (optional) mapping simulation. It MUST NOT:
  - call `validateSignalEnvelope` (this is a payload-only inspection, not a full envelope),
  - call `checkAndStore` (no idempotency touch),
  - call `appendSignal` or `appendIngestionOutcome` (no writes),
  - call `applySignals` or `evaluateState` (no state / decision side effects).
- [ ] Response body shape (HTTP 200, always, when auth + request shape are valid):
  ```json
  {
    "preflight_id": "pf_<ulid>",        // stable id for log correlation
    "received_at": "<iso8601>",
    "forbidden_pii": [                  // hits in raw payload
      { "key": "email", "path": "payload.learner.email" }
    ],
    "forbidden_semantic_raw": [         // hits in raw payload
      { "key": "score", "path": "payload.submission.score" }
    ],
    "forbidden_semantic_after_mapping": [   // hits after simulated mapping; null if no mapping simulated
      // empty array if mapping resolves all semantic hits; null if org_id/source_system absent or mapping not found
    ],
    "mapping_suggestions": [
      {
        "raw_key": "score",
        "raw_path": "payload.submission.score",
        "suggested_canonical": "masteryScore",
        "rationale": "Most-common canvas-lms mapping: masteryScore = submission.score / submission.total. See docs/specs/tenant-field-mappings.md § Canvas template.",
        "source": "static-catalog"
      }
    ],
    "verdict": "clean" | "pii_blocking" | "semantic_blocking" | "semantic_resolvable_by_mapping"
  }
  ```
- [ ] When `org_id` + `source_system` are provided and a mapping exists (`resolveTenantPayloadMappingForIngest`), the endpoint simulates mapping in-memory by calling `normalizeAndValidateTenantPayload({ orgId, payload, mappingOverride })` with the resolved mapping, then re-runs `detectForbiddenKeys` against the **normalized** payload and reports remaining semantic hits in `forbidden_semantic_after_mapping`. Mapping simulation MUST NOT mutate the caller's payload and MUST NOT write to DynamoDB.
- [ ] When `org_id` + `source_system` are provided but **no mapping exists**, `forbidden_semantic_after_mapping: null` and the response MAY include a `note` field pointing to `PUT /v1/admin/mappings/:org_id/:source_system`.
- [ ] `mapping_suggestions[]` is populated from a **static catalog** keyed on raw key name (see § Mapping Suggestion Catalog). No LLM, no fuzzy matching in v1; the suggestion is advisory only and maps 1:1 from raw key → canonical key. Unknown raw semantic keys produce no suggestion (empty array entry omitted), not an error.
- [ ] `verdict` rules (evaluated in order):
  1. `forbidden_pii.length > 0` → `"pii_blocking"`.
  2. `forbidden_semantic_raw.length === 0` → `"clean"`.
  3. `forbidden_semantic_after_mapping !== null && .length === 0` → `"semantic_resolvable_by_mapping"`.
  4. Otherwise → `"semantic_blocking"`.
- [ ] Bad input handling:
  - Body not a JSON object, missing `payload`, or `payload` not an object → `400`, `payload_not_object` (existing `ErrorCodes.PAYLOAD_NOT_OBJECT`).
  - `org_id` present without `source_system` (or vice versa) → `400`, new code `preflight_missing_scope_pair` (see § Error Codes).
  - Body larger than the preflight-specific limit (§ Concrete Values) → `413`, `request_too_large` (existing code).
- [ ] Missing / invalid `x-admin-api-key` → `401`, `admin_key_required` (existing code; enforced by `adminApiKeyPreHandler`, not this handler).

### Acceptance Criteria

- Given a raw payload `{ "learner": { "email": "a@b.c" }, "submission": { "score": 85, "total": 100 } }` submitted to preflight with no `org_id`, when the endpoint runs, then response has `forbidden_pii: [{ key: "email", path: "payload.learner.email" }]`, `forbidden_semantic_raw: [{ key: "score", path: "payload.submission.score" }]`, `forbidden_semantic_after_mapping: null`, `verdict: "pii_blocking"`.
- Given the same payload with `org_id: "springs"` and `source_system: "canvas-lms"` and a mapping that computes `masteryScore = submission.score / submission.total`, when preflight runs, then after removing the PII `email` the verdict would change: the `forbidden_semantic_after_mapping` array includes `score` only if the mapping does NOT canonicalize it (so the operator sees the truth); with the correct mapping it is empty and `verdict === "semantic_resolvable_by_mapping"` if PII still present, or `"clean"` after PII is removed.
- Given a payload with only `{ "learner_reference": "abc", "data": { "x": 1 } }`, when preflight runs, then `forbidden_pii: []`, `forbidden_semantic_raw: []`, `verdict: "clean"`.
- Given a preflight request, when it completes, then `appendIngestionOutcome` is NOT called, `appendSignal` is NOT called, `checkAndStore` is NOT called, and no DynamoDB `PutItem` is issued.
- Given live `POST /v1/signals` traffic before and after this refactor is deployed, when identical payloads are sent, then the rejection reason and status code are bit-identical (regression guarantee: existing `forbidden-keys` contract tests unchanged).
- Given a request with valid tenant API key but no admin key, when it hits `POST /v1/admin/ingestion/preflight`, then response is `401` `admin_key_required` and the handler is not invoked.

---

## Constraints

- **Zero change to live ingestion rejection contract.** Error code surfaced to `POST /v1/signals` callers remains `forbidden_semantic_key_detected`. Category split is observable in logs and in the preflight response only.
- **No per-tenant semantic-key allowlist.** Tempting for unblocking pilots, but premature: it creates a quiet path that could later leak PII-adjacent fields. The mapping layer is the correct escape hatch.
- **No new mapping storage.** The preflight endpoint reuses `resolveTenantPayloadMappingForIngest`; it does not read or write any new DynamoDB table.
- **Admin-only.** The endpoint reveals the forbidden-key catalog by shape. Keeping it behind `ADMIN_API_KEY` avoids giving potential attackers a free "what keys does 8P3P reject?" enumeration surface. Catalog secrecy is not a real security boundary, but there is also no pilot-customer use case for self-serve preflight in v1 — CS / Solutions runs it during intake.
- **Static catalog for mapping suggestions.** No LLM, no fuzzy match, no learning. v1 ships with a small catalog (Canvas + I-Ready + Branching Minds keys) and expands by PR, not by heuristic.
- **No call-through to `/v1/signals`.** The preflight endpoint MUST NOT internally `POST` to the ingestion route or invoke `handleSignalIngestionCore`. It re-uses `detectForbiddenKeys` + `normalizeAndValidateTenantPayload` directly to avoid accidentally triggering side effects.

---

## Out of Scope

- LLM- or heuristic-driven mapping suggestions (v2 if pilot demand justifies it).
- A customer-facing preflight endpoint under `/v1` (non-admin) — if a pilot customer wants self-serve preflight, revisit after Springs goes live.
- Per-org semantic-key allowlist or soft-warn mode — see rationale above.
- Batch preflight (multi-payload one-request) — a single sample is the documented CS workflow per `internal-docs/pilot-operations/pilot-readiness-definition.md`.
- A corresponding CLI wrapper (`scripts/preflight-sample.mjs`). Nice-to-have; can ship as a follow-up using the same helper module pattern as `scripts/lib/preflight-policies.mjs` (`docs/specs/seed-preflight-policy-check.md`). Not required for the readiness gate.

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `detectForbiddenKeys()` + `FORBIDDEN_KEYS` | `src/ingestion/forbidden-keys.ts`, spec'd in `docs/specs/signal-ingestion.md` §Forbidden keys | Implemented ✓ (refactor target of this spec) |
| `normalizeAndValidateTenantPayload({ orgId, payload, mappingOverride })` | `src/config/tenant-field-mappings.ts:143`; spec `docs/specs/tenant-field-mappings.md` | Implemented ✓ |
| `resolveTenantPayloadMappingForIngest(orgId, sourceSystem)` | `src/config/tenant-field-mappings.ts:102` | Implemented ✓ |
| `adminApiKeyPreHandler` + `ADMIN_API_KEY` env | `docs/specs/policy-management-api.md` § Auth | Implemented ✓ |
| Admin route registration scope (`/v1/admin` prefix) | `src/routes/admin-field-mappings.ts`, `src/server.ts` | Implemented ✓ |
| `ForbiddenKeyResult` type (extended with `category`) | `src/shared/types.ts` | Extend in this spec |

### Checked External Solutions

Per `.cursor/rules/prefer-existing-solutions/RULE.md`:

- **Node `fetch` / `undici`** — N/A; this is a server-registered Fastify route, not a CLI call.
- **JSON Schema validator (`ajv`)** — already used by `validateSignalEnvelope`. Not needed for preflight request body (two-or-three-key shape validated inline; using Ajv would add a schema file without reducing surface).
- **Existing `detectForbiddenKeys` recursive walker** — reused as-is. A second traversal library (`traverse`, `flat`) is unnecessary: the existing function is 35 lines, already tested, and produces stable `path` strings used elsewhere.
- **`normalizeAndValidateTenantPayload` with `mappingOverride`** — designed to accept an explicit mapping (see `src/config/tenant-field-mappings.ts:143–150`), which is exactly the reuse-shape needed for dry-run simulation. No new function required.

### Provides to Other Specs / Systems

| Capability | Used By |
|-----------|---------|
| `POST /v1/admin/ingestion/preflight` | `internal-docs/pilot-operations/pilot-readiness-definition.md` § Integration gate (new row); CS/Solutions during pilot intake; future `scripts/preflight-sample.mjs` CLI |
| Exported `FORBIDDEN_PII_KEYS` / `FORBIDDEN_SEMANTIC_KEYS` | `docs/specs/pilot-research-export.md` (PII scrubber can reuse the PII set as its canonical list); future FERPA redaction layers |
| `ForbiddenKeyResult.category` field | Structured log consumers; future `GET /v1/admin/ingestion/rejections?category=pii` (not in scope) |

---

## Mapping Suggestion Catalog (v1 static)

A small JSON table, shipped in source at `src/ingestion/mapping-suggestions-catalog.ts`. Structure:

```ts
export interface MappingSuggestion {
  raw_key: string;                  // matches forbidden-semantic key
  suggested_canonical: string;      // canonical field name
  rationale: string;                // one-line operator-facing explanation
  applies_to_source_systems: string[] | '*'; // e.g. ['canvas-lms'], or '*' for universal
}
```

v1 seed entries (expand by PR, not by heuristic):

| `raw_key` | `suggested_canonical` | `applies_to_source_systems` | Rationale |
|-----------|----------------------|-----------------------------|-----------|
| `score` | `masteryScore` | `['canvas-lms']` | Canvas submission.score ÷ submission.total → masteryScore ∈ [0,1] |
| `grade` | `masteryScore` | `['canvas-lms']` | Letter/numeric grade normalization required; operator picks scheme |
| `completion` | `stabilityScore` | `['i-ready']` | I-Ready lesson completion is a proxy for mastery stability |
| `progress_percent` | `stabilityScore` | `['i-ready', 'branching-minds']` | Percent-complete → [0,1] stability |
| `status` | — | `*` | **No suggestion** — operator must decide semantic meaning; preflight flags but does not auto-map |

Keys with no catalog entry produce no suggestion (empty suggestion list for that hit). The `verdict` logic does not depend on the catalog; it depends only on post-mapping detection.

---

## Error Codes

### Existing (reuse)

| Code | Source | Where used in preflight |
|------|--------|-------------------------|
| `payload_not_object` | `src/shared/error-codes.ts:29` | Missing or non-object `payload` in preflight body |
| `request_too_large` | `src/shared/error-codes.ts:41` | Preflight body exceeds § Concrete Values limit |
| `admin_key_required` | `src/shared/error-codes.ts:144` | Missing / invalid `x-admin-api-key` (enforced by preHandler, not this handler) |

### New (add during implementation)

| Code | Description |
|------|-------------|
| `preflight_missing_scope_pair` | Preflight request includes `org_id` but not `source_system`, or vice versa. Both or neither must be present. |

> Note: `forbidden_semantic_key_detected` is **not** returned by the preflight endpoint. Preflight always responds `200` on a well-formed request; the forbidden-key hits are data in the response body, not an error.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| INGEST-PREFLIGHT-001 | Clean payload, no scope | `{ payload: { learner_reference: 'x', data: {} } }` | 200; `forbidden_pii: []`, `forbidden_semantic_raw: []`, `forbidden_semantic_after_mapping: null`, `verdict: "clean"` |
| INGEST-PREFLIGHT-002 | PII detected at depth | `{ payload: { learner: { email: 'a@b.c' } } }` | 200; `forbidden_pii: [{ key: 'email', path: 'payload.learner.email' }]`, `verdict: "pii_blocking"` |
| INGEST-PREFLIGHT-003 | Semantic key, no mapping provided | `{ payload: { submission: { score: 85 } } }` (no `org_id`) | 200; `forbidden_semantic_raw: [{ key: 'score', path: 'payload.submission.score' }]`, `forbidden_semantic_after_mapping: null`, `mapping_suggestions: [{ raw_key: 'score', suggested_canonical: 'masteryScore', ... }]`, `verdict: "semantic_blocking"` |
| INGEST-PREFLIGHT-004 | Semantic key resolved by existing mapping | mapping for `(springs, canvas-lms)` defines `masteryScore = submission.score / submission.total`; `{ org_id: 'springs', source_system: 'canvas-lms', payload: { submission: { score: 85, total: 100 } } }` | 200; `forbidden_semantic_raw: [{ key: 'score', ... }]`, `forbidden_semantic_after_mapping: []` (mapping added `masteryScore` — the `score` key is still present but is a raw-layer concern; see test strategy note), `verdict: "semantic_resolvable_by_mapping"` |
| INGEST-PREFLIGHT-005 | Both PII and semantic — PII precedence | `{ payload: { email: 'a@b.c', score: 5 } }` | 200; both arrays populated; `verdict: "pii_blocking"` |
| INGEST-PREFLIGHT-006 | `org_id` without `source_system` | `{ org_id: 'springs', payload: {} }` | 400; `preflight_missing_scope_pair` |
| INGEST-PREFLIGHT-007 | No admin key → 401 | Request without `x-admin-api-key` | 401; `admin_key_required`; handler not invoked |
| INGEST-PREFLIGHT-008 | Tenant key, no admin key → 401 | Valid `x-api-key`, no `x-admin-api-key` | 401; `admin_key_required` |
| INGEST-PREFLIGHT-009 | `payload` missing or not object | `{ payload: "not an object" }` | 400; `payload_not_object` |
| INGEST-PREFLIGHT-010 | Body size limit | `{ payload: <50 KB JSON> }` | 413; `request_too_large` |
| INGEST-PREFLIGHT-011 | **No side effects** — signal log unchanged | Any valid preflight request | `appendSignal`, `appendIngestionOutcome`, `checkAndStore` spies have `.calls.length === 0`; no DynamoDB `PutItem` issued |
| INGEST-PREFLIGHT-012 | Scope pair with no mapping in store | `{ org_id: 'new-pilot', source_system: 'custom-lms', payload: { score: 1 } }`; no mapping exists | 200; `forbidden_semantic_after_mapping: null`; response includes `note` field referencing `PUT /v1/admin/mappings/:org_id/:source_system` |
| FORBIDDEN-KEYS-SPLIT-001 | Exports `FORBIDDEN_PII_KEYS` with expected membership | import from `src/ingestion/forbidden-keys.ts` | Set contains all 27 PII keys listed in § Requirements; contains **zero** semantic keys |
| FORBIDDEN-KEYS-SPLIT-002 | Exports `FORBIDDEN_SEMANTIC_KEYS` with expected membership | import | Set contains all 28 semantic keys; contains **zero** PII keys |
| FORBIDDEN-KEYS-SPLIT-003 | `FORBIDDEN_KEYS` = union (backward compat) | import | `.size === FORBIDDEN_PII_KEYS.size + FORBIDDEN_SEMANTIC_KEYS.size`; contains every member of both subsets |
| FORBIDDEN-KEYS-SPLIT-004 | `detectForbiddenKeys` returns category | call with `{ email: 'x' }` | Returns `{ key: 'email', path: 'payload.email', category: 'pii' }` |
| FORBIDDEN-KEYS-SPLIT-005 | Live ingestion regression | Existing `signal-ingestion.test.ts` suite | All tests pass unchanged; `forbidden_semantic_key_detected` still returned with same shape on forbidden-key hit |

> **Test strategy note:** INGEST-PREFLIGHT-001..012 are integration tests against the Fastify app (same pattern as `tests/contracts/admin-field-mappings.test.ts`), using `AdminFunction`'s route scope with `ADMIN_API_KEY` set in test env. FORBIDDEN-KEYS-SPLIT-001..005 are unit tests in `tests/unit/forbidden-keys.test.ts` (new file). The test in INGEST-PREFLIGHT-004 documents the v1 choice that `forbidden_semantic_after_mapping` reports hits against the **normalized** payload (which still contains the raw key alongside the new canonical key, since `normalizeAndValidateTenantPayload` is non-destructive per `tenant-field-mappings.md` § alias normalization). Operators reading the verdict get the right answer; readers of the raw arrays need to understand mappings are additive. If we later decide that should change, it is a spec edit here, not a behavior drift.

---

## Concrete Values Checklist

### Wire formats / signed payloads

N/A — no signed payloads; this is a plain admin POST with JSON in / JSON out.

### HTTP behavior

| Transition | Method | Path | Status | Content-Type | Required headers |
|------------|--------|------|--------|--------------|------------------|
| Successful preflight (any verdict) | POST | `/v1/admin/ingestion/preflight` | 200 | `application/json` | — |
| Malformed body (`payload` missing / not object) | POST | `/v1/admin/ingestion/preflight` | 400 | `application/json` | — |
| Scope pair incomplete | POST | `/v1/admin/ingestion/preflight` | 400 | `application/json` | — |
| Body too large | POST | `/v1/admin/ingestion/preflight` | 413 | `application/json` | — |
| Missing / invalid admin key | POST | `/v1/admin/ingestion/preflight` | 401 | `application/json` | — |

### Cookies

N/A — admin API does not use cookies.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `ADMIN_API_KEY` | yes (in pilot/prod) | `undefined` | string | Admin key required for all `/v1/admin/*` routes including preflight. If unset, admin routes are 401 closed (existing behavior). |
| `PREFLIGHT_MAX_BODY_BYTES` | no | `32768` (32 KB) | number | Override for preflight-only body size cap. Separate from the ingestion-wide body cap because preflight is human-driven, low-volume, and benefits from a tighter default. |
| `FIELD_MAPPINGS_TABLE` | conditional | `undefined` | string | Existing env; when set, mapping simulation reads from DynamoDB via `resolveTenantPayloadMappingForIngest`. No new env introduced. |
| `TENANT_FIELD_MAPPINGS_PATH` | conditional | `undefined` | string | Existing env; file-backed mapping fallback used by mapping simulation. No new env introduced. |

### Constants / limits

- **Preflight body size limit**: `32 KB` by default (`PREFLIGHT_MAX_BODY_BYTES`). Rationale: a single raw LMS sample from Canvas or I-Ready is typically < 4 KB; 32 KB gives 8× headroom without opening an enumeration surface.
- **Recursion depth for `detectForbiddenKeys`**: bounded by existing function (no explicit cap; JS stack limit applies). Acceptable for 32 KB payloads.
- **Rate limit**: none in v1 (admin-only endpoint, `ADMIN_API_KEY` auth, human-driven). If abuse emerges, reuse the v1.1 tenant-provisioning rate-limit primitive (`docs/specs/tenant-provisioning.md`) on the admin scope.
- **Preflight ID format**: `pf_<ulid>` — 26-char ULID prefixed with `pf_`, generated server-side. Not persisted; returned purely for log correlation.

### Routes registered

| Method | Path | Auth exempt? | Auth required |
|--------|------|--------------|---------------|
| POST | `/v1/admin/ingestion/preflight` | no | `x-admin-api-key` |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: Unchanged from `docs/specs/api-key-middleware.md`; preflight relies on the same Fastify instance, so whatever `trustProxy` setting is active for admin routes applies here. `request.ip` is not used in preflight logic; no new requirement.
- **CORS**: N/A — admin endpoints are 8P3P-internal. No cross-origin browser caller is supported. Matches existing admin route policy (`src/routes/admin-field-mappings.ts`).
- **CSP / security headers**: N/A — endpoint returns JSON; no HTML, no inline scripts.
- **Cookie prefix vs Path scoping**: N/A — no cookies.
- **Content-type parsing**: Request parsed as `application/json` via Fastify's built-in JSON body parser (already registered in `src/server.ts`). No new plugin required. Non-JSON bodies return Fastify's default 400.
- **Body size limits**: Preflight-specific cap of 32 KB (see § Constants). If the global Fastify `bodyLimit` is lower, the lower value wins; implementation must inspect and honor both.
- **Rate-limit storage scope**: N/A in v1 (no rate limit). Note for v1.1: when tenant-provisioning rate limiting is applied to admin scope, preflight should be counted under the same `admin_*` bucket as policy CRUD.
- **Error-code surface**: Response bodies contain the raw key name and `path` string for each hit (e.g. `payload.learner.email`). Operators need these to fix the customer's export. No DynamoDB schema, stack traces, or internal table names leak. Mapping simulation errors (e.g. invalid expression in stored mapping) are caught, logged, and surfaced as `{ mapping_error: "<message>" }` in the response body — not raised to 500.
- **Side-effect isolation**: The single most important correctness property. Reviewers and test writers must verify that INGEST-PREFLIGHT-011 spies on `appendSignal`, `appendIngestionOutcome`, `checkAndStore`, and the DynamoDB mock and assert zero calls. A regression here (e.g. a copy-paste from `handleSignalIngestionCore`) is the most likely way this endpoint gets dangerous.

---

## Notes

- **Why admin-only, not a public `/v1/*` endpoint?** The pilot workflow runs this from CS during intake; there is no customer-facing self-serve story in v1. Admin auth also avoids a free enumeration surface for the forbidden-key catalog. When/if a post-pilot customer needs self-serve preflight, a `POST /v1/ingestion/preflight` variant can be added that reuses this handler's core logic with tenant-key auth.
- **Why don't we mutate payloads during mapping simulation?** `normalizeAndValidateTenantPayload` is already non-destructive (`docs/specs/tenant-field-mappings.md` § alias normalization: "Normalization only *adds* canonical fields"). Simulation inherits that property for free. The semantic gate running on the raw `score` key is the desired behavior at ingestion time — preflight tells the operator it would fire, and the operator registers the mapping so the **canonical** payload is clean.
- **Why static mapping-suggestions catalog instead of heuristics?** Static is reviewable, testable, and cannot drift. The rationale strings are written for operators, not for models. The catalog grows via PR as new source systems come online — exactly when a human is already writing the template.
- **Pilot readiness gate addition (separate edit).** This spec triggers a one-row edit to `internal-docs/pilot-operations/pilot-readiness-definition.md` § Integration: "Raw sample payload preflight passes (no unresolved `forbidden_semantic` hits after mapping)." That edit is out of scope for the code-side plan and is better bundled with the § Customer Readiness edits described in Untitled-1 step 6. It's called out here so the `/plan-impl` task list can include a single doc-touch task to add the gate row at the same time the endpoint ships.
- **Relation to `docs/specs/seed-preflight-policy-check.md`.** That spec names a CLI-side "preflight" for policy presence. This spec names a server-side preflight for payload shape. They are complementary and share the naming convention intentionally: both run before a pilot feed is trusted. Neither depends on the other.

---

**Next step**: `/plan-impl docs/specs/ingestion-preflight.md`
