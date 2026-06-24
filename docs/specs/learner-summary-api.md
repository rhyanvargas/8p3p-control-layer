# Learner Summary API

> Single-endpoint aggregation that gives educators a complete picture of a learner — current state, recent decisions, field trajectories, active policy, and signal history — in one JSON response suitable for teacher dashboards and handoff reports.

## Overview

Teachers and administrators need to understand where a learner stands, how they got there, and what the system has recommended — without stitching together multiple API calls. This spec defines `GET /v1/learners/:learner_reference/summary`, a read-only projection endpoint that aggregates data from the existing state, decision, signal, and policy stores into a structured teacher-readable summary.

This endpoint closes the gap between the system's decision infrastructure and the educator experience: the response is explicitly designed to be renderable in a dashboard, exportable as a handoff document, and free of PII (inheriting all existing PII hardening).

**Sequential dependency chain:**

```
state-delta-detection.md   (provides direction fields in stored state)
         ↓
learner-trajectory-api.md  (provides getStateVersionRange + direction summaries)
         ↓
learner-summary-api.md     (this spec — aggregates trajectory + decisions + state + policy)
```

Both prior specs must be implemented before this one. The summary endpoint composes their outputs and introduces **no new tables or write paths**. It does add two **read-only** query methods to existing repositories — see § Dependencies.

---

## Endpoint

### `GET /v1/learners/:learner_reference/summary`

Return a structured summary of a learner's current state, decision history, field trajectories, and active policy.

### Collection root

**Decision:** Option A — keep `GET /v1/learners/{learner_reference}/summary` as the canonical learner-scoped path.

**Rationale:** First path-style learner URL in the API; response aggregates state + decisions + signals + policy + trajectory (not state-only). Dashboard will consume this URL in `.cursor/plans/dashboard-summary-migration.plan.md`.

**Forward policy:** Future learner-scoped read paths SHOULD use `/v1/learners/{learner_reference}/...`. Existing query-style routes (`GET /v1/state`, `GET /v1/state/trajectory`, `GET /v1/decisions`) remain unchanged for v1.1.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `learner_reference` | Learner identifier (pseudonymous — no PII) |

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID |
| `recent_decisions_limit` | No | Number of recent decisions to include (1–50, default 10) |
| `trajectory_fields` | No | Comma-separated list of canonical fields for trajectory summary (default: all numeric fields present in current state; max 10) |

**Response (200):**

```json
{
  "org_id": "springs",
  "learner_reference": "learner_001",
  "generated_at": "2026-03-28T15:00:00Z",

  "current_state": {
    "state_id": "springs:learner_001:v3",
    "state_version": 3,
    "updated_at": "2026-03-28T14:45:00Z",
    "fields": {
      "stabilityScore": 0.28,
      "masteryScore": 0.75,
      "timeSinceReinforcement": 172800,
      "stabilityScore_delta": -0.27,
      "stabilityScore_direction": "declining",
      "masteryScore_delta": 0.05,
      "masteryScore_direction": "improving"
    },
    "mastery_breakdown": {
      "overall": { "masteryScore": 0.725, "subject_count": 2, "skill_count": 2 },
      "subjects": {
        "Math": { "masteryScore": 0.9, "skill_count": 1, "strongest_skill": "MATH-301", "weakest_skill": "MATH-301" },
        "English": { "masteryScore": 0.55, "skill_count": 1, "strongest_skill": "ELA-201", "weakest_skill": "ELA-201" }
      },
      "skills": {
        "MATH-301": { "subject": "Math", "masteryScore": 0.9, "masteryScore_direction": "improving", "evidenceCount": 3 },
        "ELA-201": { "subject": "English", "masteryScore": 0.55, "masteryScore_direction": "stable", "evidenceCount": 2 }
      },
      "learning_gaps": [
        { "skill": "ELA-201", "subject": "English", "masteryScore": 0.55, "subject_masteryScore": 0.55, "gap": 0.0, "masteryScore_direction": "stable" }
      ],
      "gifted_interest": { "flagged": false, "label": null }
    }
  },

  "recent_decisions": [
    {
      "decision_id": "a1b2c3d4-...",
      "decision_type": "intervene",
      "decided_at": "2026-03-28T14:45:30Z",
      "matched_rule_id": "rule-decay-intervene",
      "educator_summary": "Needs stronger support now",
      "rationale": "Rule rule-decay-intervene fired: stabilityScore_delta (-0.27) lt -0.1 AND stabilityScore (0.28) lt 0.6",
      "policy_version": "1.1.0"
    }
  ],

  "field_trajectories": {
    "stabilityScore": {
      "first_value": 0.72,
      "latest_value": 0.28,
      "overall_direction": "declining",
      "version_count": 3
    },
    "masteryScore": {
      "first_value": 0.65,
      "latest_value": 0.75,
      "overall_direction": "improving",
      "version_count": 3
    }
  },

  "active_policy": {
    "policy_id": "springs:learner",
    "policy_key": "learner",
    "policy_version": "1.1.0",
    "description": "Springs Charter School — learner policy v1.1",
    "rule_count": 5
  },

  "signals_summary": {
    "total_count": 3,
    "first_signal_at": "2026-03-01T10:00:00Z",
    "last_signal_at": "2026-03-28T14:44:00Z"
  }
}
```

