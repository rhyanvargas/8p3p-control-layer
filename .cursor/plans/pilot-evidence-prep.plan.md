---
name: Pilot Evidence Intake Prep
overview: Prep work that must land before `.cursor/plans/program-metrics.plan.md` TASK-002..013 can execute cleanly. Covers the API-naming rename (TASK-001 of program-metrics, extracted here so it ships independently), customer-readiness gates for the three scope questions that determine whether Group C metrics are computable, a pilot-feedback intake ritual on the roadmap, a future-eval TODO marker in tenant-provisioning, and authorship of the missing implementation plan for `docs/specs/pilot-research-export.md`. Out-of-band dependency: the user is concurrently drafting the ingestion-preflight spec; PREP-002 references it once its filename is stable.
todos:
  - id: "PREP-001"
    content: "Execute TASK-001 of program-metrics.plan.md (rename pilot-metrics → program-metrics; create api-naming-conventions.md; update 5 cross-referencing docs)"
    status: "completed"
  - id: "PREP-002"
    content: "Add three customer-readiness gates to pilot-readiness-definition.md + mirror in onboarding-runbook.md Phase 0 sales handoff"
    status: "completed"
  - id: "PREP-003"
    content: "Add § Pilot Feedback Intake to roadmap.md + create pilot-feedback-log.md append-only template"
    status: "completed"
  - id: "PREP-004"
    content: "Add 1-line future-evaluation-plan TODO to tenant-provisioning.md § Usage Plans (does not add enum value)"
    status: "completed"
  - id: "PREP-005"
    content: "Author .cursor/plans/pilot-research-export.plan.md (implementation plan for existing spec)"
    status: "pending"
  - id: "PREP-006"
    content: "Add § Post-Pilot Graduation to program-metrics.plan.md citing roadmap.md Phase 1/2 consumers"
    status: "completed"
isProject: false
---

# Pilot Evidence Intake Prep

**Purpose.** Unblock `program-metrics.plan.md` TASK-002..013 by landing the naming rename, the customer-readiness gates, the feedback-intake ritual, and the missing research-export implementation plan — all before any metric-computer code is written. Also adds a forward-compatible marker for the controlled-data-evaluation flow without committing to it.

**Why a separate plan.** Four reasons: (a) PREP-001 is a safe cross-repo rename that deserves its own PR and blocks nothing else; (b) PREP-002 has an external dependency on the user's in-flight ingestion-preflight spec and shouldn't be tangled with metric computation; (c) PREP-005 authors a peer plan file and is a deliverable in itself; (d) program-metrics.plan.md is already 606 lines — inlining prep work would make it harder to review.

**What this plan does NOT do.** It does not write the ingestion-preflight spec (user is drafting concurrently). It does not implement any metric computers. It does not create an `evaluation` tenant plan — that stays as a documented future addition until a real eval prospect lands (see § Decisions below).

---

## Decisions

> Substantive decisions that shape this plan. Evidence cited.

### D-001: Defer adding `plan: "evaluation"` to `tenant-provisioning.md`

- **Decision.** Do **not** add the enum value `"evaluation"` now. Add one TODO line referencing the future addition (PREP-004).
- **Evidence.**
  - `internal-docs/Proposal for Controlled Data Evaluation.pdf` is 8P3P-authored outbound; no signed engagement exists.
  - `tenant-provisioning.md` § Usage Plans already defines `{pilot, enterprise, internal}` enforced at API Gateway (lines 230-236).
  - The naming durability rule (applied in `program-metrics.plan.md` § Naming Convention) argues for stability of **public-surface identifiers** — routes, module paths, exported symbols. An enum value in a config doc is not a public-surface identifier; adding it later is a spec edit, not a breaking change.
  - `program-metrics.plan.md` TASK-006 already returns 409 `metric_unavailable` when a dependent repo is unwired; that is the technically correct behavior for an eval and is safe to replace with a friendlier `null + source_note` when an eval lands.
- **Forward compatibility.** PREP-004 adds a 1-line TODO pointing at the proposal PDF so a future reader knows this is an intentional deferral.

### D-002: PREP-002 depends on the user's in-flight ingestion-preflight spec filename

