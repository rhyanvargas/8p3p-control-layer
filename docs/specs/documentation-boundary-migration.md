# Documentation Boundary Migration

## Overview

The repository currently treats **gitignored** `internal-docs/` as source of truth for engineering rules, planning anchors, and pilot gate criteria — while **committed** specs, guides, and Cursor rules link to those paths. Agents and fresh clones cannot resolve those links, which breaks spec-driven delivery and creates dual authority with `docs/` and `src/contracts/`.

This spec defines a **one-time migration** that:

1. **Promotes** agent- and CI-required material into committed `docs/foundation/` and `docs/guides/`.
2. **Inlines** normative pilot gate rows into the specs and checklists that enforce them.
3. **Shrinks** `internal-docs/` to a private ops vault (named customers, investor PDFs, demo scripts, append-only CS logs).
4. **Adds** a doc-drift contract test so committed docs never again depend on gitignored paths for implementation authority.

The migration is documentation-only. No runtime API, schema, or dashboard behavior changes.

## Requirements

### Functional

- [ ] **DOC-TIER-001.** Committed docs declare a two-tier documentation model in `docs/foundation/documentation-boundaries.md` (see Concrete Values Checklist).
- [ ] **DOC-PROMOTE-001.** `internal-docs/foundation/api-naming-conventions.md` is copied verbatim to `docs/foundation/api-naming-conventions.md`; all committed references updated; internal copy retained as a mirror until manually deleted.
- [ ] **DOC-PROMOTE-002.** A sanitized `docs/foundation/roadmap.md` is committed as the planning anchor. It MUST NOT contain named customer strings, dollar amounts, or investor-deck URLs that are not already public in committed `docs/reports/`.
- [ ] **DOC-PROMOTE-003.** `docs/foundation/definitive-workflow.md` is created (content from `internal-docs/foundation/definitive-workflow.md`) with the planning anchor pointer fixed to `docs/foundation/roadmap.md`.
- [ ] **DOC-INLINE-001.** Normative pilot gate tables currently referenced from specs are committed in `docs/guides/pilot-readiness-gates.md` (extracted from `internal-docs/pilot-operations/pilot-readiness-definition.md` §8P3P Readiness + §Customer Readiness, redacted).
- [ ] **DOC-INLINE-002.** `docs/specs/ingestion-preflight.md`, `docs/specs/decision-panel-ui.md`, and `docs/guides/pilot-launch-checklist.md` cite `docs/guides/pilot-readiness-gates.md` for gate rows — not `internal-docs/pilot-operations/pilot-readiness-definition.md`.
- [ ] **DOC-DELINK-001.** Every `internal-docs/` href under `docs/`, `README.md`, and `.cursor/rules/` is removed or replaced per the Link Replacement Matrix (Concrete Values Checklist).
- [ ] **DOC-RULES-001.** `.cursor/rules/project-context/RULE.md` and `.cursor/rules/control-layer-constraints/RULE.md` cite committed paths only (`src/contracts/schemas/`, `docs/foundation/`, `tests/contracts/`) — not archived POC playbooks under `internal-docs/`.
- [ ] **DOC-INDEX-001.** `docs/specs/README.md` and `docs/guides/README.md` navigation tables point at committed anchors only; internal ops docs are listed in a single stub (`docs/guides/internal-operations-stub.md`) with no relative links into `internal-docs/`.
- [ ] **DOC-TEST-001.** Contract test `DOC-001`..`DOC-004` (see Contract Tests) pass in CI via `npm run test:contracts`.

### Acceptance Criteria

- Given a fresh clone with **no** local `internal-docs/` directory, when an agent reads `docs/specs/README.md` → `docs/foundation/roadmap.md` → an active spec → `.cursor/plans/{feature}.plan.md`, then every link in that chain resolves to a committed file.
- Given `npm run test:contracts`, when the doc-boundary tests run, then zero committed markdown files under `docs/` contain `internal-docs/` hrefs except entries on the **Allowed Exceptions** list (Concrete Values Checklist).
- Given a spec author adds a new public API surface, when they follow `docs/specs/README.md`, then the MUST-read naming rule resolves to `docs/foundation/api-naming-conventions.md` without needing local internal docs.
- Given CS needs the full onboarding runbook with named customer context, when they open `internal-docs/pilot-operations/onboarding-runbook.md` locally, then that file still exists and is **not** required for implementation or CI.

