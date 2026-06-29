# Roadmap (Living Anchor)

The **stable entry point** for planning and execution. It stays short and points to the current single sources of truth. Full history, the 24-month phase arc, the 37-row capability inventory, and historical plan-status tables are preserved in [`archive/snapshots/roadmap-2026-06-23.md`](../../archive/snapshots/roadmap-2026-06-23.md) (historical inventory snapshot).

## Current Objective (2026-06-26) — Hosted Charter Pilot Readiness

The CEO ask is now implemented in code: decisions can carry a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a grade), and **auditable** ("AI explains, never decides"). Backend generation, contract coverage, and Panels 2 & 3 body-copy consumption are complete on branch.

The active execution path has shifted to the charter pilot readiness plan: deploy the AWS API + Amplify dashboard, enable Bedrock in the pilot Lambda, verify ingestion through the hosted dashboard, and capture GTM demo evidence. Source of truth: [`.cursor/plans/pilot-charter-onboarding.plan.md`](../../.cursor/plans/pilot-charter-onboarding.plan.md).

> **Provenance caveat:** the meeting record is a scaffold with unconfirmed `TODO`s (attendees, prospect name, formal P0 approval). The *direction* is verifiable (2026-06-22 CEO voice note in [`docs/specs/ai-educator-explanations.md`](../specs/ai-educator-explanations.md) §Overview); the *meeting decisions* are not yet ratified.

### "Deploy" disambiguation (read before summarizing this objective)

Three distinct tiers hide under one word. "No deployment" for the controlled eval meant tiers **A** and **B** only — **not** that nothing is reachable. The hosted charter pilot is a different live-pilot track and **does** require tier A (AWS API) plus tier C (hosted dashboard).

| Tier | What | Controlled-eval status | Hosted charter-pilot status |
|------|------|------------------------|-----------------------------|
| **A** | AWS control-layer backend (Lambda/API Gateway/DynamoDB) | **Deferred** | **Required** — CDK deploy per [`docs/guides/operators/aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md) |
| **B** | Live LMS integration / classroom-workflow deployment | **Deferred** | **Not required for first demo** — upload / 8P3P ingest path can prove value before live connector |
| **C** | Dashboard access (the Decision Panel review surface) | **Used** — local, 8P3P-run by default; lightweight host optional | **Required** — Amplify-hosted dashboard for customer self-serve touch/demo |

"Local/SQLite" describes the data + engine tier (A/B), **not** tier C. Tier-C access mode for the controlled evaluation is pinned in the internal controlled-evaluation runbook (local only, not in public repo) §2; see also [`docs/guides/operators/pilot-host-deployment.md`](../guides/operators/pilot-host-deployment.md) §3.

## Current Direction — Active Sequencing

**CEO ask (verifiable):** Educators need more than a grade-like label — a plain-language explanation of **where** and **why** a learner shows learning decay, framed as *confidence in learning* (not a student grade), remaining **auditable and defensible**. Sources: [`docs/specs/ai-educator-explanations.md`](../specs/ai-educator-explanations.md), [`docs/reports/2026-06-23-ceo-meeting-directives.md`](../reports/2026-06-23-ceo-meeting-directives.md).

**Educator-wave signal (2026-06-29):** Teachers get classroom-relevant gaps + plain-language *why* only; admin/compliance get audit drill-down, receipts, and export. Interim pilot auth = **dual passphrases** (educator vs compliance codes). Source: [`docs/reports/2026-06-29-ceo-educator-wave-directives.md`](../reports/2026-06-29-ceo-educator-wave-directives.md) · doc plan [`.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md`](../../.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md).

| Priority | Work | Ref |
|----------|------|-----|
| **P0 shipped** | AI educator-explanation layer (A1): backend + Panels 2/3 body-copy consumption | `docs/specs/ai-educator-explanations.md` · `.cursor/plans/ai-educator-explanations.plan.md` |
| **P0 active** | Hosted charter pilot readiness: AWS API, Amplify dashboard, AI explanations ON, feedback loop P0, data onboarding, demo capture | `.cursor/plans/pilot-charter-onboarding.plan.md` |
| **P0 active (doc)** | Organic educator wave: §D5 persona IA, dual-passphrase spec, Zoom/two-path runbooks, policy-builder scaffold | `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` |
| **P0 active (code, staged)** | Dashboard persona enforcement — nav/route/tab gating per §D5 | `.cursor/plans/dashboard-persona-enforcement.plan.md` (created by doc plan TASK-021) |
| **P0** | Decision Panel D1 inversion — educator summary at L0, rule id + rationale in L1 Sheet (A2) | `.cursor/plans/dashboard-uiux-improvements.plan.md` |
| **P1** | Per-skill trajectory scope — v1.2 `US-SKILL-001` extension (A3); flat trajectory already ships; **§v1.2 scoped 2026-06-23, impl pending** | `docs/specs/learner-trajectory-api.md` §v1.2 |
| **P1** | Controlled-evaluation runbook — SQLite + seed → pseudonymous export → decisions/receipts/explanations, plus the tier-C dashboard-access decision (A4) | Internal controlled-evaluation runbook (local only, not in public repo) |
| **P2 deferred (integration automation)** | Webhook adapters and tenant field-mapping automation (A6) | existing specs |

**Pilot portal principle (live-pilot vision vs. controlled-eval reality):** The visual dashboard (`dashboard/`, standalone Next.js) is the **customer-facing portal**. In the **live-pilot track** the pilot customer admin interacts with it "at any time," so it **must be hosted** (tier C). **For the controlled evaluation specifically, the "at any time" hosted portal is out of scope** — review is an 8P3P-facilitated working session, so tier C defaults to **local, 8P3P-run** and hosting is optional on leadership request.

The prior connector-heavy framing (Pre-Month 0 checklist, Connector Layer, webhook adapters) remains valid for future Phase 1 charter deployments, but the current charter-pilot critical path is narrower: hosted dashboard + upload/8P3P-ingest path + AI explanations ON + feedback capture. See the [historical inventory snapshot](../../archive/snapshots/roadmap-2026-06-23.md) for the older ledger.

### Persona surfaces (D5)

**Normative spec (in progress):** [`docs/specs/dashboard-design-requirements.md`](../specs/dashboard-design-requirements.md) §D5 — *who sees which routes and drill-downs* on the hosted dashboard (tier **C**). Auth interim: dual passphrases in [`docs/specs/dashboard-passphrase-gate.md`](../specs/dashboard-passphrase-gate.md) (educator vs compliance session persona). Implementation: [`.cursor/plans/dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) (PE-001–PE-008). **Not** a new backend tier — route/nav allowlists only.

