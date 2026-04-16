# Seed Script Pre-Flight Policy Check

> A pre-flight check in seed scripts that verifies the target org has at least one active policy in DynamoDB before sending signals, to prevent pilot data from silently being evaluated against the `global` default policy fallback.

## Overview

Seed scripts (currently `scripts/seed-springs-demo.mjs`) POST signals on behalf of a target org (e.g. `springs`) and rely on the decision engine to evaluate them. Today the decision engine resolves policy via a three-candidate chain (`src/decision/policy-loader.ts:244-259`):

1. `(org_id=<target>, policy_key=<userType>)`
2. `(org_id=<target>, policy_key='default')`
3. `(org_id='global', policy_key='default')`

When a target org has no policies of its own, candidate 3 silently wins. Decisions are produced, seeded data looks correct, and no error is surfaced — but the decisions were computed against the global defaults, not the tenant's intended rules. This is acceptable for the generic demo org (`org_demo`, now retired) but becomes a silent correctness risk once pilots start uploading custom policies: a misconfigured seed run against the wrong org (typo, stale CLI arg, forgotten admin upload) will produce "successful" seed output that is actually evaluating against global defaults.

This spec defines a lightweight pre-flight step in seed scripts that calls the admin list endpoint, detects the fallback condition explicitly, and surfaces it to the operator. The check is advisory by default (warn + continue) to preserve today's "quickstart" UX, and strict on demand (`--strict-policies`) for CI and pilot-sign-off runs.

---

## Requirements

### Functional

- [ ] Before Phase 1 (mapping registration), seed scripts invoke a pre-flight check that calls `GET /v1/admin/policies?org_id=<target_org>` using the admin key already parsed by the script.
- [ ] If the response lists ≥ 1 policy with `status: "active"`, the script prints a confirmation line (`✓ Policies: N active for org=<target_org>`) and proceeds.
- [ ] If the response lists 0 active policies, the script warns that the decision engine will fall back to `(global, default)` and names the source file (`src/decision/policy-loader.ts:252`) so the operator can verify behavior intentionally.
- [ ] When `--strict-policies` CLI flag or `STRICT_POLICIES=1` env var is set, the 0-policy case aborts with exit code `3` instead of warning.
- [ ] When no admin key is provided (same condition that already skips Phase 1 mapping registration), the pre-flight check is skipped with a single informational line — never fails.
- [ ] If the admin endpoint returns `401` or is unreachable, the script fails with exit code `4` and prints the endpoint URL + HTTP status / error code. It does not silently continue.
- [ ] The pre-flight check is implemented as a reusable helper (ES module) so future seed scripts can import it without re-implementing the logic.

### Acceptance Criteria

- Given an org with active policies in DynamoDB, when the seed script runs, then the pre-flight prints `✓ Policies: N active for org=<org>` and Phase 1 proceeds normally.
- Given an org with zero policies in DynamoDB and default mode, when the seed script runs, then the pre-flight prints the fallback warning and Phase 1 proceeds; the script exits `0` if subsequent phases succeed.
- Given an org with zero policies in DynamoDB and `--strict-policies` is set, when the seed script runs, then the script aborts before Phase 1 with exit code `3` and a message identifying the missing org.
- Given `ADMIN_API_KEY` is not set and `--admin-key` is not passed, when the seed script runs, then the pre-flight prints `⊝ Policies: skipped (no admin key)` and execution continues into Phase 2 (Phase 1 is already skipped today).
- Given `ADMIN_API_KEY` is invalid, when the seed script runs, then the pre-flight prints `✗ Policies: 401 at GET /v1/admin/policies?org_id=<org>` and exits `4`.
- Given the server is not running, when the seed script runs, then the pre-flight prints `✗ Policies: ECONNREFUSED at <base>/v1/admin/policies` and exits `4` (same behavior as existing Phase 2 connection-refused handler for consistency).

---

## Constraints

