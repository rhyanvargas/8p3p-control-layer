# Program Metrics

> Defines how the 8P3P control layer proves — with data — that a deployed program (a) works, (b) helps educators, and (c) improves student and teacher outcomes. Written to the **ED/IES SBIR bar** so the same metrics support an ED/OCTAE narrative without rework.
>
> **Naming convention.** This spec defines the durable metrics catalog (`MC-*`) and the `/v1/admin/program-metrics` endpoint. Numeric targets are phase-scoped (Phase 0 Springs, Phase I SBIR) and live in the catalog tables below; endpoint and module identifiers are phase-neutral per [`internal-docs/foundation/api-naming-conventions.md`](../../internal-docs/foundation/api-naming-conventions.md).

## Overview

A DOE SBIR proposal asks three questions and expects numbers, not anecdotes:

1. **How do we measure success?**
2. **How will it be helpful to educators?**
3. **How impactful are the student and teacher outcomes?**

This spec is the answer. It defines a **metrics catalog** (MC-*), a **data sources matrix**, **acceptance thresholds**, and a **reporting cadence** that anchor the pilot-evidence layer across two pilot phases:

- **Phase 0 — Springs Charter** (current pilot; 2026-04-18 dry run → Springs operational pilot). Produces *formative* evidence: the loop runs, educators engage, decisions are interpretable.
- **Phase I — SBIR-funded site(s)** (post-award; 6-month window). Produces *summative* evidence positioned at ESSA Tier 4 (*demonstrates a rationale*) with a clear pathway to Tier 3 (*promising evidence*) in Phase II.

All metrics derive from artifacts the control layer *already* emits (`Decision`, `Decision.trace`, state versions, state deltas, signals, LIU counts) plus three small additions specified alongside this doc:

- `docs/specs/educator-feedback-api.md` — captures teacher Approve/Reject/Ignore actions (feeds educator-impact metrics)
- `docs/specs/decision-outcomes.md` — joins a decision to subsequent state deltas (feeds student-impact metrics)
- `docs/specs/pilot-research-export.md` — FERPA-safe de-identified bulk export (feeds external efficacy review)

`docs/specs/liu-usage-meter.md` is **promoted from post-pilot to pre-Month 0** (see `internal-docs/foundation/roadmap.md`) because decisions/day and decisions/educator are the denominators for nearly every outcome metric below.

---

## Relationship to Existing Docs

| Concern | Existing artifact | What this spec adds |
|---------|-------------------|---------------------|
| Operational readiness (go/no-go, legibility) | `internal-docs/pilot-operations/pilot-readiness-definition.md`, `internal-docs/pilot-operations/dry-run-script.md` | Quantified success criteria (MC-* metrics) — gates live on; this spec defines the numbers they unlock |
| Technical defensibility | `internal-docs/foundation/ip-defensibility-and-value-proposition.md` | DOE-shaped logic model in `internal-docs/foundation/logic-model.md` maps each IP capability to a success metric in this spec |
| LIU (billing usage) | `docs/specs/liu-usage-meter.md` | This spec re-purposes LIU as the **volume denominator** for all rate-based metrics (agreement rate, override rate, action latency) |
| Audit receipts | `docs/specs/receipts-api.md` | Receipts are the per-decision evidence unit; this spec aggregates them |

---

## Metrics Catalog

Metrics are grouped by DOE question. Each metric has a stable ID (MC-***NN***) used in the logic model (`internal-docs/foundation/logic-model.md`) and the research export (`docs/specs/pilot-research-export.md`).

### Group A — "How do we measure success?" (system-level)

These are the **floor** — if any fails, the pilot is not credible.

