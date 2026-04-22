# Decision Outcomes (Derived View)

> Links each decision to the learner's subsequent state deltas so we can answer "did this decision precede improvement, regression, or neither?" with data. Feeds the student-outcome metrics (MC-C01..MC-C06) in `docs/specs/program-metrics.md`.

## Overview

A decision today is a terminal record — it captures the state that produced it but nothing about what happened next. For ED/IES SBIR, the outcome question is *"did this decision matter?"* — which requires joining each decision with the **next** observed state transitions for that learner within a bounded window.

This spec defines a **derived view** (no new storage) computed on-demand from the existing `decisions` table, the versioned `state_store`, and the state-delta fields already produced by `docs/specs/state-delta-detection.md`. Optionally, when `docs/specs/educator-feedback-api.md` is active, the view also reports whether an educator acted on the decision — enabling MC-C02 ("intervene followed by educator approve + positive delta").

**Why a view and not a table.** Pilot volume is small (≤ 500 learners × 8 weeks ≈ 15 k decisions). On-demand joins are cheap, require no write-path changes, and eliminate a class of drift bugs. A future `decision_outcomes` materialized table is an explicit **Phase II roadmap item** — see § *Out of Scope*.

---

## What an "outcome" is

For a given decision `D` at `decided_at = T0` with `learner_reference = L` and a **primary policy field** `F` (derived from the rule that matched):

| Outcome label | Definition |
|---------------|------------|
| `improved` | Within `window_days` (default 21) after `T0`, there exists a state version for `L` where the delta `F_delta` is strictly positive *and* the associated `F_direction` ∈ {`increasing`, `recovering`} |
| `regressed` | Within `window_days`, there exists a state version for `L` where `F_delta` is strictly negative *and* `F_direction` ∈ {`decreasing`, `decaying`} — and no `improved` event preceded it |
| `stable` | Within `window_days`, `|F_delta| < policy.stability_epsilon` (default 0.02) across all subsequent state versions |
| `no_signal` | No new state version for `L` within `window_days` (the learner generated no new signal or no signal moved `F`) |
| `pending` | Window has not yet elapsed (i.e. `T0 + window_days > now`) |

**Primary policy field** is resolved from the matched rule:

1. If the matched rule has a single scalar condition (e.g. `stabilityScore < 0.7`), the primary field is that scalar path.
2. If the matched rule has compound conditions (`all`/`any`), the primary field is the first condition's path.
3. The resolved path is stored on the outcome projection (`primary_field`), so consumers can introspect how the join was done.

**When feedback exists** (from `educator-feedback-api.md`), the projection also includes:

| Field | Description |
|-------|-------------|
| `educator_action` | `approve` / `reject` / `ignore` / `null` (from latest feedback row) |
| `educator_reason_category` | Closed set value or `null` |
| `time_to_educator_action_hours` | `feedback.created_at − decision.decided_at` in hours; `null` if no feedback |

---

## Endpoints

### `GET /v1/decisions/:decision_id/outcome`

**Auth:** `x-api-key` (tenant). Tenant-scoped.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `window_days` | No | Outcome observation window. Default 21. Max 180. |

**Response (200):**