- **No new server endpoints.** The check uses `GET /v1/admin/policies?org_id=<org>` which already exists (`src/admin/policy-management-routes.ts:207`) and strictly `Query`s on PK — returns empty array for orgs with no policies, so the empty-vs-fallback distinction is observable.
- **No changes to `/v1/policies` (tenant-facing inspection API).** That endpoint's response includes the `global` fallback without marking it as such; fixing that is out of scope and would require a response-shape change affecting the dashboard.
- **No changes to decision-engine fallback behavior.** The global-default fallback in `policy-loader.ts` stays intact — the check only *observes* and *reports*.
- **CLI-only concern.** No impact on Lambda bundles, Fastify routes, or dashboard.
- **Node standard library + `fetch`.** No new npm dependencies; must remain an ES module (`.mjs`) runnable with `node` directly, matching the existing `seed-springs-demo.mjs` pattern.

## Out of Scope

- Extending `GET /v1/policies` response to flag fallback-sourced policies (separate spec if needed).
- Auto-uploading a default org policy when none exists (seed scripts are demos, not provisioning tools — that belongs in `docs/specs/tenant-provisioning.md`).
- Validating the *contents* of returned policies (rule counts, default decision type) — presence is sufficient.
- Applying the check to `validate-policy.ts` or `upload-policy.ts` (those are single-operation CLIs, not bulk seeders).
- Retrying on transient failures — fail-fast is preferred for a demo/pilot script.

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `GET /v1/admin/policies` endpoint + response shape | `docs/specs/policy-management-api.md` | Defined ✓ |
| Admin API-key header (`x-admin-api-key`) auth | `docs/specs/policy-management-api.md` | Defined ✓ |
| Three-candidate policy resolution chain (target of the check) | `src/decision/policy-loader.ts:244-259` (code), referenced in `docs/specs/policy-inspection-api.md` | Defined ✓ |
| `listPolicies(orgId)` strict-query behavior (empty array when org has no policies) | `src/admin/policies-dynamodb.ts:253-270` | Defined ✓ |

### Checked External Solutions

Per `.cursor/rules/prefer-existing-solutions/RULE.md`:

- **Node built-in `fetch`** — already used by both seed scripts and `upload-policy.ts`. No new HTTP client dependency needed.
- **No generic CLI "health-check" library considered** — one fetch + one JSON parse + two branches is smaller than any library surface; adding a dep (`ky`, `undici`, `axios`, `yargs`) would increase complexity without benefit.
- **Fastify `@fastify/sensible` / `healthcheck` plugins** — server-side; not applicable to a CLI caller.

### Provides to Other Specs

| Function / Module | Used By |
|-------------------|---------|
| `checkOrgPolicies({ base, adminKey, org, strict })` (exported from `scripts/lib/preflight-policies.mjs`) | `scripts/seed-springs-demo.mjs`, future seed scripts, optionally `scripts/upload-policy.ts` in a `--verify-existing` mode (future) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `policy_not_found` | `src/shared/error-codes.ts:95` — surfaced by `GET /v1/policies/:policy_key` but NOT by list endpoint (list returns `[]`) |
| `api_key_invalid` | `src/shared/error-codes.ts:108` — surfaced by admin-key middleware on 401 |
| `api_key_required` | `src/shared/error-codes.ts:105` |

### New (add during implementation)

| Code | Description |
|------|-------------|
| *(none)* | This feature is a CLI-side observer. All HTTP errors come from existing admin-auth + endpoint machinery; no new server-side codes are added. |

---

## Contract Tests