**Response (404) — learner not found:**

```json
{ "code": "state_not_found", "message": "No state found for learner 'learner_001' in org 'springs'" }
```

> Error envelope is **flat** (`{ code, message, field_path? }`), matching all other `/v1/state*` and `/v1/decisions` endpoints and the OpenAPI `StateError` schema. Aligned with `learner-trajectory-api.md`.

---

## Response Shape Details

### `current_state`

Metadata (`state_id`, `state_version`, `updated_at`) comes from the latest `LearnerState` record. `fields` is a **projection** of `LearnerState.state`, not a passthrough — see § URS field allowlist below.

### URS field allowlist (`current_state.fields`)

`current_state.fields` is a **projection** of `LearnerState.state`, not a passthrough. Only the canonical URS keys and their delta/direction companions appear:

- **Base keys (scalars):** `masteryScore`, `stabilityScore`, `timeSinceReinforcement`, `riskSignal`, `skill`
- **Companion suffixes:** `_delta`, `_direction`, `_delta_delta`, `_delta_direction`, `_delta_delta_delta`, `_delta_delta_direction` (applied to numeric base keys only)

Source-system vocabulary (xAPI envelope keys `group`, `object`, `extensions`, `generated`; vendor extensions like `bb_action_name`, `com_instructure_canvas`) is **stripped** even when present in stored state. Per-skill nested maps (`skills.{skillId}.*`) are **not** flattened into `fields` — they are exposed exclusively via `current_state.mastery_breakdown` (see `docs/specs/urs-aggregation.md`). Top-level `fields.masteryScore` / `fields.stabilityScore` remain the dominant-skill mirror for policy back-compat (`state-engine.md`); dashboards MUST use `mastery_breakdown.overall.masteryScore` as the canonical overall score.

Numeric scalars are rounded to 4 decimal places at the projection boundary. Only scalar values (`number`, `string`, `null`) are emitted; nested objects and arrays are dropped even if the key name would otherwise be allowed.

Source list of allowed keys: `src/learners/urs-allowlist.ts`. OpenAPI schema: `LearnerStateProjection`.

### `current_state.mastery_breakdown`

Structured skill → subject → overall aggregation, learning gaps, and gifted-interest flag. Built from `LearnerState.state.aggregation` at summary assembly time; see `docs/specs/urs-aggregation.md` for formulas, subject resolution, gap thresholds, and gifted criteria.

| Condition | Value |
|-----------|-------|
| Learner has ≥1 skill with finite `masteryScore` | Full `MasteryBreakdown` object (overall, subjects, skills, `learning_gaps`, `gifted_interest`) |
| `state.skills` absent or empty | JSON `null` (200 response; not an error) |

**Educator-facing separation:** `current_state.fields.masteryScore` is the dominant-skill mirror (unchanged for policy/trajectory back-compat). **`mastery_breakdown.overall.masteryScore` is the canonical overall score** for dashboards and the 60-second student profile.

