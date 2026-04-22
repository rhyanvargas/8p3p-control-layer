---
name: Program Metrics (SBIR Evidence Layer)
overview: Implement the MC-A*/B*/C* metrics catalog and the read-only admin/tenant endpoints that compose LIU, decisions, feedback, and decision-outcomes into a single SBIR-grade evidence report. Endpoint and module names are domain-neutral (`program-metrics`, not `pilot-metrics`) so the surface survives the Phase 0 → Phase I → GA lifecycle. Phase-specific numeric targets live in the spec's comparison tables, not in identifiers.
todos:
  - id: TASK-001
    content: Establish API-naming durability rule + rename spec + update cross-references (DONE via `.cursor/plans/pilot-evidence-prep.plan.md` PREP-001 on 2026-04-21)
    status: cancelled
  - id: TASK-002
    content: Define shared types and metric ID registry
    status: pending
  - id: TASK-003
    content: Implement Group A metric computer (system-level MC-A01..A08)
    status: pending
  - id: TASK-004
    content: Implement Group B metric computer (educator-workflow MC-B01..B08)
    status: pending
  - id: TASK-005
    content: Implement Group C metric computer (efficacy MC-C01..C07)
    status: pending
  - id: TASK-006
    content: Build ProgramMetricsService composer over existing repositories
    status: pending
  - id: TASK-007
    content: Add handler-core, Fastify handlers, and route registration for admin + tenant endpoints
    status: pending
  - id: TASK-008
    content: Add OpenAPI definitions for /v1/admin/program-metrics and /v1/program-metrics
    status: pending
  - id: TASK-009
    content: Add scripts/replay-decisions.mjs for MC-A06 determinism verification
    status: pending
  - id: TASK-010
    content: Create docs/guides/pilot-educator-survey.md template for MC-B07/B08
    status: pending
  - id: TASK-011
    content: Unit tests for each metric computer (determinism, edge cases, windowing)
    status: pending
  - id: TASK-012
    content: Integration tests MET-001..MET-004 (numeric accuracy)
    status: pending
  - id: TASK-013
    content: Contract tests MET-005..MET-008 (auth boundaries, error codes)
    status: pending
isProject: false
---

# Program Metrics (SBIR Evidence Layer)

**Spec**: `docs/specs/pilot-success-metrics.md` → renamed to `docs/specs/program-metrics.md` in TASK-001.

---

## Naming Convention (Durability Rule)

> This plan establishes a convention that future specs, plans, and reviews MUST follow.

**Rule.** API surfaces and code modules are named after the **domain resource** they expose, never after the **lifecycle stage** that motivated them. Lifecycle context (pilot / SBIR / GA) belongs in documentation bodies, numeric targets, and report filenames — **not** in route paths, directory names, or exported symbols.

**Evidence.**

- Existing admin endpoints are already lifecycle-neutral: `/v1/admin/usage`, `/v1/admin/policies`, `/v1/admin/outcomes-summary`. None are phase-scoped. `pilot-metrics` is the outlier.
- The metric IDs (`MC-A01`..`MC-C07`) and their computation never change between Phase 0 (Springs), Phase I (SBIR), and GA. Only the numeric *targets* in comparison tables change. Naming the endpoint after the phase forces a rename on every lifecycle step.
- "Program" is the K-12 term of art for a deployed initiative (intervention program, reading-fluency program). It maps cleanly to the unit these metrics describe (an org × policy deployment), matches ESSA/SBIR reviewer vocabulary, and does not collide with operational "metrics" (Prometheus-style `/health`).

**Applied name table.**


| Spec-literal ( spec says )                                                                     | Plan uses                       | Why                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `GET /v1/admin/pilot-metrics`                                                                  | `GET /v1/admin/program-metrics` | Durability rule above                            |
| `GET /v1/pilot-metrics`                                                                        | `GET /v1/program-metrics`       | Same                                             |
| `src/pilot-metrics/` (implicit)                                                                | `src/program-metrics/`          | Same                                             |
| `PilotMetricsService` (implicit)                                                               | `ProgramMetricsService`         | Same                                             |
| `MC-A01..MC-C07` metric IDs                                                                    | **unchanged**                   | Spec-stable identifiers                          |
| `metric_window_too_wide`, `metric_unavailable` error codes                                     | **unchanged**                   | Already lifecycle-neutral                        |
| Report filenames `YYYY-MM-DD-springs-pilot-evidence.md`, `YYYY-MM-DD-sbir-phase-i-evidence.md` | **unchanged**                   | These artifacts *are* lifecycle-scoped by design |


**Going-forward obligation.** Any future plan implementing a spec must (a) read the rule in `internal-docs/foundation/api-naming-conventions.md` (created in TASK-001), (b) flag phase-scoped identifiers in the spec as deviations, and (c) propose domain-neutral replacements in the plan's Deviations table.

---

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Requirements (Functional)

```
- Every metric MC-A*, MC-B*, MC-C* is computable from data that already exists in the control layer
  or from the three companion specs (educator-feedback-api.md, decision-outcomes.md, liu-usage-meter.md).
- A single admin endpoint GET /v1/admin/pilot-metrics?org_id=<id>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
  returns a JSON object keyed by metric ID, with {value, numerator, denominator, window, computed_at}.
  Implementation is a read-only projection — no new storage; it composes the LIU meter, decisions table,
  feedback store, and outcomes view.
- A per-tenant endpoint GET /v1/pilot-metrics returns the calling org's MC-A* and MC-B* only
  (MC-C* requires x-admin-api-key because equity/outcome aggregations cross multiple educators).
- The decision_context field is documented as the sole opt-in channel for site-provided
  pseudonymous demographic flags (no PII; forbidden-keys list in src/ingestion/forbidden-keys.ts continues to apply).
- A survey template (docs/guides/pilot-educator-survey.md) is available for MC-B07 / MC-B08 —
  simple 5-question form; no survey tech required for Phase 0.
```

> **Plan mapping:** the endpoint identifiers are renamed per the durability rule; the response shape `{value, numerator, denominator, window, computed_at}` is **unchanged** and is the canonical per-metric wire format below.

### From spec § Acceptance Criteria

