---
name: dashboard-uiux-analysis
description: Produce a full tenant-dashboard UX/UI design analysis breakdown for the 8P3P control-layer dashboard, scored across five critical-path lenses (per-tenant view-only access, data file upload, critical-path health, developer observability, end-user clarity/freshness) and ending with an icon-first overview-page redesign. Enforces KPI/StatCard BI doctrine (one primary metric; delta + labeled secondaryLine inline on the value row; ArrowUp/ArrowDown deltas; no unlabeled dual icons). Recommendations MUST be backed by the project's frontend skills (frontend-design, vercel-react-best-practices, shadcn). Use when the user runs /dashboard-uiux-analysis or asks for a dashboard UX/UI analysis, audit, redesign recommendation, KPI card, StatCard, metric card, or Overview section-cards review.
disable-model-invocation: true
---

# Dashboard UI/UX Analysis

Produce a complete, evidence-backed UX/UI design analysis breakdown for the 8P3P tenant dashboard. Output is a structured report: a scored critical-path scorecard, per-lens findings, an icon-first overview redesign, and a prioritized roadmap — every recommendation cited to a skill or the design source-of-truth.

## Usage

```
/dashboard-uiux-analysis                      # full analysis of the current dashboard
/dashboard-uiux-analysis overview             # focus the overview-page redesign section
/dashboard-uiux-analysis upload               # focus the data-upload critical path
/dashboard-uiux-analysis observability        # focus developer observability
```

## Mandatory: back every recommendation with a skill

Before writing any recommendation, **read these skills and cite them**. A report with un-cited design recommendations is incomplete — do not deliver it.

| Skill | Read for | Path |
|-------|----------|------|
| `frontend-design` | Aesthetic direction, hierarchy, icon-first restraint, anti-"AI slop" | `.agents/skills/frontend-design/SKILL.md` |
| `vercel-react-best-practices` | Data fetching, Suspense, freshness/polling, bundle, re-render perf | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| `shadcn` | Component selection, registry blocks, composition for the redesign | `.agents/skills/shadcn/SKILL.md` |

If a relevant capability is missing, run `find-skills` (`.agents/skills/find-skills/SKILL.md`) and cite the result. Every finding's recommendation line must end with a `— per {skill}` or `— per dashboard-design-requirements.md §{n}` citation.

## Required reading (ground truth)

1. `docs/specs/dashboard-design-requirements.md` — design source-of-truth (IA, UX principles §2, anti-clutter + **KPI metric cards** §2.1, overview spec §8, components §9, states §10).
2. [references/kpi-metric-cards.md](references/kpi-metric-cards.md) — **mandatory** before scoring lens 5 or proposing any Overview KPI / `StatCard` change.
3. The implemented dashboard under `dashboard/app/(dashboard)/` and `dashboard/components/` — analyze what exists, not what's hypothetical. For KPIs inspect `section-cards.tsx` + `stat-card.tsx`.
4. Tenant/auth path: `dashboard/middleware.ts`, `dashboard/app/api/control/[...path]/route.ts`, `dashboard/lib/org-id.ts`.
5. Upload/ingestion path: `dashboard/hooks/use-learner-ingestion.ts`, `dashboard/lib/ingestion-log.ts`, signals surfaces.

## The five critical-path lenses (score each)

Evaluate the dashboard against the user's success criteria. Score every lens 🔴 / 🟡 / 🟢 with evidence (file + line or doc §).

