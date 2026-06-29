# CEO Educator Wave — Directives & Readiness (2026-06-29)

**Date:** 2026-06-29  
**Status:** Active — organic educator-wave signal decoded; persona IA gap documented with file evidence.  
**Provenance:**
- **Verifiable:** demo feedback and CEO direction on 2026-06-29 (teachers vs admin/compliance audiences).
- **Prior anchor:** [`2026-06-23-ceo-meeting-directives.md`](2026-06-23-ceo-meeting-directives.md) (AI explanation layer, controlled-eval vs live-pilot tier vocabulary).
- **Execution plan:** [`.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md`](../../.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md) (doc track; no `src/` or `dashboard/` changes in that plan).

> Purpose: give the 2026-06-29 educator-wave signal a citable home so §D5 persona specs, dual-passphrase auth, Zoom runbooks, and the companion [`dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) (TASK-021) have traceable provenance.

---

## 0. Hosted pilot prerequisite (PREREQ-001)

Organic wave docs assume a **reachable hosted URL** (tier **A** API + tier **C** dashboard). Verification against [`docs/guides/operators/aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md) §4:

| Gate | Tier | Criterion (runbook §4) | Status | Evidence |
|------|------|------------------------|--------|----------|
| API health + ingest | **A** | `GET /health` and `POST /v1/signals` return HTTP 2xx (§4.1) | **Pass (deployed)** | `pilot-charter-onboarding.plan.md` TASK-003 **completed** — CDK API deployed via `deploy.yml`, `stage=pilot` |
| Dashboard login + core flows | **C** | Passphrase login → Overview; Attention/Learners live; upload + Approve/Reject (§4.2) | **Pass (deployed)** | `pilot-charter-onboarding.plan.md` TASK-004 **completed** — Amplify dashboard + `DASHBOARD_ACCESS_CODE` + proxy env |
| AI explanations on hosted path | **A** (Lambda) | Non-null `trace.educator_explanation` after enablement | **Pass (deployed)** | `pilot-charter-onboarding.plan.md` TASK-005 **completed** |
| Formal smoke artifact | Ops | File report at `internal-docs/reports/pilot-smoke-YYYY-MM-DD.md` (runbook §4, gitignored) | **Not in repo** | Expected ops-only; local §0 gates green on release commit (`npm run build`, `npm test` — 972 tests pass, 2026-06-29) |
| Full E2E dry-run sign-off | A + C | Upload → Attention → feedback → admin list (`pilot-charter` TASK-018) | **Pending** | Blocked on customer-feedback-loop P0 (TASK-006+) |

**Verdict:** Tier **A + C** are **deployed and gate-ready** for organic-wave doc packaging. Formal §4 smoke file lives in vault; charter **launch sign-off** (TASK-018) remains open until the feedback loop ships.

**Deploy-tier note:** Organic wave **requires** tier A + C; **defers** tier B (live LMS connectors). Upload/ingest path first — same vocabulary as [`docs/foundation/roadmap.md`](../foundation/roadmap.md) § "Deploy disambiguation."

---

## 1. Context

- **Trigger:** Demo feedback (2026-06-29) — teachers need classroom-relevant learner data and plain-language *why*; admin/compliance need audit drill-down, receipts, and export.
- **Wave shape:** Organic educator outreach (Zoom 50–100) on **hosted** pilot, not controlled-eval local-only track.
- **Interim auth decision (resolved 2026-06-29):** **Dual access codes** — educator passphrase vs compliance/admin passphrase — until Cognito/SSO (Phase 2). Spec home: `dashboard-passphrase-gate.md` (TASK-017 in doc plan).

---

## 2. CEO Directives (decoded)

### Directives 1–3 (prior report — still in force)

From [`2026-06-23-ceo-meeting-directives.md`](2026-06-23-ceo-meeting-directives.md) §2 and [`docs/specs/ai-educator-explanations.md`](../specs/ai-educator-explanations.md) §Overview:

1. Explain **where** decay occurs (which skill).
2. Explain **why**, grounded in signals the engine already computes.
3. Frame as **confidence-not-grade** — auditable ("AI explains, never decides").

**Status (2026-06-29):** Built on branch; hosted enablement verified via pilot-charter TASK-005.

### Directive 4 — Persona surfaces (2026-06-29)

Split the Decision Panel by **role**, not by forking the product:

| Audience | Sees | Does not see (educator mode) |
|----------|------|--------------------------------|
| **Educator / teacher** | Overview, Attention, Learners; Struggles & progress; Approve/Reject; product feedback | Decisions audit stream, Signals upload wizard, Reports export, Learner State/Trajectory JSON, rule/policy ids at L0 |
| **Compliance / admin** | Full nav; decision trace + Export JSON; signal upload; reports when available | — (superset) |

Normative home (doc plan TASK-016): **`docs/specs/dashboard-design-requirements.md` §D5 — Persona surfaces.**

---

## 3. Readiness Assessment (Check 2 — evidence-backed)

### Capability rows (persona + audit)

