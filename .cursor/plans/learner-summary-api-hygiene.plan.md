---
name: Learner Summary — API-First Hygiene & SDK Readiness
overview: Lock down GET /v1/learners/:ref/summary as a stable SDK contract before external clients ship. Decide canonical learner-resource collection root (/v1/learners vs /v1/state), add ETag + Cache-Control for idempotent reads, add signals_summary.by_source for cross-system deck rows, constrain active_policy.policy_key to a closed enum, trim active_policy.description from the response, document recent_decisions ordering on the schema, and tighten LearnerSummaryResponse.additionalProperties at the top level. No business logic changes. Pre-requisite: gate readiness + URS projection plans landed.
todos:
  - id: TASK-001
    content: Decide canonical learner-resource collection root (/v1/learners vs /v1/state)
    status: pending
  - id: TASK-002
    content: Add ETag header keyed on (state_id, latest_decision_id)
    status: pending
  - id: TASK-003
    content: Add Cache-Control private must-revalidate on summary response
    status: pending
  - id: TASK-004
    content: Implement If-None-Match handling and 304 Not Modified path
    status: pending
  - id: TASK-005
    content: Add signals_summary.by_source aggregation (repo + projection + schema)
    status: pending
  - id: TASK-006
    content: Constrain active_policy.policy_key to enum (learner staff)
    status: pending
  - id: TASK-007
    content: Move active_policy.description behind ?include=policy_description opt-in
    status: pending
  - id: TASK-008
    content: Tighten LearnerSummaryResponse additionalProperties at top level
    status: pending
  - id: TASK-009
    content: Document recent_decisions DESC ordering in OpenAPI schema description
    status: pending
isProject: false
---

# Learner Summary — API-First Hygiene & SDK Readiness

**Spec**: `docs/specs/learner-summary-api.md`
**Pre-requisites**:
- `.cursor/plans/learner-summary-gate-readiness.plan.md`
- `.cursor/plans/learner-summary-urs-projection.plan.md`

## Why this plan exists

The gate-readiness and URS-projection plans make the response *correct and stable in shape*. This plan makes it **stable as a contract**: the kind of changes that are cheap pre-SDK and breaking post-SDK.

The endpoint is currently:
- Read-only and idempotent — but ships no caching headers, so a teacher dashboard polling at 30s × 30 students = 30 redundant DynamoDB read fan-outs per minute.
- Living at `/v1/learners/{ref}/summary` while every sibling endpoint lives under `/v1/state/...` and `/v1/decisions/...`. We are silently introducing a new collection root. The SDK method `learners.getSummary()` will lock the URL. Decide now.
- Returning `policy_key: string` with no enum — SDKs will type it `string` instead of `'learner' | 'staff'`, regressing developer ergonomics.
- Returning a 220-character `active_policy.description` paragraph in every response. Educator dashboards do not need it; document inspection at `/v1/policies/:key` does.
- Without a per-source signal breakdown — the deck row "cross-system: Canvas + Blackboard" cannot be told from `signals_summary` alone.
- Missing top-level `additionalProperties: false`, so the schema permits unknown fields — clients that strictly type the response will break when fields are added later.

These are the "fix it cheap or pay forever" items. Each is small individually; together they're the hygiene pass before the SDK locks the wire format.

## Scope rules

- **No business logic changes.** This is contract surface only.
- **All changes are spec-first.** Every wire change updates `docs/api/openapi.yaml` and `docs/specs/learner-summary-api.md` first; implementation follows.
- **No breaking changes once SDK ships.** Anything in this plan must land before any external SDK release; after that, these become major-version breaks.
- **`current_state.fields` projection is NOT changed here.** That is owned by `learner-summary-urs-projection.plan.md`.

---

## Tasks

### TASK-001 — Decide canonical learner-resource collection root

**Spec update**: `docs/specs/learner-summary-api.md` § Endpoint
**OpenAPI update**: `docs/api/openapi.yaml` (path key)
**Code update (if relocating)**: `src/learners/routes.ts`, `src/lambda/inspect.ts`, `infra/lib/control-layer-stack.ts`

Two options. Pick exactly one and document the rationale in the spec.

