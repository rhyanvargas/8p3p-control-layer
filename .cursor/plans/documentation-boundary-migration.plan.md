---
name: Documentation Boundary Migration
overview: "One-time docs-only migration: promote foundation files from gitignored internal-docs into committed docs/foundation and docs/guides, delink all internal-docs hrefs, and enforce boundaries with DOC-001 through DOC-004 contract tests."
todos:
  - id: TASK-001
    content: Create docs/foundation/documentation-boundaries.md tier model
    status: completed
  - id: TASK-002
    content: Promote api-naming-conventions.md verbatim to docs/foundation
    status: completed
  - id: TASK-003
    content: Create sanitized docs/foundation/roadmap.md planning anchor
    status: completed
  - id: TASK-004
    content: Promote definitive-workflow.md with fixed roadmap pointer
    status: completed
  - id: TASK-005
    content: Update docs/specs/README.md and project-context rule for M-001
    status: completed
  - id: TASK-006
    content: Extract pilot-readiness-gates.md from internal gate tables
    status: completed
  - id: TASK-007
    content: Update gate cross-refs in specs and launch checklists
    status: completed
  - id: TASK-008
    content: Create docs/guides/operators/internal-operations-stub.md
    status: completed
  - id: TASK-009
    content: Apply Link Replacement Matrix across docs and README
    status: completed
  - id: TASK-010
    content: Restructure docs/guides/README.md navigation tables
    status: completed
  - id: TASK-011
    content: Update control-layer-constraints rule to schema SSoT paths
    status: completed
  - id: TASK-012
    content: Add documentation-boundary.test.ts DOC-001 through DOC-004
    status: completed
  - id: TASK-013
    content: Update internal-docs/README.md local mirror pointers
    status: completed
isProject: false
---

# Documentation Boundary Migration

**Spec**: `docs/specs/documentation-boundary-migration.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Concrete Values Checklist — Documentation tier model (normative)

| Tier | Path | Git status | Audience | Authority |
|------|------|------------|----------|-----------|
| **T1 — Foundation** | `docs/foundation/` | Committed | Agents, engineers, integrators | Engineering rules, terminology, architecture, roadmap |
| **T2 — Specs** | `docs/specs/` | Committed | Agents, engineers | Requirements + interface SSoT |
| **T3 — Guides** | `docs/guides/` | Committed | Customers + operators | Integration and launch procedures |
| **T4 — Plans** | `.cursor/plans/` | Committed | Agents, engineers | Implementation sequencing |
| **T5 — Contracts** | `src/contracts/schemas/`, `docs/api/` | Committed | Agents, CI | Machine-verifiable truth |
| **T6 — Internal ops** | `internal-docs/` | **Gitignored** | CS, solutions, leadership | Named-customer runbooks, investor PDFs, demo scripts, append-only logs |

**Hard rule:** T1–T5 MUST NOT link to T6 with a relative markdown href. T6 MAY link to T1–T5.

### From spec § Concrete Values Checklist — Files to promote

| Source (local only) | Destination (committed) | Redaction required |
|---------------------|-------------------------|-------------------|
| `internal-docs/foundation/api-naming-conventions.md` | `docs/foundation/api-naming-conventions.md` | None — already domain-neutral |
| `internal-docs/foundation/roadmap.md` | `docs/foundation/roadmap.md` | Remove/replace: named customer strings, `$` budget figures not in public reports, links to gitignored reports |
| `internal-docs/foundation/definitive-workflow.md` | `docs/foundation/definitive-workflow.md` | Fix planning anchor path only |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` (gate tables only) | `docs/guides/operators/pilot-readiness-gates.md` | Remove customer names; keep gate text verbatim |

### From spec § Concrete Values Checklist — New files to create

| Path | Purpose |
|------|---------|
| `docs/foundation/documentation-boundaries.md` | Tier model + agent reading order |
| `docs/guides/operators/internal-operations-stub.md` | Lists internal-only doc titles; no `internal-docs/` hrefs |
| `tests/contracts/documentation-boundary.test.ts` | DOC-001..DOC-004 |

### From spec § Concrete Values Checklist — Link Replacement Matrix