```
- Given 100 decisions for org_springs in April 2026, when GET /v1/admin/pilot-metrics?org_id=org_springs&from=2026-04-01&to=2026-04-30
  is called, then MC-A01 value == 100 and denominator == learners_with_at_least_one_signal_in_window.
- Given MC-A02 is 100% on the test dataset, when one seeded decision is mutated to have trace.rationale = null,
  then MC-A02 drops below 100% in the next query.
- Given a cohort of 10 learners with intervene decisions and 6 subsequent positive deltas within 21 days,
  when MC-C02 is computed, then value == 0.6.
- Given an educator submits feedback.action = "reject" for 3 of 10 reviewed decisions,
  when MC-B03 is computed, then value == 0.3.
```

### From spec § Metrics Catalog — Group A


| ID     | Metric                                | Definition                                                                                                                                | Data source                                                    |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| MC-A01 | Decision volume                       | Count of decisions (`matched: true`) per org per week                                                                                     | `decisions` table + `/v1/usage`                                |
| MC-A02 | Decision trace completeness           | % of decisions whose `trace` has non-null `state_snapshot`, `matched_rule`, `rationale`, `educator_summary`                               | `GET /v1/decisions` aggregation                                |
| MC-A03 | Policy-rule coverage                  | % of evaluations that matched a policy rule vs. returned `{ok: true, matched: false}`                                                     | Derived: signals-producing-state vs. decisions count           |
| MC-A04 | Pipeline latency — signal to decision | P50 / P95 seconds from `POST /v1/signals` to `Decision.decided_at`                                                                        | Server logs + `Decision.decided_at`                            |
| MC-A05 | Time to first value                   | Minutes from pilot-site onboarding call start to first decision visible in `/dashboard` to the educator                                   | Onboarding runbook timestamp + first `decided_at` for that org |
| MC-A06 | Determinism                           | % of replayed decisions (same state_id + state_version + policy_version) that reproduce `(decision_type, matched_rule_id)`                | Replay job using `decisions` + `state_store`                   |
| MC-A07 | Uptime of pilot environment           | % of Mon–Fri 7AM–7PM local pilot time where `/health` returns 200 within 2 s                                                              | External uptime probe                                          |
| MC-A08 | Error rate                            | Ratio of `5xx` responses on `/v1/signals`, `/v1/decisions`, `/v1/usage`, `/v1/feedback`, `/v1/outcomes`, `/dashboard/*` over rolling 24 h | Server logs                                                    |


### From spec § Metrics Catalog — Group B


| ID     | Metric                               | Definition                                                                                         | Data source                                                             |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| MC-B01 | Educator engagement rate             | % of decisions with a logged educator view within 7 days of `decided_at`                           | `decision_view_log`                                                     |
| MC-B02 | Agreement rate                       | % of reviewed decisions where educator submits `feedback.action = "approve"`                       | `decision_feedback`                                                     |
| MC-B03 | Override rate                        | % of reviewed decisions where `feedback.action = "reject"` with non-empty `reason_text`            | Same                                                                    |
| MC-B04 | Ignore rate                          | % of reviewed decisions where `feedback.action = "ignore"`                                         | Same                                                                    |
| MC-B05 | Decision-to-action latency           | Median hours from `decided_at` to first non-null educator feedback                                 | `decisions.decided_at` ↔ `decision_feedback.created_at`                 |
| MC-B06 | Coverage of at-risk learners         | % of learners flagged `intervene` or `pause` whose row was viewed by educator within 48 h          | `decision_view_log` filtered by `decision_type` ∈ {`intervene`,`pause`} |
| MC-B07 | Educator self-reported time savings  | Minutes saved per week per educator vs. pre-pilot baseline                                         | Pre- and mid-pilot educator survey                                      |
| MC-B08 | Educator Net Promoter-style question | "Would you recommend 8P3P decisions to a colleague?" on 0–10 scale; NPS = %promoters − %detractors | Same survey                                                             |


### From spec § Metrics Catalog — Group C


| ID     | Metric                               | Definition                                                                                                                                                                                                              | Data source                                      |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| MC-C01 | Post-decision skill improvement rate | % of `reinforce`/`advance` decisions followed, within 21 days, by a positive `_delta` on the primary policy field for that learner                                                                                      | `GET /v1/outcomes` derived view                  |
| MC-C02 | Post-intervene improvement rate      | % of `intervene` decisions followed, within 21 days, by either a positive primary-field delta OR an educator `approve` + a logged follow-up signal                                                                      | Same                                             |
| MC-C03 | Pause resolution rate                | % of `pause` decisions where the subsequent state within 21 days no longer matches the pause rule                                                                                                                       | Same                                             |
| MC-C04 | Time-to-mastery delta                | Median signals between first below-threshold state and first above-threshold state, pilot cohort vs. non-pilot comparison cohort (where available)                                                                      | Pilot data + site's historical baseline          |
| MC-C05 | Early-identification rate            | % of eventually-intervened learners where the first `intervene` decision precedes the teacher's independent identification by ≥ 7 days (requires teacher to log "I would have caught this on day X" in feedback reason) | `decision_feedback.reason_text` structured field |
| MC-C06 | False-positive rate (safety)         | % of `intervene` decisions marked by the educator as `reject` with `reason_category = "not_at_risk"`                                                                                                                    | `decision_feedback`                              |
| MC-C07 | Equity dispersion check              | Agreement/override rates split by any demographic attribute the site chooses to send in `decision_context` (opt-in; pseudonymous)                                                                                       | `decisions.decision_context` + feedback          |


### From spec § Error Codes — New


| Code                     | HTTP | Description                                                                               |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------- |
| `metric_window_too_wide` | 400  | `to - from` exceeds the max window (365 days)                                             |
| `metric_unavailable`     | 409  | Underlying source (e.g. `decision_feedback` table) not populated for the requested window |


### From spec § Constraints

```
- FERPA / privacy: No metric names or values contain PII. All MC-C* aggregations use pseudonymous learner_reference only.
- Determinism: MC-* queries MUST NOT return wall-clock-dependent values (e.g. "decisions in the last 7 days"
  is always anchored to an explicit from/to, not NOW()).
- Evidence-tier positioning: No MC-C* claim will use language stronger than "descriptive, quasi-experimental" (ESSA Tier 4) in pilot reports.
- Minimal surface: New specs listed above are the only additions; no other control-layer changes are required to compute these metrics.
```

### From spec § Non-functional

```
- GET /v1/admin/pilot-metrics completes in <= 2 s at pilot scale (<= 500 learners x 8 weeks ~ 15k decisions) under P95.
- No metric computation writes to the signal/state/decision stores. Metrics are read-only.
- All metric values are derived deterministically from the underlying stores.
```

### Canonical per-metric wire format (from spec § Functional)