| Capability | Verdict | Evidence |
|------------|---------|----------|
| Persona IA enforcement | **Gap** | Single nav for all users — [`dashboard/lib/navigation.ts:21-28`](../../dashboard/lib/navigation.ts) exports one `NAV_MAIN_ITEMS` including Decisions, Signals, Reports for every session |
| Educator Overview leaks rule/policy | **Gap** | Learner Overview tab exposes `state_version`, `active_policy` (policy id + version) — [`dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx:132-148`](../../dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx) |
| Plain-language *why* (A1) | **Built** | `trace.educator_explanation` + Panels 2/3 consumption — pilot-charter TASK-005 |
| Audit/export for compliance | **Built, not gated** | Decision trace Export JSON — [`dashboard/app/(dashboard)/decisions/[id]/_components/decision-trace-view.tsx:76-79`](../../dashboard/app/(dashboard)/decisions/[id]/_components/decision-trace-view.tsx); `/reports` export hooks exist — reachable by any logged-in user today |
| Dual-passphrase auth | **Spec pending / not implemented** | Single `DASHBOARD_ACCESS_CODE` in runbook §3.2; dual-code spec = doc plan TASK-017 |

### Capability vs infrastructure tension (Check 2 — both sides cited)

These claims **conflict** until §D5 + dual-passphrase ship (or interim mitigations are enforced):

| Claim | Location |
|-------|----------|
| **Two audiences** — educators vs integration/compliance — one navigation model "without forking the UI" | [`docs/specs/dashboard-design-requirements.md:12-23`](../specs/dashboard-design-requirements.md) |
| **No RBAC** — "User accounts, RBAC, SSO/OAuth … Phase 2" | [`docs/specs/dashboard-passphrase-gate.md:15`](../specs/dashboard-passphrase-gate.md) |
| **Runtime reality** — one shared code, full sidebar for all sessions | [`dashboard/lib/navigation.ts:21-28`](../../dashboard/lib/navigation.ts) |

**Reconciliation (interim pilot):** Distribute **two passphrases** (educator vs compliance) and follow the **two-path demo script** (doc plan TASK-006/010) until [`dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) PE-001–PE-006 enforce route/nav allowlists. Missing decision owner for long-term auth: Phase 2 Cognito replaces codes, **not** IA rules (TASK-017).

---

## 4. Role × feature × infrastructure map (SSoT for §D5)

Document this table in §D5 (`dashboard-design-requirements.md`, TASK-016) and use it for Zoom/demo routing:

| Feature / route | Educator code | Compliance code | Infra tier |
|-----------------|:-------------:|:---------------:|------------|
| Overview, Attention, Learners | Yes | Yes | C |
| Learner Struggles & progress | Yes | Yes | C reads A (`/v1/learners`, `/v1/state`) |
| Learner State / Trajectory / JSON | No | Yes | C |
| Decisions stream + trace export | No | Yes | C reads A |
| Signals log + upload wizard | No | Yes | C proxy + A admin preflight |
| Reports + export | No | Yes | C (+ staged program-metrics on A) |
| Policy admin API | No | Yes (API key server-side) | A `/v1/admin/policies/*` |
| Product feedback POST | Yes | Yes | A (pilot-charter TASK-006+) |
| Per-decision Approve/Reject | Yes | Yes | A + C |

---

## 5. Decisions

| Decision | Status | Notes |
|----------|--------|-------|
| Organic educator wave (Zoom 50–100) is valid GTM shape | **Accepted** | Hosted tier A + C; tier B deferred |
| Dual access codes (educator vs compliance) for interim pilot | **Resolved 2026-06-29** | Replaces single-code + honor-system demo until persona plan ships |
| §D5 persona surfaces normative in design spec | **Doc in progress** | TASK-016 in ceo_educator_wave doc plan |
| Cognito/SSO long-term | **Pending (Phase 2)** | Replaces passphrases; IA allowlists remain |
| Per-teacher policy overlay (policy-builder MVP-2) | **Pending** | Requires auth beyond dual passphrase — doc plan TASK-007/020 |

---

## 6. Action Items → Specs/Plans

| # | Action | Priority | Artifact | Status |
|---|--------|----------|----------|--------|
| E1 | Document §D5 persona surfaces + role × feature table | P0 (doc) | `docs/specs/dashboard-design-requirements.md` | TASK-016 (doc plan) |
| E2 | Dual-passphrase spec (`DASHBOARD_ACCESS_CODE_EDUCATOR` / `_COMPLIANCE`) | P0 (doc) | `docs/specs/dashboard-passphrase-gate.md` | TASK-017 (doc plan) |
| E3 | Create persona **implementation** plan (PE-001–PE-008) | P0 | `.cursor/plans/dashboard-persona-enforcement.plan.md` | TASK-021 (doc plan) |
| E4 | Two-path demo + Zoom runbook | P0 (GTM) | `springs-pilot-demo.md`, `organic-educator-wave-zoom.md` | TASK-006, TASK-010 |
| E5 | CEO report + roadmap ledger (this file, roadmap §D5) | P0 (doc) | this file, `docs/foundation/roadmap.md` | **This report — TASK-001/002** |
| E6 | Policy builder scaffold (compliance-only writes MVP-1) | P1 | `educator-policy-builder.md`, companion plan | TASK-007–009 (doc plan) |

**GTM gate:** `pilot-charter-onboarding.plan.md` TASK-020 (demo video) is **blocked on** persona plan PE-001–006 **or** documented two-path script-only interim (TASK-004 context row).

---

## 7. Open Questions

- **Resolved (interim pilot):** dual access codes — educator vs compliance/admin passphrase (user decision 2026-06-29).
- **Pending:** Cognito/SSO timeline; merge with policy-builder MVP-1 teacher overlay.
- **Pending:** Choose demo-video path — enforce persona middleware vs two-path script only — before TASK-020.

---

*Authored 2026-06-29. Replaces informal demo notes for educator-wave persona scope; links forward to §D5 and dashboard-persona-enforcement implementation plan.*
