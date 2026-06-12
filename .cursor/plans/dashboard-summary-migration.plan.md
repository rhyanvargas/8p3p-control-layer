---
name: Dashboard Summary Migration
overview: Migrate decision-driven panels (Who Needs Help Now, What Should Happen Next) to GET /v1/learners/:ref/summary while keeping the per-skill panels (What Do They Need Help With, Did the Support Work) on GET /v1/state, because the literacy pilot requires per-skill breakdown that the URS summary projection intentionally strips. Align panel titles and skill IDs to the 9th Grade Literacy Pilot guide.
todos:
  - id: TASK-001
    content: Add LearnerSummaryResponse types and useLearnerSummary hook
    status: completed
  - id: TASK-002
    content: Migrate WhoNeedsAttention and WhatToDo to summary data
    status: completed
  - id: TASK-003
    content: Keep WhyAreTheyStuck and DidItWork on per-skill state; fix learner_reference param only
    status: completed
  - id: TASK-004
    content: Narrow redundant hooks without losing per-skill state reads
    status: completed
  - id: TASK-005
    content: Align panel titles and verify literacy skill IDs to pilot guide
    status: completed
  - id: TASK-006
    content: Update decision-panel-ui spec data sources and DPU e2e assertions
    status: completed
  - id: TASK-007
    content: Run dashboard typecheck lint and Playwright e2e
    status: completed
isProject: false
---

# Dashboard Summary Migration

**Primary API spec**: `docs/specs/learner-summary-api.md`
**UI spec**: `docs/specs/decision-panel-ui.md`
**Auth spec (unchanged)**: `docs/specs/dashboard-passphrase-gate.md`
**Pilot source of truth**: `internal-docs/9th Grade Literacy Pilot.pdf`
**Master plan**: `.cursor/plans/pilot-mvp-launch.plan.md` (Wave 3 Step 2)
**Depends on**: `.cursor/plans/learner-summary-api-hygiene-mvp.plan.md` (contract locked)
**Rules**: `.cursor/rules/document-traceability/RULE.md`, `.agents/skills/vercel-react-best-practices/AGENTS.md` (§4.3 SWR/React Query dedup, §3.6 minimize serialization)

## Why this plan exists

The summary endpoint is implemented and gate-verified, but the Decision Panel still fan-outs:

```
GET /v1/state/list          → learner enumeration (keep)
GET /v1/state?learner=...   → per learner (wrong param name — OpenAPI says learner_reference)
GET /v1/decisions?...       → per learner
GET /v1/signals?...         → per learner (SignalsPrefetch)
```

## Critical constraint — per-skill data (9th Grade Literacy Pilot)

The pilot guide is **skill-centric**. Panels 2 and 4 are per-skill tables:

- Panel 2 "What Do They Need Help With" — e.g. Jordan: `text_evidence` + `written_response` declining
- Panel 4 "Did the Support Work" — e.g. Jordan `text_evidence`: Fragile → Improving

The current implementation renders these from `extractSkillRows(body.state)` over the **full `skills.*` map** returned by `GET /v1/state`. The summary endpoint's `current_state.fields` is a **URS projection that intentionally strips `skills.*`** (see `learner-summary-urs-projection.plan.md`) down to a single dominant-skill scalar. Therefore:

- **Migrate to summary** only the decision-driven panels (Panel 1, Panel 3) — they need `recent_decisions` + `decision_context.skill`, which the summary carries.
- **Keep on `GET /v1/state`** the per-skill panels (Panel 2, Panel 4) — the summary cannot back them without re-expanding the contract we just locked.

This preserves the pilot's core proof (the exact literacy skill causing the issue) over request-count optimization. At pilot scale (<100 learners) the residual fan-out is acceptable.

## Spec Literals

### From `docs/specs/learner-summary-api.md` § Endpoint

```
GET /v1/learners/:learner_reference/summary
```

