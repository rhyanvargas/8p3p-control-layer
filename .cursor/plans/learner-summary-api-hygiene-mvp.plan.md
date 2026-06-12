---
name: Learner Summary API Hygiene MVP
overview: "MVP contract-hygiene subset before pilot: lock URL root, tighten OpenAPI schema (additionalProperties, policy_key enum, optional description), document ordering. Defers ETag, by_source, and include query param to post-pilot perf plan. Spec-first per document-traceability and contract-enforcement rules."
todos:
  - id: TASK-001
    content: Record URL collection root decision in learner-summary-api spec
    status: completed
  - id: TASK-002
    content: Document recent_decisions DESC ordering in OpenAPI schema
    status: completed
  - id: TASK-003
    content: Add LearnerSummaryResponse additionalProperties false at top level
    status: completed
  - id: TASK-004
    content: Constrain policy_key enum and add unknown-key coercion with SUM-012
    status: completed
  - id: TASK-005
    content: Make ActivePolicy.description optional in OpenAPI and spec (handler unchanged)
    status: completed
  - id: TASK-006
    content: Register SUM-012 in spec Contract Tests and run npm run check
    status: completed
  - id: TASK-007
    content: Fix default field_trajectories discovery to read projected current_state.fields not raw state (SUM-013)
    status: completed
isProject: false
---

# Learner Summary API Hygiene MVP

**Spec**: `docs/specs/learner-summary-api.md`
**Parent plan (full SDK hygiene)**: `.cursor/plans/learner-summary-api-hygiene.plan.md` (TASK-002 through TASK-005 deferred to post-pilot)
**Master plan**: `.cursor/plans/pilot-mvp-launch.plan.md` (Wave 3 Step 1)
**Rules**: `.cursor/rules/document-traceability/RULE.md`, `.cursor/rules/contract-enforcement/RULE.md`, `.cursor/skills/plan-impl/SKILL.md`

## Why this plan exists

The full hygiene plan targets SDK lock-in ("fix it cheap pre-SDK or pay forever"). For the MVP pilot, only items that **lock the dashboard wire contract** ship now. Server-side caching (ETag/304), `signals_summary.by_source`, and the full `?include=policy_description` query param are deferred — they are additive and do not block product value.

Pre-requisites (already landed):
- `.cursor/plans/learner-summary-gate-readiness.plan.md`
- `.cursor/plans/learner-summary-urs-projection.plan.md`

## Spec Literals

> Verbatim copies from the spec. TASK bodies MUST quote these rather than paraphrase.

### From spec § Endpoint

```
GET /v1/learners/:learner_reference/summary
```

### From spec § recent_decisions

```
The last N decisions (default 10, configurable via recent_decisions_limit) ordered by decided_at descending.
```

### From spec § active_policy — userType resolution

```ts
const userType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
```

### From spec § active_policy — response fields

| Field | Source |
|-------|--------|
| `policy_key` | Coerced `userType` (`learner` or `staff`) passed to `loadPolicyForContext` (not a field on `PolicyDefinition`) |

### From OpenAPI `#/components/schemas/ActivePolicy` (post-MVP)

```yaml
required:
  - policy_id
  - policy_key
  - policy_version
  - rule_count
policy_key:
  type: string
  enum: [learner, staff]
  description: |
    Resolved userType passed to loadPolicyForContext. v1.1 supports learner
    and staff routing keys; future user types require a spec update.
description:
  type: string
  description: |
    Informational. Consumers SHOULD NOT depend on its presence. Use GET
    /v1/policies/:key for full policy detail.
```

## Prerequisites

Before starting implementation:
- [x] Gate readiness and URS projection plans show all tasks `completed`
- [x] `npm run check` passes on `main`

## Tasks

> **Status tracking**: Task status lives only in YAML frontmatter `todos`.

### TASK-001: Record URL collection root decision
- **Files**: `docs/specs/learner-summary-api.md`
- **Action**: Modify
- **Details**: Under § Endpoint, add a **Collection root** subsection:
  - **Decision:** Option A — keep `GET /v1/learners/{learner_reference}/summary` as the canonical learner-scoped path.
  - **Rationale:** First path-style learner URL in the API; response aggregates state + decisions + signals + policy + trajectory (not state-only). Dashboard will consume this URL in `.cursor/plans/dashboard-summary-migration.plan.md`.
  - **Forward policy:** Future learner-scoped read paths SHOULD use `/v1/learners/{learner_reference}/...`. Existing query-style routes (`GET /v1/state`, `GET /v1/state/trajectory`, `GET /v1/decisions`) remain unchanged for v1.1.
- **Depends on**: none
- **Verification**: Spec § Endpoint contains decision + one-line rationale; no route code change

### TASK-002: Document recent_decisions DESC ordering
- **Files**: `docs/api/openapi.yaml` (`LearnerSummaryResponse.properties.recent_decisions`)
- **Action**: Modify
- **Details**: Add `description` to the `recent_decisions` array property (quote spec literal):

