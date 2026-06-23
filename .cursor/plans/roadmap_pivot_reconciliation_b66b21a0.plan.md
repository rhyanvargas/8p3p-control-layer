---
name: roadmap pivot reconciliation
overview: Update the roadmap living anchor (internal-docs/foundation/roadmap.md) to (a) record the 2026-06-23 CEO controlled-evaluation pivot and the active P0/P1/P2 sequencing, and (b) fix the stale Decision Panel / passphrase-gate rows left behind by the Next.js migration.
todos:
  - id: direction-section
    content: Add '### Current Direction (2026-06-23) — Controlled Data Evaluation' subsection + cite directives report in auditable snapshot list
    status: completed
  - id: checklist-rows
    content: Add Pre-Month 0 readiness rows 32–35 (Next.js migration, AI explanations P0, dashboard UX D1/D2/D3, controlled-eval runbook)
    status: completed
  - id: fix-stale-rows
    content: "Fix stale Decision Panel (row 21) and Passphrase Gate (row 22) entries re: /dashboard + src/auth files"
    status: completed
  - id: active-plans
    content: Correct Active Execution Plans rows + add AI Educator Explanations and Dashboard UX Improvements rows
    status: completed
  - id: historical-annotations
    content: Annotate Wave 2 ASCII block and /inspect v1 artifact as migrated (no history rewrite)
    status: completed
  - id: verify
    content: Grep roadmap for /dashboard, src/auth/dashboard-, VITE_ to confirm only intentional historical mentions remain
    status: completed
isProject: false
---

# Roadmap Pivot Reconciliation

Single-file edit: [internal-docs/foundation/roadmap.md](internal-docs/foundation/roadmap.md). No code or spec changes. Combines (a) CEO-pivot direction + (b) stale-row fixes.

## A. Record the 2026-06-23 direction

1. **New subsection** after the phase table (around line 16), titled `### Current Direction (2026-06-23) — Controlled Data Evaluation`. Content:
   - The verifiable CEO ask: plain-language "why" explanation (where/why decay; confidence-not-grade; auditable). Cite `docs/specs/ai-educator-explanations.md` + `docs/reports/2026-06-23-ceo-meeting-directives.md`.
   - Near-term goal = **controlled data evaluation** (local/SQLite, pseudonymous export, no AWS deploy gate, no live integration).
   - Active sequencing: **P0** = AI educator-explanation layer (A1) + Decision Panel D1 inversion (A2); **P1** = per-skill trajectory scope (A3) + controlled-eval runbook (A4); **P2 deferred (live-pilot track)** = full AWS deploy, webhook adapters, tenant field-mapping automation (A6).
   - One-line note that the prior AWS-deploy-gated live-pilot framing remains valid but is **not** the current critical path.

2. **Current Roadmap Snapshot (Auditable)** list (lines 93–99): add a top bullet linking `docs/reports/2026-06-23-ceo-meeting-directives.md` as the latest direction record.

## B. New Pre-Month 0 Readiness Checklist rows (after line 53)

- **32 Dashboard → Next.js migration** — retires Fastify-served Vite SPA (`/dashboard`, `/inspect`, `VITE_API_KEY`); standalone app + server-side `/api/control/*` proxy. Status: local Phases 1–4 complete; AWS Amplify deploy **blocked pending startup credits**. Refs `docs/specs/nextjs-amplify-dashboard-migration.md`, `docs/specs/dashboard-design-requirements.md`.
- **33 AI educator-explanation layer (P0)** — Spec'd + Plan staged 2026-06-23; **impl pending** (`src/decision/explanations/` = 0 files). Refs `docs/specs/ai-educator-explanations.md`, `.cursor/plans/ai-educator-explanations.plan.md`.
- **34 Decision Panel UX D1/D2/D3 (P0/P1)** — educator-first L0 columns + technical-tier L1 Sheet (D1), cross-filter sync toggle (D2), KPI declutter + uniform clickability (D3). Refs `.cursor/plans/dashboard-uiux-improvements.plan.md`, `docs/specs/overview-cross-filter-sync.md`.
- **35 Controlled-evaluation runbook (A4)** — **Not started**: SQLite + seed -> pseudonymous export -> decisions/receipts/explanations.

## C. Fix stale rows (the (b) fixes)

3. **Row 21** (line 43, Decision Panel UI): replace `served at /dashboard` with a note that it is now a standalone Next.js app in `dashboard/` (Fastify no longer serves `/dashboard` or `/inspect`); cross-ref item 32. Keep the historical "Complete (14 tasks)" fact.
4. **Row 22** (line 44, Passphrase Gate): repoint implementation to `dashboard/middleware.ts`, `dashboard/lib/*`, `dashboard/app/(auth)/*`; note `dp_session` is now `Path=/` (isolation by host, split origins) and that Fastify `src/auth/dashboard-gate.ts` / `dashboard-login.ts` / `login-rate-limiter.ts` are removed; login at `/login`.
5. **Active Execution Plans table** (lines 263–264): apply the same two corrections, and **add two rows**:
   - `AI Educator Explanations` — Spec'd + Plan staged (2026-06-23), impl pending.
   - `Dashboard UX Improvements (D1/D2/D3)` — Plan staged (2026-06-23).

## D. Light annotations on historical logs (no rewrite)

6. Add a one-line "(dashboard surfaces migrated to Next.js — see item 32)" note to the Pilot Wave 2 ASCII block (near line 161) and to v1 artifact `/inspect` row (line 110), so historical records stay accurate without erasing what happened.

## Out of scope
- The `docs/specs/README.md` + `dashboard-passphrase-gate.md` doc-drift fixes from the earlier `/review` (separate change).
- Implementing A1/A2/A4 themselves (this only records/sequences them).

## Verification
- Re-grep `internal-docs/foundation/roadmap.md` for `/dashboard`, `src/auth/dashboard-`, `VITE_` to confirm only intentional historical mentions remain.