Query parameters: `org_id` (required), `recent_decisions_limit` (optional, 1–50, default 10), `trajectory_fields` (optional).

### From `docs/specs/learner-summary-api.md` § Response (200) — top-level keys

```
org_id, learner_reference, generated_at, current_state, recent_decisions,
field_trajectories, active_policy, signals_summary
```

### From `docs/specs/decision-panel-ui.md` § Requirements (current)

```
- No new API endpoints for MVP. The panel reads from existing GET /v1/* routes.
```

### From OpenAPI `GET /v1/state` query param (correct name)

```
learner_reference — Learner identifier (required)
```

## Prerequisites

Before starting implementation:
- [ ] `.cursor/plans/learner-summary-api-hygiene-mvp.plan.md` completed
- [ ] `npm run check` passes on control-layer root
- [ ] Dashboard builds: `cd dashboard && npm run typecheck`

## Tasks

### TASK-001: Types + useLearnerSummary hook
- **Files**: `dashboard/src/api/types.ts`, `dashboard/src/hooks/use-learner-summary.ts`, `dashboard/src/lib/query-client.ts` (query keys if needed)
- **Action**: Create / Modify
- **Details**:
  1. Add `LearnerSummaryResponse` and nested types mirroring OpenAPI (`current_state.fields` as closed URS projection subset used by panels).
  2. Add `useLearnerSummary(orgId, learnerRef, options?)` using TanStack Query:
     - Path: `/v1/learners/${encodeURIComponent(learnerRef)}/summary?org_id=${encodeURIComponent(orgId)}`
     - Reuse `apiFetch` from `dashboard/src/api/client.ts` (existing `x-api-key` header).
     - `staleTime` aligned with other panel hooks (match `use-decisions.ts` polling interval).
  3. Prefer React Query deduplication (vercel-react-best-practices §4.3) — one hook instance per learner ref.
- **Depends on**: hygiene MVP plan complete
- **Verification**: Hook fetches summary for a seeded learner in dev; types compile

### TASK-002: Migrate WhoNeedsAttention + WhatToDo
- **Files**: `dashboard/src/components/panels/WhoNeedsAttention.tsx`, `dashboard/src/components/panels/WhatToDo.tsx`, `dashboard/src/lib/attention-decisions.ts` (if needed)
- **Action**: Modify
- **Details**:
  - **WhoNeedsAttention:** Keep org-wide decision fan-out OR refactor to: list learners via `use-learner-list`, then filter by `recent_decisions` from summary per high-priority learner. Minimum change: for displayed learners, prefer `recent_decisions` from summary where a single learner is selected; document if org-wide list still uses `fetch-org-decisions.ts` temporarily.
  - **WhatToDo:** Read `recent_decisions[0]` from summary for selected learner; use `educator_summary` field (already on summary projection).
  - Preserve existing UI copy and Approve/Reject behavior (feedback API unchanged).
- **Depends on**: TASK-001
- **Verification**: Panels render with dev server + seeded org; no regression in educator_summary display

### TASK-003: Keep per-skill panels on state; fix param drift only
- **Files**: `dashboard/src/components/panels/WhyAreTheyStuck.tsx`, `dashboard/src/components/panels/DidItWork.tsx`
- **Action**: Modify
- **Details**:
  - **Do NOT migrate these to the summary endpoint.** They MUST keep reading `skills.*` via `GET /v1/state` to satisfy pilot Panels 2 and 4 (per-skill breakdown).
  - Fix the query-param drift: `GET /v1/state` uses `learner_reference`, not `learner=` (current code uses `&learner=` which mismatches OpenAPI `docs/api/openapi.yaml` `/v1/state` parameter). Verify the handler accepts whichever name is canonical and align both sides; prefer `learner_reference`.
  - No data-shape change to `extractSkillRows`.
- **Depends on**: TASK-001 (independent; can run in parallel)
- **Verification**: Panels 2/4 still render per-skill rows for seeded Jordan (`text_evidence`); param matches OpenAPI

