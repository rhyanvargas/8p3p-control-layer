---
name: Decision Outcomes (Derived View)
overview: On-demand derived outcome projection joining decisions, versioned learner state, and optional educator feedback — three new read-only HTTP surfaces (`GET /v1/decisions/:decision_id/outcome`, `GET /v1/outcomes`, `GET /v1/admin/outcomes-summary`) with no new storage, unblocking MC-C01..MC-C06 composition in program-metrics.
todos:
  - id: "TASK-001"
    content: "StateRepository — list learner state versions in outcome time window (SQLite + DynamoDB)"
    status: "pending"
  - id: "TASK-002"
    content: "DecisionRepository — org-scoped decisions by decided_at with filters + pagination; Dynamo GSI2 + write path"
    status: "pending"
  - id: "TASK-003"
    content: "Pure resolvePrimaryField + computeOutcome in src/outcomes/view.ts"
    status: "pending"
  - id: "TASK-004"
    content: "Outcomes request validation (window_days, timestamps, decision_type, page_token/page_size)"
    status: "pending"
  - id: "TASK-005"
    content: "handler-core.ts — tenant outcome orchestration (single + list)"
    status: "pending"
  - id: "TASK-006"
    content: "admin-handler-core + admin-handler — GET /v1/admin/outcomes-summary"
    status: "pending"
  - id: "TASK-007"
    content: "Fastify handlers, routes.ts, server registration"
    status: "pending"
  - id: "TASK-008"
    content: "Lambda query/admin routing + API Gateway CDK resources"
    status: "pending"
  - id: "TASK-009"
    content: "OpenAPI paths and schemas for outcome endpoints + new error codes"
    status: "pending"
  - id: "TASK-010"
    content: "Optional FeedbackRepository wiring for educator_* fields"
    status: "pending"
  - id: "TASK-011"
    content: "Unit tests — computeOutcome, primary_field resolution, validators"
    status: "pending"
  - id: "TASK-012"
    content: "Contract + integration tests OUTCOME-001..OUTCOME-012"
    status: "pending"
isProject: false
---

# Decision Outcomes (Derived View)

**Spec**: `docs/specs/decision-outcomes.md`

## Repo parity (`/post-impl-doc-sync`)

As of this sync, **`src/` does not implement this plan yet**: there is no `src/outcomes/`, no outcome-related HTTP paths in `docs/api/openapi.yaml`, and the **new** outcome error codes from `docs/specs/decision-outcomes.md` § Error Codes (`window_days_out_of_range`, `invalid_decision_type_filter`; reuse list for timestamps/pagination) are not wired in **`src/shared/error-codes.ts`** until TASK-009 / TASK-004 land. `docs/specs/decision-outcomes.md` remains normative; implementation follows TASK-001..012.

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § What an "outcome" is

| Outcome label | Definition |
|---------------|------------|
| `improved` | Within `window_days` after `T0` (default window length is per `decision_type` when `window_days` is omitted; see `DEFAULT_WINDOW_DAYS_BY_TYPE` in spec), there exists a state version for `L` where the delta `F_delta` is strictly positive *and* the associated `F_direction == "improving"` |
| `regressed` | Within `window_days`, there exists a state version for `L` where `F_delta` is strictly negative *and* `F_direction == "declining"` — and no `improved` event preceded it |
| `stable` | Within `window_days`, `|F_delta| < policy.stability_epsilon` (default 0.02) across all subsequent state versions |
| `no_signal` | No new state version for `L` within `window_days` (the learner generated no new signal or no signal moved `F`) |
| `pending` | Window has not yet elapsed (i.e. `T0 + window_days > now`) |

**Per-decision-type default `window_days`** (when query param omitted; explicit `?window_days=N` still overrides, max 180):

```
DEFAULT_WINDOW_DAYS_BY_TYPE = {
  intervene: 10,
  pause:     14,
  reinforce: 14,
  advance:   21
}
```

**Outcome response extensions:** `recheck_due_at` (RFC3339) and `recheck_overdue` (boolean, true when `now > recheck_due_at && outcome == "pending"`).

**Primary policy field** is resolved from the matched rule:

1. If the matched rule has a single scalar condition (e.g. `stabilityScore < 0.7`), the primary field is that scalar path.
2. If the matched rule has compound conditions (`all`/`any`), the primary field is the first condition's path.
3. The resolved path is stored on the outcome projection (`primary_field`), so consumers can introspect how the join was done.

### From spec § When feedback exists (from educator-feedback-api.md)

| Field | Description |
|-------|-------------|
| `educator_action` | `approve` / `reject` / `ignore` / `null` (from latest feedback row) |
| `educator_reason_category` | Closed set value or `null` |
| `time_to_educator_action_hours` | `feedback.created_at − decision.decided_at` in hours; `null` if no feedback |