OpenAPI schema: `MasteryBreakdown` in `docs/api/openapi.yaml`.

### `recent_decisions`

The last N decisions (default 10, configurable via `recent_decisions_limit`) ordered by `decided_at` descending. Each entry includes:

| Field | Source |
|-------|--------|
| `decision_id` | `Decision.decision_id` |
| `decision_type` | `Decision.decision_type` |
| `decided_at` | `Decision.decided_at` |
| `matched_rule_id` | `Decision.trace.matched_rule_id` |
| `educator_summary` | `Decision.trace.educator_summary` (teacher-facing short label, sourced from `DECISION_TYPE_TO_EDUCATOR_SUMMARY` in `src/decision/educator-summaries.ts`) |
| `rationale` | `Decision.trace.rationale` (engineer-facing rule-trace string; not for direct teacher display) |
| `policy_version` | `Decision.trace.policy_version` |

PII exclusion: `state_snapshot` from `Decision.trace` is **not** included. Only the listed fields appear.

**Educator vs engineer text:** `educator_summary` is the deck-facing wording (e.g. "Ready to move on", "Needs more practice", "Needs stronger support now") and MUST be the teacher-displayed string. `rationale` is the rule-evaluation trace and SHOULD only surface in inspection/audit panels.

### `field_trajectories`

The `summary` object from `GET /v1/state/trajectory` for the fields named in `trajectory_fields` (or all numeric fields in current state if `trajectory_fields` is omitted). Pulled from the trajectory API core logic — same `getStateVersionRange()` call and same `buildSummary` semantics.

**Single-version semantics (aligned with trajectory core):** When the learner has only 1 state version (or only 1 version where the field is non-null and numeric), the field's entry is `{ first_value: <value>, latest_value: <value>, overall_direction: null, version_count: 1 }`. Direction is `null` (not `"stable"`) because direction is undefined with a single data point. This matches `buildSummary` in `src/state/trajectory-handler-core.ts`.

**"All numeric fields" default (when `trajectory_fields` omitted):** Inspect `current_state.fields` and pick keys where `typeof value === 'number'`, excluding any keys that end in `_delta` (companion fields are not trajectory targets). Cap at 10 fields to honor the same limit as `learner-trajectory-api.md`.

**Pagination scope:** Summary computes `field_trajectories` across **all** versions in `[1, current_state.state_version]` by looping `getStateVersionRange` until `nextCursor === null` (typical learner has < 100 versions in v1.1; bounded loop with safety cap). Trajectory's per-page summary semantics do not apply here.

### `active_policy`

The policy currently applied to this learner — resolved via `loadPolicyForContext(org_id, userType)`.

**`userType` resolution chain (pinned):** Because the summary endpoint is learner-scoped and has no `source_system` context, `userType` is resolved as:

```ts
const userType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
```

This matches the decision engine's fallback (`src/decision/engine.ts`) when no `source_system` is supplied.

**`policy_key` constraint:** OpenAPI constrains `active_policy.policy_key` to `learner` or `staff`. After resolving `userType` from routing config, if the value is not one of those keys the handler coerces it to `learner` and emits a warning log (org id + unrecognized key). The coerced key is what is passed to `loadPolicyForContext` and returned in the response.

**Composition of the response object:**

| Field | Source |
|-------|--------|
| `policy_id` | `PolicyDefinition.policy_id` |
| `policy_key` | Coerced `userType` (`learner` or `staff`) passed to `loadPolicyForContext` (not a field on `PolicyDefinition`) |
| `policy_version` | `PolicyDefinition.policy_version` |
| `description` | `PolicyDefinition.description` — optional in OpenAPI; handler returns it by default at MVP. Opt-in omission via `?include=` is deferred to the full hygiene plan. |
| `rule_count` | `PolicyDefinition.rules.length` |

Does **not** include rule conditions or thresholds (use `GET /v1/policies/:policy_key` for full detail).

**Null behavior:** `loadPolicyForContext` **throws** an `Error` with `code: 'policy_not_found'` (from `src/shared/error-codes.ts`) when no filesystem candidate exists. The handler MUST catch **only** that specific code and set `active_policy: null`. Any other error code rethrows (do not swallow unrelated failures).