### TASK-004: Narrow redundant hooks (preserve per-skill reads)
- **Files**: `dashboard/src/hooks/use-learner-states.ts`, `dashboard/src/hooks/use-signals.ts`, `dashboard/src/components/layout/SignalsPrefetch.tsx`
- **Action**: Modify
- **Details**:
  - Remove per-learner `use-learner-states` calls only from panels migrated in TASK-002 (Panel 1/3).
  - **Keep** `GET /v1/state` reads feeding Panels 2/4 (TASK-003).
  - **SignalsPrefetch:** evaluate whether `signals_summary` from the summary replaces signal prefetch for migrated panels; keep raw signal reads only if a panel still needs them.
  - Keep `use-learner-list` and org-wide `fetch-org-decisions` where summary cannot replace (org-wide attention sorting — acceptable at pilot scale).
- **Depends on**: TASK-002, TASK-003
- **Verification**: Migrated panels call `/v1/learners/*/summary`; per-skill panels still call `/v1/state`; no `&learner=` param remains

### TASK-005: Align panel titles + literacy skill IDs to pilot guide
- **Files**: `dashboard/src/components/panels/*.tsx` (PanelCard titles), `examples/springs/seed-springs-demo.mjs` / `docs/templates/literacy-field-mappings.json` (verify only), `dashboard/src/lib/state-skills.ts` (skill label mapping if present)
- **Action**: Modify / Verify
- **Details**:
  1. Align panel titles to `internal-docs/9th Grade Literacy Pilot.pdf` § What We Are Proving:
     - "Who Needs Attention?" → "Who Needs Help Now"
     - "Why Are They Stuck?" → "What Do They Need Help With"
     - "What To Do?" → "What Should Happen Next"
     - "Did It Work?" → "Did the Support Work"
  2. Verify the literacy template + seed emit the pilot skill IDs: `main_idea`, `text_evidence`, `written_response`, `academic_vocabulary`, `reading_stamina`, `basic_comprehension`, `cross_subject_literacy`. If labels differ, fix the mapping/seed (owning files), not the panel.
- **Depends on**: TASK-002, TASK-003
- **Verification**: Demo dashboard titles match the PDF; Panel 2 shows pilot skill labels

### TASK-006: Update spec + e2e
- **Files**: `docs/specs/decision-panel-ui.md`, `dashboard/e2e/decision-panel.spec.ts`
- **Action**: Modify
- **Details**:
  1. Spec — update Architecture data sources:
     - `GET /v1/state/list` (learner index — unchanged)
     - `GET /v1/learners/:ref/summary` (Panels 1, 3 — decision-driven)
     - `GET /v1/state` with `skills.*` (Panels 2, 4 — per-skill breakdown, REQUIRED by literacy pilot)
  2. Update § Requirements: "Uses summary endpoint for decision panels; per-skill panels read GET /v1/state. No new write paths."
  3. Update panel titles in spec to match pilot guide (TASK-005).
  4. E2E **DPU-009**: assert refresh triggers a `/v1/learners/` request (Panel 1/3) AND a `/v1/state` request (Panel 2/4).
- **Depends on**: TASK-005
- **Verification**: Spec matches implementation and pilot guide; DPU-001 + DPU-009 pass

### TASK-007: Quality gates
- **Files**: (none — run commands)
- **Action**: Verify
- **Details**: From repo root and dashboard:
  - `npm run check`
  - `cd dashboard && npm run typecheck && npm run lint`
  - `cd dashboard && npm run test:e2e` (with `E2E_WITH_API=1` when API available)