| ID | Metric | Definition | Data source | Phase 0 target (Springs) | Phase I target (SBIR) |
|----|--------|------------|-------------|---------------------------|------------------------|
| MC-A01 | **Decision volume** | Count of decisions (`matched: true`) per org per week | `decisions` table (`WHERE decided_at BETWEEN`) + `/v1/usage` | ≥ 1 decision / enrolled learner / week | ≥ 1 decision / enrolled learner / week for ≥ 80% of pilot weeks |
| MC-A02 | **Decision trace completeness** | % of decisions whose `trace` has non-null `state_snapshot`, `matched_rule`, `rationale`, `educator_summary` | `GET /v1/decisions` aggregation | 100% | 100% (regression gate) |
| MC-A03 | **Policy-rule coverage** | % of evaluations that matched a policy rule vs. returned `{ok: true, matched: false}` (which produces no decision, no LIU per `decision-engine.md` §4.3) | Derived: signals-producing-state vs. decisions count | ≥ 70% (if lower, policy is too narrow) | ≥ 70% after week 2 policy tuning |
| MC-A04 | **Pipeline latency — signal to decision** | P50 / P95 seconds from `POST /v1/signals` to `Decision.decided_at` | Server logs + `Decision.decided_at` | P50 ≤ 60 s; P95 ≤ 300 s | P50 ≤ 30 s; P95 ≤ 120 s |
| MC-A05 | **Time to first value** | Minutes from pilot-site onboarding call start to first decision visible in `/dashboard` to the educator | Onboarding runbook timestamp + first `decided_at` for that org | ≤ 120 min | ≤ 60 min |
| MC-A06 | **Determinism** | % of replayed decisions (same state_id + state_version + policy_version) that reproduce `(decision_type, matched_rule_id)` | Replay job using `decisions` + `state_store` | 100% | 100% (regression gate) |
| MC-A07 | **Uptime of pilot environment** | % of Mon–Fri 7AM–7PM local pilot time where `/health` returns 200 within 2 s | External uptime probe (e.g. Fly health checks + external cron) | ≥ 99.0% | ≥ 99.5% |
| MC-A08 | **Error rate** | Ratio of `5xx` responses on `/v1/signals`, `/v1/decisions`, `/v1/usage`, `/v1/feedback`, `/v1/outcomes`, `/dashboard/*` over rolling 24 h | Server logs | ≤ 1.0% | ≤ 0.5% |

### Group B — "How will it be helpful to educators?" (teacher-workflow metrics)

These are the metrics ED reviewers specifically read when evaluating "intellectual merit for educators." They rely on **`docs/specs/educator-feedback-api.md`** existing.

| ID | Metric | Definition | Data source | Phase 0 target | Phase I target |
|----|--------|------------|-------------|----------------|----------------|
| MC-B01 | **Educator engagement rate** | % of decisions with a logged educator view within 7 days of `decided_at` (view = authenticated `/dashboard` session loading that decision) | `dashboard_view_log` (new; lightweight; added in feedback spec) | ≥ 50% | ≥ 75% |
| MC-B02 | **Agreement rate** | % of reviewed decisions where educator submits `feedback.action = "approve"` | `decision_feedback` (new; see `educator-feedback-api.md`) | Report baseline; no target | ≥ 70% (implies trust) |
| MC-B03 | **Override rate** | % of reviewed decisions where `feedback.action = "reject"` with non-empty `reason_text` | Same | Report baseline | ≤ 25% |
| MC-B04 | **Ignore rate** | % of reviewed decisions where `feedback.action = "ignore"` (educator explicitly marks "not applicable now") | Same | Report baseline | ≤ 15% |
| MC-B05 | **Decision-to-action latency** | Median hours from `decided_at` to first non-null educator feedback | `decisions.decided_at` ↔ `decision_feedback.created_at` | Report baseline | ≤ 48 h |
| MC-B06 | **Coverage of at-risk learners** | % of learners flagged `intervene` or `pause` whose row was viewed by educator within 48 h | `dashboard_view_log` filtered by `decision_type` ∈ {`intervene`,`pause`} | ≥ 60% | ≥ 90% |
| MC-B07 | **Educator self-reported time savings** | Minutes saved per week per educator vs. pre-pilot baseline | Pre- and mid-pilot educator survey (template in `docs/guides/pilot-educator-survey.md` — TODO in Phase I) | Report narrative | ≥ 30 min/week per educator (target, not gate) |
| MC-B08 | **Educator Net Promoter-style question** | "Would you recommend 8P3P decisions to a colleague?" on 0–10 scale; NPS = %promoters − %detractors | Same survey | Report baseline | ≥ +20 |

### Group C — "How impactful are the student and teacher outcomes?" (efficacy)

These metrics rely on **`docs/specs/decision-outcomes.md`** (derived view joining decisions → subsequent state deltas).

| ID | Metric | Definition | Data source | Phase 0 target | Phase I target |
|----|--------|------------|-------------|----------------|----------------|
| MC-C01 | **Post-decision skill improvement rate** | % of `reinforce`/`advance` decisions followed, within 21 days, by a **positive** `_delta` on the primary policy field for that learner | `GET /v1/outcomes` derived view | Report baseline (descriptive) | ≥ 55% (positive vs. null effect) |
| MC-C02 | **Post-intervene improvement rate** | % of `intervene` decisions followed, within 21 days, by either a positive primary-field delta OR an educator `approve` + a logged follow-up signal | Same | Report baseline | ≥ 50% |
| MC-C03 | **Pause resolution rate** | % of `pause` decisions where the subsequent state within 21 days no longer matches the pause rule (evidence of recovery or teacher action) | Same | Report baseline | ≥ 40% |
| MC-C04 | **Time-to-mastery delta** | Median signals between first below-threshold state and first above-threshold state, pilot cohort vs. non-pilot comparison cohort (where available) | Pilot data + site's historical baseline | Report descriptive for Springs | ≥ 15% reduction vs. baseline (Tier-4-appropriate claim) |
| MC-C05 | **Early-identification rate** | % of eventually-intervened learners where the first `intervene` decision precedes the teacher's independent identification by ≥ 7 days (requires teacher to log "I would have caught this on day X" in feedback reason) | `decision_feedback.reason_text` structured field | Report baseline | ≥ 40% |
| MC-C06 | **False-positive rate (safety)** | % of `intervene` decisions marked by the educator as `reject` with `reason_category = "not_at_risk"` | `decision_feedback` | ≤ 20% | ≤ 15% |
| MC-C07 | **Equity dispersion check** | Agreement/override rates split by any demographic attribute the site chooses to send in `decision_context` (opt-in; pseudonymous) | `decisions.decision_context` + feedback | No target — *report* differences ≥ 10 pp across groups | No target — *report* differences ≥ 10 pp across groups |