**Option A — Commit to `/v1/learners/{learner_reference}/...` as the canonical learner root.**
- Migrate (in follow-up plans, not here) `/v1/state/{learner_reference}/trajectory` → `/v1/learners/{learner_reference}/trajectory`, etc.
- Pros: REST-clean. The learner is the resource; state, decisions, and trajectory are sub-resources.
- Cons: requires a deprecation period for the existing `/v1/state/...` URLs and SDK method renames.

**Option B — Move this endpoint to `/v1/state/{learner_reference}/summary` for consistency with current routing.**
- Pros: zero migration cost. Existing `/v1/state/...` is the de-facto learner namespace.
- Cons: "summary" semantically aggregates state + decisions + signals + policy — naming it under `state/` is mildly misleading. State is one of five sections.

**Recommendation:** Option A. URL stability is more valuable than naming purity, and `/v1/learners/{ref}/summary` reads correctly to anyone seeing it cold. The tradeoff is a future migration plan for the other learner-scoped routes.

**Acceptance:** decision recorded in spec § Endpoint with one-line rationale; URL either kept (Option A) or moved (Option B). No code change in this task if Option A is selected.

---

### TASK-002 — Add `ETag` header

**File**: `src/learners/handler.ts` (Fastify), `src/lambda/inspect.ts` (Lambda)
**File**: `docs/api/openapi.yaml` § GET /v1/learners/{learner_reference}/summary responses
**File**: `docs/specs/learner-summary-api.md` — new § Caching subsection

The summary response is a deterministic projection of:
- `currentState.state_id` (changes only when state advances)
- The most recent `Decision.decision_id` for this learner (changes only when a decision is recorded)
- `recent_decisions_limit` query parameter (changes only with the request)
- `trajectory_fields` query parameter (changes only with the request)

ETag computation:
```ts
import { createHash } from 'node:crypto';

function computeSummaryETag(input: {
  stateId: string;
  latestDecisionId: string | null;
  recentDecisionsLimit: number;
  trajectoryFieldsCanonical: string;  // sorted, deduped, joined with comma
}): string {
  const payload = `${input.stateId}|${input.latestDecisionId ?? 'none'}|${input.recentDecisionsLimit}|${input.trajectoryFieldsCanonical}`;
  return `"${createHash('sha256').update(payload).digest('hex').slice(0, 16)}"`;
}
```

Set on every 200 response:
```
ETag: "a3f1c92b1e4d7e08"
```

OpenAPI updates: under the 200 response, add a `headers` section:
```yaml
'200':
  headers:
    ETag:
      description: |
        Strong validator for cache revalidation. Computed from state_id,
        latest decision_id, and request query parameters. Stable across
        identical requests; changes whenever underlying state or recent
        decisions change.
      schema:
        type: string
```

**Acceptance:** repeated identical requests return identical `ETag` values; mutating signals or decisions changes the ETag.

---

### TASK-003 — Add `Cache-Control`

**File**: same as TASK-002

```
Cache-Control: private, max-age=0, must-revalidate
```

- `private` — response is per-tenant, never shared by intermediate caches.
- `max-age=0, must-revalidate` — every revalidation goes back to origin (which can return 304 via TASK-004).
- We deliberately do **not** set a non-zero `max-age`; freshness expectations for an educator dashboard are "as fresh as the last signal", which only the origin knows.

OpenAPI: add `Cache-Control` header to the 200 response headers block.

**Acceptance:** `Cache-Control: private, max-age=0, must-revalidate` is set on every 2xx and 3xx response.

---

### TASK-004 — `If-None-Match` → 304 Not Modified

**File**: same as TASK-002

```ts
const requestETag = request.headers['if-none-match'];
const computed = computeSummaryETag({...});
if (requestETag === computed) {
  reply.code(304).header('ETag', computed).header('Cache-Control', 'private, max-age=0, must-revalidate').send();
  return;
}
// otherwise compute and return the full body with ETag
```

OpenAPI: add the 304 response and the `If-None-Match` request header:
```yaml
parameters:
  - name: If-None-Match
    in: header
    required: false
    schema: { type: string }
responses:
  '304':
    description: Not Modified — client's cached representation is current
    headers:
      ETag: { schema: { type: string } }
      Cache-Control: { schema: { type: string } }
```