> These become implementation requirements for `/plan-impl`. Tests live in `tests/scripts/preflight-policies.test.ts` (new file) and exercise the `checkOrgPolicies` helper against a mocked `fetch`. A smoke test exercises the full `seed-springs-demo.mjs` entry point with `SIGNALS = []` short-circuit to keep runtime low.

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| SEED-PREFLIGHT-001 | Happy path — org has policies | mocked `fetch` returns `{ policies: [{ policy_key: 'default', status: 'active', ... }], count: 1 }` | `{ ok: true, count: 1, fallbackRisk: false }`; prints `✓ Policies: 1 active for org=springs` |
| SEED-PREFLIGHT-002 | Fallback risk — org has zero policies (default mode) | mocked `fetch` returns `{ policies: [], count: 0 }` | `{ ok: true, count: 0, fallbackRisk: true }`; prints warning referencing `src/decision/policy-loader.ts:252`; process exit code not set (caller continues) |
| SEED-PREFLIGHT-003 | Strict mode — zero policies aborts | same as 002 with `strict: true` | Helper returns `{ ok: false, count: 0, fallbackRisk: true, exitCode: 3 }`; caller must exit 3 |
| SEED-PREFLIGHT-004 | No admin key — skip silently | `adminKey: undefined` | Helper returns `{ ok: true, skipped: true }`; prints `⊝ Policies: skipped (no admin key)`; no fetch issued |
| SEED-PREFLIGHT-005 | 401 Unauthorized | mocked `fetch` returns `status: 401` | Helper returns `{ ok: false, exitCode: 4 }`; prints `✗ Policies: 401 at GET /v1/admin/policies?org_id=springs`; caller must exit 4 |
| SEED-PREFLIGHT-006 | Server unreachable (ECONNREFUSED) | mocked `fetch` throws `{ cause: { code: 'ECONNREFUSED' } }` | Helper returns `{ ok: false, exitCode: 4 }`; prints `✗ Policies: ECONNREFUSED at <base>/v1/admin/policies`; does not throw |
| SEED-PREFLIGHT-007 | Integration — `seed-springs-demo.mjs` invokes pre-flight before Phase 1 | Run script with mocked server that rejects `/v1/admin/mappings/*` until pre-flight logged | Console output order: pre-flight line → Phase 1 → Phase 2 → Phase 3 |
| SEED-PREFLIGHT-008 | Counts only `status: "active"` policies | mocked `fetch` returns policies with mixed statuses (2 active, 1 disabled) | `count: 2`, `fallbackRisk: false` |

> **Test strategy note:** SEED-PREFLIGHT-001 through -006, -008 exercise the `checkOrgPolicies` helper directly with a mocked `fetch` (unit tests, `tests/scripts/preflight-policies.test.ts`). SEED-PREFLIGHT-007 is an integration test that shells out to the script entry point against a test Fastify instance (same pattern as existing contract tests in `tests/contracts/admin-field-mappings.test.ts`).

---

## Concrete Values Checklist

### Wire formats / signed payloads

- N/A — no signed payloads; this feature is a plain admin GET.

### HTTP behavior

The pre-flight check issues one HTTP request and branches on the response. Upstream behavior is defined by `docs/specs/policy-management-api.md`; the CLI-visible surface is pinned here for reproducibility:

| Condition | Method | Path (with query) | Status | Helper outcome |
|-----------|--------|-------------------|--------|----------------|
| Org has ≥ 1 active policy | GET | `/v1/admin/policies?org_id=<org>` | 200 | `ok: true, count: N, fallbackRisk: false` |
| Org has 0 active policies | GET | `/v1/admin/policies?org_id=<org>` | 200 | `ok: true, count: 0, fallbackRisk: true` |
| Admin key missing/invalid | GET | `/v1/admin/policies?org_id=<org>` | 401 | `ok: false, exitCode: 4` |
| Server unreachable | GET | `/v1/admin/policies?org_id=<org>` | — (throws) | `ok: false, exitCode: 4` |

**Request headers sent by helper:**

| Header | Value | Required |
|--------|-------|----------|
| `x-admin-api-key` | value of `--admin-key` or `ADMIN_API_KEY` env | yes |
| `accept` | `application/json` | no (implied by Fastify) |

### Cookies

N/A — CLI client; no browser session.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `ADMIN_API_KEY` | conditional | `undefined` | string | Admin key. When absent AND `--admin-key` is not passed, pre-flight is skipped (same condition as Phase 1 mapping registration today). |
| `STRICT_POLICIES` | no | `undefined` (falsy) | boolean | When truthy (`1`, `true`, `yes`, case-insensitive), zero-policy condition aborts the script with exit code 3. CLI flag `--strict-policies` takes precedence. |
| `API_KEY` | yes (unchanged) | `undefined` | string | Tenant API key for Phase 2 signal POSTs. Not used by pre-flight. |

### Constants / limits

- **Timeout**: No explicit timeout on the admin fetch. Default Node `fetch` behavior applies (no timeout; operator is expected to Ctrl-C if the server hangs). A single-request call to localhost in dev / VPC in pilot does not warrant a timeout primitive.
- **Retry**: None. Fail fast on 401 / ECONNREFUSED.
- **Rate limit**: None (one request per seed run).
- **Body size limit**: N/A — GET with no body.