### From spec § Endpoints — `GET /v1/decisions/:decision_id/outcome` — Query params

| Param | Required | Description |
|-------|----------|-------------|
| `window_days` | No | When omitted, default is `DEFAULT_WINDOW_DAYS_BY_TYPE[decision.decision_type]`. Max 180. |

### From spec § Endpoints — `GET /v1/decisions/:decision_id/outcome` — Response (200)

```json
{
  "decision_id": "uuid",
  "learner_reference": "stu-10042",
  "decided_at": "2026-04-15T14:00:00Z",
  "window_days": 14,
  "primary_field": "stabilityScore",
  "outcome": "improved",
  "recheck_due_at": "2026-04-29T14:00:00Z",
  "recheck_overdue": false,
  "outcome_evidence": {
    "state_version_at_decision": 7,
    "observed_state_versions": [8, 9, 10],
    "primary_field_at_decision": 0.62,
    "primary_field_latest": 0.78,
    "max_positive_delta": 0.16,
    "max_negative_delta": 0.00
  },
  "educator_action": "approve",
  "educator_reason_category": "agree_primary",
  "time_to_educator_action_hours": 18.4
}
```

When `outcome == "pending"` the evidence block contains `window_ends_at` (RFC3339) and `observed_state_versions` reflects only versions seen so far.

### From spec § Endpoints — `GET /v1/outcomes` — Query params

| Param | Required | Description |
|-------|----------|-------------|
| `from_time` | Yes | Decision `decided_at` lower bound (RFC3339) |
| `to_time` | Yes | Decision `decided_at` upper bound (RFC3339); must be ≥ `from_time` |
| `window_days` | No | When omitted, per-row default follows `DEFAULT_WINDOW_DAYS_BY_TYPE[decision_type]` |
| `decision_type` | No | Filter: `reinforce` / `advance` / `intervene` / `pause` |
| `learner_reference` | No | Filter to a single learner |
| `page_token` | No | Opaque pagination cursor |
| `page_size` | No | 1–1000, default 100 |

### From spec § Endpoints — `GET /v1/outcomes` — Response (200)

```json
{
  "outcomes": [
    {
      "decision_id": "uuid",
      "learner_reference": "stu-10042",
      "decision_type": "intervene",
      "decided_at": "2026-04-15T14:00:00Z",
      "primary_field": "stabilityScore",
      "outcome": "improved",
      "educator_action": "approve"
    }
  ],
  "next_page_token": "..."
}
```

Ordering matches `GET /v1/decisions` (`decided_at ASC`). Per-decision detail available via `GET /v1/decisions/:id/outcome`.

### From spec § Endpoints — `GET /v1/admin/outcomes-summary` (admin)

**Auth:** `x-admin-api-key`.

**Query params:** same as `GET /v1/outcomes`, plus optional `org_id` filter.

**Response (200):** aggregate counts per org × decision_type × outcome label. Used by `GET /v1/admin/program-metrics` (per `program-metrics.md`) to compute MC-C01..MC-C06 without scanning individual outcomes.

```json
{
  "from_time": "2026-04-01T00:00:00Z",
  "to_time": "2026-04-30T23:59:59Z",
  "window_days": 14,
  "by_org": [
    {
      "org_id": "org_springs",
      "by_decision_type": {
        "intervene": { "improved": 14, "regressed": 2, "stable": 6, "no_signal": 3, "pending": 5 },
        "reinforce": { "improved": 42, "regressed": 1, "stable": 18, "no_signal": 7, "pending": 12 },
        "advance":   { "improved": 9,  "regressed": 0, "stable": 4,  "no_signal": 2, "pending": 3 },
        "pause":     { "improved": 5,  "regressed": 3, "stable": 2,  "no_signal": 1, "pending": 2 }
      }
    }
  ]
}
```

### From spec § Computation Semantics (HTTP / ordering / exclusivity prose)

Given `decision_id = D`, the server:

1. Fetches `D` from the `decisions` table. Rejects with 404 if absent or not in caller's org.
2. Extracts `learner_reference = L`, `decided_at = T0`, `state_id = S`, `state_version = V0`, `trace.matched_rule`.
3. Resolves `primary_field` per the rules above.
4. Fetches all state versions for `L` in the window `(T0, T0 + window_days]` — already a supported query on the state store.
5. For each subsequent version `Vi`, reads `F_delta` and `F_direction` (present automatically per `state-delta-detection.md` when `F` is numeric).
6. Applies the label rules (§ "What an outcome is") in order: `pending` first (if window not elapsed), else `improved`, `regressed`, `stable`, `no_signal` (mutually exclusive; `improved` wins over `regressed` when both occur within the same window).
7. If `FeedbackRepository` is wired, queries `decision_feedback` for `D` and fills `educator_*` fields from the latest row.