| Surface | Educator access code | Compliance access code |
|---------|:--------------------:|:----------------------:|
| Overview, Attention, Learners | Yes | Yes |
| Learner Struggles & progress | Yes | Yes |
| Learner State / Trajectory / JSON | No | Yes |
| Decisions + trace export | No | Yes |
| Signals + upload wizard | No | Yes |
| Reports + export | No | Yes |
| Approve/Reject, product feedback | Yes | Yes |

Full role × feature × infra-tier table: [`2026-06-29-ceo-educator-wave-directives.md`](../reports/2026-06-29-ceo-educator-wave-directives.md) §4. Until PE-001–PE-006 ship, GTM may use **two passphrases + two-path demo script** (doc plan TASK-006/010) as interim mitigation.

## Program Status Ledger (single source of truth)

This table is the **only** place to read program-level status. To decide what to execute next: read the **Active / next** group top-down and open the first plan's **Next action**.

**Maintenance rule (keeps this DRY — do not duplicate status elsewhere):**

- **Task-level** status (which steps are done / next) lives **only** in each plan's YAML frontmatter `todos`. Rollups here are derived from those counts (`completed / total`).
- **Plan-level** rollup + "Next action" lives **only** in this ledger.
- Specs keep authoring status in [`docs/specs/README.md`](../specs/README.md); contracts/CI remain machine-verifiable truth (T5). Nothing else tracks feature status.

> Counts reflect each plan's frontmatter on 2026-06-29. "Shipped on branch" = implemented + tests, pending commit/merge; live AWS enablement is a separate ops step inside `pilot-charter-onboarding.plan.md`.

### Active / next (execute in this order)

| Order | Feature / Plan | Spec | Status | Next action |
|-------|----------------|------|--------|-------------|
| 1 | `pilot-charter-onboarding.plan.md` | `customer-feedback-loop.md` (+ runbook refs) | **P0 active** — 8/23 (PREREQ + TASK-001..005 done) | TASK-006 ProductFeedback types, error codes, and FeedbackRepository extension |
| 1b | `ceo_educator_wave_docs_5f6ef773.plan.md` | `dashboard-design-requirements.md` §D5 · `dashboard-passphrase-gate.md` | **P0 active (doc)** — 3/22 (PREREQ-001 + TASK-001..002 done) | TASK-003 organic educator wave scenario path |
| 1c | `dashboard-persona-enforcement.plan.md` | `dashboard-design-requirements.md` §D5 · `dashboard-passphrase-gate.md` | **Staged** — plan file pending TASK-021 | PE-001 dual-code login + persona cookie (after doc plan TASK-021 creates plan) |
| 2 | `overview-educator-activity-layout.plan.md` (D4) | `overview-educator-activity-layout.md` | **Staged** — 0/11 | TASK-001 chart/CSV builders; **committed `RefreshDataButton` + `--content-max-width` substrate already in `overview-explorer.tsx`** — absorb when wiring TASK-006 |
| 3 | `learner-pending-review-bar.plan.md` (LPR) | `learner-pending-review-bar.md` | **Staged** — 0/11 | TASK-001 `selectPendingDecisionForLearner`; build **after** the committed review-bar overlay + §8.2 learner tabs |