```yaml
recent_decisions:
  type: array
  description: |
    Most recent decisions for this learner, ordered by decided_at DESC
    (newest first). Up to recent_decisions_limit items (1–50, default 10).
  items:
    $ref: '#/components/schemas/RecentDecisionItem'
```

- **Depends on**: none
- **Verification**: `npm run validate:api` passes; Redocly shows ordering in generated docs

### TASK-003: Tighten top-level additionalProperties
- **Files**: `docs/api/openapi.yaml` (`#/components/schemas/LearnerSummaryResponse`)
- **Action**: Modify
- **Details**: Add `additionalProperties: false` at the top level of `LearnerSummaryResponse` (mirrors `LearnerStateProjection` closure from URS projection plan).
- **Depends on**: none
- **Verification**: `npm run validate:api` passes; schema is closed at top level

### TASK-004: Constrain policy_key enum and add coercion
- **Files**: `docs/api/openapi.yaml` (`ActivePolicy`), `docs/specs/learner-summary-api.md` (§ active_policy), `src/learners/summary-handler-core.ts`, `src/lambda/inspect.ts`, `tests/contracts/learner-summary-api.test.ts`
- **Action**: Modify
- **Details**:
  1. OpenAPI — narrow `policy_key`:

```yaml
policy_key:
  type: string
  enum: [learner, staff]
  description: |
    Resolved userType passed to loadPolicyForContext. v1.1 supports learner
    and staff routing keys; future user types require a spec update.
```

  2. TypeScript — add `export type PolicyKey = 'learner' | 'staff'` and narrow `ActivePolicyResponse.policy_key`.
  3. Handler — shared `resolveSummaryPolicyKey(orgId, rawUserType, warn)` in `summary-handler-core.ts` (imported by Lambda). If `rawUserType` is not `learner` or `staff`, coerce to `'learner'` and call `warn` with org id + unrecognized key (`request.log.warn` in Fastify; `console.warn` in Lambda).
  4. Spec § active_policy — document enum + coercion behavior (replaces pass-through-only wording).
  5. Contract test **SUM-012**: org routing config with `default_policy_key: 'parent'` → 200, `active_policy.policy_key === 'learner'`.
- **Depends on**: TASK-001 (spec § active_policy updated in same PR)
- **Verification**: SUM-012 passes; `npm run typecheck` passes; existing SUM-006 unaffected

### TASK-005: Make description optional in schema (TASK-007-LITE)
- **Files**: `docs/api/openapi.yaml` (`ActivePolicy`), `docs/specs/learner-summary-api.md` (§ active_policy)
- **Action**: Modify
- **Details**:
  1. Remove `description` from `ActivePolicy.required` array.
  2. Add to `description` property: "Informational. Consumers SHOULD NOT depend on its presence. Use GET /v1/policies/:key for full policy detail."
  3. Spec note: handler **continues to return** `description` by default at MVP; opt-in omission via `?include=` is deferred to full hygiene plan.
  4. **Do not** add `include` query parameter in this plan.
- **Depends on**: TASK-004
- **Verification**: OpenAPI example still shows description; default responses unchanged; `npm run validate:api` passes

### TASK-006: Register SUM-012 + SUM-013 and run full check
- **Files**: `docs/specs/learner-summary-api.md` (§ Contract Tests)
- **Action**: Modify
- **Details**: Add rows:

| SUM-012 | Unknown routing key coerces to learner | Org routing `default_policy_key: 'parent'` | 200; `active_policy.policy_key === 'learner'` |
| SUM-013 | Default trajectory fields are URS-projected | Learner with a numeric non-URS stored key | 200; `field_trajectories` keys ⊆ `current_state.fields` keys |

Run: `npm run check`
- **Depends on**: TASK-002, TASK-003, TASK-004, TASK-005, TASK-007
- **Verification**: All checklist items green

### TASK-007: Default trajectory fields must use the URS-projected field set
- **Files**: `src/learners/summary-handler-core.ts` (`resolveTrajectoryFields`), `src/lambda/inspect.ts` (same logic ~line 324), `tests/contracts/learner-summary-api.test.ts`
- **Action**: Modify
- **Why this is "fix cheap pre-SDK or pay forever"**: `field_trajectories` keys are part of the dashboard/SDK wire contract. Today, when `trajectory_fields` is omitted, the handler enumerates **raw stored state** (`currentState.state`), so a non-URS numeric key still present in stored state can surface as a `field_trajectories` entry — even though `projectLearnerState()` strips it from `current_state.fields`. This contradicts the spec and the URS projection intent, and leaks once consumers pin to it.
- **Spec literal** (`docs/specs/learner-summary-api.md` § field_trajectories default):

```
When trajectory_fields is omitted: inspect current_state.fields and pick keys
where typeof value === 'number', excluding _delta companions.
```