- **Depends on**: TASK-006
- **Verification**: All green

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `dashboard/src/hooks/use-learner-summary.ts` | TASK-001 | TanStack Query wrapper for summary endpoint |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `dashboard/src/api/types.ts` | TASK-001 | LearnerSummaryResponse types |
| `dashboard/src/components/panels/WhoNeedsAttention.tsx`, `WhatToDo.tsx` | TASK-002 | Read from summary |
| `dashboard/src/components/panels/WhyAreTheyStuck.tsx`, `DidItWork.tsx` | TASK-003 | Keep on GET /v1/state; fix param |
| `dashboard/src/hooks/use-learner-states.ts`, `use-signals.ts` | TASK-004 | Narrow without losing per-skill reads |
| `dashboard/src/components/panels/*.tsx` | TASK-005 | Panel titles to pilot guide |
| `docs/templates/literacy-field-mappings.json` (verify) | TASK-005 | Confirm pilot skill IDs |
| `docs/specs/decision-panel-ui.md` | TASK-006 | Data source architecture + titles |
| `dashboard/e2e/decision-panel.spec.ts` | TASK-006 | DPU-009 network assertion |

## Requirements Traceability

| Requirement | Source | Task |
|-------------|--------|------|
| Four panels render educator-readable data | decision-panel-ui § Overview | TASK-002, TASK-003 |
| Panel 2/4 show exact literacy skill (per-skill) | 9th Grade Literacy Pilot § Panels 2,4 | TASK-003 |
| Panel titles match pilot guide | 9th Grade Literacy Pilot § What We Are Proving | TASK-005 |
| Literacy skill IDs (text_evidence, etc.) | 9th Grade Literacy Pilot § Minimum Literacy Skill IDs | TASK-005 |
| Read-only; no CRUD | decision-panel-ui § Overview | all (read paths only) |
| Uses TanStack Query for server state | decision-panel-ui § Tech Stack | TASK-001 |
| Auth via dashboard passphrase gate unchanged | dashboard-passphrase-gate | no change |
| Summary backs decision panels | learner-summary-api § Requirements | TASK-001, TASK-002 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| DPU-001 | e2e | Four panels render | TASK-007 |
| DPU-009 | e2e | Refresh triggers summary (Panel 1/3) + state (Panel 2/4) | TASK-006, TASK-007 |
| (manual) | smoke | Panel 2 shows per-skill rows for Jordan (text_evidence) | TASK-003 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| decision-panel-ui § Requirements | No new API endpoints; reads GET /v1/state, /v1/decisions, /v1/signals | Panels 1/3 read GET /v1/learners/:ref/summary; Panels 2/4 keep GET /v1/state | Update spec in same PR (TASK-006) |
| decision-panel-ui panel titles | "Who Needs Attention?" etc. | Pilot titles "Who Needs Help Now" etc. | Update spec in same PR (TASK-005) — aligns to literacy pilot guide |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migrating per-skill panels to summary would lose skill breakdown | High (pilot proof) | Explicitly keep Panels 2/4 on GET /v1/state (TASK-003) |
| N state calls for per-skill panels | Medium at scale | Accept for pilot (<100 learners); batch later |
| Seed emits wrong skill IDs | Medium (wrong labels) | TASK-005 verifies against pilot Skill ID table |

## Verification Checklist

- [ ] All tasks completed
- [ ] Panels 2/4 still render per-skill rows (pilot requirement)
- [ ] No `&learner=` query param (use `learner_reference`)
- [ ] Panel titles match `internal-docs/9th Grade Literacy Pilot.pdf`
- [ ] `docs/specs/decision-panel-ui.md` updated
- [ ] Dashboard e2e passes

## Implementation Order

```
TASK-001 → TASK-002 ─┐
TASK-003 ────────────┤→ TASK-004 → TASK-005 → TASK-006 → TASK-007
```

## Post-pilot follow-up (out of scope here)

If a single-call literacy dashboard is required later, add a per-skill `skills_summary` section to the summary endpoint (`learner-summary-skills-section.plan.md`, tracked in `.cursor/plans/urs_product_readiness_55b0b52e.plan.md` follow-ups). That reverses part of the URS projection stripping and would let Panels 2/4 also read the summary. Not needed for pilot — two endpoints is the deliberate v1.1 choice.
