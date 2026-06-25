---
name: Task 6 Doc Cleanup
overview: Doc-only cleanup to align Track 6 sequencing and stale plan literals with the current controlled-eval roadmap and SBIR evidence dependencies.
todos:
  - id: TASK-001
    content: Audit current Task 6 source docs and freeze evidence
    status: completed
  - id: TASK-002
    content: Update dashboard roadmap Track 6 status and sequence
    status: completed
  - id: TASK-003
    content: Refresh program metrics plan literals and next steps
    status: completed
  - id: TASK-004
    content: Refresh pilot research export plan literals
    status: completed
  - id: TASK-005
    content: Cross-check active specs index and foundation roadmap
    status: completed
  - id: TASK-006
    content: Run doc consistency review and link scan
    status: completed
isProject: false
---

# Task 6 Doc Cleanup

**Source**: `/review` findings for `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md` Track 6, plus current source docs in `docs/foundation/roadmap.md`, `docs/specs/program-metrics.md`, `docs/specs/pilot-research-export.md`, and the staged Track 6 plans.

## Spec Literals

> Verbatim copies of normative or source-of-truth blocks that this doc-only cleanup must preserve. TASK details MUST quote from this section rather than paraphrase when editing source docs.

### From `docs/foundation/roadmap.md` § Current Objective

```markdown
Build the one capability the CEO asked for: a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a grade), and **auditable** ("AI explains, never decides"). We prove it end-to-end on a **controlled, de-identified dataset** (local/SQLite, manually-mapped pseudonymous export).

The readiness assessment scored the codebase and found a **single capability gap** — the plain-language "why"; everything else needed for the evaluation is built or is a narrow extension ([`docs/reports/2026-06-23-ceo-meeting-directives.md`](../reports/2026-06-23-ceo-meeting-directives.md) §3). This is the **only** active critical path.
```

### From `docs/foundation/roadmap.md` § Active Execution Plans

```markdown
| `liu-usage-meter.plan.md` | Plan committed; impl pending (SBIR denominator) |
| `program-metrics.plan.md` | Plan committed; impl pending (SBIR evidence) |
| `educator-feedback-api.plan.md` | Spec'd + plan staged (SBIR) |
| `decision-outcomes.plan.md` | Spec'd + plan staged (SBIR) |
| `pilot-research-export.plan.md` | Spec'd + plan staged (SBIR) |
```

### From `docs/specs/program-metrics.md` § Overview

```markdown
All metrics derive from artifacts the control layer *already* emits (`Decision`, `Decision.trace`, state versions, state deltas, signals, LIU counts) plus three small additions specified alongside this doc:

- `docs/specs/educator-feedback-api.md` — captures teacher Approve/Reject/Ignore actions (feeds educator-impact metrics)
- `docs/specs/decision-outcomes.md` — joins a decision to subsequent state deltas (feeds student-impact metrics)
- `docs/specs/pilot-research-export.md` — FERPA-safe de-identified bulk export (feeds external efficacy review)

`docs/specs/liu-usage-meter.md` is **promoted from post-pilot to pre-Month 0** (see [`docs/foundation/roadmap.md`](../foundation/roadmap.md)) because decisions/day and decisions/educator are the denominators for nearly every outcome metric below.
```

### From `.cursor/plans/program-metrics.plan.md` § Prerequisites

```markdown
- **PREREQ-001**: `docs/specs/liu-usage-meter.md` implemented — `UsageRepository`, `/v1/admin/usage`, `/v1/usage`. (Promoted to pre-Month 0 per spec § Overview.)
- **PREREQ-002**: `docs/specs/educator-feedback-api.md` implemented — `FeedbackRepository`, `decision_feedback` + `decision_view_log` stores, `POST /v1/decisions/:id/feedback`, `POST /v1/decisions/:id/view`.
- **PREREQ-003**: `docs/specs/decision-outcomes.md` implemented — `computeOutcome()`, `GET /v1/admin/outcomes-summary`.
- **PREREQ-004**: Admin auth middleware (`x-admin-api-key`) is present (already complete per `docs/specs/policy-management-api.md`).
- **PREREQ-005**: Tenant auth middleware (`x-api-key`) is present (already complete per `docs/specs/api-key-middleware.md`).
```

### From `docs/specs/pilot-research-export.md` § MANIFEST.json