```json
{
  "value": <number | null>,
  "numerator": <number | null>,
  "denominator": <number | null>,
  "window": { "from": "<YYYY-MM-DD>", "to": "<YYYY-MM-DD>" },
  "computed_at": "<RFC3339>"
}
```

Metrics whose data source is external (MC-A04 latency from logs, MC-A07 uptime, MC-A08 error rate, MC-B07/B08 survey, MC-A06 replay script) return `value: null, numerator: null, denominator: null` **plus** a non-normative sibling `source_note` field identifying the out-of-band source. This is an explicit deviation; see § Deviations from Spec.

---

## Prerequisites

Before starting implementation:

- **PREREQ-001**: `docs/specs/liu-usage-meter.md` implemented — `UsageRepository`, `/v1/admin/usage`, `/v1/usage`. (Promoted to pre-Month 0 per spec § Overview.)
- **PREREQ-002**: `docs/specs/educator-feedback-api.md` implemented — `FeedbackRepository`, `decision_feedback` + `decision_view_log` stores, `POST /v1/decisions/:id/feedback`, `POST /v1/decisions/:id/view`.
- **PREREQ-003**: `docs/specs/decision-outcomes.md` implemented — `computeOutcome()`, `GET /v1/admin/outcomes-summary`.
- **PREREQ-004**: Admin auth middleware (`x-admin-api-key`) is present (already complete per `docs/specs/policy-management-api.md`).
- **PREREQ-005**: Tenant auth middleware (`x-api-key`) is present (already complete per `docs/specs/api-key-middleware.md`).

If PREREQ-001..003 are not complete, TASK-003..006 produce `metric_unavailable` (409) for metrics sourced from the missing repository — this is the spec-defined contract and is covered by the tests.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list. Do not duplicate per-task status in bodies.

### TASK-001: Establish API-naming durability rule + rename spec + update cross-references ✅ DONE (via PREP-001, 2026-04-21)

> **Status:** Executed in `.cursor/plans/pilot-evidence-prep.plan.md` PREP-001. This task exists here for traceability only; **do not re-run**. Frontmatter status is `cancelled` (done-via-PREP-001).
>
> **Ship artifacts (verified):**
> - Spec renamed: `docs/specs/program-metrics.md` (H1 `# Program Metrics`; endpoints `/v1/admin/program-metrics` and `/v1/program-metrics`).
> - Naming convention doc created: `internal-docs/foundation/api-naming-conventions.md`.
> - Cross-refs updated in `docs/specs/README.md`, `docs/specs/educator-feedback-api.md`, `docs/specs/decision-outcomes.md`, `docs/specs/pilot-research-export.md`, `internal-docs/pilot-operations/pilot-runbook.md`, `internal-docs/pilot-operations/pilot-readiness-definition.md`, `internal-docs/foundation/roadmap.md`.
> - Verification: `rg "pilot-metrics"` and `rg "pilot-success-metrics"` return zero hits outside `.cursor/plans/` (plan files retain literals for the deviation audit trail; this is expected and does not indicate drift).
>
> **Why kept in the plan:** future readers tracing `/v1/admin/program-metrics` back through the plan need a pointer to the rename event. Frontmatter status (`cancelled`) is the execution signal; this section is the narrative signal.

### TASK-002: Define shared types and metric ID registry

- **Files**:
  - `src/program-metrics/types.ts` (Create)
  - `src/program-metrics/metric-ids.ts` (Create)
- **Action**: Create
- **Details**:
  - `types.ts`: export the canonical per-metric shape quoted verbatim in § Spec Literals:

```ts
    export interface ProgramMetricValue {
      value: number | null;
      numerator: number | null;
      denominator: number | null;
      window: { from: string /* YYYY-MM-DD */; to: string /* YYYY-MM-DD */ };
      computed_at: string /* RFC3339 */;
      source_note?: string; // present only when the metric is sourced out-of-band (see Deviations)
    }

    export interface ProgramMetricsReport {
      org_id: string;
      window: { from: string; to: string };
      metrics: Record<MetricId, ProgramMetricValue>;
    }
    

```

- `metric-ids.ts`: export `MetricId` union (`"MC-A01" | ... | "MC-C07"`) and three exported arrays (`GROUP_A_IDS`, `GROUP_B_IDS`, `GROUP_C_IDS`) used by the tenant endpoint to omit Group C without duplicating the list.
- **Depends on**: TASK-001
- **Verification**: `tsc --noEmit` passes. `import { MetricId, GROUP_A_IDS, GROUP_B_IDS, GROUP_C_IDS, ProgramMetricValue, ProgramMetricsReport } from "src/program-metrics"` compiles.

### TASK-003: Implement Group A metric computer (system-level MC-A01..A08)

- **Files**: `src/program-metrics/metric-group-a.ts` (Create)
- **Action**: Create
- **Details**:
  - Export `computeGroupA(deps, window): Promise<Record<"MC-A01"|...|"MC-A08", ProgramMetricValue>>` where `deps = { decisionsRepo, usageRepo, signalLogRepo, stateRepo }` (interfaces already exist per PREREQ-001/PREREQ-005 and `docs/specs/signal-log.md`).
  - **MC-A01**: `numerator = count(decisions WHERE matched=true AND org=X AND decided_at IN [from,to])`; `denominator = count(distinct learners WHERE signal received_at IN [from,to])`; `value = numerator / denominator` (unit: decisions-per-learner).
  - **MC-A02**: `numerator = count(decisions WHERE trace.state_snapshot IS NOT NULL AND trace.matched_rule IS NOT NULL AND trace.rationale IS NOT NULL AND trace.educator_summary IS NOT NULL)`; `denominator = count(decisions in window)`; `value = numerator / denominator`.
  - **MC-A03**: `numerator = count(decisions)`; `denominator = count(signals producing new state in window)`; `value = numerator / denominator`. The "evaluated but unmatched" branch returns no decision (per `decision-engine.md` §4.3), so this ratio captures rule coverage.
  - **MC-A04**: Join `signal_log.received_at` → `decision.decided_at` via `decision.signal_id`, compute P50/P95 latency in seconds over the window. Return `value = P95, numerator = P50, denominator = count_decisions` with `source_note: "P50=<n>s; derived from signal_log ↔ decisions join"`. *Deviation: the spec lists "Server logs" but the DB join is lossless and deterministic — see Deviations table.*
  - **MC-A05**: Return `{value: null, source_note: "Sourced from internal-docs/pilot-operations/pilot-runbook.md onboarding timestamps"}`. Out-of-band; injected into reports at authoring time.
  - **MC-A06**: Return `{value: null, source_note: "Run scripts/replay-decisions.mjs (see TASK-009); result persisted in internal-docs/reports/"}`.
  - **MC-A07**: `{value: null, source_note: "External uptime probe"}`.
  - **MC-A08**: `{value: null, source_note: "Derived from server logs (Pino); see docs/guides/pilot-operations-runbook.md"}`.
  - All values carry `computed_at = new Date().toISOString()` and `window` echoed from input.