**Determinism.** Given the same stores and the same `(decision_id, window_days)`, this function returns identical output. No wall-clock dependence inside the computation (except for the `pending` branch, which reports elapsed window state as of the request time).

**Caching.** None in v1. If P95 becomes a concern at scale, cache `outcome` rows that are *not* `pending` (they are immutable once the window closes). Add cache only when measured P95 > 1 s.

### From spec § Error Codes — New

| Code | HTTP | Description |
|------|------|-------------|
| `decision_not_found` | 404 | `decision_id` absent or not in caller's org |
| `window_days_out_of_range` | 400 | `window_days` < 1 or > 180 |
| `invalid_decision_type_filter` | 400 | `decision_type` query param not in closed set |

### From spec § Error Codes — Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | `api-key-middleware.md` |
| `admin_key_required` | `policy-management-api.md` |
| `invalid_timestamp`, `invalid_time_range` | Shared |
| `invalid_page_token`, `page_size_out_of_range` | Shared |

### From spec § Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| OUTCOME-001 | integration | Seed decision + 3 subsequent state versions with positive `stabilityScore_delta`; outcome == `improved` | 200 |
| OUTCOME-002 | integration | Seed decision + no subsequent signals; outcome == `no_signal` | 200 |
| OUTCOME-003 | integration | Window not elapsed yet; outcome == `pending`, `window_ends_at` populated | 200 |
| OUTCOME-004 | integration | Mixed positive and negative deltas; outcome == `improved` (positive wins when preceding) | 200 |
| OUTCOME-005 | integration | Feedback row exists; `educator_action` and `time_to_educator_action_hours` populated | 200 |
| OUTCOME-006 | contract | Cross-org decision_id → 404 `decision_not_found` | 404 |
| OUTCOME-007 | contract | `window_days=0` → 400 `window_days_out_of_range` | 400 |
| OUTCOME-008 | contract | `window_days=181` → 400 `window_days_out_of_range` | 400 |
| OUTCOME-009 | integration | `GET /v1/outcomes?decision_type=intervene` returns only intervene outcomes | 200 |
| OUTCOME-010 | integration | `GET /v1/admin/outcomes-summary` aggregates counts correctly across decision types | 200 |
| OUTCOME-011 | contract | Admin summary without admin key → 401 `admin_key_required` | 401 |
| OUTCOME-012 | integration | Primary-field resolution: compound rule with `all` picks first condition's path | 200; `primary_field` matches |

### From spec § File Structure

```
src/
├── outcomes/
│   ├── view.ts                # Pure function computeOutcome(decision, stateVersions, feedback?, windowDays)
│   ├── handler-core.ts        # Framework-agnostic request logic
│   ├── handler.ts             # Fastify handlers (GET /v1/decisions/:id/outcome, GET /v1/outcomes)
│   ├── admin-handler.ts       # Fastify handler (GET /v1/admin/outcomes-summary)
│   └── routes.ts              # Route registration
```

### From spec § Requirements — Non-functional (numeric thresholds)

- [ ] `GET /v1/decisions/:id/outcome` P95 ≤ 200 ms at pilot scale
- [ ] `GET /v1/outcomes` (one month, ~2 k decisions) P95 ≤ 2 s
- [ ] No computation depends on a wall-clock except the `pending` branch
- [ ] No PII is introduced — outcome records carry only `learner_reference` (already pseudonymous) and numeric deltas

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** — `docs/specs/state-delta-detection.md` behavior available in stored state (`{F}_delta`, `{F}_direction`) for numeric top-level `F`; outcome logic reads those keys for the resolved `primary_field`.
- [ ] **PREREQ-002** — `docs/specs/educator-feedback-api.md`: `FeedbackRepository` + `decision_feedback` (or graceful unwiring) so OUTCOME-005 can assert populated `educator_action` / `time_to_educator_action_hours`; when unwired, educator fields remain JSON `null` per functional requirement.
- [ ] **PREREQ-003** — Tenant org resolution from `x-api-key` and admin from `x-admin-api-key` match existing `src/server.ts` / middleware patterns used by `GET /v1/decisions` and admin routes.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: StateRepository — list learner state versions in outcome window
- **Files**: `src/state/repository.ts`, `src/state/store.ts`, `src/state/dynamodb-repository.ts`, `src/state/store.ts` (module exports if needed)
- **Action**: Modify
- **Details**: Add a repository method to support Computation Semantics step 4 verbatim: *"Fetches all state versions for `L` in the window `(T0, T0 + window_days]`"*. Interpret the window on persisted learner state rows using each version's `updated_at` (RFC3339), intersected with `state_version > V0` from the decision's `trace.state_version`, ordered ascending by `state_version` (aligns with monotonic versions). **Prefer existing SDK**: DynamoDB path uses `QueryCommand` on existing StateTable key `org_learner` + `state_version` with `FilterExpression` on `updated_at` (already an attribute per `DynamoDbStateRepository` docblock) — no `ScanCommand` for the hot path. SQLite uses indexed `WHERE org_id = ? AND learner_reference = ? AND state_version > ?` plus `updated_at` bounds.
- **Depends on**: none
- **Verification**: New unit tests on SQLite repository helper (or thin integration) proving ordering and boundary `(T0, T0 + window_days]`; `npm run typecheck` passes.