```json
{
  "bundle_version": "1.0.0",
  "org_id": "org_springs",
  "from_time": "2026-02-01T00:00:00Z",
  "to_time": "2026-04-30T23:59:59Z",
  "exported_at": "2026-05-02T18:00:00Z",
  "exporter": {
    "tool": "8p3p-control-layer",
    "git_sha": "abc1234",
    "cli_version": "1.0.0"
  },
  "counts": {
    "decisions": 14320,
    "decision_feedback": 9210,
    "state_versions": 48210,
    "state_deltas_nonzero": 31884,
    "decision_outcomes": 14320
  },
  "policy_versions_referenced": [
    "springs:learner@1.0.0",
    "springs:learner@1.1.0",
    "springs:staff@1.0.0"
  ],
  "metrics_snapshot_available": true,
  "metrics_snapshot": {
    "MC-A01": { "value": 14320, "window_days": 89 },
    "MC-A02": { "value": 1.0 },
    "MC-B02": { "value": 0.72, "numerator": 6631, "denominator": 9210 }
  },
  "de_identification": {
    "method": "pseudonymous_learner_reference",
    "forbidden_keys_version": "2026-02-24",
    "pii_regex_applied": ["email", "phone_us", "ssn", "given_name_heuristic"],
    "structural_scan_scope": ["top_level", "data.*", "state_snapshot.*", "decision_context.*", "policies/*.json"]
  },
  "files": [
    { "path": "decisions.jsonl", "sha256": "...", "rows": 14320, "schema_version": "1.0.0" }
  ]
}
```

## Prerequisites

Before starting implementation:

- [ ] {PREREQ-001} Confirm no product-code edits are needed. This plan is doc-only.
- [ ] {PREREQ-002} Preserve existing user or branch changes; only edit the named plan/docs files.
- [ ] {PREREQ-003} Treat `docs/specs/` as requirements source of truth and `.cursor/plans/` as implementation sequencing per `.cursor/rules/document-traceability/RULE.md`.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Audit current Task 6 source docs and freeze evidence

- **Files**: `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md`, `docs/foundation/roadmap.md`, `docs/specs/README.md`, `docs/specs/program-metrics.md`, `docs/specs/pilot-research-export.md`, `.cursor/plans/program-metrics.plan.md`, `.cursor/plans/pilot-research-export.plan.md`, `.cursor/plans/liu-usage-meter.plan.md`, `.cursor/plans/decision-outcomes.plan.md`
- **Action**: Read
- **Details**: Re-read the exact files above before editing. Capture evidence for three known drift classes:
  - Track 6 must be staged SBIR/live-pilot evidence work, not the controlled-eval critical path, using the roadmap literal from § Current Objective.
  - LIU must precede Program Metrics because `docs/specs/program-metrics.md` states that LIU is promoted to pre-Month 0 and supplies denominators.
  - Plan literals in `program-metrics.plan.md` and `pilot-research-export.plan.md` must match current spec literals, especially `/v1/admin/program-metrics`, `/v1/program-metrics`, `metrics_snapshot_available`, and `structural_scan_scope`.
- **Depends on**: none
- **Verification**: Notes or comments in the PR summary cite the exact source paths and line ranges used for the edits.

### TASK-002: Update dashboard roadmap Track 6 status and sequence

- **Files**: `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md`
- **Action**: Modify
- **Details**: Update only the Track 6 and execution-order material needed to resolve drift:
  - Change Track 6 heading/copy to make it staged SBIR/live-pilot evidence work, not the current controlled-eval critical path.
  - Reorder Track 6 execution to `liu-usage-meter` first, then educator feedback API or Track 2 feedback writes, then `decision-outcomes`, then `program-metrics`, then `pilot-research-export`.
  - Keep the dashboard Track 2 UI feedback bridge separate from backend `educator-feedback-api.plan.md`, but make the dependency clear.
  - Update the frontmatter `todos` list so Track 6 tasks reflect the same order and include LIU as a prerequisite rather than a trailing item.
  - Update the mermaid execution graph if it still implies SBIR Track 6 follows only dashboard Track 2.
- **Depends on**: TASK-001
- **Verification**: A local search for `Track 6` in the roadmap shows one consistent ordering and no statement that Program Metrics precedes LIU.

### TASK-003: Refresh program metrics plan literals and next steps