### `signals_summary`

Aggregate signal counts from the signal log:

| Field | Description |
|-------|-------------|
| `total_count` | Total signals received for this learner in this org |
| `first_signal_at` | Timestamp of the earliest accepted signal |
| `last_signal_at` | Timestamp of the most recent accepted signal |

---

## Requirements

### Functional

- [x] `GET /v1/learners/:learner_reference/summary` returns the full aggregated summary in a single response
- [x] `current_state.fields` is a URS projection of the latest `LearnerState.state` (canonical scalars and delta/direction companions only; see § URS field allowlist)
- [x] `current_state.mastery_breakdown` exposes per-skill/subject aggregation, learning gaps, and gifted-interest per `docs/specs/urs-aggregation.md`; `null` when learner has no skills
- [x] `recent_decisions` contains the last N decisions ordered by `decided_at` DESC; N is configurable via `recent_decisions_limit` (1–50, default 10)
- [x] `field_trajectories` summary is computed via `getStateVersionRange()` (reuses `learner-trajectory-api.md` core logic) across all versions; defaults to all numeric fields in current state when `trajectory_fields` is not specified
- [x] `active_policy` resolves the policy for the learner using the same resolution chain as the decision engine (`loadPolicyForContext(org_id, userType)`)
- [x] `signals_summary` returns total signal count + date range from the signal log
- [x] Response does not contain PII — `state_snapshot` from decision trace is excluded; `learner_reference` is the pseudonymous identifier only
- [x] Auth: `x-api-key` required (not admin-only — tenant API key is sufficient)
- [x] Read-only — no mutations, no side effects
- [x] `generated_at` is the server timestamp when the summary was assembled
- [x] If learner has no state (never received a signal), returns 404 `state_not_found`
- [x] If active policy cannot be resolved (no policy for org), `active_policy` is `null` with no error (summary still returns 200)

### Acceptance Criteria

- Given learner `learner_001` in org `springs` with 3 state versions and 5 decisions, when `GET /v1/learners/learner_001/summary?org_id=springs` is called, then response includes `current_state`, `recent_decisions` (last 10 or fewer), `field_trajectories`, `active_policy`, and `signals_summary`
- Given `recent_decisions_limit=3`, then exactly 3 (or fewer if learner has fewer) decisions appear in the response
- Given learner's `stabilityScore_direction` in current state is `"declining"`, then `field_trajectories.stabilityScore.overall_direction` is `"declining"` (consistent with stored delta data)
- Given no state exists for the learner, then 404 `state_not_found` is returned
- Given a valid call without `x-api-key`, then 401 is returned
- Given `active_policy` cannot be resolved (no policy for org), then `active_policy: null` is returned and the rest of the summary is still returned (200)

---

## Constraints