| Old reference pattern | Replacement |
|----------------------|-------------|
| `internal-docs/foundation/api-naming-conventions.md` | `docs/foundation/api-naming-conventions.md` |
| `internal-docs/foundation/roadmap.md` | `docs/foundation/roadmap.md` |
| `internal-docs/foundation/definitive-workflow.md` | `docs/foundation/definitive-workflow.md` |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` (gate rows) | `docs/guides/operators/pilot-readiness-gates.md` |
| `internal-docs/pilot-operations/onboarding-runbook.md` | Prose: "Internal onboarding runbook (local `internal-docs/`, not in public repo)" — **no href** |
| `internal-docs/pilot-operations/pilot-runbook.md` | Same stub pattern |
| `internal-docs/compliance-security-posture-and-migration-path.md` | Prose: "Internal compliance posture doc (local only)" — **no href** |
| `internal-docs/foundation/logic-model.md` | Prose stub until a sanitized logic model is drafted (out of scope for v1 migration) |
| `internal-docs/reports/pilot-smoke-*.md` | Keep path as **literal filename pattern** in checklists (ops artifact location), not a markdown link |
| `internal-docs/Proposal for Controlled Data Evaluation.pdf` | Prose stub in specs that mention evaluation engagements |

### From spec § Concrete Values Checklist — Allowed Exceptions (DOC-001)

These committed files MAY mention the string `internal-docs/` without a resolvable href:

| File | Allowed mention |
|------|-----------------|
| `docs/foundation/documentation-boundaries.md` | Defines T6 tier by name |
| `docs/guides/operators/internal-operations-stub.md` | Lists internal doc titles |
| `docs/specs/documentation-boundary-migration.md` | This spec (migration instructions) |
| Checklist items describing ops artifact save paths | Literal path pattern only, e.g. `` `internal-docs/reports/pilot-smoke-*.md` `` — not a link |

### From spec § Concrete Values Checklist — Migration phases (execution order)

| Phase | ID | Deliverables | PR gate |
|-------|-----|--------------|---------|
| **1 — Promote foundation** | M-001 | `api-naming-conventions.md`, `roadmap.md`, `definitive-workflow.md`, `documentation-boundaries.md`; update `docs/specs/README.md`, `.cursor/rules/project-context/RULE.md` | DOC-002, DOC-004 pass |
| **2 — Inline gates** | M-002 | `pilot-readiness-gates.md`; update ingestion-preflight, decision-panel-ui, pilot-launch-checklist, deployment-checklist | Spec gate cross-refs resolve |
| **3 — Delink** | M-003 | Link Replacement Matrix applied across `docs/`, `README.md`, `.cursor/rules/`; `internal-operations-stub.md`; guides README restructure | DOC-001, DOC-003 pass |
| **4 — Rules cleanup** | M-004 | `control-layer-constraints/RULE.md` → `src/contracts/schemas/` as schema SSoT | DOC-003 pass |
| **5 — Internal README** | M-005 | Update `internal-docs/README.md` to point at committed anchors for engineering rules | Local only (not in CI) |

### From spec § Concrete Values Checklist — Agent reading order (post-migration)

```
docs/foundation/documentation-boundaries.md
  → docs/foundation/roadmap.md
  → docs/specs/README.md (pick Active spec)
  → docs/specs/{feature}.md
  → .cursor/plans/{feature}.plan.md
  → src/ + tests/