- **Files**: `.cursor/plans/program-metrics.plan.md`
- **Action**: Modify
- **Details**: Treat `docs/specs/program-metrics.md` as the current source of truth:
  - Replace stale `/v1/admin/pilot-metrics` and `/v1/pilot-metrics` copied literals with `/v1/admin/program-metrics` and `/v1/program-metrics`.
  - Convert old rename/deviation rows into a short historical note, or mark them resolved without claiming the spec still needs an update.
  - Update `Next Steps` so it no longer says `liu-usage-meter.md`, `educator-feedback-api.md`, or `decision-outcomes.md` need `/plan-impl` when their plans already exist.
  - Keep genuine prerequisites intact: LIU, educator feedback API, and decision outcomes still gate meaningful Program Metrics.
  - Check all occurrences of `pilot-success-metrics`, `pilot-metrics`, and old endpoint literals. Historical references may remain only if explicitly labeled as historical and not used by task instructions.
- **Depends on**: TASK-001
- **Verification**: `rg "pilot-metrics|pilot-success-metrics" .cursor/plans/program-metrics.plan.md` returns only explicitly historical/deviation-audit references, or zero matches if the history is removed.

### TASK-004: Refresh pilot research export plan literals

- **Files**: `.cursor/plans/pilot-research-export.plan.md`
- **Action**: Modify
- **Details**: Align copied literals and task details with `docs/specs/pilot-research-export.md`:
  - Replace the copied `MANIFEST.json` literal with the current spec block, including `metrics_snapshot_available` and `de_identification.structural_scan_scope`.
  - Ensure task bodies that build `ExportManifest` mention the same fields as the copied literal.
  - Ensure the CSV placement text says CSVs are emitted next to the `.tar.gz` bundle on the operator filesystem, not inside the archive.
  - Ensure closed `format` behavior says v1 server accepts only `jsonl_tar_gz`; CLI-side CSV is post-processing.
  - Leave the SQLite/Fastify pilot-host implementation scope if it remains intentional, but keep it in `Deviations from Spec` as an implementation detail if the spec stays deployment-agnostic.
- **Depends on**: TASK-001
- **Verification**: `rg "metrics_snapshot_available|structural_scan_scope|jsonl_tar_gz|next to the .tar.gz|inside the bundle" .cursor/plans/pilot-research-export.plan.md` confirms current literals and no contradictory CSV placement remains.

### TASK-005: Cross-check active specs index and foundation roadmap

- **Files**: `docs/specs/README.md`, `docs/foundation/roadmap.md`, optionally `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md`
- **Action**: Read | Modify
- **Details**: Verify the spec index and foundation roadmap do not contradict the cleaned Track 6 sequence:
  - `docs/specs/README.md` can keep all SBIR docs in Active/Staged status, but if it implies execution priority, it must not place Program Metrics before LIU without noting LIU is the denominator.
  - `docs/foundation/roadmap.md` must continue to identify AI educator explanations as the only controlled-eval critical path. Do not promote SBIR Track 6 unless a newer leadership source says so.
  - Only edit these files if the audit finds a real contradiction. Otherwise leave them untouched and mention no change was needed.
- **Depends on**: TASK-002, TASK-003, TASK-004
- **Verification**: Searches for `SBIR`, `program-metrics`, and `liu-usage-meter` across these docs do not produce contradictory priority claims.

### TASK-006: Run doc consistency review and link scan

- **Files**: Changed docs only
- **Action**: Verify
- **Details**: Run a doc-only review pass:
  - Search changed files for stale literals: `pilot-metrics`, `pilot-success-metrics`, missing `metrics_snapshot_available`, missing `structural_scan_scope`, and old Track 6 order.
  - Check Markdown links in changed sections manually or with existing repo tooling if available.
  - Run `/review` on changed files after edits, or manually apply the review checklist if command execution is unavailable.
  - No `npm test`, `npm run lint`, or contract validation is required unless code, OpenAPI, or contract files are changed.
