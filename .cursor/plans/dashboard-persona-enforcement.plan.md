---
name: Dashboard Persona Enforcement
overview: "Implement §D5 persona surfaces on the hosted dashboard: dual-code login, persona cookie, nav/route/tab allowlists, educator Overview scrub, and compliance-only KPI filter. Interim pilot auth — Cognito replaces codes in Phase 2, not IA rules."
todos:
  - id: PE-001
    content: "Dual-code login + persona cookie — DASHBOARD_ACCESS_CODE_EDUCATOR/COMPLIANCE, extend dp_session payload, login route validation"
    status: pending
  - id: PE-002
    content: "Nav allowlist by persona — filter dashboard/lib/navigation.ts and app-sidebar.tsx per D5 educator vs compliance surfaces"
    status: pending
  - id: PE-003
    content: "Route guard redirect for compliance-only paths — middleware prefix allowlists; redirect educator sessions from /decisions, /signals, /reports, etc."
    status: pending
  - id: PE-004
    content: "Learner tab gating — learner-detail-view.tsx shows Overview + Struggles only for educator persona"
    status: pending
  - id: PE-005
    content: "Scrub educator Overview leaks — hide matched_rule_id, policy id, state version from learner-overview-tab.tsx for educator persona"
    status: pending
  - id: PE-006
    content: "Overview KPI persona filter — hide or relocate Rejected signals today and other compliance-only KPIs in educator mode"
    status: pending
  - id: PE-007
    content: "Unit + E2E persona smoke — dashboard/e2e/ dual-code login, nav visibility, route redirect, tab gating"
    status: pending
  - id: PE-008
    content: "Runbook note — aws-pilot-runbook § env vars for DASHBOARD_ACCESS_CODE_EDUCATOR and DASHBOARD_ACCESS_CODE_COMPLIANCE"
    status: pending
isProject: false
---

# Dashboard Persona Enforcement

**Primary spec:** [`docs/specs/dashboard-design-requirements.md`](../../docs/specs/dashboard-design-requirements.md) §2.2 D5 — Persona surfaces (normative)

**Auth spec:** [`docs/specs/dashboard-passphrase-gate.md`](../../docs/specs/dashboard-passphrase-gate.md) § Dual access codes

**Parent doc plan:** [`.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md`](ceo_educator_wave_docs_5f6ef773.plan.md) (TASK-021 — doc-only scaffold; this plan owns all `dashboard/` implementation)

**GTM context:** Blocks or mitigates [`pilot-charter-onboarding.plan.md`](pilot-charter-onboarding.plan.md) TASK-020 demo video — either PE-001–PE-006 ship **or** operators enforce two-path demo script + dual codes only ([`springs-pilot-demo.md`](../../docs/guides/playbooks/springs-pilot-demo.md)).

---

## Non-goals

- **Cognito / SSO** — Phase 2 replaces access codes, not D5 IA rules
- **Per-teacher policy overlay** — MVP-2 in [`educator-policy-builder.plan.md`](educator-policy-builder.plan.md); requires auth beyond dual passphrase
- **Backend RBAC changes** — route/nav allowlists are tier **C** only; admin API key model unchanged

---

## Deploy-tier note (Check 1)

Persona gating is **tier C** (dashboard middleware + UI). It does **not** require new Lambda/API Gateway work. Educator and compliance sessions both call the same tier **A** API; D5 controls which dashboard routes proxy which endpoints.

---

## Spec literals (D5 summary)

### Educator surface (educator access code)

| Area | Rule |
|------|------|
| **Nav** | Overview, Attention, Learners only |
| **Learner L2 tabs** | Overview, Struggles & progress only |
| **L0 columns** | Summary-first; no `matched_rule_id`, state version, policy id |
| **Overview KPIs** | Hide or relocate **Rejected signals today** — D4 Program health defers to D5 in educator mode |
| **Write surfaces** | Approve/Reject; product feedback POST — **not** signal upload, policy admin, trace export |

### Compliance/admin surface (compliance access code)

| Area | Rule |
|------|------|
| **Nav** | Full nav — Decisions, Signals, Reports included |
| **Learner L2 tabs** | Overview, Struggles, State, Trajectory |
| **Audit** | Decision trace JSON export; program/research export when available |

Full role × feature × infra-tier table: [`2026-06-29-ceo-educator-wave-directives.md`](../../docs/reports/2026-06-29-ceo-educator-wave-directives.md) §4.

---

## Task breakdown

### PE-001 — Dual-code login + persona cookie