- **Decision.** Do not hardcode a filename for the preflight spec in `pilot-readiness-definition.md`. Once the user confirms the spec filename (expected `docs/specs/ingestion-preflight.md` or similar), PREP-002 references it.
- **Rationale.** Avoids a broken link if the user picks a different filename; PREP-002 is the one prep task that gates on external authorship, so it ships last.

### D-003: PREP-005 authors an implementation plan, not a new spec

- **Decision.** `docs/specs/pilot-research-export.md` already exists (326 lines, spec'd 2026-04-20 per roadmap.md item 27). PREP-005 authors only the `.cursor/plans/pilot-research-export.plan.md` implementation plan against the existing spec.
- **Evidence.** `roadmap.md` § DOE/IES SBIR Evidence Layer row for `pilot-research-export.md` shows "Spec'd"; no matching plan file exists under `.cursor/plans/`.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list.

### PREP-001: Execute the API-naming rename (extracted from program-metrics TASK-001)

- **Files**:
  - `git mv docs/specs/pilot-success-metrics.md docs/specs/program-metrics.md`
  - `internal-docs/foundation/api-naming-conventions.md` (Create)
  - `docs/specs/README.md` (Modify — index entry + add pointer to conventions doc)
  - `docs/specs/educator-feedback-api.md` (Modify — 2 mentions of `/v1/admin/pilot-metrics`)
  - `docs/specs/decision-outcomes.md` (Modify — 3 mentions of `/v1/admin/pilot-metrics`)
  - `docs/specs/pilot-research-export.md` (Modify — cross-refs to `pilot-success-metrics.md`)
  - `docs/specs/program-metrics.md` (Modify after rename — H1 to `# Program Metrics`; replace `pilot-metrics` with `program-metrics` in route segments, JSON keys, module names; keep `MC-*` IDs and error codes unchanged; add Naming Convention paragraph pointing at conventions doc)
  - `internal-docs/pilot-operations/pilot-runbook.md` (Modify — 2 mentions of `/v1/admin/pilot-metrics` and the cross-ref link target)
  - `internal-docs/pilot-operations/pilot-readiness-definition.md` (Modify — mentions of `pilot-success-metrics.md` path, `GET /v1/admin/pilot-metrics`, `GET /v1/pilot-metrics`)
  - `internal-docs/foundation/roadmap.md` (Modify — rows for items 24 and 27 reference `pilot-success-metrics.md`)
- **Action**: Create + Modify (no code changes)
- **Details**:
  - Copy verbatim from `program-metrics.plan.md` § TASK-001 Details; this is the same task, extracted into a standalone PR so it ships before any computer code.
  - Create `internal-docs/foundation/api-naming-conventions.md` containing the durability rule, evidence block, and applied-name table copied from `program-metrics.plan.md` § Naming Convention (Durability Rule).
  - Update `docs/specs/README.md` § SBIR Evidence Layer entry from `pilot-success-metrics.md` → `program-metrics.md`; add a § Foundation references pointing at the new conventions doc.
  - Run `rg "pilot-metrics" -g '!**/archive/**' -g '!**/agent-transcripts/**'` after edits; zero non-changelog hits expected.
  - Run `rg "pilot-success-metrics"` after edits; zero hits expected.
- **Depends on**: none (the rename is architecturally safe — no code imports the renamed identifiers yet because TASK-002+ hasn't run).
- **Verification**:
  - `rg "pilot-metrics" docs/` and `rg "pilot-metrics" internal-docs/` return zero hits outside archive/.
  - `rg "pilot-success-metrics"` returns zero hits outside archive/.
  - `docs/specs/README.md` § SBIR Evidence Layer links to `program-metrics.md` and `api-naming-conventions.md`.
  - `internal-docs/foundation/api-naming-conventions.md` exists and contains the durability rule + evidence + applied-name table.
- **Post-execution**: mark `program-metrics.plan.md` TASK-001 as `cancelled` (done-via-PREP-001) in that plan's frontmatter to avoid duplicate execution.

### PREP-002: Customer-readiness gates for MC-C scope decisions

- **Files**:
  - `internal-docs/pilot-operations/pilot-readiness-definition.md` (Modify — § Customer Readiness → Technical table: add 3 rows)
  - `internal-docs/pilot-operations/onboarding-runbook.md` (Modify — § Phase 0 Sales Handoff → "What you need from sales" table: add 3 rows)
- **Action**: Modify (no code, no new files)
- **Details**: add the following three gates to both tables (phrased for each audience).

  For `pilot-readiness-definition.md` § Customer Readiness → Technical:

  | Gate | Who on their side | Notes |
  |---|---|---|
  | **Export retrospective depth ≥ 3 months** (required if MC-C01..C03 efficacy metrics are in scope) | Data team | 21-day outcome windows (per `decision-outcomes.md` default `window_days=21`) must fit inside the dataset; shorter exports mean Group C returns descriptive-only / `pending`. |
  | **Primary policy field identified and present in export** | Solutions + their data team | Derived per `decision-outcomes.md` § "Primary policy field" from the matched rule's first scalar condition. Without it, MC-A03 (policy-rule coverage) trends toward zero and decisions won't fire. |
  | **Raw sample payload preflight clean** (no unresolved forbidden_semantic hits after mapping registration) | Engineering | Uses the ingestion-preflight endpoint (filename TBD — user is drafting the spec separately; this row is phrased generically and gets an exact cross-ref once PREP-002 lands). |

  For `onboarding-runbook.md` § Phase 0 → "What you need from sales":

  | Item | Example | Where to record |
  |---|---|---|
  | Export retrospective depth | "Sept 2025 – present (7 months)" | Onboarding ticket |
  | Primary policy field in the export | `masteryScore` (derived via Canvas mapper from `scoreGiven / maxScore`) | Onboarding ticket |
  | Preflight result on raw sample payload | `forbidden_pii: []`, `forbidden_semantic: [score, grade] → resolved via Canvas mapping` | Onboarding ticket |

- **Depends on**: user's ingestion-preflight spec filename (external; see D-002). Do not block PREP-001/003/004/005/006 on this — execute those in parallel.
- **Verification**:
  - `pilot-readiness-definition.md` § Customer Readiness → Technical has 3 new rows.
  - `onboarding-runbook.md` § Phase 0 → "What you need from sales" has 3 new rows with matching semantics.
  - Cross-ref to preflight endpoint spec resolves (`rg` on the preflight spec filename in both files returns ≥ 2 hits).

### PREP-003: Pilot feedback intake ritual + append-only log template

- **Files**:
  - `internal-docs/foundation/roadmap.md` (Modify — add § Pilot Feedback Intake after § Pilot Operations (Internal Team Enablement))
  - `internal-docs/reports/pilot-feedback-log.md` (Create — append-only template)
- **Action**: Create + Modify
- **Details**:
  - In `roadmap.md`, add a new § Pilot Feedback Intake with three short paragraphs:
    1. **Why.** The roadmap phases define what we will build; this ritual defines how pilot-field signal shapes what we prioritize next.
    2. **When.** After every Springs weekly review (per `onboarding-runbook.md` Phase 4 weekly cadence), CS appends new feedback items to `internal-docs/reports/pilot-feedback-log.md`.
    3. **How.** Each row is one feedback item with the schema: `{date, customer, summary, category: bug|spec|policy|workflow|feature, proposed-roadmap-phase, status}`. Items flagged `proposed-roadmap-phase: Phase 1` are reviewed at each Monday roadmap sync; items flagged `Phase 2+` are reviewed at each monthly roadmap review.
  - In `pilot-feedback-log.md`, create the template:

    ```markdown
    # Pilot Feedback Log (Append-Only)

    > Ritual and rationale: `internal-docs/foundation/roadmap.md` § Pilot Feedback Intake.
    > Appended by: CS lead after each Springs weekly review. Read by: engineering + product at Monday roadmap sync.
    > Schema: date | customer | summary | category | proposed-roadmap-phase | status.

    ## Entries

    | Date | Customer | Summary | Category | Proposed phase | Status |
    |------|----------|---------|----------|----------------|--------|
    | _YYYY-MM-DD_ | _org_springs_ | _one-line summary_ | _bug \| spec \| policy \| workflow \| feature_ | _Phase 1 \| Phase 2 \| Phase 3 \| Phase 4_ | _new \| in-review \| accepted \| declined \| shipped_ |
    ```

- **Depends on**: none.
- **Verification**:
  - `roadmap.md` has a § Pilot Feedback Intake section with a link to the log file.
  - `internal-docs/reports/pilot-feedback-log.md` exists with the header, the ritual cross-ref, and the empty table.

### PREP-004: Future-evaluation TODO marker in tenant-provisioning

- **Files**: `docs/specs/tenant-provisioning.md` (Modify — § Usage Plans)
- **Action**: Modify
- **Details**: under the Usage Plans table (line 232 area), append one line after the table:

  ```markdown
  > **Future plan (not yet enabled).** A `evaluation` plan value is anticipated for the controlled-data-evaluation flow described in `internal-docs/Proposal for Controlled Data Evaluation.pdf`. When a signed evaluation engagement lands, we add the enum value, rate limits (likely `pilot`-equivalent), and the mode-aware branch in `ProgramMetricsService.computeReport` in one scoped PR. See `.cursor/plans/pilot-evidence-prep.plan.md` § Decisions D-001 for the defer-until-signal rationale.
  ```

- **Depends on**: none.
- **Verification**: `rg "evaluation.*plan" docs/specs/tenant-provisioning.md` returns the new paragraph; no other changes elsewhere in the spec.

### PREP-005: Author `.cursor/plans/pilot-research-export.plan.md`

- **Files**: `.cursor/plans/pilot-research-export.plan.md` (Create)
- **Action**: Create
- **Details**:
  - Plan against the existing `docs/specs/pilot-research-export.md` (326 lines, spec'd 2026-04-20).
  - Structure follows `program-metrics.plan.md`: frontmatter with `todos`; Spec Literals (verbatim quotes of § Requirements, § Endpoints and CLI, § Contract Tests); Prerequisites (must cite `educator-feedback-api.md`, `decision-outcomes.md`, and — post-rename — `program-metrics.md`); Tasks; Files Summary; Requirements Traceability; Test Plan (EXPORT-001..012 per spec); Deviations; Risks; Verification Checklist; Implementation Order.
  - **Task breakdown** (draft — refined during PREP-005 execution):
    - EXP-001: Shared types + manifest schema (`src/exports/types.ts`, `src/exports/manifest.ts`).
    - EXP-002: Deidentification module (`src/exports/deidentify.ts`) — imports from `src/ingestion/forbidden-keys.ts` (post-user-refactor into PII + semantic categories).
    - EXP-003: Bundler (`src/exports/bundler.ts`) — streams each JSONL via the existing repository interfaces (no new storage).
    - EXP-004: Handlers + routes (`handler.ts`, `routes.ts`, wire into `src/server.ts`).
    - EXP-005: CLI wrapper (`scripts/export-pilot-research.mjs`).
    - EXP-006: Async job store (minimal — in-memory Map keyed by `export_id` for v1; doc Phase-II materialization deferral from spec § Out of Scope).
    - EXP-007: OpenAPI additions in `docs/api/openapi.yaml`.
    - EXP-008: Unit tests (per-module).
    - EXP-009: Integration tests EXPORT-001..012 per spec.
  - **Prerequisites** block must include: the user's ingestion-preflight refactor (for `FORBIDDEN_PII_KEYS` + `FORBIDDEN_SEMANTIC_KEYS` exports cited in spec § Deidentification), `educator-feedback-api.md` implemented (spec row in `decision_feedback.jsonl` depends on the `FeedbackRepository`), `decision-outcomes.md` implemented (`decision_outcomes.jsonl` depends on `computeOutcome()`).
  - **Parallelism note**: this plan is independently implementable once PREREQs land; it does NOT block `program-metrics.plan.md` and can run concurrently.
- **Depends on**: PREP-001 (so cross-refs use `program-metrics.md`, not `pilot-success-metrics.md`).
- **Verification**:
  - `.cursor/plans/pilot-research-export.plan.md` exists with valid YAML frontmatter (passes `cursor-plans` lint if present; otherwise manual).
  - All 9 draft tasks map to a Files Summary entry.
  - All 12 EXPORT-*** spec contract tests appear in the plan's Test Plan table.
  - Plan's Deviations table is non-empty only if the plan legitimately diverges from the spec; otherwise an empty "No deviations" note is sufficient.

### PREP-006: § Post-Pilot Graduation in program-metrics plan

- **Files**: `.cursor/plans/program-metrics.plan.md` (Modify — add new § before § Next Steps)
- **Action**: Modify
- **Details**: append a short § Post-Pilot Graduation section naming the two downstream consumers of the `/v1/admin/program-metrics` surface:
  1. **Phase 2 admin dashboard** (`8p3p-admin` separate repo, per `roadmap.md` item "Phase 2: admin dashboard platform UI").
  2. **SBIR Phase I evidence report** authored at pilot close (per `pilot-readiness-definition.md` § Evidence produced, template `YYYY-MM-DD-sbir-phase-i-evidence.md`).

  State explicitly that the API surface **does not change** when we graduate Springs → Phase I; only the numeric targets in `docs/specs/program-metrics.md` comparison tables update. Cite the durability rule as the mechanism.
- **Depends on**: PREP-001 (the plan already references the renamed files; this subsection references `roadmap.md` phases that are stable).
- **Verification**:
  - `program-metrics.plan.md` has a new § Post-Pilot Graduation.
  - The section cites `roadmap.md` Phase 1/2 rows verbatim where useful.
  - Section is ≤ 20 lines (this is a pointer, not a plan-within-a-plan).

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `internal-docs/foundation/api-naming-conventions.md` | PREP-001 | Durability rule + evidence + applied-name table |
| `internal-docs/reports/pilot-feedback-log.md` | PREP-003 | Append-only feedback log |
| `.cursor/plans/pilot-research-export.plan.md` | PREP-005 | Implementation plan for existing spec |

### To Modify / Rename

| File | Task | Changes |
|------|------|---------|
| `docs/specs/pilot-success-metrics.md` → `docs/specs/program-metrics.md` | PREP-001 | Rename + H1 + route identifiers + naming-convention pointer |
| `docs/specs/README.md` | PREP-001 | Index entry + pointer to conventions doc |
| `docs/specs/educator-feedback-api.md` | PREP-001 | 2 endpoint references |
| `docs/specs/decision-outcomes.md` | PREP-001 | 3 endpoint references |
| `docs/specs/pilot-research-export.md` | PREP-001 | Cross-refs to renamed spec |
| `internal-docs/pilot-operations/pilot-runbook.md` | PREP-001 | 2 endpoint + cross-ref updates |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` | PREP-001 + PREP-002 | Rename refs (PREP-001); 3 new gate rows (PREP-002) |
| `internal-docs/pilot-operations/onboarding-runbook.md` | PREP-002 | 3 new rows in Phase 0 sales handoff table |
| `internal-docs/foundation/roadmap.md` | PREP-001 + PREP-003 | Rename refs (PREP-001); new § Pilot Feedback Intake (PREP-003) |
| `docs/specs/tenant-provisioning.md` | PREP-004 | 1-line future-evaluation TODO under § Usage Plans |
| `.cursor/plans/program-metrics.plan.md` | PREP-006 | Mark TASK-001 as done-via-PREP-001 in frontmatter; add § Post-Pilot Graduation |

---

## Dependencies

### Internal

| Dependency | Consumer | Status |
|------------|----------|--------|
| PREP-001 (rename) | PREP-005 (new plan uses renamed identifiers); PREP-006 (references renamed plan) | Blocks those two |
| User's in-flight ingestion-preflight spec (filename TBD) | PREP-002 (cross-refs the preflight endpoint) | External — do not block other PREPs |

### External (not in scope of this plan — user is handling)

- Ingestion-preflight spec + `FORBIDDEN_KEYS` split into PII + semantic categories. Owner: user (drafting now per 2026-04-21 chat). Consumer: PREP-002 + `pilot-research-export.plan.md` § Prerequisites (PREP-005 acknowledges this dependency but does not block on it — the plan authors fine with forward reference).

---

## Implementation Order

```
PREP-001 (rename — ships as own PR, blocks PREP-005 + PREP-006)
    ↓
    ├─→ PREP-003 (roadmap + feedback-log) ─┐
    ├─→ PREP-004 (tenant-provisioning TODO) ─┼─ all three ship as one small doc-only PR
    └─→ PREP-006 (program-metrics § graduation) ─┘
    ↓
PREP-005 (author pilot-research-export.plan.md — largest single task)
    ↓ (after user's preflight spec lands)
PREP-002 (customer-readiness gates + onboarding-runbook mirror)
```

Estimated effort (for sequencing with other in-flight work):

| Task | Effort | Risk |
|------|--------|------|
| PREP-001 | ~45 min | Low (surgical rename + link check) |
| PREP-002 | ~20 min | Low (2 table edits) |
| PREP-003 | ~25 min | Low (new § + empty template) |
| PREP-004 | ~5 min | Zero |
| PREP-005 | ~90 min | Medium (new plan file authorship; mirrors existing program-metrics plan structure) |
| PREP-006 | ~15 min | Low (pointer-only §) |

---

## Verification Checklist

- [ ] PREP-001: `rg "pilot-metrics" -g '!**/archive/**' -g '!**/agent-transcripts/**'` returns zero hits
- [ ] PREP-001: `rg "pilot-success-metrics"` returns zero hits outside archive/
- [ ] PREP-001: `internal-docs/foundation/api-naming-conventions.md` exists and is linked from `docs/specs/README.md`
- [ ] PREP-001: `.cursor/plans/program-metrics.plan.md` TASK-001 status changed to `cancelled` with a note pointing at PREP-001
- [ ] PREP-002: `pilot-readiness-definition.md` § Customer Readiness → Technical has 3 new rows
- [ ] PREP-002: `onboarding-runbook.md` § Phase 0 sales-handoff table has 3 new rows
- [ ] PREP-002: Preflight endpoint spec filename appears in both updated docs
- [ ] PREP-003: `roadmap.md` has a § Pilot Feedback Intake section
- [ ] PREP-003: `internal-docs/reports/pilot-feedback-log.md` exists with the schema table
- [ ] PREP-004: `tenant-provisioning.md` § Usage Plans has the future-evaluation TODO paragraph
- [ ] PREP-005: `.cursor/plans/pilot-research-export.plan.md` exists with valid frontmatter, Tasks, and Test Plan (EXPORT-001..012)
- [ ] PREP-006: `program-metrics.plan.md` has a § Post-Pilot Graduation section citing roadmap.md Phase 1 + 2

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| PREP-001 misses a cross-ref and the build breaks a link | Medium | Run `rg` twice (once on `pilot-metrics`, once on `pilot-success-metrics`) + manual link check on `docs/specs/README.md`. Pilot runbook already has an explicit link to `/v1/admin/pilot-metrics` — grep will catch it. |
| User's preflight spec lands with a different shape than assumed in PREP-002 | Low | PREP-002 is the last task and is phrased generically; exact cross-ref added only once the spec filename is stable. |
| PREP-005 duplicates task structure that should live in the spec | Low | Spec already exists and is detailed (326 lines); the plan only adds implementation sequencing + test mapping. Compare to `program-metrics.plan.md` for the correct ratio of spec : plan content. |
| Roadmap.md § Pilot Feedback Intake becomes a dead letter if CS doesn't actually append | Medium | Bake the ritual into `onboarding-runbook.md` Phase 4 weekly cadence explicitly — it's not optional CS hygiene, it's an explicit gate in the weekly review. |
| Future-evaluation TODO (PREP-004) rots if an eval prospect never lands | Low | 1-line note; cheaper to leave than to churn. Re-evaluated at each roadmap snapshot. |

---

## Next Steps

1. Confirm PREP-001 should ship as a standalone PR (recommended: yes — pure rename, safe, blocks nothing else).
2. Confirm PREP-003/PREP-004/PREP-006 can ship as a single doc-only PR after PREP-001 lands.
3. Start PREP-005 (largest task — ~90 min) in parallel with the doc-only PR.
4. PREP-002 ships last, after the user's preflight spec has a stable filename.
5. Once all six PREPs are green, unblock `program-metrics.plan.md` TASK-002..013.
