# Roadmap (Living Anchor)

The **stable entry point** for planning and execution. It stays short and points to the current single sources of truth. Full history, the 24-month phase arc, the 37-row capability inventory, and historical plan-status tables are preserved in [`archive/snapshots/roadmap-2026-06-23.md`](../../archive/snapshots/roadmap-2026-06-23.md) (historical inventory snapshot).

## Current Objective (2026-06-23) — Win a Controlled Data Evaluation

Build the one capability the CEO asked for: a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a grade), and **auditable** ("AI explains, never decides"). We prove it end-to-end on a **controlled, de-identified dataset** (local/SQLite, manually-mapped pseudonymous export).

The readiness assessment scored the codebase and found a **single capability gap** — the plain-language "why"; everything else needed for the evaluation is built or is a narrow extension ([`docs/reports/2026-06-23-ceo-meeting-directives.md`](../reports/2026-06-23-ceo-meeting-directives.md) §3). This is the **only** active critical path.

> **Provenance caveat:** the meeting record is a scaffold with unconfirmed `TODO`s (attendees, prospect name, formal P0 approval). The *direction* is verifiable (2026-06-22 CEO voice note in [`docs/specs/ai-educator-explanations.md`](../specs/ai-educator-explanations.md) §Overview); the *meeting decisions* are not yet ratified.

### "Deploy" disambiguation (read before summarizing this objective)

Three distinct tiers hide under one word. "No deployment" for the controlled eval means tiers **A** and **B** only — **not** that nothing is reachable:

| Tier | What | Controlled-eval status |
|------|------|------------------------|
| **A** | AWS control-layer backend (Lambda/API Gateway/DynamoDB) | **Deferred** |
| **B** | Live LMS integration / classroom-workflow deployment | **Deferred** |
| **C** | Dashboard access (the Decision Panel review surface) | **Used** — **local, 8P3P-run** during the facilitated review session by default; a lightweight host (Fly/Vercel/Render/any Node 22 Next.js host) is optional, required only in the live-pilot track |

"Local/SQLite" describes the data + engine tier (A/B), **not** tier C. Tier-C access mode for the controlled evaluation is pinned in the internal controlled-evaluation runbook (local only, not in public repo) §2; see also [`docs/guides/pilot-host-deployment.md`](../guides/pilot-host-deployment.md) §3.

## Current Direction — Active Sequencing

**CEO ask (verifiable):** Educators need more than a grade-like label — a plain-language explanation of **where** and **why** a learner shows learning decay, framed as *confidence in learning* (not a student grade), remaining **auditable and defensible**. Sources: [`docs/specs/ai-educator-explanations.md`](../specs/ai-educator-explanations.md), [`docs/reports/2026-06-23-ceo-meeting-directives.md`](../reports/2026-06-23-ceo-meeting-directives.md).

| Priority | Work | Ref |
|----------|------|-----|
| **P0** | AI educator-explanation layer (A1) | `docs/specs/ai-educator-explanations.md` · `.cursor/plans/ai-educator-explanations.plan.md` |
| **P0** | Decision Panel D1 inversion — educator summary at L0, rule id + rationale in L1 Sheet (A2) | `.cursor/plans/dashboard-uiux-improvements.plan.md` |
| **P1** | Per-skill trajectory scope — v1.2 `US-SKILL-001` extension (A3); flat trajectory already ships; **§v1.2 scoped 2026-06-23, impl pending** | `docs/specs/learner-trajectory-api.md` §v1.2 |
| **P1** | Controlled-evaluation runbook — SQLite + seed → pseudonymous export → decisions/receipts/explanations, plus the tier-C dashboard-access decision (A4) | Internal controlled-evaluation runbook (local only, not in public repo) |
| **P2 deferred (live-pilot track)** | Full AWS control-layer deploy (tier A), webhook adapters, tenant field-mapping automation (A6) | existing specs |

**Pilot portal principle (live-pilot vision vs. controlled-eval reality):** The visual dashboard (`dashboard/`, standalone Next.js) is the **customer-facing portal**. In the **live-pilot track** the pilot customer admin interacts with it "at any time," so it **must be hosted** (tier C). **For the controlled evaluation specifically, the "at any time" hosted portal is out of scope** — review is an 8P3P-facilitated working session, so tier C defaults to **local, 8P3P-run** and hosting is optional on leadership request.