> **MC-C07 notes.** The system never requires demographic data. Sites that choose to include it MUST do so only via pseudonymous flags in `decision_context` (never PII — see `internal-docs/foundation/terminology.md` and DEF-DEC-008-PII). This metric is descriptive; it is *not* a gate. It exists so IES reviewers can see we planned for equity instrumentation.

---

## Measurement Windows

| Phase | Window | Cadence | Output artifact |
|-------|--------|---------|-----------------|
| Phase 0 (Springs) | 8 weeks from first onboarded educator | Weekly pull; final report at week 8 | `internal-docs/reports/YYYY-MM-DD-springs-pilot-evidence.md` |
| Phase I (SBIR) | 6 months from site activation | Bi-weekly pull; interim report at month 3; final report at month 6 | `internal-docs/reports/YYYY-MM-DD-sbir-phase-i-evidence.md`; plus a de-identified export per `pilot-research-export.md` for external review |

---

## Requirements

### Functional

- [ ] Every metric MC-A*, MC-B*, MC-C* is computable from data that already exists in the control layer **or** from the three companion specs (`educator-feedback-api.md`, `decision-outcomes.md`, `liu-usage-meter.md`).
- [ ] A single admin endpoint `GET /v1/admin/program-metrics?org_id=<id>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` returns a JSON object keyed by metric ID, with `{value, numerator, denominator, window, computed_at}`. **Implementation is a read-only projection** — no new storage; it composes the LIU meter, decisions table, feedback store, and outcomes view.
- [ ] A per-tenant endpoint `GET /v1/program-metrics` returns the calling org's MC-A* and MC-B* only (MC-C* requires `x-admin-api-key` because equity/outcome aggregations cross multiple educators).
- [ ] The `decision_context` field is documented as the sole opt-in channel for site-provided pseudonymous demographic flags (no PII; forbidden-keys list in `src/ingestion/forbidden-keys.ts` continues to apply).
- [ ] A survey template (`docs/guides/pilot-educator-survey.md`) is available for MC-B07 / MC-B08 — simple 5-question form; no survey tech required for Phase 0; pilot sites may use Google Forms, Typeform, or paper.

### Non-functional

- [ ] `GET /v1/admin/program-metrics` completes in ≤ 2 s at pilot scale (≤ 500 learners × 8 weeks ≈ 15 k decisions) under P95.
- [ ] No metric computation writes to the signal/state/decision stores. Metrics are read-only.
- [ ] All metric values are derived deterministically from the underlying stores — i.e. re-running the query over the same window returns the same numbers (barring new writes).

### Acceptance Criteria

- Given 100 decisions for `org_springs` in April 2026, when `GET /v1/admin/program-metrics?org_id=org_springs&from=2026-04-01&to=2026-04-30` is called, then MC-A01 `value == 100` and `denominator == learners_with_at_least_one_signal_in_window`.
- Given MC-A02 is 100% on the test dataset, when one seeded decision is mutated to have `trace.rationale = null`, then MC-A02 drops below 100% in the next query.
- Given a cohort of 10 learners with `intervene` decisions and 6 subsequent positive deltas within 21 days, when MC-C02 is computed, then `value == 0.6`.
- Given an educator submits `feedback.action = "reject"` for 3 of 10 reviewed decisions, when MC-B03 is computed, then `value == 0.3`.

---

## Constraints

- **FERPA / privacy:** No metric names or values contain PII. All MC-C* aggregations use pseudonymous `learner_reference` only.
- **Determinism:** MC-* queries MUST NOT return wall-clock-dependent values (e.g. "decisions in the last 7 days" is always anchored to an explicit `from`/`to`, not `NOW()`).
- **Evidence-tier positioning:** No MC-C* claim will use language stronger than *"descriptive, quasi-experimental"* (ESSA Tier 4) in pilot reports. Tier 3 (promising evidence) requires a comparison group and is a Phase II ambition, not Phase I.
- **Minimal surface:** New specs listed above are the only additions; no other control-layer changes are required to compute these metrics.