### Routes registered

N/A — CLI tool registers no HTTP routes. It consumes the existing `GET /v1/admin/policies` route registered by `src/admin/policy-management-routes.ts`.

### Exit codes

| Exit code | Meaning |
|-----------|---------|
| 0 | Full success (policies present), OR default-mode success with zero-policy warning, OR Phase 1 skipped. |
| 1 | Existing: Phase 2 expected-outcome mismatch (unchanged). |
| 3 | **New**: strict mode + zero policies in target org. |
| 4 | **New**: admin endpoint unreachable (ECONNREFUSED) or unauthorized (401). Pre-flight did not complete. |

### CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--strict-policies` | boolean (presence) | false | Convert the zero-policy warning into a hard abort (exit 3). |
| `--host`, `--api-key`, `--admin-key`, `--org` | existing | (unchanged) | — |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — CLI client. Server-side `trustProxy` concerns are owned by `docs/specs/signal-ingestion.md` and `docs/specs/policy-management-api.md`.
- **CORS**: N/A — Node-to-server call; not a browser context.
- **CSP / security headers**: N/A — CLI consumes JSON; renders nothing.
- **Cookie prefix vs Path scoping**: N/A — no cookies issued or consumed.
- **Content-type parsing**: N/A — GET request, no body sent; response parsed with `res.json()` and defensively coerced with `.catch(() => ({}))` matching the pattern in `seed-springs-demo.mjs:451, 513`.
- **Body size limits**: N/A — no request body. Response from `listPolicies` projects only metadata (no `policy_json`) so payload is small (< 10 KB typical).
- **Rate-limit storage scope**: N/A — single request per seed run. Server-side admin endpoint has no rate limit by design (low-frequency operator access, ADMIN_API_KEY auth).
- **Error-code surface**: The pre-flight reproduces only the HTTP status and a stable file-line reference (`src/decision/policy-loader.ts:252`) in warnings. It never prints raw DynamoDB errors, stack traces, or table names. If the server's admin handler already returns an error body, only `error.code` and `error.message` are surfaced — consistent with how `upload-policy.ts:74` formats errors.
- **Console output stability**: Warning text is part of the operator-facing contract (pilot runbooks will grep for it). Do not change the `✓`/`⊝`/`✗` prefixes or the `Policies:` label without bumping this spec's version.

---

## Notes

- **Why warn-by-default instead of fail-by-default**: The prior `seed-demo.mjs` seeded the `org_demo` sandbox with no policies and relied entirely on the global fallback. Treating zero-policy as an error by default would break that historical contract and annoy operators running quickstarts. Strict mode is the right tool for CI and pilot sign-off scripts, not for local dev.
- **Why use the admin list endpoint instead of `/v1/policies`**: `GET /v1/policies?org_id=<org>` returns the global fallback *as if it belonged to the target org* (see `src/policies/active-policies-source.ts:184-191` and FS fallback at `:146-157`) without marking the source. The admin `listPolicies(orgId)` is a strict PK query with no fallback (`src/admin/policies-dynamodb.ts:257-270`), giving us the exact signal we need.
- **Why a shared helper module**: Even with only one seed script today, the decision-engine fallback semantics are a cross-cutting concern. A `scripts/lib/preflight-policies.mjs` helper keeps the check DRY for the next seed script (probable: a multi-org pilot seeder, or `scripts/upload-policy.ts --verify` mode). Placing the helper in `scripts/lib/` rather than `src/` avoids coupling CLI-only code into the Lambda/Fastify bundle.
- **Future extension — routing config check**: The same helper could also fetch `loadRoutingConfigForOrg` via a future admin endpoint to detect missing routing (currently resolved via its own three-candidate fallback in `src/decision/policy-loader.ts:588-693`). Out of scope for v1 of this spec; add when `GET /v1/admin/policies/routing` exists.
- **File reference stability**: This spec names `src/decision/policy-loader.ts:252` as the authoritative fallback line. If that file is restructured, the warning message reference must update in lockstep — covered by SEED-PREFLIGHT-007 which asserts the literal string in console output.

---

**Next step**: `/plan-impl docs/specs/seed-preflight-policy-check.md`