- **Depends on**: TASK-002
- **Verification**: Unit tests in TASK-011 pass with deterministic seeded data.

### TASK-004: Implement Group B metric computer (educator-workflow MC-B01..B08)

- **Files**: `src/program-metrics/metric-group-b.ts` (Create)
- **Action**: Create
- **Details**:
  - Export `computeGroupB(deps, window): Promise<Record<"MC-B01"|...|"MC-B08", ProgramMetricValue>>` where `deps = { decisionsRepo, feedbackRepo }` (from PREREQ-002).
  - **MC-B01**: `numerator = count(decisions with >=1 view_log row WHERE (viewed_at - decided_at) <= 7 days)`; `denominator = count(decisions in window)`.
  - **MC-B02**: `numerator = count(decisions with latest feedback.action="approve")`; `denominator = count(decisions with any feedback row)` — "reviewed decisions" per spec.
  - **MC-B03**: `numerator = count(feedback.action="reject" AND reason_text IS NOT NULL AND length(reason_text)>0)`; `denominator = count(reviewed decisions)`.
  - **MC-B04**: `numerator = count(feedback.action="ignore")`; `denominator = count(reviewed decisions)`.
  - **MC-B05**: `value = median(first_feedback.created_at - decision.decided_at in hours)` over decisions that received ≥ 1 feedback row; `numerator = count_decisions_with_feedback`, `denominator = count_decisions_in_window`.
  - **MC-B06**: `numerator = count(decisions WHERE decision_type IN ('intervene','pause') AND >=1 view_log row WHERE (viewed_at - decided_at) <= 48h)`; `denominator = count(decisions WHERE decision_type IN ('intervene','pause') in window)`.
  - **MC-B07**: `{value: null, source_note: "Sourced from docs/guides/pilot-educator-survey.md responses; injected at report authoring time"}`.
  - **MC-B08**: `{value: null, source_note: "Sourced from same survey; NPS computed externally"}`.
  - If `feedbackRepo` is null/unwired, throw `MetricUnavailableError("MC-B*", "decision_feedback repository not wired")` — handler-core maps to 409 `metric_unavailable`.
- **Depends on**: TASK-002, PREREQ-002
- **Verification**: Unit tests in TASK-011.

### TASK-005: Implement Group C metric computer (efficacy MC-C01..C07)

- **Files**: `src/program-metrics/metric-group-c.ts` (Create)
- **Action**: Create
- **Details**:
  - Export `computeGroupC(deps, window): Promise<Record<"MC-C01"|...|"MC-C07", ProgramMetricValue>>` where `deps = { outcomesView, feedbackRepo, decisionsRepo }` (from PREREQ-003).
  - **Reuse rule**: do not re-implement the outcome label logic. Call `outcomesView.summarize(window, window_days=21)` which returns the counts block from `GET /v1/admin/outcomes-summary` (per `decision-outcomes.md` § Endpoints). Then derive MC-C01..C03 from those counts:
    - **MC-C01**: Sum `improved` over `reinforce` + `advance` decision types ÷ total non-pending of those types.
    - **MC-C02**: `improved_or_educator_approved / total_non_pending` over `intervene` decision type. "Educator approved + follow-up signal" path uses `feedbackRepo.findByDecision(decision_id)` joined against outcomes where `outcome = "improved"` OR (`educator_action = "approve"` AND `observed_state_versions.length > 0`).
    - **MC-C03**: `(improved + stable where no-longer-matches-pause-rule) / total_non_pending` over `pause`. The "no longer matches" check uses `outcomesView.primaryFieldAtDecision` vs. `primary_field_latest` with the matched rule's threshold from `decision.trace.matched_rule`.
  - **MC-C04**: `{value: null, source_note: "Requires comparison cohort; computed externally against pilot-research-export.md data set"}`.
  - **MC-C05**: `numerator = count(decisions WHERE decision_type="intervene" AND feedback.reason_category="agree_would_have_missed")`; `denominator = count(eventually-intervened learners)` = distinct learners appearing as `decision_type="intervene"` in window.
  - **MC-C06**: `numerator = count(feedback WHERE action="reject" AND reason_category="not_at_risk" AND decision.decision_type="intervene")`; `denominator = count(decisions WHERE decision_type="intervene" in window)`.
  - **MC-C07**: `{value: null, source_note: "Descriptive only (ESSA Tier 4); report differences >=10pp across decision_context demographic flags. Not computed numerically by endpoint."}`. Per spec § MC-C07 notes, this metric is **not a gate**; it exists to document equity instrumentation.
- **Depends on**: TASK-002, PREREQ-002, PREREQ-003
- **Verification**: Unit tests in TASK-011.

### TASK-006: Build ProgramMetricsService composer over existing repositories

- **Files**: `src/program-metrics/service.ts` (Create)
- **Action**: Create
- **Details**:
  - Export class `ProgramMetricsService`:

```ts
    constructor(deps: {
      decisionsRepo, usageRepo, signalLogRepo, stateRepo,
      feedbackRepo /* may be null if PREREQ-002 not live */,
      outcomesView /* may be null if PREREQ-003 not live */,
    })

    async computeReport(opts: { org_id: string; from: string; to: string; include_group_c: boolean }): Promise<ProgramMetricsReport>
    

```

- `computeReport` calls `computeGroupA`, `computeGroupB`, and (when `include_group_c === true`) `computeGroupC` in parallel via `Promise.all`. Missing prerequisite repos surface as `MetricUnavailableError` on the affected group only — Group A still returns even if feedback is not wired.
- Validates `from`/`to` as ISO-8601 dates; throws `InvalidTimeRangeError` if `from > to`, `MetricWindowTooWideError` if `(to - from) > 365 days`.
- No writes to any store. No `NOW()` used except for `computed_at`. Per spec § Constraints: metric queries MUST be anchored to explicit `from`/`to`.
- No caching in v1 per spec § Implementation Notes ("Add caching only if P95 > 2 s in practice").
- **Depends on**: TASK-003, TASK-004, TASK-005
- **Verification**: Unit test constructs service with mock repos and verifies all three groups compose correctly. Type-check passes.