```json
{
  "decision_id": "uuid",
  "learner_reference": "stu-10042",
  "decided_at": "2026-04-15T14:00:00Z",
  "window_days": 21,
  "primary_field": "stabilityScore",
  "outcome": "improved",
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

### `GET /v1/outcomes`

**Auth:** `x-api-key` (tenant). Tenant-scoped.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `from_time` | Yes | Decision `decided_at` lower bound (RFC3339) |
| `to_time` | Yes | Decision `decided_at` upper bound (RFC3339); must be ≥ `from_time` |
| `window_days` | No | Default 21 |
| `decision_type` | No | Filter: `reinforce` / `advance` / `intervene` / `pause` |
| `learner_reference` | No | Filter to a single learner |
| `page_token` | No | Opaque pagination cursor |
| `page_size` | No | 1–1000, default 100 |

**Response (200):**

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

### `GET /v1/admin/outcomes-summary` (admin)

**Auth:** `x-admin-api-key`.

**Query params:** same as `GET /v1/outcomes`, plus optional `org_id` filter.

**Response (200):** aggregate counts per org × decision_type × outcome label. Used by `GET /v1/admin/program-metrics` (per `program-metrics.md`) to compute MC-C01..MC-C06 without scanning individual outcomes.

```json
{
  "from_time": "2026-04-01T00:00:00Z",
  "to_time": "2026-04-30T23:59:59Z",
  "window_days": 21,
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

---

## Computation Semantics

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

---

## Requirements

### Functional

- [ ] `GET /v1/decisions/:id/outcome` returns the label + evidence for one decision
- [ ] `GET /v1/outcomes` returns paginated outcomes for a time window, filterable by `decision_type` and `learner_reference`
- [ ] `GET /v1/admin/outcomes-summary` returns aggregate counts across orgs per decision type × outcome
- [ ] Outcome computation is purely read-only — no writes to any store
- [ ] When feedback is unavailable (repo not wired or row missing), educator_* fields are `null` — the view still functions
- [ ] Primary-field resolution is deterministic and surfaced in the response (`primary_field`)
- [ ] `window_days` is capped at 180 (longer windows require a research export, not an API call)

### Non-functional

- [ ] `GET /v1/decisions/:id/outcome` P95 ≤ 200 ms at pilot scale
- [ ] `GET /v1/outcomes` (one month, ~2 k decisions) P95 ≤ 2 s
- [ ] No computation depends on a wall-clock except the `pending` branch
- [ ] No PII is introduced — outcome records carry only `learner_reference` (already pseudonymous) and numeric deltas

### Acceptance Criteria

- Given a decision at state v3 and three subsequent versions (v4, v5, v6) where `stabilityScore` climbs from 0.62 → 0.78, when the outcome is queried with `window_days=21`, then `outcome == "improved"` and `max_positive_delta ≈ 0.16`
- Given a decision with no subsequent state versions inside the window, then `outcome == "no_signal"`
- Given the window has not yet elapsed, then `outcome == "pending"` and `window_ends_at` is returned
- Given feedback exists for the decision with `action == "approve"`, then `educator_action == "approve"` and `time_to_educator_action_hours` is populated
- Given a cross-org `decision_id`, then response is `404 decision_not_found`

---

## Constraints

- **No new storage.** This spec adds endpoints only; all data comes from existing stores plus `educator-feedback-api.md`.
- **Primary field is best-effort.** For compound rules with multi-field logic, the chosen primary field may not fully characterize the outcome. The response always includes `primary_field` so consumers can interpret correctly.
- **Rule evolution.** If a policy is edited mid-pilot, outcomes computed against a decision use the primary field from that decision's `trace.matched_rule`, not the current policy. Trace immutability (`decision-engine.md` §4.1) guarantees this.
- **No Phase-II materialization.** A materialized `decision_outcomes` table is explicitly Phase II — see § Out of Scope.

---

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| Materialized `decision_outcomes` table populated by a post-decision job | Pilot volume does not require it; computing on-demand avoids drift | Phase II when learner counts > 5 k or window queries exceed 2 s |
| Multi-field outcome composition (e.g. weighted average of 3 deltas) | Over-engineers pilot evidence; single-field resolution is transparent and defensible | Phase II if sites ask |
| Outcomes webhook (push "decision improved" to external systems) | Enforcement is out of 8P3P's boundary | Phase II workflow automation |
| Confidence intervals / significance testing | External reviewer's job against the research export | Never in-product |

---

## Dependencies

### Required from other specs

| Dependency | Source | Status |
|------------|--------|--------|
| Immutable decision records with `trace.matched_rule` and `state_id`/`state_version` | `docs/specs/decision-engine.md` | **Complete** |
| Versioned state store with per-learner version query | `docs/specs/state-engine.md` | **Complete** |
| State-delta companion fields (`_delta`, `_direction`) | `docs/specs/state-delta-detection.md` | **Complete** |
| Educator feedback rows | `docs/specs/educator-feedback-api.md` | **New — this review** |
| API key middleware + org scoping | `docs/specs/api-key-middleware.md` | **Complete** |
| Admin API key for summary endpoint | `docs/specs/policy-management-api.md` | **Complete** |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| Per-decision outcome labels | `docs/specs/program-metrics.md` (MC-C01..MC-C06) |
| Aggregate outcome summary | `GET /v1/admin/program-metrics` |
| Outcome rows (de-identified) | `docs/specs/pilot-research-export.md` |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | `api-key-middleware.md` |
| `admin_key_required` | `policy-management-api.md` |
| `invalid_timestamp`, `invalid_time_range` | Shared |
| `invalid_page_token`, `page_size_out_of_range` | Shared |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `decision_not_found` | 404 | `decision_id` absent or not in caller's org |
| `window_days_out_of_range` | 400 | `window_days` < 1 or > 180 |
| `invalid_decision_type_filter` | 400 | `decision_type` query param not in closed set |

---

## Contract Tests

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

---

## File Structure

```
src/
├── outcomes/
│   ├── view.ts                # Pure function computeOutcome(decision, stateVersions, feedback?, windowDays)
│   ├── handler-core.ts        # Framework-agnostic request logic
│   ├── handler.ts             # Fastify handlers (GET /v1/decisions/:id/outcome, GET /v1/outcomes)
│   ├── admin-handler.ts       # Fastify handler (GET /v1/admin/outcomes-summary)
│   └── routes.ts              # Route registration
```

---

*Spec created: 2026-04-20 | Phase: v1.1 (pre-Month 0) / SBIR evidence layer | Depends on: `decision-engine.md`, `state-engine.md`, `state-delta-detection.md`, `educator-feedback-api.md` | Feeds: `program-metrics.md`, `pilot-research-export.md`*