### TASK-002: DecisionRepository — org time-range listing + DynamoDB GSI2
- **Files**: `src/decision/repository.ts`, `src/decision/store.ts`, `src/decision/dynamodb-repository.ts`, `src/decision/engine.ts` / ingest persistence (if attribute must be denormalized at write), `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: `GET /v1/outcomes` requires listing decisions for the **tenant org** with `from_time` / `to_time` on `decided_at`, optional `learner_reference`, optional `decision_type`, and pagination with ordering verbatim: *"Ordering matches `GET /v1/decisions` (`decided_at ASC`)"* (from spec § `GET /v1/outcomes` — Response). SQLite: extend `decisions` queries with optional learner + type filters and keyset pagination compatible with shared `invalid_page_token` / `page_size_out_of_range`. DynamoDB: add **GSI2** (name fixed in code and CDK, e.g. `gsi2-org-decided-at`) with `PK = org_id`, `SK = decided_at#decision_id` (lexicographic ISO8601 `decided_at` + tie-breaker) so org-wide windows do not require a `learner_reference`. **Prefer `DynamoDBDocumentClient` patterns already used**: extend `PutItem` / marshall payload in `DynamoDbDecisionRepository.saveDecision` to include the GSI2 sort key attribute; use `QueryCommand` on GSI2 with `Between :a AND :b` on SK prefix range or composite key design chosen at implementation time (must preserve `decided_at ASC` + stable pagination). Document one-time backfill gap for rows written before deploy (Risks).
- **Depends on**: none
- **Verification**: `npm run cdk:synth`; repository-level test or integration proving page ordering; typecheck.