---

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| Randomized controlled trial (RCT) design | Requires comparison group + randomization not available in single-site pilot | Phase II |
| Statistical significance testing in the product | Domain-specific; done by external reviewer against the research export | Ongoing, external |
| Student-level PII or identifiable demographic data | Forbidden by design (DEF-DEC-008-PII) | Never |
| Real-time alerting on metric drift | Observability tooling, not product | Post-pilot |
| Integration with state-provided outcome datasets (e.g. NWEA, iReady longitudinal) | Requires site DUA + external data contract | Phase II |

---

## Dependencies

### Required from other specs

| Dependency | Source | Status |
|------------|--------|--------|
| `Decision.trace.state_snapshot`, `matched_rule`, `rationale` | `docs/specs/decision-engine.md` | **Complete** |
| State-delta fields (`_delta`, `_direction`) | `docs/specs/state-delta-detection.md` | **Complete** |
| LIU counter + `/v1/usage` + `/v1/admin/usage` | `docs/specs/liu-usage-meter.md` | **Promoted to pre-Month 0** |
| Educator feedback ingestion | `docs/specs/educator-feedback-api.md` | **New — this review** |
| Decision-to-outcome derived view | `docs/specs/decision-outcomes.md` | **New — this review** |
| Research export (DOE reviewers) | `docs/specs/pilot-research-export.md` | **New — this review** |
| Pseudonymous `learner_reference` + forbidden PII keys | `docs/specs/signal-ingestion.md`, `src/ingestion/forbidden-keys.ts` | **Complete** |

### Provides to other docs

| Capability | Used by |
|------------|---------|
| MC-* catalog | `internal-docs/foundation/logic-model.md` (§ Outcomes column), `internal-docs/pilot-operations/pilot-readiness-definition.md` (§ Pilot Success Criteria), SBIR proposal narrative |
| `/v1/admin/program-metrics` endpoint | Pilot reports; future admin dashboard (Phase 2, `8p3p-admin` repo) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `admin_key_required` | Admin auth |
| `api_key_required` / `api_key_invalid` | Tenant auth |
| `invalid_timestamp`, `invalid_time_range` | Shared |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `metric_window_too_wide` | 400 | `to - from` exceeds the max window (365 days) |
| `metric_unavailable` | 409 | Underlying source (e.g. `decision_feedback` table) not populated for the requested window |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| MET-001 | integration | Seed 10 decisions; `GET /v1/admin/program-metrics` → MC-A01.value == 10 | 200; exact count |
| MET-002 | integration | Seed 10 decisions, 1 with null `trace.rationale`; MC-A02 == 0.9 | 200; precision ±0.01 |
| MET-003 | integration | Seed 10 decisions with 3 approves, 2 rejects, 1 ignore, 4 unreviewed; MC-B02 == 0.5 (3/6), MC-B03 == 0.333, MC-B04 == 0.167 | 200 |
| MET-004 | integration | 10 `intervene` decisions; 5 followed by positive primary-field delta within 21 days; MC-C02 == 0.5 | 200 |
| MET-005 | contract | Tenant endpoint never returns MC-C* keys | 200; response omits MC-C* |
| MET-006 | contract | Admin endpoint with `org_id=springs` returns only Springs data | 200; org isolation |
| MET-007 | contract | `from > to` → `invalid_time_range` | 400 |
| MET-008 | unit | Metric window > 365 days → `metric_window_too_wide` | 400 |

---

## Implementation Notes

- **Layering:** `GET /v1/admin/program-metrics` is implemented as a thin composition over existing repositories: `DecisionsRepository`, `UsageRepository`, `StateRepository`, `DecisionFeedbackRepository` (new — see `educator-feedback-api.md`), `DecisionOutcomesView` (new — see `decision-outcomes.md`). No new table.
- **Caching:** The endpoint does *not* cache; pilot volume is small (≤ 15 k decisions/window). Add caching only if P95 > 2 s in practice.
- **Survey data:** MC-B07 / MC-B08 values are injected into the report at authoring time (they are not persisted in the control layer). The survey template is the source of truth.
- **Replay for MC-A06:** A lightweight CLI (`scripts/replay-decisions.mjs`, to be added) loads `(state_id, state_version, policy_version)` tuples from historical decisions and re-evaluates them; the script outputs a diff count. This is a dev-time verification, not a runtime endpoint.

---

*Spec created: 2026-04-20 | Phase: v1.1 (pre-Month 0) / SBIR evidence layer | Anchors: `internal-docs/foundation/logic-model.md`, `docs/specs/educator-feedback-api.md`, `docs/specs/decision-outcomes.md`, `docs/specs/liu-usage-meter.md`, `docs/specs/pilot-research-export.md`*