```

### From spec § Concrete Values Checklist — Constants / limits

- **Redaction grep patterns** (must return zero hits in committed `docs/foundation/roadmap.md` after sanitization): `Springs Charter`, `springs-charter`, `$5/month`, `$20/month` (unless already present in a committed public report being quoted).
- **Link scan roots for DOC-001:** `docs/`, `README.md` — exclude `docs/specs/documentation-boundary-migration.md` exception clauses only when asserting *href* patterns, not bare string mentions.

### From spec § Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| DOC-001 | No forbidden `internal-docs/` hrefs in committed docs | All `*.md` under `docs/`, plus root `README.md` | Zero matches for pattern `\]\(\.{0,2}/internal-docs/` except paths on **Allowed Exceptions** list |
| DOC-002 | Promoted foundation files exist | File paths from Promote table | Each file exists and is non-empty |
| DOC-003 | Cursor rules do not cite gitignored POC playbooks as SSoT | `.cursor/rules/project-context/RULE.md`, `.cursor/rules/control-layer-constraints/RULE.md` | Zero matches for `internal-docs/foundation/poc-playbooks` |
| DOC-004 | Spec index links resolve | `docs/specs/README.md` markdown links to `docs/foundation/` | Every `docs/foundation/*.md` link target exists |

> **Test strategy note:** DOC-001..DOC-004 are static analysis tests in `tests/contracts/documentation-boundary.test.ts` (new file). They do not require a running server. Pattern: same approach as `tests/contracts/pilot-copy-drift.test.ts`.

### From spec § Production Correctness Notes — CI enforcement

- **CI enforcement:** DOC-001..DOC-004 MUST run under existing `npm run test:contracts` — no new npm script required.
- **Agent rule sync:** After M-001, `internal-docs/foundation/definitive-workflow.md` SHOULD mirror the committed workflow doc or add a banner: "Canonical copy: `docs/foundation/definitive-workflow.md`."

## Prerequisites

Before starting implementation:
- [ ] **PREREQ-001** Local `internal-docs/` directory exists with source files listed in the Promote table (gitignored; not required in CI).
- [ ] **PREREQ-002** Read `archive/snapshots/roadmap-2026-06-23.md` as a partial sanitization reference; living source is `internal-docs/foundation/roadmap.md`.
- [ ] **PREREQ-003** Confirm no runtime code changes are in scope (documentation-only migration per spec Constraints).

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Create docs/foundation/documentation-boundaries.md tier model
- **Files**: `docs/foundation/documentation-boundaries.md`
- **Action**: Create
- **Details**: Author the T1–T6 tier model using the verbatim Documentation tier model table from Spec Literals. Include the Agent reading order block verbatim. State the hard rule: T1–T5 MUST NOT link to T6 with a relative markdown href. Document what stays in T6 (named-customer runbooks, investor PDFs, demo scripts, append-only logs). Cross-link to `docs/specs/README.md` and `docs/guides/README.md`.
- **Depends on**: none
- **Verification**: File exists, non-empty; tier table matches spec verbatim; reading order block matches spec.

### TASK-002: Promote api-naming-conventions.md verbatim to docs/foundation
- **Files**: `docs/foundation/api-naming-conventions.md`
- **Action**: Create
- **Details**: Copy `internal-docs/foundation/api-naming-conventions.md` verbatim to `docs/foundation/api-naming-conventions.md`. Redaction required: None — already domain-neutral. Retain internal copy as mirror until manually deleted.
- **Depends on**: PREREQ-001
- **Verification**: `diff internal-docs/foundation/api-naming-conventions.md docs/foundation/api-naming-conventions.md` shows no content changes.

### TASK-003: Create sanitized docs/foundation/roadmap.md planning anchor
- **Files**: `docs/foundation/roadmap.md`
- **Action**: Create
- **Details**: Promote from `internal-docs/foundation/roadmap.md`. Apply sanitization policy from spec Notes: preserve P0/P1/P2 active sequencing table, deploy tier A/B/C disambiguation, links to committed specs and `.cursor/plans/`, active execution plans table. Replace or remove: named customer references to "pilot customer" or "Phase 0 site"; internal-only report links to committed `docs/reports/` equivalents where they exist; full 37-row inventory to link to `archive/snapshots/roadmap-2026-06-23.md` as "historical inventory snapshot". Run redaction grep — must return zero hits for: `Springs Charter`, `springs-charter`, `$5/month`, `$20/month` (unless already in a committed public report being quoted). Replace any `internal-docs/` markdown hrefs with committed paths or prose stubs per Link Replacement Matrix.
- **Depends on**: TASK-001
- **Verification**: File exists and non-empty; redaction grep patterns return zero hits; tier A/B/C vocabulary preserved; no forbidden customer identifiers or unsigned engagement PDF links.

### TASK-004: Promote definitive-workflow.md with fixed roadmap pointer
- **Files**: `docs/foundation/definitive-workflow.md`
- **Action**: Create
- **Details**: Copy content from `internal-docs/foundation/definitive-workflow.md`. Redaction required: Fix planning anchor path only — Source-of-Truth Pointers MUST cite `docs/foundation/roadmap.md` (not `internal-docs/foundation/roadmap.md`). After commit, add banner to local mirror: "Canonical copy: `docs/foundation/definitive-workflow.md`."
- **Depends on**: TASK-003
- **Verification**: Planning anchor pointer is `docs/foundation/roadmap.md`; file matches internal source except anchor fix.

### TASK-005: Update docs/specs/README.md and project-context rule for M-001
- **Files**: `docs/specs/README.md`, `.cursor/rules/project-context/RULE.md`
- **Action**: Modify
- **Details**: **Phase M-001 PR gate.** In `docs/specs/README.md`: replace `internal-docs/foundation/roadmap.md` with `docs/foundation/roadmap.md`; replace `internal-docs/foundation/api-naming-conventions.md` with `docs/foundation/api-naming-conventions.md`; add link to `docs/foundation/documentation-boundaries.md` in MUST-read section. In `.cursor/rules/project-context/RULE.md`: update Planning Entry Point and Key References table — roadmap to `docs/foundation/roadmap.md`, definitive-workflow to `docs/foundation/definitive-workflow.md`, api-naming to `docs/foundation/api-naming-conventions.md`; remove POC playbook rows pointing at `internal-docs/foundation/poc-playbooks/` (full POC playbook delink completes in TASK-011 for control-layer-constraints; project-context should cite `src/contracts/schemas/` and `tests/contracts/` instead).
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-004
- **Verification**: Every `docs/foundation/*.md` link in `docs/specs/README.md` resolves; project-context cites committed foundation paths only; M-001 PR gate: DOC-002 and DOC-004 pass once TASK-012 lands (or run manual file-exists check before test task).

### TASK-006: Extract pilot-readiness-gates.md from internal gate tables
- **Files**: `docs/guides/operators/pilot-readiness-gates.md`
- **Action**: Create
- **Details**: Extract gate tables from `internal-docs/pilot-operations/pilot-readiness-definition.md` sections **8P3P Readiness** and **Customer Readiness** only. Redaction required: Remove customer names; keep gate text verbatim. Do NOT copy narrative runbook prose or customer-specific procedures (those stay in internal-docs per spec Constraints). Add header explaining this is the committed normative gate reference; full onboarding narrative is internal-only.
- **Depends on**: PREREQ-001
- **Verification**: Gate rows present for Integration BLOCKING and Customer Readiness Technical rows referenced by ingestion-preflight; no named customer strings; file non-empty.

### TASK-007: Update gate cross-refs in specs and launch checklists
- **Files**: `docs/specs/ingestion-preflight.md`, `docs/specs/decision-panel-ui.md`, `docs/guides/operators/pilot-launch-checklist.md`, `docs/guides/operators/deployment-checklist.md`
- **Action**: Modify
- **Details**: **Phase M-002 PR gate.** Replace references to `internal-docs/pilot-operations/pilot-readiness-definition.md` (gate rows) with `docs/guides/operators/pilot-readiness-gates.md` per Link Replacement Matrix. In `ingestion-preflight.md`: update pilot-blocking gate prose and TASK-016 notes to cite committed gates doc. In `decision-panel-ui.md`: replace readiness gate link; replace onboarding runbook hrefs with prose stub "Internal onboarding runbook (local `internal-docs/`, not in public repo)" — **no href**. In checklists: gate criteria cite `docs/guides/operators/pilot-readiness-gates.md`; retain literal path pattern `` `internal-docs/reports/pilot-smoke-*.md` `` for ops artifact save paths (not a link).
- **Depends on**: TASK-006
- **Verification**: Zero markdown hrefs to `internal-docs/pilot-operations/pilot-readiness-definition.md` in these four files; gate row semantics unchanged; M-002 PR gate: spec gate cross-refs resolve.

### TASK-008: Create docs/guides/operators/internal-operations-stub.md
- **Files**: `docs/guides/operators/internal-operations-stub.md`
- **Action**: Create
- **Details**: List internal-only doc titles (onboarding runbook, pilot runbook, configure LMS, controlled-evaluation runbook, dry-run script, compliance posture, logic model, pilot feedback log, etc.) with one-line descriptions. **No `internal-docs/` hrefs** — prose only, e.g. "Available locally in gitignored internal-docs/". This file is on the Allowed Exceptions list for bare `internal-docs/` string mentions.
- **Depends on**: none
- **Verification**: File exists; lists key internal ops doc titles; zero matches for pattern `\]\(\.{0,2}/internal-docs/`.

### TASK-009: Apply Link Replacement Matrix across docs and README
- **Files**: All `*.md` under `docs/` with `internal-docs/` hrefs, `README.md`, `.cursor/rules/project-context/RULE.md` (remaining refs)
- **Action**: Modify
- **Details**: **Phase M-003 core deliverable.** Grep `\]\(\.{0,2}/internal-docs/` across `docs/` and `README.md`. Apply Link Replacement Matrix replacements file-by-file. Known touch points from codebase scan: `docs/foundation/architecture.md`, `docs/specs/program-metrics.md`, `docs/specs/aws-deployment.md`, `docs/specs/customer-feedback-loop.md`, `docs/specs/ci-cd-pipeline.md`, `docs/specs/pilot-research-export.md`, `docs/specs/document-extraction-service.md`, `docs/specs/tenant-field-mappings.md`, `docs/specs/tenant-provisioning.md`, `docs/specs/liu-usage-meter.md`, `docs/specs/nextjs-amplify-dashboard-migration.md`, `docs/specs/tiered-data-classification.md`, `docs/guides/operators/pilot-host-deployment.md`, `docs/guides/customers/pilot-integration-guide.md`, `docs/reports/*.md` (within DOC-001 scan roots). Compliance doc links become prose: "Internal compliance posture doc (local only)" — **no href**. Logic model references become prose stub. Pilot-smoke paths stay as literal backtick patterns, not links. Do NOT modify `archive/` or `.cursor/plans/` (out of scope).
- **Depends on**: TASK-002, TASK-003, TASK-004, TASK-006, TASK-007, TASK-008
- **Verification**: `rg '\]\(\.{0,2}/internal-docs/' docs/ README.md` returns zero hits outside Allowed Exceptions; README compliance link is prose-only.

### TASK-010: Restructure docs/guides/README.md navigation tables
- **Files**: `docs/guides/README.md`
- **Action**: Modify
- **Details**: Remove internal-docs href rows from navigation tables. Point committed guide readers at `docs/guides/operators/pilot-readiness-gates.md` for gate criteria. Add row linking to `docs/guides/operators/internal-operations-stub.md` for CS/solutions internal-only docs. Ensure all table links resolve to committed paths only.
- **Depends on**: TASK-006, TASK-008
- **Verification**: Zero `internal-docs/` hrefs in guides README; navigation tables use committed anchors only.

### TASK-011: Update control-layer-constraints rule to schema SSoT paths
- **Files**: `.cursor/rules/control-layer-constraints/RULE.md`
- **Action**: Modify
- **Details**: **Phase M-004 PR gate.** Replace Contract Enforcement and Discovery Guidelines references to `internal-docs/foundation/poc-playbooks/` with committed SSoT paths: `src/contracts/schemas/` (JSON schemas), `tests/contracts/` (contract test requirements), `docs/api/openapi.yaml` (REST alignment). Remove all `internal-docs/foundation/poc-playbooks` strings. Zero matches required for DOC-003.
- **Depends on**: TASK-009
- **Verification**: `rg 'internal-docs/foundation/poc-playbooks' .cursor/rules/` returns zero hits; rule cites `src/contracts/schemas/` as schema SSoT.

### TASK-012: Add documentation-boundary.test.ts DOC-001 through DOC-004
- **Files**: `tests/contracts/documentation-boundary.test.ts`
- **Action**: Create
- **Details**: Implement static analysis tests matching spec Contract Tests table. Follow `tests/contracts/pilot-copy-drift.test.ts` pattern (Vitest, `node:fs` walk, no external link-checker). **DOC-001**: scan all `*.md` under `docs/` plus root `README.md`; assert zero matches for `\]\(\.{0,2}/internal-docs/` except Allowed Exceptions files (href assertion only — bare string mentions allowed on exception list). **DOC-002**: assert each Promote-table destination exists and is non-empty. **DOC-003**: assert zero `internal-docs/foundation/poc-playbooks` in project-context and control-layer-constraints rules. **DOC-004**: parse `docs/specs/README.md` links to `docs/foundation/*.md`; assert each target exists. Tests run via existing `npm run test:contracts` — no new npm script.
- **Depends on**: TASK-005, TASK-009, TASK-011
- **Verification**: `npm run test:contracts` passes; all four test IDs green.

### TASK-013: Update internal-docs/README.md local mirror pointers
- **Files**: `internal-docs/README.md`
- **Action**: Modify
- **Details**: **Phase M-005 — local only, not in CI.** Update internal README to point engineering rules at committed anchors: `docs/foundation/documentation-boundaries.md`, `docs/foundation/roadmap.md`, `docs/foundation/api-naming-conventions.md`, `docs/foundation/definitive-workflow.md`. Note that gate criteria live at `docs/guides/operators/pilot-readiness-gates.md`. Add banner on `internal-docs/foundation/definitive-workflow.md` if not already present: "Canonical copy: `docs/foundation/definitive-workflow.md`."
- **Depends on**: TASK-012
- **Verification**: Local internal README lists committed anchors; file is gitignored so not in CI.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `docs/foundation/documentation-boundaries.md` | TASK-001 | T1–T6 tier model and agent reading order |
| `docs/foundation/api-naming-conventions.md` | TASK-002 | Committed API naming durability rules |
| `docs/foundation/roadmap.md` | TASK-003 | Sanitized living planning anchor |
| `docs/foundation/definitive-workflow.md` | TASK-004 | Spec-driven delivery workflow |
| `docs/guides/operators/pilot-readiness-gates.md` | TASK-006 | Committed normative pilot gate tables |
| `docs/guides/operators/internal-operations-stub.md` | TASK-008 | CS pointer to internal-only docs without hrefs |
| `tests/contracts/documentation-boundary.test.ts` | TASK-012 | DOC-001..DOC-004 enforcement |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `docs/specs/README.md` | TASK-005 | Foundation path links, remove internal-docs hrefs |
| `.cursor/rules/project-context/RULE.md` | TASK-005, TASK-009 | Committed foundation and schema paths |
| `docs/specs/ingestion-preflight.md` | TASK-007, TASK-009 | Gate cross-ref to pilot-readiness-gates |
| `docs/specs/decision-panel-ui.md` | TASK-007, TASK-009 | Gate + onboarding stub prose |
| `docs/guides/operators/pilot-launch-checklist.md` | TASK-007 | Gate cross-ref; literal smoke path pattern |
| `docs/guides/operators/deployment-checklist.md` | TASK-007, TASK-009 | Gate cross-ref; literal smoke path pattern |
| `docs/guides/README.md` | TASK-010 | Committed-only navigation |
| `README.md` | TASK-009 | Compliance prose stub, no href |
| `.cursor/rules/control-layer-constraints/RULE.md` | TASK-011 | Schema SSoT at src/contracts/schemas/ |
| ~15 additional docs/*.md files | TASK-009 | Link Replacement Matrix |
| `internal-docs/README.md` | TASK-013 | Local mirror pointers (gitignored) |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| DOC-TIER-001: Committed docs declare two-tier documentation model in documentation-boundaries.md | spec § Requirements | TASK-001 |
| DOC-PROMOTE-001: api-naming-conventions copied verbatim; refs updated; internal mirror retained | spec § Requirements | TASK-002, TASK-009 |
| DOC-PROMOTE-002: Sanitized roadmap.md committed without named customers, dollar amounts, investor URLs | spec § Requirements | TASK-003 |
| DOC-PROMOTE-003: definitive-workflow.md with planning anchor fixed to docs/foundation/roadmap.md | spec § Requirements | TASK-004 |
| DOC-INLINE-001: pilot-readiness-gates.md with redacted gate tables | spec § Requirements | TASK-006 |
| DOC-INLINE-002: ingestion-preflight, decision-panel-ui, pilot-launch-checklist cite pilot-readiness-gates.md | spec § Requirements | TASK-007 |
| DOC-DELINK-001: Every internal-docs href under docs/, README.md, .cursor/rules/ removed or replaced | spec § Requirements | TASK-009, TASK-010, TASK-011 |
| DOC-RULES-001: project-context and control-layer-constraints cite committed paths only | spec § Requirements | TASK-005, TASK-011 |
| DOC-INDEX-001: specs/README and guides/README point at committed anchors; internal ops in stub | spec § Requirements | TASK-005, TASK-008, TASK-010 |
| DOC-TEST-001: DOC-001..DOC-004 pass in CI via npm run test:contracts | spec § Requirements | TASK-012 |
| AC: Fresh clone link chain README to roadmap to spec to plan resolves | spec § Acceptance Criteria | TASK-003, TASK-005 |
| AC: test:contracts doc-boundary tests zero forbidden hrefs except Allowed Exceptions | spec § Acceptance Criteria | TASK-009, TASK-012 |
| AC: New API surface naming rule resolves to docs/foundation/api-naming-conventions.md | spec § Acceptance Criteria | TASK-002, TASK-005 |
| AC: CS onboarding runbook still exists locally, not required for CI | spec § Acceptance Criteria | TASK-013 (local verify) |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| DOC-001 | contract | No forbidden internal-docs hrefs in docs/ and README.md | TASK-012 |
| DOC-002 | contract | Promoted foundation files exist and are non-empty | TASK-012 |
| DOC-003 | contract | Cursor rules do not cite gitignored POC playbooks as SSoT | TASK-012 |
| DOC-004 | contract | Spec index docs/foundation/ links resolve | TASK-012 |

## Deviations from Spec

None — plan is literal-compatible with spec.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| internal-docs/ absent on implementer machine | High | PREREQ-001 blocks promote tasks; use archive/snapshot for roadmap partial reference |
| Roadmap sanitization misses named customer string | High | Run spec redaction grep patterns before merge; manual review against Public repo boundary constraint |
| Delink sweep misses a file | Medium | DOC-001 test catches href regressions in CI; grep before TASK-012 |
| Gate table extraction loses BLOCKING row semantics | Medium | Cross-check ingestion-preflight TASK-016 notes against extracted tables |
| Partial PR merge leaves broken links between phases | Medium | Follow M-001 through M-004 phase gates; do not merge M-001 without README + project-context updates |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Contract tests pass (`npm run test:contracts`) including DOC-001..DOC-004
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Redaction grep on docs/foundation/roadmap.md returns zero hits for forbidden patterns
- [ ] Fresh-clone link chain resolves: docs/specs/README.md to docs/foundation/roadmap.md to active spec to .cursor/plans/
- [ ] Matches spec requirements

## Implementation Order

```
PREREQ-001
    ↓
TASK-001 → TASK-002
         ↘ TASK-003 → TASK-004 → TASK-005  (M-001)
TASK-006 → TASK-007                       (M-002)
TASK-008 ─────────────────────────────┐
                                      ↓
         TASK-009 → TASK-010           (M-003)
              ↓
         TASK-011                       (M-004)
              ↓
         TASK-012                       (DOC-001..004)
              ↓
         TASK-013                       (M-005, local)
```

**PR boundary note:** Spec requires single PR scope per phase. Tasks TASK-001 through TASK-005 may ship as M-001 PR; TASK-006 through TASK-007 as M-002; TASK-008 through TASK-010 as M-003; TASK-011 as M-004; TASK-013 as M-005 (local, may accompany any PR or land separately).

## Existing Solutions

- **Vitest static analysis** (`tests/contracts/pilot-copy-drift.test.ts`): reuse walkFiles + readFileSync pattern for DOC-001..004. No link-checker npm dependency — justified by spec Existing solutions note (less complex, already in harness).
- **`npm run test:contracts`**: existing script runs `vitest run tests/contracts` — no new npm script per spec Production Correctness Notes.
