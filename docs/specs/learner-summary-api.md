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

Both prior specs must be implemented before this one. The summary endpoint composes their outputs; it introduces no new data models.

---

## Endpoint

### `GET /v1/learners/:learner_reference/summary`

Return a structured summary of a learner's current state, decision history, field trajectories, and active policy.

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
    }
  },

  "recent_decisions": [
    {
      "decision_id": "a1b2c3d4-...",
      "decision_type": "intervene",
      "decided_at": "2026-03-28T14:45:30Z",
      "matched_rule_id": "rule-decay-intervene",
      "rationale": "Rule rule-decay-intervene fired: stabilityScore_delta (-0.27) lt -0.1 AND stabilityScore (0.28) lt 0.6",
      "policy_version": "1.1.0"
    }
  ],
  "recent_decisions_count": 1,

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
{
  "error": { "code": "state_not_found", "message": "No state found for learner 'learner_001' in org 'springs'" }
}
```

---

## Response Shape Details

### `current_state`

The latest `LearnerState.state` object, including all stored canonical fields and delta companion fields. Delta fields (`_delta`, `_direction`) written by `state-delta-detection.md` are included as-is.

### `recent_decisions`

The last N decisions (default 10, configurable via `recent_decisions_limit`) ordered by `decided_at` descending. Each entry includes:

| Field | Source |
|-------|--------|
| `decision_id` | `Decision.decision_id` |
| `decision_type` | `Decision.decision_type` |
| `decided_at` | `Decision.decided_at` |
| `matched_rule_id` | `Decision.trace.matched_rule_id` |
| `rationale` | `Decision.trace.rationale` |
| `policy_version` | `Decision.trace.policy_version` |

PII exclusion: `state_snapshot` from `Decision.trace` is **not** included. Only the listed fields appear.

### `field_trajectories`

The `summary` object from `GET /v1/state/trajectory` for the fields named in `trajectory_fields` (or all numeric fields in current state if `trajectory_fields` is omitted). Pulled from the trajectory API core logic — same `getStateVersionRange()` call.

When no trajectory data exists (learner has only 1 state version), `field_trajectories` returns each field with `first_value` = `latest_value`, `overall_direction: "stable"`, `version_count: 1`.

### `active_policy`

The policy currently applied to this learner — resolved via `loadPolicyForContext(org_id, userType)` where `userType` is resolved from the org's routing config. Returns `policy_id`, `policy_key`, `policy_version`, `description`, and `rule_count`. Does **not** include rule conditions or thresholds (use `GET /v1/policies/:policy_key` for full detail).

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

- [ ] `GET /v1/learners/:learner_reference/summary` returns the full aggregated summary in a single response
- [ ] `current_state.fields` contains the complete latest `LearnerState.state` object including delta companion fields
- [ ] `recent_decisions` contains the last N decisions ordered by `decided_at` DESC; N is configurable via `recent_decisions_limit` (1–50, default 10)
- [ ] `field_trajectories` summary is computed via `getStateVersionRange()` (reuses `learner-trajectory-api.md` core logic) across all versions; defaults to all numeric fields in current state when `trajectory_fields` is not specified
- [ ] `active_policy` resolves the policy for the learner using the same resolution chain as the decision engine (`loadPolicyForContext(org_id, userType)`)
- [ ] `signals_summary` returns total signal count + date range from the signal log
- [ ] Response does not contain PII — `state_snapshot` from decision trace is excluded; `learner_reference` is the pseudonymous identifier only
- [ ] Auth: `x-api-key` required (not admin-only — tenant API key is sufficient)
- [ ] Read-only — no mutations, no side effects
- [ ] `generated_at` is the server timestamp when the summary was assembled
- [ ] If learner has no state (never received a signal), returns 404 `state_not_found`
- [ ] If active policy cannot be resolved (no policy for org), `active_policy` is `null` with no error (summary still returns 200)

### Acceptance Criteria

- Given learner `learner_001` in org `springs` with 3 state versions and 5 decisions, when `GET /v1/learners/learner_001/summary?org_id=springs` is called, then response includes `current_state`, `recent_decisions` (last 10 or fewer), `field_trajectories`, `active_policy`, and `signals_summary`
- Given `recent_decisions_limit=3`, then exactly 3 (or fewer if learner has fewer) decisions appear in the response
- Given learner's `stabilityScore_direction` in current state is `"declining"`, then `field_trajectories.stabilityScore.overall_direction` is `"declining"` (consistent with stored delta data)
- Given no state exists for the learner, then 404 `state_not_found` is returned
- Given a valid call without `x-api-key`, then 401 is returned
- Given `active_policy` cannot be resolved (no policy for org), then `active_policy: null` is returned and the rest of the summary is still returned (200)

---

## Constraints

- **Aggregation only — no new data** — this endpoint reads from existing stores: `StateRepository`, `DecisionRepository` (via `GET /v1/decisions` core), `SignalLogStore` (via `GET /v1/signals` count query), `FieldMappingsTable` (via `loadPolicyForContext`). No new tables or write paths.
- **PII exclusion is mandatory** — `state_snapshot` from decision trace must not appear in the response. Follows DEF-DEC-008-PII (PII forbidden keys + canonical snapshot).
- **`trajectory_fields` max 10** — reuses the same 10-field limit from `learner-trajectory-api.md`.
- **`recent_decisions` max 50** — prevents large response payloads for high-frequency learners.
- **No per-request freshness guarantee** — data reflects whatever is in the stores at query time. If a signal was just ingested and the state hasn't been applied yet, the summary reflects pre-signal state.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Nested dot-path trajectory fields | Depends on US-SKILL-001 (v1.2) | US-SKILL-001 implemented |
| PDF / document export | Client rendering responsibility; response is structured JSON | SDK or export spec |
| Real-time summary streaming | Not required for pilot | WebSocket / EventBridge integration |
| Multi-learner cohort summary | Separate analytics/reporting concern | Analytics API spec |
| Skill-level breakdown in `current_state.fields` | Nested skills require US-SKILL-001 | US-SKILL-001 implemented |
| Policy simulation ("what-if") | Separate concern from summary | Policy simulation spec |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| **`getStateVersionRange()`** — trajectory core | `docs/specs/learner-trajectory-api.md` | **Spec'd — MUST be implemented first** |
| **`{field}_direction` companion values in state** | `docs/specs/state-delta-detection.md` | **Spec'd — MUST be implemented before trajectory** |
| `getState()` — latest learner state | `docs/specs/state-engine.md` | **Complete** |
| `GET /v1/decisions` core (last N decisions for learner) | `docs/specs/decision-engine.md`, `src/decision/store.ts` | **Complete** |
| Signal log count query (total signals + date range) | `docs/specs/signal-log.md` | **Complete** |
| `loadPolicyForContext(orgId, userType)` | `docs/specs/decision-engine.md`, `src/decision/policy-loader.ts` | **Complete** |
| API key middleware + `org_id` isolation | `docs/specs/api-key-middleware.md` | **Complete** |
| PII hardening — DEF-DEC-008-PII (forbidden keys + canonical snapshot) | `docs/specs/signal-ingestion.md` | **Complete** |
| `GET /v1/policies` core (policy metadata) | `docs/specs/policy-inspection-api.md` | Spec'd (v1.1) |
| `InspectFunction` Lambda routing | `docs/specs/aws-deployment.md` | Spec'd (v1.1) |

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
| `missing_required_field` | Validation — `org_id` absent |
| `api_key_required` / `api_key_invalid` | Auth middleware |
| `invalid_format` | Validation — `trajectory_fields` too many or invalid |

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

> **Test strategy:** SUM-001 through SUM-008 use Fastify `inject` with SQLite in-process. Seed data: use `saveStateWithAppliedSignals` to create versioned state, insert decisions via `saveDecision`, and insert signals via `signalLog.store`. PII test (SUM-005) asserts against the forbidden keys list from `src/ingestion/forbidden-keys.ts`.

---

## Notes

- **Implementation pattern:** This endpoint is a pure aggregation — call each store/function once, assemble the response object, return. The handler should be structured as a `Promise.all([getState, getDecisions, getSignalCount, getPolicy, getTrajectory])` so the stores are hit concurrently where possible.
- **SDK note:** The response shape of this endpoint is intentionally designed to be the primary input for an 8P3P SDK method `getLearnerSummary(learnerRef, options)`. The SDK layer is out of scope for this spec but the JSON contract is forward-compatible.

---

*Spec created: 2026-03-28 | Phase: v1.1 | Derived from US-HANDOFF-001 (backlog) | Depends on: state-delta-detection.md → learner-trajectory-api.md → this spec (in order)*