## Constraints

- **Public repo boundary.** Nothing committed may include named pilot customer identifiers, unsigned engagement PDFs, CEO/CTO private comms, or competitive IP analysis currently in `internal-docs/`.
- **No spec content duplication.** Gate *criteria* move to committed guides; gate *narrative and customer-specific procedures* stay in `internal-docs/`.
- **Single PR scope per phase.** Phases are ordered; do not partially promote roadmap without updating rules and README in the same PR.
- **Archive is not SSoT.** `archive/snapshots/roadmap-2026-06-23.md` is a historical snapshot only; after migration the living anchor is `docs/foundation/roadmap.md`.

## Out of Scope

- Publishing `internal-docs/` to a private git remote or submodule (follow-up decision).
- Rewriting every archived plan under `archive/plans/` or `.cursor/plans/` (update only when those plans are next touched).
- Customer-facing doc site / Stripe-like docs UX (`internal-docs/foundation/documentation-experience.md` remains aspirational).
- Moving SBIR evidence report templates or `pilot-feedback-log.md` out of `internal-docs/reports/` (append-only ops artifacts stay private).
- Redacting or committing `internal-docs/compliance-security-posture-and-migration-path.md` (enterprise posture narrative stays internal; committed specs keep a one-line "see internal compliance doc" stub without a broken href — see Link Replacement Matrix).
- Deleting the `internal-docs/` directory locally.

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Document hierarchy (spec → plan → code) | `.cursor/rules/document-traceability/RULE.md` | Defined ✓ |
| Spec index and lifecycle tiers | `docs/specs/README.md` | Defined ✓ — **requires update in this migration** |
| Integration guide index | `docs/guides/README.md` | Defined ✓ — **requires update in this migration** |
| Pilot launch gates | `docs/guides/pilot-launch-checklist.md` | Defined ✓ — **requires gate cross-ref update** |
| Ingestion preflight gate semantics | `docs/specs/ingestion-preflight.md` | Defined ✓ — **requires gate cross-ref update** |
| Decision Panel deployment gates | `docs/specs/decision-panel-ui.md` | Defined ✓ — **requires gate cross-ref update** |
| Program metrics naming rule | `docs/specs/program-metrics.md` | Defined ✓ — **requires path update** |
| Contract test harness | `tests/contracts/` (Vitest) | Defined ✓ |
| Analysis consistency (deploy tiers) | `.cursor/rules/analysis-consistency-checks.mdc` | Defined ✓ — roadmap sanitization MUST preserve tier A/B/C vocabulary |

### Provides to Other Specs

| Artifact | Used By |
|----------|---------|
| `docs/foundation/documentation-boundaries.md` | All future specs, `/draft-spec`, `/plan-impl`, `/review` |
| `docs/foundation/api-naming-conventions.md` | All specs adding routes/modules (replaces internal path) |
| `docs/foundation/roadmap.md` | Spec index, project-context rule, planning workflows |
| `docs/guides/pilot-readiness-gates.md` | Ingestion preflight, decision panel, launch checklist, program metrics |
| `docs/guides/internal-operations-stub.md` | CS/solutions pointer without broken links |

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| N/A | Documentation-only migration — no runtime error codes |

### New (add during implementation)

| Code | Description |
|------|-------------|
| N/A | Documentation-only migration |

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| DOC-001 | No forbidden `internal-docs/` hrefs in committed docs | All `*.md` under `docs/`, plus root `README.md` | Zero matches for pattern `\]\(\.{0,2}/internal-docs/` except paths on **Allowed Exceptions** list |
| DOC-002 | Promoted foundation files exist | File paths from Promote table | Each file exists and is non-empty |
| DOC-003 | Cursor rules do not cite gitignored POC playbooks as SSoT | `.cursor/rules/project-context/RULE.md`, `.cursor/rules/control-layer-constraints/RULE.md` | Zero matches for `internal-docs/foundation/poc-playbooks` |
| DOC-004 | Spec index links resolve | `docs/specs/README.md` markdown links to `docs/foundation/` | Every `docs/foundation/*.md` link target exists |

> **Test strategy note:** DOC-001..DOC-004 are static analysis tests in `tests/contracts/documentation-boundary.test.ts` (new file). They do not require a running server. Pattern: same approach as `tests/contracts/pilot-copy-drift.test.ts`.