- **Depends on**: TASK-002, TASK-003, TASK-004, TASK-005
- **Verification**: Final review reports no remaining doc drift for the three findings that triggered this plan.

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `.cursor/plans/task-6-doc-cleanup.plan.md` | TASK-001 | Plan this doc-only cleanup before editing existing docs |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md` | TASK-002 | Reframe Track 6 and reorder SBIR evidence dependencies |
| `.cursor/plans/program-metrics.plan.md` | TASK-003 | Refresh stale endpoint literals, deviations, and next steps |
| `.cursor/plans/pilot-research-export.plan.md` | TASK-004 | Refresh manifest, metrics snapshot, structural scan, CSV, and format literals |
| `docs/specs/README.md` | TASK-005 | Modify only if audit finds priority/status contradiction |
| `docs/foundation/roadmap.md` | TASK-005 | Modify only if audit finds priority/status contradiction |

## Requirements Traceability

> Every finding from the source review maps to at least one TASK here. This is a doc-cleanup plan, so findings replace spec `- [ ]` requirements.

| Requirement or finding | Source | Task |
|------------------------|--------|------|
| Track 6 sequence must not put Program Metrics before LIU because LIU is the denominator for rate metrics | `docs/specs/program-metrics.md` § Overview; `.cursor/plans/program-metrics.plan.md` § Prerequisites | TASK-002, TASK-003 |
| Track 6 must be labeled staged SBIR/live-pilot evidence work, not the controlled-eval critical path | `docs/foundation/roadmap.md` § Current Objective and § Current Direction | TASK-002, TASK-005 |
| Program Metrics plan must not instruct implementation from stale `/pilot-metrics` literals | `docs/specs/program-metrics.md` § Requirements; `.cursor/plans/program-metrics.plan.md` § Spec Literals | TASK-003, TASK-006 |
| Pilot Research Export plan manifest literal must include `metrics_snapshot_available` and `structural_scan_scope` | `docs/specs/pilot-research-export.md` § MANIFEST.json | TASK-004, TASK-006 |
| Cleanup must stay doc-only unless audit finds direct contradiction in source docs | User request and review recommendation | TASK-001, TASK-005, TASK-006 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| DOC-001 | review | Roadmap Track 6 order matches LIU to feedback to outcomes to metrics to export | TASK-002, TASK-006 |
| DOC-002 | review | Program Metrics plan has no actionable stale `/pilot-metrics` instructions | TASK-003, TASK-006 |
| DOC-003 | review | Pilot Research Export plan copied manifest matches current spec fields | TASK-004, TASK-006 |
| DOC-004 | review | Foundation roadmap still identifies AI educator explanations as controlled-eval P0 | TASK-005, TASK-006 |
| DOC-005 | search | Changed files contain no contradictory Track 6 priority or stale literal references | TASK-006 |

## Deviations from Spec

None - this is a doc-only cleanup plan and does not change product requirements or wire contracts.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Accidentally promoting SBIR evidence work back onto the controlled-eval critical path | High | Quote `docs/foundation/roadmap.md` Current Objective and keep Track 6 explicitly staged |
| Removing historical rename context that future readers need | Medium | Preserve short historical notes only where they are clearly non-actionable |
| Over-editing specs when only plans are stale | Medium | Specs win for requirements; edit specs only when TASK-005 finds a real contradiction |
| Missing a stale literal hidden in a task body | Medium | TASK-006 searches changed files for old endpoints and manifest fields |

## Verification Checklist

- [x] All tasks completed
- [x] No product code changed
- [x] Changed roadmap Track 6 sequence is internally consistent
- [x] Program Metrics plan literals match `docs/specs/program-metrics.md`
- [x] Pilot Research Export plan literals match `docs/specs/pilot-research-export.md`
- [x] Search for stale literals in changed files passes
- [x] `/review` or equivalent doc review passes on changed files

## Post-impl doc sync (2026-06-25)

Cross-checked specs, plans, and `src/` after TASK-002–006 landed:

| Check | Result |
|-------|--------|
| Track 6 order (LIU → feedback → outcomes → metrics → export) | Aligned in `dashboard_pilot_roadmap_0fa0e18a.plan.md` |
| Program Metrics endpoints | Plan uses `/v1/admin/program-metrics` and `/v1/program-metrics`; no actionable `pilot-metrics` literals remain |
| Pilot Research Export MANIFEST | Plan literal matches spec (`metrics_snapshot_available`, `structural_scan_scope`, `jsonl_tar_gz`, CSV adjacent to archive) |
| Foundation roadmap P0 | AI educator explanations remain the only controlled-eval critical path |
| Specs index | `docs/specs/README.md` notes LIU precedes program-metrics |
| Implementation | No `program-metrics` or export routes in `src/` yet (plans-only); feedback API exists in `src/feedback/` |

**Reconciled in this pass:** `docs/specs/pilot-research-export.md` § De-identification structural prose now includes `policies/*.json` and `structural_scan_scope` manifest note to match the § `MANIFEST.json` literal and `pilot-research-export.plan.md`.

## Implementation Order

```text
TASK-001 -> TASK-002
         -> TASK-003
         -> TASK-004
TASK-002 + TASK-003 + TASK-004 -> TASK-005 -> TASK-006
```

## Next Steps

After reviewing this plan:

- Run `/implement-spec .cursor/plans/task-6-doc-cleanup.plan.md` or manually apply TASK-002 through TASK-006 as a doc-only edit.
- Re-run `/review` on the changed files before committing.