The prior AWS-deploy-gated live-pilot framing (Pre-Month 0 checklist, Connector Layer, webhook adapters) remains valid for future Phase 1 charter deployments but is **not** the current critical path. See the [historical inventory snapshot](../../archive/snapshots/roadmap-2026-06-23.md) for that ledger.

## Active Execution Plans

Actionable implementation work is driven by Cursor plans in `.cursor/plans/`. Completed plans are archived in `archive/plans/` (gitignored). The plans currently live in `.cursor/plans/` are the only active/staged/pending ones:

| Plan | Status |
|------|--------|
| `ai-educator-explanations.plan.md` | **P0** — Spec'd + plan staged (2026-06-23); impl pending (`src/decision/explanations/` = 0 files) |
| `dashboard-uiux-improvements.plan.md` | **P0/P1** — plan staged (2026-06-23); D1/D2/D3 |
| `ci-cd-pipeline.plan.md` | Staged; not yet merged (Fly.io pilot deploy + Node 20/22 CI matrix) |
| `liu-usage-meter.plan.md` | Plan committed; impl pending (SBIR denominator) |
| `program-metrics.plan.md` | Plan committed; impl pending (SBIR evidence) |
| `educator-feedback-api.plan.md` | Spec'd + plan staged (SBIR) |
| `decision-outcomes.plan.md` | Spec'd + plan staged (SBIR) |
| `pilot-research-export.plan.md` | Spec'd + plan staged (SBIR) |
| `tenant-config.plan.md` | Spec'd + plan staged; not pilot-blocking |
| `learner-summary-api-hygiene.plan.md` | Deferred post-pilot (full ETag/304/by_source hygiene) |

## Planning Rules

When there is a conflict:

1. **Specs win** for requirements and interfaces: `docs/specs/`
2. **Plans win** for step-by-step implementation: `.cursor/plans/`
3. **Reports win** for timeline commitments and auditability: `docs/reports/`

## Execution Workflow

- Canonical workflow: [`definitive-workflow.md`](./definitive-workflow.md)
- Command entrypoints: `.cursor/commands/`
- Step-by-step execution logic: `.cursor/skills/`

## Foundation References

- Documentation tiers and agent reading order: [`documentation-boundaries.md`](./documentation-boundaries.md)
- Architecture: [`architecture.md`](./architecture.md)
- Terminology: [`terminology.md`](./terminology.md)
- Local dev & testing: [`setup.md`](./setup.md)
- API naming conventions: [`api-naming-conventions.md`](./api-naming-conventions.md)
- DOE-style theory of change: internal logic model doc (local only, not in public repo)

## Runtime Policy

- **Node version:** pinned to **22** via `.nvmrc`, enforced via `package.json` `engines` (`>=22 <23`) and `.npmrc` (`engine-strict=true`). Matches the Lambda deploy target and Dockerfile builder (`node:22-bookworm-slim`); eliminates `better-sqlite3` native-ABI drift. Durable removal of the native addon is tracked as INFRA-SQLITE-001 (post-pilot) in the [historical inventory snapshot](../../archive/snapshots/roadmap-2026-06-23.md) § v1.2 Backlog.

## Pilot Operations

- Pilot readiness gate criteria (committed): [`docs/guides/pilot-readiness-gates.md`](../guides/pilot-readiness-gates.md)
- Internal onboarding runbook (local only, not in public repo)
- Internal controlled-evaluation runbook (local only, not in public repo)

## Pilot Feedback Intake

The roadmap defines *what* we build; this ritual defines *how* pilot-field signal shapes *what we prioritize next*. The closed loop is spec'd in [`docs/specs/customer-feedback-loop.md`](../specs/customer-feedback-loop.md) (always-on "Send feedback" + CSAT microsurvey → `GET /v1/admin/feedback`). After each pilot weekly review, the CS lead appends items to the internal pilot feedback log (append-only, local only) using the schema `{date, customer, summary, category, proposed-roadmap-phase, status}`. `Phase 1` items are triaged at the Monday roadmap sync; `Phase 2+` at the monthly review.

## Versioning Policy

- Roadmaps are published as **dated snapshots** under `docs/reports/`.
- This file is the living anchor and links to the latest snapshot and the [historical inventory snapshot](../../archive/snapshots/roadmap-2026-06-23.md) (full history, phase arc, capability inventory, and historical plan-status tables).