### TASK-007: Handler-core + Fastify handlers + route registration

- **Files**:
  - `src/program-metrics/handler-core.ts` (Create)
  - `src/program-metrics/handler.ts` (Create)
  - `src/program-metrics/routes.ts` (Create)
  - `src/server.ts` (Modify)
- **Action**: Create + Modify
- **Details**:
  - `handler-core.ts`: framework-agnostic `runProgramMetricsRequest({ org_id, from, to, auth: "admin"|"tenant" }): Promise<ProgramMetricsReport | ErrorResponse>`. When `auth === "tenant"`, strips MC-C* keys from the response (tenant endpoint never returns MC-C* per spec § Requirements).
  - `handler.ts`: two Fastify handlers:
    - `handleAdminProgramMetrics(req, reply)` — requires `x-admin-api-key` (returns 401 `admin_key_required` if missing/invalid); accepts required `org_id`; passes `auth: "admin"`.
    - `handleTenantProgramMetrics(req, reply)` — requires `x-api-key` (401 `api_key_required`/`api_key_invalid`); derives `org_id` from the API key context; passes `auth: "tenant"`.
  - Both handlers map errors: `InvalidTimeRangeError` → 400 `invalid_time_range`; `MetricWindowTooWideError` → 400 `metric_window_too_wide`; `MetricUnavailableError` → 409 `metric_unavailable`; missing required params → 400 `invalid_request`.
  - `routes.ts`: exports `registerProgramMetricsRoutes(app, service)` which registers:
    - `app.get("/v1/admin/program-metrics", { preHandler: adminAuth }, handleAdminProgramMetrics)`
    - `app.get("/v1/program-metrics", { preHandler: tenantAuth }, handleTenantProgramMetrics)`
  - `src/server.ts`: import and call `registerProgramMetricsRoutes(app, service)` next to the existing `registerPolicyManagementRoutes` call. Wire the service from the existing repositories already instantiated in the bootstrap block.
- **Depends on**: TASK-006
- **Verification**: `curl http://localhost:3000/v1/admin/program-metrics?org_id=org_springs&from=2026-04-01&to=2026-04-30 -H "x-admin-api-key: ..."` returns a 200 JSON matching `ProgramMetricsReport`. Contract tests in TASK-013 pass.

### TASK-008: OpenAPI additions

- **Files**: `docs/api/openapi.yaml` (Modify)
- **Action**: Modify
- **Details**:
  - Add two path items: `/v1/admin/program-metrics` (admin) and `/v1/program-metrics` (tenant).
  - Both share a response schema `ProgramMetricsReport` with `components.schemas.ProgramMetricValue` matching the canonical wire format:

```yaml
    ProgramMetricValue:
      type: object
      required: [value, numerator, denominator, window, computed_at]
      properties:
        value: { oneOf: [{ type: number }, { type: "null" }] }
        numerator: { oneOf: [{ type: integer }, { type: "null" }] }
        denominator: { oneOf: [{ type: integer }, { type: "null" }] }
        window:
          type: object
          required: [from, to]
          properties:
            from: { type: string, format: date }
            to:   { type: string, format: date }
        computed_at: { type: string, format: date-time }
        source_note: { type: string }
    

```

- Tenant path includes **only** MC-A* and MC-B* keys in its example response; admin path includes all three groups.
- Add `metric_window_too_wide` and `metric_unavailable` to the shared error-codes section.
- **Depends on**: TASK-007
- **Verification**: `npm run validate:api` (redocly lint) passes. `rg "program-metrics" docs/api/openapi.yaml` shows two path entries.

### TASK-009: Replay-verification CLI for MC-A06

- **Files**: `scripts/replay-decisions.mjs` (Create)
- **Action**: Create
- **Details**: Per spec § Implementation Notes: "A lightweight CLI (`scripts/replay-decisions.mjs`, to be added) loads `(state_id, state_version, policy_version)` tuples from historical decisions and re-evaluates them; the script outputs a diff count." Reuses the existing `evaluatePolicy()` function from `src/decision/`. Prints `replayed=N mismatched=M mismatch_rate=<float>` to stdout. This is a dev-time verification, not a runtime endpoint; the MC-A06 value in `/v1/admin/program-metrics` remains `null` with `source_note` pointing to this script.
- **Depends on**: TASK-003
- **Verification**: `node scripts/replay-decisions.mjs --org org_springs --from 2026-04-01 --to 2026-04-30` runs on seeded data and reports `mismatched=0`.

### TASK-010: Survey template for MC-B07/B08

- **Files**: `docs/guides/pilot-educator-survey.md` (Create)
- **Action**: Create
- **Details**: Simple 5-question markdown template per spec § Requirements: three minutes-saved questions (Q1: total minutes saved/week; Q2: minutes saved on intervention planning; Q3: minutes saved on progress review), one NPS question (Q4: "Would you recommend 8P3P decisions to a colleague? (0–10)"), one open-text (Q5: "What would you change?"). No survey tech required — paper/Google Forms/Typeform all acceptable. MC-B07 aggregates Q1/Q2/Q3; MC-B08 computes NPS from Q4.
- **Depends on**: none
- **Verification**: File exists; referenced from `docs/specs/program-metrics.md` § Requirements (already present in spec, no edit needed after TASK-001).

### TASK-011: Unit tests for each metric computer

- **Files**:
  - `tests/unit/program-metrics/metric-group-a.test.ts` (Create)
  - `tests/unit/program-metrics/metric-group-b.test.ts` (Create)
  - `tests/unit/program-metrics/metric-group-c.test.ts` (Create)
  - `tests/unit/program-metrics/service.test.ts` (Create)
- **Action**: Create
- **Details**:
  - Group A: 8 tests — one per MC-A01..A08. Seed known `decisionsRepo` / `usageRepo` / `signalLogRepo` mocks; assert exact `numerator`/`denominator`/`value`. Determinism test: run twice over the same seeded data, assert byte-identical `ProgramMetricValue` except for `computed_at`.
  - Group B: 8 tests — one per MC-B01..B08. Includes the spec acceptance criterion "3 of 10 reviewed decisions are rejects → MC-B03 = 0.3".
  - Group C: 7 tests — one per MC-C01..C07. Includes "10 intervene decisions with 6 positive deltas → MC-C02 = 0.6" (maps to acceptance criterion via MC-C01 pattern — see Requirements Traceability).
  - Service: tests that (a) parallelizes via `Promise.all`, (b) handles missing `feedbackRepo` with `metric_unavailable` on Group B only while Group A still returns, (c) rejects `from > to` with `invalid_time_range`, (d) rejects window > 365 days with `metric_window_too_wide`.