## Concrete Values Checklist

### Documentation tier model (normative)

| Tier | Path | Git status | Audience | Authority |
|------|------|------------|----------|-----------|
| **T1 — Foundation** | `docs/foundation/` | Committed | Agents, engineers, integrators | Engineering rules, terminology, architecture, roadmap |
| **T2 — Specs** | `docs/specs/` | Committed | Agents, engineers | Requirements + interface SSoT |
| **T3 — Guides** | `docs/guides/` | Committed | Customers + operators | Integration and launch procedures |
| **T4 — Plans** | `.cursor/plans/` | Committed | Agents, engineers | Implementation sequencing |
| **T5 — Contracts** | `src/contracts/schemas/`, `docs/api/` | Committed | Agents, CI | Machine-verifiable truth |
| **T6 — Internal ops** | `internal-docs/` | **Gitignored** | CS, solutions, leadership | Named-customer runbooks, investor PDFs, demo scripts, append-only logs |

**Hard rule:** T1–T5 MUST NOT link to T6 with a relative markdown href. T6 MAY link to T1–T5.

### Files to promote (copy → update refs → verify)

| Source (local only) | Destination (committed) | Redaction required |
|---------------------|-------------------------|-------------------|
| `internal-docs/foundation/api-naming-conventions.md` | `docs/foundation/api-naming-conventions.md` | None — already domain-neutral |
| `internal-docs/foundation/roadmap.md` | `docs/foundation/roadmap.md` | Remove/replace: named customer strings, `$` budget figures not in public reports, links to gitignored reports |
| `internal-docs/foundation/definitive-workflow.md` | `docs/foundation/definitive-workflow.md` | Fix planning anchor path only |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` (gate tables only) | `docs/guides/pilot-readiness-gates.md` | Remove customer names; keep gate text verbatim |

### New files to create

| Path | Purpose |
|------|---------|
| `docs/foundation/documentation-boundaries.md` | Tier model + agent reading order |
| `docs/guides/internal-operations-stub.md` | Lists internal-only doc titles; no `internal-docs/` hrefs |
| `tests/contracts/documentation-boundary.test.ts` | DOC-001..DOC-004 |

### Link Replacement Matrix

| Old reference pattern | Replacement |
|----------------------|-------------|
| `internal-docs/foundation/api-naming-conventions.md` | `docs/foundation/api-naming-conventions.md` |
| `internal-docs/foundation/roadmap.md` | `docs/foundation/roadmap.md` |
| `internal-docs/foundation/definitive-workflow.md` | `docs/foundation/definitive-workflow.md` |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` (gate rows) | `docs/guides/pilot-readiness-gates.md` |
| `internal-docs/pilot-operations/onboarding-runbook.md` | Prose: "Internal onboarding runbook (local `internal-docs/`, not in public repo)" — **no href** |
| `internal-docs/pilot-operations/pilot-runbook.md` | Same stub pattern |
| `internal-docs/compliance-security-posture-and-migration-path.md` | Prose: "Internal compliance posture doc (local only)" — **no href** |
| `internal-docs/foundation/logic-model.md` | Prose stub until a sanitized logic model is drafted (out of scope for v1 migration) |
| `internal-docs/reports/pilot-smoke-*.md` | Keep path as **literal filename pattern** in checklists (ops artifact location), not a markdown link |
| `internal-docs/Proposal for Controlled Data Evaluation.pdf` | Prose stub in specs that mention evaluation engagements |

### Allowed Exceptions (DOC-001)

These committed files MAY mention the string `internal-docs/` without a resolvable href:

| File | Allowed mention |
|------|-----------------|
| `docs/foundation/documentation-boundaries.md` | Defines T6 tier by name |
| `docs/guides/internal-operations-stub.md` | Lists internal doc titles |
| `docs/specs/documentation-boundary-migration.md` | This spec (migration instructions) |
| Checklist items describing ops artifact save paths | Literal path pattern only, e.g. `` `internal-docs/reports/pilot-smoke-*.md` `` — not a link |

### Migration phases (execution order)