- **Details**:
  1. Change `resolveTrajectoryFields` to enumerate the **projected** fields (the same `projectLearnerState(currentState).fields` object the response returns), not `currentState.state`.
  2. Apply the identical change in the Lambda path (`src/lambda/inspect.ts`) via `resolveSummaryTrajectoryFields` (same logic as core `resolveTrajectoryFields`).
  3. Keep the numeric + `!endsWith('_delta')` filter and the `.slice(0, 10)` cap.
  4. Contract test **SUM-013**: seed a learner whose stored state has a numeric non-URS key (e.g. `internalScratchScore`); assert it appears in neither `current_state.fields` nor `field_trajectories` keys, while URS numeric fields (e.g. `masteryScore`) do appear.
- **Depends on**: none (independent of TASK-001..006; URS projection plan already shipped `projectLearnerState`)
- **Verification**: SUM-013 passes; existing SUM-001..008 remain green; `field_trajectories` keys are a subset of `current_state.fields` keys for every response.

## Files Summary

### To Modify
| File | Task | Changes |
|------|------|---------|
| `docs/specs/learner-summary-api.md` | TASK-001, TASK-004, TASK-005, TASK-006 | URL decision, policy_key enum/coercion, description optional, SUM-012, SUM-013 |
| `docs/api/openapi.yaml` | TASK-002, TASK-003, TASK-004, TASK-005 | Schema tightenings |
| `src/learners/summary-handler-core.ts` | TASK-004, TASK-007 | PolicyKey type + coercion; projected-field trajectory discovery |
| `src/lambda/inspect.ts` | TASK-004, TASK-007 | Same coercion + projected-field discovery in Lambda path |
| `tests/contracts/learner-summary-api.test.ts` | TASK-004, TASK-006, TASK-007 | SUM-012, SUM-013 |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| Endpoint path unchanged at `/v1/learners/:ref/summary` | spec § Endpoint | TASK-001 |
| `recent_decisions` ordered by `decided_at` DESC | spec § recent_decisions | TASK-002 |
| `active_policy.policy_key` reflects resolved userType | spec § active_policy | TASK-004 |
| Response shape stable for SDK/dashboard consumers | spec § Notes SDK note | TASK-003, TASK-005 |
| Contract tests traceable (SUM-001..013) | spec § Contract Tests | TASK-006 |
| Default `field_trajectories` uses `current_state.fields` (URS-projected) | spec § field_trajectories default | TASK-007 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| SUM-012 | contract | Unknown routing key coerces to `learner` | TASK-004 |
| SUM-013 | contract | Default `field_trajectories` keys are a subset of URS-projected `current_state.fields` | TASK-007 |
| (regression) | contract | SUM-001..008 remain green | TASK-006 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § active_policy | `policy_key` is pass-through userType | Coerce unrecognized keys to `learner` with warn log | **Resolved** — spec § active_policy updated (TASK-004) |
| § active_policy | `description` listed as response field | OpenAPI marks optional; handler still returns it | **Resolved** — spec § active_policy updated (TASK-005); opt-in omission deferred |
| (full hygiene plan) | ETag, by_source, include param | Not in MVP plan | Deferred — `.cursor/plans/learner-summary-api-hygiene.plan.md` TASK-002..005, TASK-007 full |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Coercion hides misconfigured routing | Medium | Warn log on every coercion; monitor in pilot |
| `additionalProperties: false` rejects accidental fields | Low | Intentional — forces spec update before new top-level keys |

## Verification Checklist

- [x] All tasks completed
- [x] `npm run check` passes
- [x] Spec § Endpoint records URL decision (TASK-001)
- [x] SUM-012 and SUM-013 registered and green
- [x] `field_trajectories` keys are a subset of `current_state.fields` keys (TASK-007)
- [x] No ETag/304/by_source/include query changes in this PR

## Implementation Notes

Post-implementation parity (synced with `docs/specs/learner-summary-api.md`):

- **`PolicyKey`** — `export type PolicyKey = 'learner' | 'staff'` in `src/learners/summary-handler-core.ts`; narrows `ActivePolicyResponse.policy_key`.
- **`resolveSummaryPolicyKey()`** — shared coercion helper used by Fastify core and Lambda inspect paths; contract-tested via SUM-012.
- **Default trajectory discovery** — `resolveTrajectoryFields` (core) and `resolveSummaryTrajectoryFields` (Lambda) both enumerate `projectLearnerState(currentState.state).fields`, not raw stored state; contract-tested via SUM-013.
- **`ActivePolicyResponse.description`** — optional in TypeScript (`description?: string`); handler still populates it at MVP.

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006
TASK-007 (independent; land before TASK-006 so npm run check covers SUM-013)
```

## Deferred (post-pilot — full hygiene plan)

| Item | Plan reference | Why deferred |
|------|----------------|--------------|
| ETag + Cache-Control + 304 | hygiene TASK-002..004 | Additive; no dashboard lock-in |
| `signals_summary.by_source` | hygiene TASK-005 | RCU cost; no MVP UI consumer |
| `?include=policy_description` | hygiene TASK-007 | Schema marker sufficient for MVP |
| Redocly zero-warning cleanup (`/health` 4XX, webhook example) | hygiene TASK-010 | Unrelated paths; `validate:api` still passes (warnings only) |