- **Aggregation only — no new tables, no write paths.** This endpoint reads from existing stores: `StateRepository`, `DecisionRepository`, `SignalLogRepository`, and `loadPolicyForContext`. Two new **read-only query methods** (`getRecentDecisionsByLearner`, `getSignalSummary`) are introduced on existing repos, owned by `decision-engine.md` and `signal-log.md` respectively (see § Dependencies).
- **PII exclusion is mandatory** — `state_snapshot` from decision trace must not appear in the response. Follows DEF-DEC-008-PII (PII forbidden keys + canonical snapshot).
- **Scalars-only projection** — `current_state.fields` emits only allowlisted keys whose values are `number`, `string`, or `null`. Source-system vocabulary, nested skill maps, and non-scalar values are stripped at the projection boundary (see § URS field allowlist).
- **`trajectory_fields` max 10** — reuses the same 10-field limit from `learner-trajectory-api.md`.
- **`recent_decisions` max 50** — prevents large response payloads for high-frequency learners.
- **No per-request freshness guarantee** — data reflects whatever is in the stores at query time. If a signal was just ingested and the state hasn't been applied yet, the summary reflects pre-signal state.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Nested dot-path trajectory fields (`skills.{skillId}.{metric}`) | Scoped in `learner-trajectory-api.md` §v1.2 (A3, 2026-06-23); current per-skill snapshot via `current_state.mastery_breakdown` | §v1.2 impl pending |
| PDF / document export | Client rendering responsibility; response is structured JSON | SDK or export spec |
| Real-time summary streaming | Not required for pilot | WebSocket / EventBridge integration |
| Multi-learner cohort summary | Separate analytics/reporting concern | Analytics API spec |
| Policy simulation ("what-if") | Separate concern from summary | Policy simulation spec |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| **`getStateVersionRange()`** — trajectory core | `docs/specs/learner-trajectory-api.md` | **Complete** (`src/state/store.ts:496`) |
| **`{field}_direction` companion values in state** | `docs/specs/state-delta-detection.md` | **Complete** (`src/state/engine.ts`) |
| `buildSummary` (trajectory summary computation) | `docs/specs/learner-trajectory-api.md` | **Complete** — exported from `src/state/trajectory-handler-core.ts` (TASK-001) |
| `getState()` — latest learner state | `docs/specs/state-engine.md` | **Complete** |
| **`getRecentDecisionsByLearner(orgId, learnerRef, limit)`** — DESC by `decided_at` | `docs/specs/decision-engine.md`, `src/decision/store.ts` | **Complete** — `src/decision/store.ts` (TASK-003), `src/decision/dynamodb-repository.ts` (TASK-004) |
| **`getSignalSummary(orgId, learnerRef)`** — `{ total_count, first_signal_at, last_signal_at }` | `docs/specs/signal-log.md` | **Complete** — `src/signalLog/store.ts` (TASK-006), `src/signalLog/dynamodb-repository.ts` (TASK-007) |
| `loadPolicyForContext(orgId, userType)` | `docs/specs/decision-engine.md`, `src/decision/policy-loader.ts` | **Complete** (note: throws `policy_not_found`; handler must catch — see § `active_policy`) |
| `loadRoutingConfigForOrg(orgId)` | `docs/specs/decision-engine.md`, `src/decision/policy-loader.ts` | **Complete** |
| **`mastery_breakdown` projection** — skill/subject/overall aggregation, learning gaps, gifted-interest | `docs/specs/urs-aggregation.md`, `src/learners/state-projection.ts` | **Complete** |
| **`getDecisionTypeSummaryForLearner(orgId, learnerRef)`** — full-history decision type counts for gifted flag | `docs/specs/urs-aggregation.md`, `src/decision/store.ts` | **Complete** |
| API key middleware + `org_id` isolation | `docs/specs/api-key-middleware.md` | **Complete** |
| PII hardening — DEF-DEC-008-PII (forbidden keys + canonical snapshot) | `docs/specs/signal-ingestion.md` | **Complete** |
| `GET /v1/policies` core (policy metadata) | `docs/specs/policy-inspection-api.md` | Spec'd (v1.1) |
| `InspectFunction` Lambda routing | `docs/specs/aws-deployment.md` | **Complete** — `src/lambda/inspect.ts` (`handleGetLearnerSummary`), CDK route at `infra/lib/control-layer-stack.ts` |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Educator-readable learner summary (JSON) | Teacher dashboard, grade-level handoff workflow |
| Foundation for SDK `getLearnerSummary()` method | Future SDK spec (post-pilot) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `state_not_found` | State Engine — no state for given org + learner |
| `org_scope_required` | Validation — `org_id` absent or blank (aligned with `GET /v1/state/trajectory`) |
| `missing_required_field` | Validation — `learner_reference` absent from path |
| `api_key_required` / `api_key_invalid` | Auth middleware |
| `invalid_format` | Validation — `trajectory_fields` too many or invalid; `recent_decisions_limit` out of range (1–50) |
| `invalid_type` | Validation — `recent_decisions_limit` or `trajectory_fields` wrong type |

### New (add during implementation)