| Phase | ID | Deliverables | PR gate |
|-------|-----|--------------|---------|
| **1 — Promote foundation** | M-001 | `api-naming-conventions.md`, `roadmap.md`, `definitive-workflow.md`, `documentation-boundaries.md`; update `docs/specs/README.md`, `.cursor/rules/project-context/RULE.md` | DOC-002, DOC-004 pass |
| **2 — Inline gates** | M-002 | `pilot-readiness-gates.md`; update ingestion-preflight, decision-panel-ui, pilot-launch-checklist, deployment-checklist | Spec gate cross-refs resolve |
| **3 — Delink** | M-003 | Link Replacement Matrix applied across `docs/`, `README.md`, `.cursor/rules/`; `internal-operations-stub.md`; guides README restructure | DOC-001, DOC-003 pass |
| **4 — Rules cleanup** | M-004 | `control-layer-constraints/RULE.md` → `src/contracts/schemas/` as schema SSoT | DOC-003 pass |
| **5 — Internal README** | M-005 | Update `internal-docs/README.md` to point at committed anchors for engineering rules | Local only (not in CI) |

### Agent reading order (post-migration)

```
docs/foundation/documentation-boundaries.md
  → docs/foundation/roadmap.md
  → docs/specs/README.md (pick Active spec)
  → docs/specs/{feature}.md
  → .cursor/plans/{feature}.plan.md
  → src/ + tests/
```

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| N/A | — | — | Documentation-only migration |

### Cookies

N/A — no cookies.

### Env vars

N/A — no runtime env vars.

### Constants / limits

- **Redaction grep patterns** (must return zero hits in committed `docs/foundation/roadmap.md` after sanitization): `Springs Charter`, `springs-charter`, `$5/month`, `$20/month` (unless already present in a committed public report being quoted).
- **Link scan roots for DOC-001:** `docs/`, `README.md` — exclude `docs/specs/documentation-boundary-migration.md` exception clauses only when asserting *href* patterns, not bare string mentions.

### Routes registered

N/A — no HTTP routes.

## Production Correctness Notes

- **Proxy / `trustProxy`:** N/A — no runtime component.
- **CORS:** N/A.
- **CSP / security headers:** N/A.
- **Cookie prefix vs Path scoping:** N/A.
- **Content-type parsing:** N/A.
- **Body size limits:** N/A.
- **Rate-limit storage scope:** N/A.
- **Error-code surface:** N/A.
- **CI enforcement:** DOC-001..DOC-004 MUST run under existing `npm run test:contracts` — no new npm script required.
- **Agent rule sync:** After M-001, `internal-docs/foundation/definitive-workflow.md` SHOULD mirror the committed workflow doc or add a banner: "Canonical copy: `docs/foundation/definitive-workflow.md`."

## Notes

### Problem evidence (2026-06-23)

- `internal-docs/` is gitignored (`.gitignore` line 5) but cited as SSoT from `docs/specs/README.md` lines 11, 76, 83.
- `.cursor/rules/control-layer-constraints/RULE.md` cites archived POC playbooks under `internal-docs/foundation/poc-playbooks/` while canonical schemas live in `src/contracts/schemas/`.
- `internal-docs/foundation/definitive-workflow.md` points at non-existent `docs/foundation/roadmap.md`; living roadmap exists only in gitignored `internal-docs/foundation/roadmap.md`.
- `archive/snapshots/roadmap-2026-06-23.md` is a partial committed snapshot but is not wired as the planning anchor.

### Existing solutions (prefer-existing-solutions check)

- **No external doc toolchain required.** Migration uses existing Vitest static analysis (same pattern as `pilot-copy-drift.test.ts`) rather than adding a link-checker dependency.
- **Optional follow-up:** private git submodule or team vault sync for `internal-docs/` — justified as higher DX for CS, but out of scope here because it requires infra the public repo cannot assume.

### Sanitized roadmap content policy

When promoting `roadmap.md`, preserve:

- P0/P1/P2 active sequencing table
- Deploy tier A/B/C disambiguation (required by analysis-consistency-checks rule)
- Links to committed specs and `.cursor/plans/`
- Active execution plans table

Replace or remove:

- Named customer references → "pilot customer" or "Phase 0 site"
- Internal-only report links → committed `docs/reports/` equivalents where they exist
- Full 37-row inventory → link to `archive/snapshots/roadmap-2026-06-23.md` as "historical inventory snapshot"

### Recommended next step

Run `/plan-impl docs/specs/documentation-boundary-migration.md` to produce `.cursor/plans/documentation-boundary-migration.plan.md` with one task group per phase (M-001..M-005).