- **Depends on**: TASK-003, TASK-004, TASK-005, TASK-006
- **Verification**: `npm test -- tests/unit/program-metrics` all green.

### TASK-012: Integration tests MET-001..MET-004

- **Files**: `tests/integration/program-metrics.test.ts` (Create)
- **Action**: Create
- **Details**:
  - **MET-001**: Seed 10 decisions for org_springs in window; `GET /v1/admin/program-metrics` returns `metrics["MC-A01"].numerator === 10`, `value === 10 / distinct_learners`.
  - **MET-002**: Seed 10 decisions, mutate one to `trace.rationale = null`; `metrics["MC-A02"].value === 0.9` (±0.01).
  - **MET-003**: Seed 10 decisions with 3 approves, 2 rejects, 1 ignore, 4 unreviewed (6 reviewed); assert `MC-B02.value === 0.5`, `MC-B03.value === 0.333` (±0.01), `MC-B04.value === 0.167` (±0.01).
  - **MET-004**: Seed 10 `intervene` decisions + 5 subsequent positive-delta state versions within 21 days; assert `MC-C02.value === 0.5`.
- **Depends on**: TASK-007
- **Verification**: `npm run test:integration -- program-metrics` all green.

### TASK-013: Contract tests MET-005..MET-008

- **Files**: `tests/contracts/program-metrics.test.ts` (Create)
- **Action**: Create
- **Details**:
  - **MET-005**: `GET /v1/program-metrics` (tenant) returns only MC-A* and MC-B* keys; `Object.keys(res.metrics).filter(k => k.startsWith("MC-C")).length === 0`.
  - **MET-006**: `GET /v1/admin/program-metrics?org_id=org_springs` returns only Springs data even when `org_acme` exists in the store.
  - **MET-007**: `from > to` → `400` `invalid_time_range`.
  - **MET-008**: Window > 365 days → `400` `metric_window_too_wide`.
  - Plus auth-boundary tests: admin endpoint without `x-admin-api-key` → `401 admin_key_required`; tenant endpoint without `x-api-key` → `401 api_key_required`.
- **Depends on**: TASK-007
- **Verification**: `npm run test:contracts -- program-metrics` all green.

---

## Files Summary

### /plan-impl @docs/specs/[ingestion-preflight.md](http://ingestion-preflight.md)To Create


| File                                                 | Task     | Purpose                                      |
| ---------------------------------------------------- | -------- | -------------------------------------------- |
| `internal-docs/foundation/api-naming-conventions.md` | TASK-001 | Durability rule for future specs             |
| `docs/guides/pilot-educator-survey.md`               | TASK-010 | Survey template for MC-B07/B08               |
| `src/program-metrics/types.ts`                       | TASK-002 | Shared interfaces                            |
| `src/program-metrics/metric-ids.ts`                  | TASK-002 | `MetricId` union + group ID arrays           |
| `src/program-metrics/metric-group-a.ts`              | TASK-003 | MC-A01..A08 computers                        |
| `src/program-metrics/metric-group-b.ts`              | TASK-004 | MC-B01..B08 computers                        |
| `src/program-metrics/metric-group-c.ts`              | TASK-005 | MC-C01..C07 computers (wraps `outcomesView`) |
| `src/program-metrics/service.ts`                     | TASK-006 | `ProgramMetricsService` composer             |
| `src/program-metrics/handler-core.ts`                | TASK-007 | Framework-agnostic request logic             |
| `src/program-metrics/handler.ts`                     | TASK-007 | Fastify handlers (admin + tenant)            |
| `src/program-metrics/routes.ts`                      | TASK-007 | `registerProgramMetricsRoutes`               |
| `scripts/replay-decisions.mjs`                       | TASK-009 | MC-A06 determinism CLI                       |
| `tests/unit/program-metrics/metric-group-a.test.ts`  | TASK-011 | Group A unit tests                           |
| `tests/unit/program-metrics/metric-group-b.test.ts`  | TASK-011 | Group B unit tests                           |
| `tests/unit/program-metrics/metric-group-c.test.ts`  | TASK-011 | Group C unit tests                           |
| `tests/unit/program-metrics/service.test.ts`         | TASK-011 | Service composer unit tests                  |
| `tests/integration/program-metrics.test.ts`          | TASK-012 | MET-001..MET-004                             |
| `tests/contracts/program-metrics.test.ts`            | TASK-013 | MET-005..MET-008 + auth                      |


### To Modify / Rename


| File                                                                    | Task     | Changes                                                                                                                                               |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/pilot-success-metrics.md` → `docs/specs/program-metrics.md` | TASK-001 | Rename; update title; replace `pilot-metrics` → `program-metrics` in route/module identifiers; keep MC-* IDs unchanged; add naming-convention pointer |
| `docs/specs/educator-feedback-api.md`                                   | TASK-001 | 2 endpoint references updated                                                                                                                         |
| `docs/specs/decision-outcomes.md`                                       | TASK-001 | 3 endpoint references updated                                                                                                                         |
| `docs/specs/pilot-research-export.md`                                   | TASK-001 | Cross-reference to renamed spec                                                                                                                       |
| `docs/specs/README.md`                                                  | TASK-001 | Index entry updated to `program-metrics.md`; add pointer to `api-naming-conventions.md`                                                               |
| `docs/api/openapi.yaml`                                                 | TASK-008 | Two new path items + `ProgramMetricValue` schema + new error codes                                                                                    |
| `src/server.ts`                                                         | TASK-007 | Wire `registerProgramMetricsRoutes`                                                                                                                   |


---

## Requirements Traceability

> Every `- [ ]` bullet under spec § Requirements and every `Given/When/Then` under § Acceptance Criteria maps to at least one TASK.

### Functional


| Requirement (spec anchor)                                                                                                                                                                                                                   | Source                      | Task                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Every metric MC-A*, MC-B*, MC-C* is computable from data that already exists in the control layer or from the three companion specs                                                                                                         | § Requirements > Functional | TASK-003, TASK-004, TASK-005                                                                                                           |
| A single admin endpoint `GET /v1/admin/program-metrics?org_id=<id>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` returns `{value, numerator, denominator, window, computed_at}` per metric, read-only composition over LIU/decisions/feedback/outcomes | § Requirements > Functional | TASK-002, TASK-006, TASK-007                                                                                                           |
| A per-tenant endpoint `GET /v1/program-metrics` returns the calling org's MC-A* + MC-B* only (MC-C* requires `x-admin-api-key`)                                                                                                             | § Requirements > Functional | TASK-007 (tenant branch strips MC-C*)                                                                                                  |
| `decision_context` is documented as the sole opt-in channel for pseudonymous demographic flags; forbidden-keys list continues to apply                                                                                                      | § Requirements > Functional | TASK-005 (MC-C07 implementation note references `decision_context`); no code change — `src/ingestion/forbidden-keys.ts` already exists |
| Survey template at `docs/guides/pilot-educator-survey.md` for MC-B07/B08                                                                                                                                                                    | § Requirements > Functional | TASK-010                                                                                                                               |


### Non-functional


| Requirement (spec anchor)                                                   | Source                          | Task                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/admin/program-metrics` P95 ≤ 2 s at pilot scale (≤ 15 k decisions) | § Requirements > Non-functional | TASK-006 (parallel group compute via `Promise.all`), TASK-012 (integration test asserts < 2 s)                          |
| No metric computation writes to signal/state/decision stores                | § Requirements > Non-functional | TASK-003, TASK-004, TASK-005 (all computers use read-only repo methods); TASK-011 unit tests assert no mock write calls |
| Deterministic: same window → same numbers (no `NOW()` dependence)           | § Requirements > Non-functional | TASK-006 (`from`/`to` required; no `NOW()`); TASK-011 determinism test                                                  |