**Files:** `dashboard/middleware.ts`, `dashboard/app/(auth)/login/`, `dashboard/lib/*`

- Read `DASHBOARD_ACCESS_CODE_EDUCATOR` + `DASHBOARD_ACCESS_CODE_COMPLIANCE` when both set (dual-code mode per passphrase spec)
- Login POST: constant-time match → set `persona` in signed `dp_session` payload (`educator` | `compliance`)
- Legacy fallback: single `DASHBOARD_ACCESS_CODE` → `compliance` persona (full nav)
- Absent `persona` on old cookies → treat as `compliance` (backward compatible)

### PE-002 — Nav allowlist by persona

**Files:** [`dashboard/lib/navigation.ts`](../../dashboard/lib/navigation.ts), [`dashboard/components/layout/app-sidebar.tsx`](../../dashboard/components/layout/app-sidebar.tsx)

- Filter nav items from session persona before render
- Educator: `/`, `/attention`, `/learners` (+ learner detail under `/learners/*`)
- Compliance: full item list per design-requirements §5.1 persona column

### PE-003 — Route guard redirect

**Files:** `dashboard/middleware.ts`

- Educator allowed prefixes: `/`, `/attention`, `/learners`, `/login`, `/logout`, `/api/control/*` (scoped to educator-allowed API paths if needed)
- Compliance-only routes redirect educator sessions to `/` or `/attention` with optional toast
- Compliance-only: `/decisions`, `/signals`, `/reports`, `/policies/*` (future policy builder)

### PE-004 — Learner tab gating

**Files:** [`dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx`](../../dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx)

- Educator persona: render Overview + Struggles tabs only
- Compliance persona: all tabs (State, Trajectory, etc.)

### PE-005 — Scrub educator Overview leaks

**Files:** [`dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`](../../dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx)

- Today: educator Overview exposes `matched_rule_id`, policy references (~lines 132–148) — **gap cited in CEO report**
- Educator persona: hide rule/policy identifiers; keep plain-language explanation copy

### PE-006 — Overview KPI persona filter

**Files:** overview components, `overview-metrics.ts` (or equivalent)

- Hide **Rejected signals today** and other compliance-only KPIs for educator persona
- Align with D4 deferral: Program health groupings compliance-only until D4 ships with persona awareness

### PE-007 — Unit + E2E persona smoke

**Files:** `dashboard/e2e/`, component tests

Suggested cases:

| ID | Case |
|----|------|
| PE-PERSONA-001 | Educator code login → nav shows 3 items only |
| PE-PERSONA-002 | Compliance code login → full nav |
| PE-PERSONA-003 | Educator direct URL `/decisions` → redirect |
| PE-PERSONA-004 | Educator learner detail → no State/Trajectory tabs |
| PE-PERSONA-005 | Educator Overview → no rule id in DOM |

### PE-008 — Runbook env vars

**Files:** [`docs/guides/operators/aws-pilot-runbook.md`](../../docs/guides/operators/aws-pilot-runbook.md)

- Document Amplify env vars for dual codes
- Note: distribute educator code to teachers; compliance code to admins/operators only
- Cross-ref [`organic-educator-wave-zoom.md`](../../docs/guides/playbooks/organic-educator-wave-zoom.md) distribution checklist

---

## Sequencing

```
PE-001 (login + cookie)
     ↓
PE-002 + PE-003 (nav + middleware) — parallel
     ↓
PE-004 + PE-005 + PE-006 (learner + overview UI) — parallel
     ↓
PE-007 (tests)
     ↓
PE-008 (runbook)
```

**Parallel track:** [`educator-policy-builder.plan.md`](educator-policy-builder.plan.md) EPB-004 depends on PE-003 for `/policies/builder` route guard.

---

## Interim mitigation (before PE-001 ships)

Operators running organic educator wave **before** this plan lands:

1. Set **both** dual-code env vars on Amplify (even if middleware ignores persona until PE-001)
2. Distribute **educator code** to teachers; **compliance code** to admins only
3. Follow **two-path demo script** — never open compliance routes in educator Zoom sessions ([`springs-pilot-demo.md`](../../docs/guides/playbooks/springs-pilot-demo.md))

---

## Ledger

| Plan | Group | Status |
|------|-------|--------|
| `dashboard-persona-enforcement.plan.md` | Active | 0/8 — PE-001 dual-code login |

Update [`docs/foundation/roadmap.md`](../../docs/foundation/roadmap.md) when tasks complete — rollup lives only in roadmap Program Status Ledger.

---

*Created: 2026-06-29 | Parent: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-021*