**Optimization note:** computing the ETag still requires fetching `current_state.state_id` and the latest decision id — that's two cheap reads vs. the full aggregation. On Fastify+SQLite both are sub-ms; on Lambda+DynamoDB it's two GetItem calls instead of N parallel reads. Worth it.

**Tests:** new contract test SUM-009 — given identical requests, the second with `If-None-Match: <prior ETag>` returns 304 with no body.

**Acceptance:** repeated requests with valid `If-None-Match` return 304; mutating data invalidates and forces 200.

---

### TASK-005 — `signals_summary.by_source`

**Repo method**: `getSignalSummary(orgId, learnerRef)` in `src/signalLog/store.ts` and `src/signalLog/dynamodb-repository.ts`
**Type**: `SignalsSummary` in `src/learners/summary-handler-core.ts`
**OpenAPI**: `SignalsSummary` schema at `docs/api/openapi.yaml:2145`
**Spec**: `docs/specs/learner-summary-api.md` § signals_summary

Extend `SignalsSummary`:
```ts
export interface SignalsSummary {
  total_count: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
  by_source: Record<string, number>;  // NEW — source_system → count
}
```

SQLite implementation: `SELECT source_system, COUNT(*) FROM signal_log WHERE org_id = ? AND learner_ref = ? GROUP BY source_system`.

DynamoDB implementation: aggregate from the existing learner-indexed query results in-memory (signal volumes per learner are bounded; existing query already pages).

OpenAPI:
```yaml
SignalsSummary:
  required: [total_count, first_signal_at, last_signal_at, by_source]
  properties:
    # ...existing...
    by_source:
      type: object
      additionalProperties:
        type: integer
        minimum: 0
      description: |
        Per source_system count of accepted signals (e.g. canvas-lms,
        blackboard-lms, iready-diagnostic). Sum of values equals total_count.
```

**Tests:** SUM-010 — given a learner with 3 canvas-lms + 1 blackboard-lms signals, `signals_summary.by_source` is `{ "canvas-lms": 3, "blackboard-lms": 1 }` and sums to `total_count`.

**Acceptance:** the deck row "cross-system: Canvas + Blackboard" can be rendered from one field.

---

### TASK-006 — Constrain `active_policy.policy_key` to enum

**File**: `docs/api/openapi.yaml:2123-2143` (`ActivePolicy`)
**File**: `src/learners/summary-handler-core.ts:24-30` (`ActivePolicyResponse`)

The handler resolves `userType` from `loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner'`. Today the closed set is `learner | staff`; future expansion (e.g. `parent`, `admin`) is governed by routing config schema.

OpenAPI:
```yaml
policy_key:
  type: string
  enum: [learner, staff]
  description: |
    Resolved userType passed to loadPolicyForContext. v1.1 supports learner
    and staff routing keys; future user types will require a spec update.
```

TypeScript:
```ts
export type PolicyKey = 'learner' | 'staff';
export interface ActivePolicyResponse {
  policy_id: string;
  policy_key: PolicyKey;  // narrowed
  // ...
}
```

If `loadRoutingConfigForOrg` returns an unrecognised key, the handler must either coerce to `'learner'` (current fallback behavior) or fail closed with a 500 — pick coercion to keep the response shape stable. Add a server log when coercion happens.

**Tests:** typecheck verifies; SUM-006 (active_policy null path) unaffected. Add test for unrecognised routing key → coerces to `learner`.

**Acceptance:** SDK can type `policy_key as 'learner' | 'staff'` instead of `string`.

---

### TASK-007 — `active_policy.description` opt-in

**File**: `src/learners/summary-handler-core.ts` (validation + assembly)
**File**: `docs/api/openapi.yaml` (query parameter + ActivePolicy schema)
**File**: `docs/specs/learner-summary-api.md` § Query Parameters and § active_policy

Add query parameter:
```
include: comma-separated list of optional sections to include.
         Currently supported value: policy_description.
         Default: empty (description omitted).
```