1. **Per-tenant view-only access** — Is dashboard access scoped per tenant, read-only by default, with no client-held API key (§2 #6)? Is tenant context unambiguous in the UI (org switcher / pinned org)?
2. **Data file upload** — Can a tenant upload data (JSON payload, Excel/CSV) with clear states (drag-drop, validating, accepted/duplicate/rejected), inline field-level rejection reasons, and an honest success/failure surface?
3. **Critical-path health** — Does the end-to-end flow (upload → ingest → process → decision → reflected on dashboard) run smoothly and visibly, with no dead ends or silent failures?
4. **Developer observability** — Can devs see **what** errored, **why** (reason code / message), and **where** (route, layer, request id)? Are error states actionable and is failure traceable end-to-end?
5. **End-user clarity & freshness** — Can end-users read the dashboard at a glance (icon-first, scannable, semantic color + label), and is data demonstrably up-to-date (freshness timestamp, refresh, polling/refetch)? **Must include a KPI metric-card compliance check** (below).

## KPI metric cards (mandatory — enforce every run)

Overview `StatCard`s follow BI glance-tile rules. Full doctrine: [references/kpi-metric-cards.md](references/kpi-metric-cards.md). Spec: `dashboard-design-requirements.md` §2.1.

**Pass criteria (all must hold):**

| Check | Pass | Fail (score lens 5 🔴 or block redesign approval) |
|-------|------|-----------------------------------------------------|
| Primary | One hero number; title names that metric | Two peer numbers competing as heroes |
| Value row | Delta and labeled `secondaryLine` inline beside the hero | Delta/secondary stacked on a separate row under the hero |
| Secondary | `secondaryLine` text with a noun (`17 accepted`) | Icon + bare digit, or unlabeled chip beside the hero |
| Delta icon | `ArrowUp` / `ArrowDown` only | `TrendingUp` / squiggle trend icons |
| Icons | One leading title icon for the card's job | Opposing status icons on the same face (e.g. X + check) |
| Prose | Nuance in tooltip only | Multi-clause sentences on the card face |

**Canonical good example:** Rejected today → hero = rejected count; `secondaryLine` = `N accepted` **inline** beside the hero (same pattern as Needs action delta and Pending → `N reviewed`).

**Never recommend** reintroducing dual peer metrics or icon-chips on the value row. If a second metric needs equal weight, give it its own card (still ≤4) or a non-KPI surface.

When proposing Overview KPIs in the redesign table, each row must state primary value + optional labeled secondary — not a compound face value.

## Overview page: customer-value, icon-first

The overview must surface the **highest customer-value metrics first**, easy to read, **icons over verbose text**. For each proposed metric, justify with a value rank and an icon.

- Rank metrics by customer value (what answers "Is anything wrong right now?" §8) — not by what's easy to query.
- Prefer a Lucide icon + short label + value + delta over sentences. Reserve prose for the single chart's adjacent summary line (§2.1).
- Respect the anti-clutter doctrine (§2.1): ≤4 KPIs, one chart, one recent table — no "everything dashboard."
- Every metric paired with semantic color **and** icon/label (color is never the only signal — §2 #9).
- KPI faces obey the metric-card table above — icon-first does **not** mean unlabeled dual icons.

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Read the three frontend skills (mandatory) + run find-skills if a gap exists
- [ ] Step 2: Read dashboard-design-requirements.md §2.1 KPI metric cards + references/kpi-metric-cards.md
- [ ] Step 3: Inspect section-cards.tsx / stat-card.tsx against the KPI pass/fail table
- [ ] Step 4: Read remaining ground truth + inspect auth/upload paths
- [ ] Step 5: Score all five critical-path lenses with file/doc evidence (lens 5 includes KPI compliance)
- [ ] Step 6: Write per-lens findings (current state → gap → recommendation + citation)
- [ ] Step 7: Produce the icon-first overview redesign (value-ranked metrics; each KPI lists primary + labeled secondary)
- [ ] Step 8: Prioritize a P0/P1/P2 roadmap (KPI face defects are P0 if present)
- [ ] Step 9: Emit report using references/output-template.md; deliver path + 3-sentence recap
```

## Output

Write the report to `docs/reports/{YYYY-MM-DD}-dashboard-uiux-analysis.md` using the structure in [references/output-template.md](references/output-template.md). Then return the path and a 3-sentence recap (overall scorecard verdict + top P0).

## Rules

- **No un-cited recommendations.** Each ends with `— per {skill}` or `— per {doc §}`.
- **Evidence over opinion.** Cite a file path/line or a doc section for every current-state claim and gap.
- **Icon-first, not verbose** (mirror the product principle in the report itself: use the scorecard table and icons, not walls of prose).
- **KPI doctrine is non-negotiable.** Do not approve or propose StatCard faces that fail the pass criteria; cite `kpi-metric-cards.md` / §2.1.
- **Read-only analysis.** This skill produces a report; it does not modify dashboard code unless the user explicitly asks for fixes afterward.
- Keep within the design doctrine — recommend refined minimalism (restraint, hierarchy, whitespace), not decorative maximalism.