### Acceptance Criteria


| Acceptance criterion                                                                                                                   | Source                | Task                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| 100 decisions for `org_springs` in April 2026 → MC-A01 `value == 100` and `denominator == learners_with_at_least_one_signal_in_window` | § Acceptance Criteria | TASK-003 (MC-A01), TASK-012 (MET-001 scaled down to 10)                                               |
| MC-A02 at 100% drops below 100% when one seeded decision has `trace.rationale = null`                                                  | § Acceptance Criteria | TASK-003 (MC-A02), TASK-012 (MET-002)                                                                 |
| 10 intervene decisions with 6 positive deltas in 21 days → MC-C02 `value == 0.6`                                                       | § Acceptance Criteria | TASK-005 (MC-C02), TASK-012 (MET-004 uses 5/10 = 0.5; full 6/10 = 0.6 added as unit test in TASK-011) |
| 3 rejects of 10 reviewed → MC-B03 `value == 0.3`                                                                                       | § Acceptance Criteria | TASK-004 (MC-B03), TASK-012 (MET-003)                                                                 |


---

## Test Plan


| Test ID | Type        | Description                                                                                     | Task                                                         |
| ------- | ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| MET-001 | integration | Seed 10 decisions; `GET /v1/admin/program-metrics` → MC-A01.numerator == 10                     | TASK-012                                                     |
| MET-002 | integration | Seed 10 decisions, 1 with null `trace.rationale`; MC-A02.value == 0.9                           | TASK-012                                                     |
| MET-003 | integration | 3 approves, 2 rejects, 1 ignore, 4 unreviewed → MC-B02 == 0.5, MC-B03 == 0.333, MC-B04 == 0.167 | TASK-012                                                     |
| MET-004 | integration | 10 intervene, 5 positive deltas in 21 days → MC-C02 == 0.5                                      | TASK-012                                                     |
| MET-005 | contract    | Tenant endpoint never returns MC-C* keys                                                        | TASK-013                                                     |
| MET-006 | contract    | Admin endpoint with `org_id=org_springs` returns only Springs data                              | TASK-013                                                     |
| MET-007 | contract    | `from > to` → 400 `invalid_time_range`                                                          | TASK-013                                                     |
| MET-008 | unit        | Metric window > 365 days → 400 `metric_window_too_wide`                                         | TASK-011 (service.test.ts) + TASK-013 (HTTP-level assertion) |


All 8 spec-defined contract test IDs map to a plan task. Additional non-spec tests (per-metric unit tests, determinism, missing-repo handling) live in TASK-011.

---

## Deviations from Spec

> Every place the plan's literal values differ from the spec. Resolution must be chosen before coding starts.