When `include=policy_description` is present, populate `active_policy.description`; otherwise omit the field entirely (don't return empty string — omit the key, OpenAPI marks it optional).

OpenAPI:
```yaml
- name: include
  in: query
  required: false
  schema:
    type: string
    description: Comma-separated optional sections (currently policy_description)
# ...
ActivePolicy:
  required: [policy_id, policy_key, policy_version, rule_count]   # description removed
  properties:
    # ...
    description:
      type: string
      description: |
        Policy description. Only included when ?include=policy_description
        is set on the request. Use GET /v1/policies/:key for full policy detail.
```

**Why opt-in instead of just dropping it:** zero-cost path-of-least-resistance for clients that already display it (decision panel UI), opt-out by default for everyone else.

**Tests:** SUM-011 — without `include`, `active_policy` has no `description` key. With `include=policy_description`, the description is present and matches `loadPolicyForContext` output.

**Acceptance:** default response is ~220 bytes lighter; description is reachable when needed.

---

### TASK-008 — Tighten top-level `additionalProperties: false`

**File**: `docs/api/openapi.yaml:2163-2216` (`LearnerSummaryResponse`)

Add `additionalProperties: false` at the top level:
```yaml
LearnerSummaryResponse:
  type: object
  additionalProperties: false   # NEW
  required: [...]
  properties: {...}
```

Why now: future fields (e.g. `risk_signals`, `recommended_next_steps`, `cohort_context`) will be added with deliberation. Locking the top level prevents accidental additions from leaking into the response without spec changes.

**Acceptance:** Redocly lint passes; the schema is closed at the top level. Adding a new top-level field requires (1) spec update, (2) schema update, (3) implementation — the right order.

---

### TASK-009 — Document `recent_decisions` ordering on the schema

**File**: `docs/api/openapi.yaml:2198-2201`

```yaml
recent_decisions:
  type: array
  description: |
    Most recent decisions for this learner, ordered by decided_at DESC
    (newest first). Up to recent_decisions_limit items (1–50, default 10).
  items:
    $ref: '#/components/schemas/RecentDecisionItem'
```

The ordering is documented in the spec but not in the schema description; SDK code generators emit only the schema. Five-second fix; massive future-confusion saver.

**Acceptance:** generated SDK doc strings include the ordering guarantee.

---

## Verification checklist

- [ ] `npm run validate:api` passes (Redocly lint clean with all schema tightenings)
- [ ] `npm run validate:contracts` passes
- [ ] `npm test` passes (existing + new SUM-009/010/011)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Live curl with `If-None-Match` returns 304 on unchanged data, 200 on changed data
- [ ] Live curl response includes `ETag` and `Cache-Control` headers
- [ ] `signals_summary.by_source` populated and sums to `total_count`
- [ ] `active_policy.description` absent by default, present with `?include=policy_description`
- [ ] `policy_key` typed as enum in OpenAPI and TypeScript
- [ ] `LearnerSummaryResponse` has `additionalProperties: false`
- [ ] `recent_decisions` schema description states DESC ordering
- [ ] Spec § Endpoint records the URL collection-root decision (TASK-001)
- [ ] Spec § Caching subsection added

## Notes

- **Why this plan must land before any SDK release:** every item here is a contract change. After SDK 1.0, removing `recent_decisions_count` (URS projection plan), enum-narrowing `policy_key`, omitting `active_policy.description` by default, and tightening `additionalProperties` all become major-version breaks. Pre-SDK, they're harmless.
- **Why ETag instead of Last-Modified:** `state.updated_at` is a per-state timestamp, but the response also depends on the latest decision's timestamp and the request query parameters. ETag composing all of those is more accurate than a single timestamp.
- **Why `private` cache:** the response includes `learner_reference` and per-tenant policy data. Even if pseudonymised, it must never be served to a different tenant from a shared cache.
- **`include` query parameter pattern:** sets a precedent for future opt-in sections (e.g. `include=cohort_context,risk_signals`). Document the pattern in the spec so future additions follow it.
- **Out of scope (separate plan):** dashboard-side cache integration (using `If-None-Match` from a SWR layer), CDN caching of public learner metadata (none exists today), and webhook-triggered cache invalidation (not needed at v1.1 traffic).