None. All error cases map to existing codes.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| SUM-001 | Full summary for learner with history | `org_id=springs, learner_reference=learner_001` (3 state versions, 2 decisions seeded) | 200; all 5 top-level sections present; `recent_decisions` has ≤10 items; `field_trajectories` has entries for numeric fields |
| SUM-002 | `recent_decisions_limit` respected | `recent_decisions_limit=2`; learner has 5 decisions | `recent_decisions` array has exactly 2 items, most recent first |
| SUM-003 | Learner not found | `learner_reference=nobody` | 404 `state_not_found` |
| SUM-004 | Auth required | No `x-api-key` | 401 |
| SUM-005 | PII not leaked in response | Decisions seeded with `state_snapshot` containing canonical fields only | Response `recent_decisions` items do not contain `state_snapshot`; `current_state.fields` contains no PII keys (assert against forbidden key list) |
| SUM-006 | Active policy null when no policy | Learner in org with no configured policy | 200; `active_policy: null`; rest of summary populated |
| SUM-007 | Delta fields in current_state | Learner has received 2 signals; `stabilityScore_direction: "declining"` in latest state | `current_state.fields.stabilityScore_direction === "declining"` |
| SUM-008 | `field_trajectories.overall_direction` consistent | Learner: `stabilityScore` 0.72 → 0.55 → 0.28 | `field_trajectories.stabilityScore.overall_direction === "declining"` |
| SUM-012 | Unknown routing key coerces to learner | Org routing `default_policy_key: 'parent'` | 200; `active_policy.policy_key === 'learner'` |
| SUM-013 | Default trajectory fields are URS-projected | Learner with a numeric non-URS stored key | 200; `field_trajectories` keys ⊆ `current_state.fields` keys |

> **Test strategy:** SUM-001 through SUM-013 use Fastify `inject` with SQLite in-process. Seed data: use `saveStateWithAppliedSignals` to create versioned state, insert decisions via `saveDecision`, and insert signals via `signalLog.store`. PII test (SUM-005) asserts against the forbidden keys list from `src/ingestion/forbidden-keys.ts`.

---

## Notes

- **Implementation pattern:** This endpoint is a pure aggregation — call each store/function once, assemble the response object, return. The Fastify path operates against synchronous SQLite stores (`getState`, `getRecentDecisionsByLearner`, `getSignalSummary`, `loadPolicyForContext`, `getStateVersionRange`); concurrency is only meaningful on the Lambda DynamoDB path where every repo call is async. The Lambda handler MUST use `Promise.all([statePromise, recentDecisionsPromise, signalSummaryPromise, trajectorySummaryPromise])` (with policy resolved synchronously after state is in hand) to hit DynamoDB tables concurrently.
- **`resolveSummaryPolicyKey(orgId, rawUserType, warn)`** — exported from `src/learners/summary-handler-core.ts`; implements § `active_policy` coercion (returns `'learner' | 'staff'`, warns and coerces unrecognized routing keys). Shared by Fastify core and `src/lambda/inspect.ts`.
- **Default trajectory field discovery** — when `trajectory_fields` is omitted, both paths enumerate numeric keys from `projectLearnerState(currentState.state).fields` (not raw `LearnerState.state`): `resolveTrajectoryFields` in core, `resolveSummaryTrajectoryFields` in Lambda inspect.
- **Implementation note:** The handler walks `getStateVersionRange` in pages of 100 with a hard cap of 10 iterations (1000 versions maximum). This bounds the worst-case Lambda runtime and matches v1.1 traffic expectations; revisit when median learner exceeds ~500 versions.
- **SDK note:** The response shape of this endpoint is intentionally designed to be the primary input for an 8P3P SDK method `getLearnerSummary(learnerRef, options)`. The SDK layer is out of scope for this spec but the JSON contract is forward-compatible.
- **Pilot SLO (aspirational):** During school hours, target **p95 latency ≤ 500ms** and **99.5% availability** for `GET /v1/learners/:learner_reference/summary`. Monitor via CloudWatch InspectFunction metrics and `learner_summary` structured logs (`org_id`, `learner_reference`, `duration_ms`, `statusCode`). Alarms: error rate > 1% (5 min), duration p95 > 2000ms (5 min) — see `infra/lib/control-layer-stack.ts`.

---

*Spec created: 2026-03-28 | Phase: v1.1 | Derived from US-HANDOFF-001 (backlog) | Depends on: state-delta-detection.md → learner-trajectory-api.md → this spec (in order)*