| Spec section                                       | Spec says                                                            | Plan does                                                                                                                     | Resolution                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| § Requirements > Functional (endpoint path)        | `GET /v1/admin/pilot-metrics`                                        | `GET /v1/admin/program-metrics`                                                                                               | **Update spec in same PR** (TASK-001 renames the spec and its endpoint references per the durability rule; justification in plan § Naming Convention)                                                                                                                                                                                                                                    |
| § Requirements > Functional (tenant endpoint path) | `GET /v1/pilot-metrics`                                              | `GET /v1/program-metrics`                                                                                                     | **Update spec in same PR** (TASK-001)                                                                                                                                                                                                                                                                                                                                                    |
| § Provides to other docs                           | `/v1/admin/pilot-metrics` endpoint                                   | `/v1/admin/program-metrics` endpoint                                                                                          | **Update spec in same PR** (TASK-001)                                                                                                                                                                                                                                                                                                                                                    |
| § Contract Tests table                             | MET-001..MET-004 use `GET /v1/admin/pilot-metrics`                   | MET-001..MET-004 use `GET /v1/admin/program-metrics`                                                                          | **Update spec in same PR** (TASK-001)                                                                                                                                                                                                                                                                                                                                                    |
| Spec filename itself                               | `docs/specs/pilot-success-metrics.md`                                | `docs/specs/program-metrics.md`                                                                                               | **Update spec in same PR** (TASK-001 performs `git mv` and updates cross-refs in `educator-feedback-api.md`, `decision-outcomes.md`, `pilot-research-export.md`, `docs/specs/README.md`)                                                                                                                                                                                                 |
| Spec title                                         | `# Pilot Success Metrics`                                            | `# Program Metrics`                                                                                                           | **Update spec in same PR** (TASK-001); body retains Phase 0 / Phase I target columns — they are the program's numeric targets for its first two program deployments, not phase-identifiers in the spec structure                                                                                                                                                                         |
| § Metrics Catalog Group A — MC-A04 data source     | "Server logs + `Decision.decided_at`"                                | `signal_log.received_at` ↔ `decision.decided_at` DB join (plus `source_note`)                                                 | **Implementation detail — spec silent** on *which* logs; the DB join is deterministic and lossless (every decision has its triggering signal's ID), whereas raw server logs are non-deterministic and would violate § Constraints > Determinism                                                                                                                                          |
| Wire format — extra `source_note` field            | spec JSON has `{value, numerator, denominator, window, computed_at}` | Plan adds optional `source_note?: string` for metrics whose data source is external (MC-A05..A08, MC-B07/B08, MC-C04, MC-C07) | **Update spec in same PR** — document `source_note` as an optional, non-normative field in the renamed spec. Required to make the contract honest: the spec says "computable from existing data" but concedes in § Implementation Notes that MC-B07/B08 are survey-sourced and MC-A06 is replay-script-sourced. The plan surfaces this explicitly rather than silently returning `null`. |


---

## Risks


| Risk                                                                                                | Impact       | Mitigation                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prerequisites (PREREQ-001..003) slip, blocking Group B/C                                            | High         | Groups are independently computable; `ProgramMetricsService` returns `metric_unavailable` (409) only for affected groups; Group A still functions. TASK-011 asserts this isolation.                                                        |
| Endpoint-rename churn breaks documentation links elsewhere in repo                                  | Medium       | TASK-001 runs `rg "pilot-metrics"` and `rg "pilot-success-metrics"` over the full repo (not just `docs/specs/`) and updates every hit. `markdown-link-check` (or manual) verifies after.                                                   |
| MC-C07 demographic fields arrive via `decision_context` in ways that exceed the forbidden-keys list | High (FERPA) | No code change — `src/ingestion/forbidden-keys.ts` enforces at ingestion time. TASK-005 documents this explicitly in MC-C07's `source_note`. Equity dispersion is descriptive only and never a gate.                                       |
| P95 > 2 s at pilot scale, violating non-functional requirement                                      | Medium       | TASK-006 parallelizes the three groups via `Promise.all`; TASK-012 asserts < 2 s on seeded Springs data set (500 learners × 8 weeks). If exceeded, add memoization only for the outcomes-summary branch (the expensive path) — not before. |
| Future developer writes a new phase-scoped endpoint and reintroduces the anti-pattern               | Medium       | TASK-001 creates `internal-docs/foundation/api-naming-conventions.md` with the durability rule. `/review --spec` and `/plan-impl` workflows should flag phase-scoped identifiers in the Deviations pass.                                   |


---

## Verification Checklist

- All 13 tasks completed
- `npm test` passes (unit + integration + contracts)
- `npm run lint` passes
- `npm run typecheck` passes
- `npm run validate:api` passes (OpenAPI lint)
- `rg "pilot-metrics" -g '!**/changelog/**' -g '!**/agent-transcripts/**'` returns zero hits outside historical/changelog files
- `rg "pilot-success-metrics"` returns zero hits (file renamed, all cross-refs updated)
- `GET /v1/admin/program-metrics?org_id=org_springs&from=2026-04-01&to=2026-04-30` returns 200 with all MC-A*/B*/C* keys
- `GET /v1/program-metrics` (tenant key) returns only MC-A*/B* keys
- `internal-docs/foundation/api-naming-conventions.md` exists and is cross-linked from `docs/specs/README.md`
- Acceptance criteria from spec (MC-A01 == 100, MC-A02 drops below 100%, MC-C02 == 0.6, MC-B03 == 0.3) all pass in the test suite

---

## Implementation Order

```
TASK-001 (rename + convention doc)
    ↓
TASK-002 (types + metric IDs)
    ↓
    ├─→ TASK-003 (Group A) ─┐
    ├─→ TASK-004 (Group B) ─┼─→ TASK-006 (service) ─→ TASK-007 (handlers + routes) ─→ TASK-008 (OpenAPI)
    └─→ TASK-005 (Group C) ─┘                                    │
                                                                  ├─→ TASK-012 (integration)
                                                                  └─→ TASK-013 (contracts)

TASK-009 (replay CLI) parallel to TASK-003
TASK-010 (survey template) parallel to any task
TASK-011 (unit tests) parallel to TASK-003/004/005/006
```

---

## Post-Pilot Graduation

> This surface graduates without renaming. Pointer for future readers tracing where `/v1/admin/program-metrics` travels after Springs.

The `/v1/admin/program-metrics` endpoint, the `MC-*` metric IDs, the `{value, numerator, denominator, window, computed_at}` response shape, and the module paths under `src/program-metrics/` are **lifecycle-neutral identifiers** per [`internal-docs/foundation/api-naming-conventions.md`](../../internal-docs/foundation/api-naming-conventions.md) § The Durability Rule. They do not change as the program graduates from Springs (Phase 0) → SBIR Phase I → GA. Only the **numeric targets** in `docs/specs/program-metrics.md` comparison tables update per phase.

**Downstream consumers of this surface (in activation order):**

1. **Phase 2 admin dashboard** (`8p3p-admin` separate repo, per [`internal-docs/foundation/roadmap.md`](../../internal-docs/foundation/roadmap.md) § Phase 2 row: "admin dashboard platform UI"). It will embed `GET /v1/admin/program-metrics` as its evidence panel. No endpoint change required at graduation; only an auth-model adjustment (admin dashboard uses a service-level key with admin scope, not an educator passphrase).

2. **SBIR Phase I evidence report** authored at pilot close per [`internal-docs/pilot-operations/pilot-readiness-definition.md`](../../internal-docs/pilot-operations/pilot-readiness-definition.md) § Evidence produced. Template filename: `internal-docs/reports/YYYY-MM-DD-sbir-phase-i-evidence.md`. The report pulls numeric values from the same endpoint Springs uses; only the Phase I target column in the comparison tables changes.

**What does NOT change at graduation:** route paths, module paths, OpenAPI operation IDs, error codes, wire-format shape, metric IDs, acceptance-test assertions (targets shift; the test structure is stable). If a future reviewer proposes renaming any of these, route them back to the durability rule — the answer is no.

---

## Next Steps

1. TASK-001 is complete (via PREP-001, 2026-04-21). Ignore TASK-001 Details narrative except as historical breadcrumb.
2. Verify PREREQ-001..003 status before running `/implement-spec`. As of 2026-04-21, all three are **spec'd but not implemented**; their plans must be authored first:
   - `docs/specs/liu-usage-meter.md` → needs `/plan-impl`
   - `docs/specs/educator-feedback-api.md` → needs `/plan-impl`
   - `docs/specs/decision-outcomes.md` → needs `/plan-impl`
3. Once PREREQ plans are authored (or explicitly deferred with `metric_unavailable` handling as the contract), run `/implement-spec .cursor/plans/program-metrics.plan.md` starting at TASK-002.