### TASK-003: Pure `resolvePrimaryField` + `computeOutcome` (`src/outcomes/view.ts`)
- **Files**: `src/outcomes/view.ts` (new)
- **Action**: Create
- **Details**: Implement pure functions per spec File Structure and Computation Semantics steps 3–6. **Quote label precedence verbatim** from § Computation Semantics: *"`pending` first (if window not elapsed), else `improved`, `regressed`, `stable`, `no_signal` (mutually exclusive; `improved` wins over `regressed` when both occur within the same window)"`.* **Quote stable rule verbatim** from § "What an outcome is" table: *"`stable` \| Within `window_days`, `|F_delta| < policy.stability_epsilon` (default 0.02) across all subsequent state versions"`* — use literal default **`0.02`** when policy object is not loaded on the read path. **Quote improved/regressed direction membership verbatim** from the same table — `F_direction == "improving"` for `improved`, `F_direction == "declining"` for `regressed` (aligned with `src/state/engine.ts` and `state-delta-detection.md` as of spec edit 2026-04-23; see § Deviations from Spec for history). **Quote primary-field resolution rules verbatim** (scalar → that path; compound `all`/`any` → first condition's path). Expose `primary_field` on the projection. When `window_days` is omitted on input, resolve the effective window using **`DEFAULT_WINDOW_DAYS_BY_TYPE[decision.decision_type]`** from `docs/specs/decision-outcomes.md` § Recheck cadence. Populate **`recheck_due_at`** and **`recheck_overdue`** on the projection per spec. Evidence object fields match § `GET /v1/decisions/:decision_id/outcome` — Response JSON (`state_version_at_decision`, `observed_state_versions`, `primary_field_at_decision`, `primary_field_latest`, `max_positive_delta`, `max_negative_delta`; when pending add `window_ends_at`). Export `computeOutcome` (and any helpers) for TASK-011 direct tests.
- **Depends on**: TASK-001 (types for state version rows)
- **Verification**: `npm run typecheck`; TASK-011 exercises branches.

### TASK-004: Outcomes request validation
- **Files**: `src/outcomes/validator.ts` (new), optionally `src/shared/error-codes.ts` or local constants consistent with existing patterns
- **Action**: Create
- **Details**: Validate query params using the **Query params** tables in § Spec Literals for `GET /v1/decisions/:decision_id/outcome`, `GET /v1/outcomes`, and `GET /v1/admin/outcomes-summary` (admin shares outcomes params + optional `org_id`). Enforce **Error Codes — New** verbatim: `window_days` **< 1 or > 180** → HTTP **400** body code **`window_days_out_of_range`**; `decision_type` not in **`reinforce` / `advance` / `intervene` / `pause`** → **400** **`invalid_decision_type_filter`**. Reuse shared validators for `from_time` / `to_time` (`invalid_timestamp`, `invalid_time_range` with `to_time` ≥ `from_time`), pagination tokens/sizes (`invalid_page_token`, `page_size_out_of_range`). Cap **`page_size`** to **1–1000**, default **100** per outcomes table.
- **Depends on**: none
- **Verification**: Unit tests for boundary values matching OUTCOME-007/OUTCOME-008 expectations.

### TASK-005: `handler-core.ts` — tenant outcomes orchestration
- **Files**: `src/outcomes/handler-core.ts` (new)
- **Action**: Create
- **Details**: Framework-agnostic `HandlerResult<T>` flows (mirror `src/decision/handler-core.ts`). **`GET /v1/decisions/:decision_id/outcome`**: Computation Semantics steps 1–7; on missing / cross-org use **404** + code **`decision_not_found`** per Error Codes table. **Read-only**: no writes. **`GET /v1/outcomes`**: for each page of decisions from TASK-002, compute outcome labels (list row may omit heavy `outcome_evidence` if not in § list Response JSON — only include fields shown in the list Response literal). Resolve **`window_days`** using per-`decision_type` defaults from **`DEFAULT_WINDOW_DAYS_BY_TYPE`** when the query param is omitted; explicit override max **180** from outcomes query table. Wire org from tenant context (same as other `/v1/*` handlers).
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-004
- **Verification**: Callable from Fastify and Lambda with plain `Record<string, unknown>` query + params; returns correct HTTP codes for validation errors.

### TASK-006: Admin outcomes summary core + handler
- **Files**: `src/outcomes/admin-handler-core.ts` (new), `src/outcomes/admin-handler.ts` (new)
- **Action**: Create
- **Details**: Implement **`GET /v1/admin/outcomes-summary`** with **Auth:** *`x-admin-api-key`* and response shape from § Spec Literals (`from_time`, `to_time`, `window_days`, `by_org` tree). **Query params:** *"same as `GET /v1/outcomes`, plus optional `org_id` filter"`* verbatim from spec § Endpoints — admin. Aggregation: for each decision in scope, reuse `computeOutcome`; increment counts per **`org_id` × `decision_type` × outcome label** including all five labels **`improved` / `regressed` / `stable` / `no_signal` / `pending`**. Cross-org iteration must not leak tenant boundaries: admin path may read all orgs (consistent with program-metrics consumer); apply optional `org_id` filter when present.
- **Depends on**: TASK-002, TASK-003, TASK-004, TASK-005 patterns
- **Verification**: Deterministic counts on seeded multi-org SQLite fixture (TASK-012).

### TASK-007: Fastify routes and server registration
- **Files**: `src/outcomes/handler.ts` (new), `src/outcomes/routes.ts` (new), `src/server.ts`
- **Action**: Create | Modify
- **Details**: Register **`GET /v1/decisions/:decision_id/outcome`** (use param name **`decision_id`** to match spec path segment) and **`GET /v1/outcomes`** under the existing **`apiKeyPreHandler`** scope. Register **`GET /v1/admin/outcomes-summary`** under **`adminApiKeyPreHandler`** scope (same pattern as `registerPolicyManagementRoutes`). Handlers delegate to TASK-005/006 core functions.
- **Depends on**: TASK-005, TASK-006
- **Verification**: `npm run dev` local smoke; routes appear in server log / OpenAPI (TASK-009).

### TASK-008: Lambda + API Gateway wiring
- **Files**: `src/lambda/query.ts`, `src/lambda/admin.ts` (or whichever module serves `/v1/admin/*` today), `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: Extend path routing so API Gateway invocations reach new handlers: nested **`decisions/{decision_id}/outcome`**, top-level **`outcomes`**, admin **`outcomes-summary`**. Grant IAM read on State/Decisions (and Feedback table when TASK-010 registers repo) to the Lambda that executes each path. **Prefer existing Lambda packaging** (`../dist/lambda`).
- **Depends on**: TASK-005, TASK-006, TASK-007
- **Verification**: `npm run build` then manual `sam`/local Lambda path smoke if available; at minimum `cdk synth` and unit path matcher tests.

### TASK-009: OpenAPI + contract script parity
- **Files**: `docs/api/openapi.yaml`, `scripts/validate-contracts.ts` (only if new route names must be enumerated there)
- **Action**: Modify
- **Details**: Document the three paths, params from the **Query params** tables in § Spec Literals, response examples from the JSON blocks in § Spec Literals (including **`recheck_due_at`** and **`recheck_overdue`** on outcome detail), and new error codes from the **Error Codes — New** table. Ensure Redocly lint passes (`npm run validate:api`).
- **Depends on**: TASK-007
- **Verification**: `npm run validate:api`.

### TASK-010: Optional FeedbackRepository wiring
- **Files**: `src/outcomes/handler-core.ts`, possibly `src/server.ts` / `src/lambda/query.ts` init, `src/feedback/*.ts` (if getters already exist from educator-feedback work)
- **Action**: Modify
- **Details**: If `getFeedbackRepository()` (or project equivalent) returns a repo, load **latest** `decision_feedback` row for **`D`** and map to fields per **§ When feedback exists** table: `educator_action` **`approve` / `reject` / `ignore` / `null`**, `educator_reason_category`, `time_to_educator_action_hours` = **`feedback.created_at − decision.decided_at` in hours**; otherwise JSON **`null`** fields per functional requirement *"When feedback is unavailable (repo not wired or row missing), educator_* fields are `null`"*. **Prefer existing `@aws-sdk/lib-dynamodb` / document client** already in `package.json` for any Dynamo feedback adapter.
- **Depends on**: TASK-005, PREREQ-002
- **Verification**: OUTCOME-005 integration passes when feedback store seeded; unwired path returns nulls without error.

### TASK-011: Unit tests — view + validators
- **Files**: `tests/unit/outcomes-view.test.ts`, `tests/unit/outcomes-validator.test.ts` (new)
- **Action**: Create
- **Details**: Direct tests for **exported** `computeOutcome` / `resolvePrimaryField` and validator branches (including **`window_days=0`** and **`181`** expecting **`window_days_out_of_range`**). Cover **Computation Semantics** exclusivity and **`pending`** evidence (`window_ends_at`). Cover **Non-functional** item *"No computation depends on a wall-clock except the `pending` branch"`* by asserting deterministic outputs when `now` is injected or `pending` branch is the only clock-dependent path.
- **Depends on**: TASK-003, TASK-004
- **Verification**: `npm run test:unit`.

### TASK-012: Contract + integration tests OUTCOME-001..OUTCOME-012
- **Files**: `tests/contracts/outcomes.test.ts`, `tests/integration/outcomes.test.ts` (new; exact split optional if single file stays readable)
- **Action**: Create
- **Details**: Implement every **§ Contract Tests** row verbatim mapping:

| Test ID | Expected HTTP |
|---------|----------------|
| OUTCOME-001 | 200 |
| OUTCOME-002 | 200 |
| OUTCOME-003 | 200 |
| OUTCOME-004 | 200 |
| OUTCOME-005 | 200 |
| OUTCOME-006 | 404 |
| OUTCOME-007 | 400 |
| OUTCOME-008 | 400 |
| OUTCOME-009 | 200 |
| OUTCOME-010 | 200 |
| OUTCOME-011 | 401 |
| OUTCOME-012 | 200 |

Use Fastify app harness consistent with existing integration tests. Seed decisions + state versions + optional feedback per Description column. Assert response bodies against § Spec Literals JSON shapes where applicable (e.g. OUTCOME-003 `window_ends_at`, OUTCOME-012 `primary_field`).
- **Depends on**: TASK-007, TASK-008, TASK-009, TASK-010
- **Verification**: `npm run test:contracts` / `npm run test:integration` subsets or full `npm test` green.

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/outcomes/view.ts` | TASK-003 | Pure outcome label + evidence |
| `src/outcomes/validator.ts` | TASK-004 | Query validation + error codes |
| `src/outcomes/handler-core.ts` | TASK-005 | Tenant read orchestration |
| `src/outcomes/admin-handler-core.ts` | TASK-006 | Admin aggregation |
| `src/outcomes/handler.ts` | TASK-007 | Fastify tenant handlers |
| `src/outcomes/admin-handler.ts` | TASK-007 | Fastify admin handler |
| `src/outcomes/routes.ts` | TASK-007 | Route registration |
| `tests/unit/outcomes-view.test.ts` | TASK-011 | Unit coverage |
| `tests/unit/outcomes-validator.test.ts` | TASK-011 | Validator coverage |
| `tests/contracts/outcomes.test.ts` | TASK-012 | Contract tests |
| `tests/integration/outcomes.test.ts` | TASK-012 | Integration tests |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/state/repository.ts` | TASK-001 | New list-in-window method |
| `src/state/store.ts` | TASK-001 | SQLite implementation |
| `src/state/dynamodb-repository.ts` | TASK-001 | DynamoDB Query + filter |
| `src/decision/repository.ts` | TASK-002 | Org time-range list API |
| `src/decision/store.ts` | TASK-002 | SQL + pagination |
| `src/decision/dynamodb-repository.ts` | TASK-002 | GSI2 query + item attributes |
| `infra/lib/control-layer-stack.ts` | TASK-002, TASK-008 | GSI2, API routes, IAM |
| `src/server.ts` | TASK-007 | `registerOutcomeRoutes` |
| `src/lambda/query.ts` | TASK-008 | Path routing for tenant outcomes |
| `src/lambda/admin.ts` (or equivalent) | TASK-008 | Admin summary route |
| `docs/api/openapi.yaml` | TASK-009 | Paths, schemas, errors |
| `src/outcomes/handler-core.ts` | TASK-010 | Feedback enrichment |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `- [ ]` `GET /v1/decisions/:id/outcome` returns the label + evidence for one decision | spec § Requirements — Functional | TASK-003, TASK-005, TASK-007, TASK-012 |
| `- [ ]` `GET /v1/outcomes` returns paginated outcomes for a time window, filterable by `decision_type` and `learner_reference` | spec § Requirements — Functional | TASK-002, TASK-004, TASK-005, TASK-007, TASK-012 |
| `- [ ]` `GET /v1/admin/outcomes-summary` returns aggregate counts across orgs per decision type × outcome | spec § Requirements — Functional | TASK-002, TASK-004, TASK-006, TASK-007, TASK-012 |
| `- [ ]` Outcome computation is purely read-only — no writes to any store | spec § Requirements — Functional | TASK-005, TASK-006, TASK-012 |
| `- [ ]` When feedback is unavailable (repo not wired or row missing), educator_* fields are `null` — the view still functions | spec § Requirements — Functional | TASK-005, TASK-010, TASK-012 |
| `- [ ]` Primary-field resolution is deterministic and surfaced in the response (`primary_field`) | spec § Requirements — Functional | TASK-003, TASK-005, TASK-011, TASK-012 |
| `- [ ]` `window_days` is capped at 180 (longer windows require a research export, not an API call) | spec § Requirements — Functional | TASK-004, TASK-012 |
| `- [ ]` `GET /v1/decisions/:id/outcome` P95 ≤ 200 ms at pilot scale | spec § Requirements — Non-functional | TASK-001, TASK-003, TASK-012 + **Risks** (instrument / manual benchmark); not gate CI |
| `- [ ]` `GET /v1/outcomes` (one month, ~2 k decisions) P95 ≤ 2 s | spec § Requirements — Non-functional | TASK-002, TASK-005, TASK-012 + **Risks** |
| `- [ ]` No computation depends on a wall-clock except the `pending` branch | spec § Requirements — Non-functional | TASK-003, TASK-011 |
| `- [ ]` No PII is introduced — outcome records carry only `learner_reference` (already pseudonymous) and numeric deltas | spec § Requirements — Non-functional | TASK-003, TASK-005, TASK-009 |
| Given a decision at state v3 and three subsequent versions (v4, v5, v6) where `stabilityScore` climbs from 0.62 → 0.78, when the outcome is queried with explicit `window_days=21`, then `outcome == "improved"` and `max_positive_delta ≈ 0.16` | spec § Acceptance Criteria | TASK-003, TASK-012 (OUTCOME-001) |
| Given a decision with no subsequent state versions inside the window, then `outcome == "no_signal"` | spec § Acceptance Criteria | TASK-003, TASK-012 (OUTCOME-002) |
| Given the window has not yet elapsed, then `outcome == "pending"` and `window_ends_at` is returned | spec § Acceptance Criteria | TASK-003, TASK-012 (OUTCOME-003) |
| Given feedback exists for the decision with `action == "approve"`, then `educator_action == "approve"` and `time_to_educator_action_hours` is populated | spec § Acceptance Criteria | TASK-010, TASK-012 (OUTCOME-005) |
| Given a cross-org `decision_id`, then response is `404 decision_not_found` | spec § Acceptance Criteria | TASK-005, TASK-012 (OUTCOME-006) |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| OUTCOME-001 | integration | Seed decision + 3 subsequent state versions with positive `stabilityScore_delta`; outcome == `improved` | TASK-012 |
| OUTCOME-002 | integration | Seed decision + no subsequent signals; outcome == `no_signal` | TASK-012 |
| OUTCOME-003 | integration | Window not elapsed yet; outcome == `pending`, `window_ends_at` populated | TASK-012 |
| OUTCOME-004 | integration | Mixed positive and negative deltas; outcome == `improved` (positive wins when preceding) | TASK-012 |
| OUTCOME-005 | integration | Feedback row exists; `educator_action` and `time_to_educator_action_hours` populated | TASK-012 |
| OUTCOME-006 | contract | Cross-org decision_id → 404 `decision_not_found` | TASK-012 |
| OUTCOME-007 | contract | `window_days=0` → 400 `window_days_out_of_range` | TASK-011, TASK-012 |
| OUTCOME-008 | contract | `window_days=181` → 400 `window_days_out_of_range` | TASK-011, TASK-012 |
| OUTCOME-009 | integration | `GET /v1/outcomes?decision_type=intervene` returns only intervene outcomes | TASK-012 |
| OUTCOME-010 | integration | `GET /v1/admin/outcomes-summary` aggregates counts correctly across decision types | TASK-012 |
| OUTCOME-011 | contract | Admin summary without admin key → 401 `admin_key_required` | TASK-012 |
| OUTCOME-012 | integration | Primary-field resolution: compound rule with `all` picks first condition's path | TASK-011, TASK-012 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § "What an outcome is" — `improved` / `regressed` rows | `F_direction` token set | Plan implements `improved` when `F_direction == "improving"` and `regressed` when `F_direction == "declining"` (matching `src/state/engine.ts` and `state-delta-detection.md`) | **Resolved in spec 2026-04-23** — `decision-outcomes.md` § "What an outcome is" now uses `F_direction == "improving"` / `F_direction == "declining"`, aligned with engine output. Plan literal matches spec. |
| § Computation Semantics step 4 | *"already a supported query on the state store"* | No first-class `StateRepository` method exists today for time-bounded multi-version fetch | **Implementation detail — spec silent** on exact repository method name; add TASK-001 |
| § File Structure | Lists `handler-core.ts` only | Adds `validator.ts` and `admin-handler-core.ts` for parity with existing `src/decision/` / admin patterns | **Implementation detail — spec silent** |
| § Error Codes — New | Lists three new codes | Reuses shared codes for time/page validation per *"Existing (reuse)"* table | **Implementation detail — spec silent** (still returns those codes verbatim) |

**Self-consistency:** Error codes `decision_not_found`, `window_days_out_of_range`, `invalid_decision_type_filter`; outcome labels `improved`, `regressed`, `stable`, `no_signal`, `pending`; `window_days` per-type defaults **`DEFAULT_WINDOW_DAYS_BY_TYPE`** (intervene 10 / pause 14 / reinforce 14 / advance 21), max **180** on explicit override; `page_size` **1–1000**, default **100**; decision types **`reinforce` / `advance` / `intervene` / `pause`**; stability epsilon default **`0.02`**; response fields **`recheck_due_at`**, **`recheck_overdue`** — use identical spellings in TASK bodies, OpenAPI, and tests.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| DynamoDB GSI2 added after pilot start — historical decision items lack sort key until backfilled | Medium — org-wide `/v1/outcomes` misses old rows | CDK deploy + documented backfill script or accept pilot window start date post-deploy; TASK-002 verification includes note |
| Admin summary computes one outcome per decision synchronously | High latency at large cardinality vs NFR | Batch internal page size, reuse TASK-002 pagination; measure before optimizing; v1 spec forbids materialized table |
| Spec direction strings vs engine strings drift | Wrong label if mis-mapped | Deviations table + spec PR; unit tests on boundary cases (OUTCOME-004) |
| P95 NFRs not enforced in CI | Medium | Seed ~2 k decisions locally or in staging script; document results in PR; optional future k6 job |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Matches spec requirements (after direction-token spec alignment PR)

## Implementation Order

```
TASK-001 ─┬→ TASK-003 → TASK-004 → TASK-005 ─→ TASK-007 → TASK-009
TASK-002 ─┘                          ↓
                               TASK-006 → TASK-007
TASK-004 ─────────────────────────────→ TASK-011
TASK-005, TASK-006, TASK-007, TASK-009, TASK-010 → TASK-012
TASK-008 (parallel after TASK-005/006 stable)
```

## Next Steps

- F_direction spec/engine mismatch **already resolved** in `docs/specs/decision-outcomes.md` on 2026-04-23 (Gate A from `/review`). Plan implementation uses `"improving"` / `"declining"` literally per spec.
- Run `/implement-spec .cursor/plans/decision-outcomes.plan.md` when ready to build.