### Shipped on branch (verify + commit; do not re-run)

| Feature / Plan | Spec | Status |
|----------------|------|--------|
| `ai-educator-explanations.plan.md` | `ai-educator-explanations.md` | **Shipped** 14/14 — backend + Panels 2/3 body copy; live Bedrock enablement = pilot-charter TASK-005 |
| `dashboard-uiux-improvements.plan.md` | `dashboard-design-requirements.md` (D1/D3) | **Shipped** 27/27 |
| `overview-cross-filter-sync.plan.md` (D2) | `overview-cross-filter-sync.md` | **Shipped** 14/14 |
| `attention-review-ux.plan.md` (Phase 1) | `attention-review-ux.md` | **Shipped** 11/11 |
| `attention-review-ux-phase-2.plan.md` | `attention-review-ux.md` §Phase 2 | **Shipped** 15/15 |
| `educator-feedback-api.plan.md` | `educator-feedback-api.md` | **Shipped** 17/17 — backend `src/feedback/` + dashboard write path |
| `documentation-boundary-migration.plan.md` | `documentation-boundary-migration.md` | **Shipped** 13/13 |
| `task-6-doc-cleanup.plan.md` | — (doc-only) | **Shipped** 6/6 |

### Staged — SBIR evidence layer (after pilot path clears; ordered by dependency)

| Order | Feature / Plan | Spec | Status |
|-------|----------------|------|--------|
| 1 | `liu-usage-meter.plan.md` | `liu-usage-meter.md` | **Staged** 0/17 — usage denominator |
| 2 | `decision-outcomes.plan.md` | `decision-outcomes.md` | **Staged** — derived outcomes view |
| 3 | `program-metrics.plan.md` | `program-metrics.md` | **Staged** 1/13 — MC-A/B/C catalog |
| 4 | `pilot-research-export.plan.md` | `pilot-research-export.md` | **Staged** — DOE/IES research bundle |

### Backlog — not pilot-blocking

| Feature / Plan | Spec | Status |
|----------------|------|--------|
| `learner-trajectory-api-v1.2.plan.md` | `learner-trajectory-api.md` §v1.2 | **Staged** 0/7 (P1) |
| `tenant-config.plan.md` | `tenant-config.md` | **Staged** 0/11 |
| `ci-cd-pipeline.plan.md` | `ci-cd-pipeline.md` | **Staged** — Fly.io/Node matrix, not merged |
| `learner-summary-api-hygiene.plan.md` | `learner-summary-api.md` | **Deferred post-pilot** 0/10 |

> `dashboard_pilot_roadmap_0fa0e18a.plan.md` is **not** a separate source of truth — it is per-track detail for the shipped dashboard work (Tracks 0–6) and defers to this ledger for status.

## Enforcement Pointers

This roadmap is a planning anchor, not the place where agent behavior is enforced.

- Planning authority and status drift rules: `.cursor/rules/document-traceability/RULE.md`
- Runtime policy and repository commands: `.cursor/rules/project-context/RULE.md`
- Command pre-flight loading: `.cursor/rules/command-context-loading/RULE.md`
- Canonical workflow ownership: [`definitive-workflow.md`](./definitive-workflow.md)
- Command entrypoints: `.cursor/commands/`
- Step-by-step execution logic: `.cursor/skills/`

## Foundation References

- Documentation tiers and agent reading order: [`documentation-boundaries.md`](./documentation-boundaries.md)
- Architecture: [`architecture.md`](./architecture.md)
- Terminology: [`terminology.md`](./terminology.md)
- Local dev & testing: [`setup.md`](./setup.md)
- API naming conventions: [`api-naming-conventions.md`](./api-naming-conventions.md)
- DOE-style theory of change: internal logic model doc (local only, not in public repo)

## Pilot Operations

- Pilot readiness gate criteria (committed): [`docs/guides/operators/pilot-readiness-gates.md`](../guides/operators/pilot-readiness-gates.md)
- Agent workflow: `/pilot-readiness` (source of truth: `.cursor/skills/pilot-readiness/SKILL.md`)
- Internal onboarding runbook (local only, not in public repo)
- Internal controlled-evaluation runbook (local only, not in public repo)

## Pilot Feedback Intake

The roadmap defines *what* we build; the feedback ritual defines *how* pilot-field signal shapes *what we prioritize next*. The closed loop is spec'd in [`docs/specs/customer-feedback-loop.md`](../specs/customer-feedback-loop.md), and the agent workflow is `/pilot-feedback-intake` (source of truth: `.cursor/skills/pilot-feedback-intake/SKILL.md`). Customer-specific append-only logs remain internal-only.

## Versioning Policy

- Roadmaps are published as **dated snapshots** under `docs/reports/`.
- This file is the living anchor and links to the latest snapshot and the [historical inventory snapshot](../../archive/snapshots/roadmap-2026-06-23.md) (full history, phase arc, capability inventory, and historical plan-status tables).
