# CEO Meeting — Directives & Readiness (2026-06-23)

**Date:** 2026-06-23
**Status:** Scaffold — reconstructed from verifiable artifacts; sections marked `TODO` need the meeting owner to confirm.
**Provenance:**
- **Verifiable:** the 2026-06-22 CEO voice-note directive captured in `docs/specs/ai-educator-explanations.md` (§Overview).
- **Attached (2026-06-23):** the controlled-evaluation proposal is now in the repo at `internal-docs/Proposal for Controlled Data Evaluation.pdf` — it is the scope-of-record for the evaluation (supersedes the earlier "Untitled-3" working buffer).
- **Still TODO:** the district/prospect name (referenced as Clark County in working notes) — confirm before treating as ground truth.

> Purpose: give this meeting a citable home so downstream specs/plans (`ai-educator-explanations.md`, dashboard D1) have traceable provenance per the repo's spec-traceability discipline.

---

## 1. Attendees & Context (TODO — confirm)

- **Attendees:** TODO
- **Trigger:** CEO directive (2026-06-22 voice note) + a proposed **controlled data evaluation** with a district prospect (referenced as Clark County in working notes — TODO confirm).
- **Framing:** The evaluation is a **controlled data evaluation**, not a live integration — "no live system integration, classroom deployment, or changes to existing workflows" (proposal § Data Handling and Risk Posture). 8P3P processes an approved, pseudonymous flat-file export in a controlled environment **separate from the org's production systems**, then reviews findings with leadership in a **facilitated working session**.
- **Deploy-tier note (resolves the "hosted portal vs. local-only" tension):** "no AWS deploy" excludes **tier A** (the AWS control-layer backend) and **tier B** (live LMS integration) — it does **not** mean nothing is reachable. For the controlled evaluation the Decision Panel is **local, 8P3P-run during the review session by default**; a lightweight **tier-C** host is optional only if leadership wants async self-serve review. The always-reachable "gives feedback at any time" portal is a **live-pilot** capability, intentionally out of scope here. Full decision: `internal-docs/pilot-operations/controlled-evaluation-runbook.md` §2; tier vocabulary: `internal-docs/foundation/roadmap.md` § Current Direction "Deploy disambiguation".

## 2. CEO Directive (verifiable)

From `docs/specs/ai-educator-explanations.md` §Overview (2026-06-22 voice note):

> Educators need more than a grade-like label: a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a student grade).

**Decoded into product requirements:**
1. Explain **where** decay is occurring (which skill).
2. Explain **why**, grounded in the signals the engine already computes (stability/mastery deltas + the matched rule).
3. Frame as **confidence-not-grade** — verbalize the system's confidence/stability trend, never a letter/percentage grade.
4. Must remain **auditable and defensible** for the SBIR narrative (AI explains, never decides; deterministic engine stays the source of truth).

## 3. Readiness Assessment (evidence-backed)

Two questions the board cares about, scored against the actual codebase:

| Question | Verdict | Evidence |
|----------|---------|----------|
| Does the system **identify** learning gaps? | ✅ Built | 4 governed decision types incl. decay (`src/decision/educator-summaries.ts:12-17`); dot-path skill-level eval live (`src/decision/engine.ts` via `getAtPath`); automatic `_delta`/`_direction` decay detection |
| Does it show **where** a learner struggles? | ✅ Built | `decision_context.skill` on every decision (`engine.ts:181-185`); Decision Panel "What Do They Need Help With" |
| Does it **explain why** in plain language? | 🔴 Specced, not built | `ai-educator-explanations.md` (all reqs unchecked); `src/decision/explanations/**` = 0 files |
| Can it show risk appeared **earlier** (temporal)? | 🟡 Built (flat) / gap (per-skill) | `GET /v1/state/trajectory` registered (`src/state/routes.ts:20`), handler + contract test + dashboard tab exist; **v1.1 is flat-fields only** — per-skill nested-path trajectory is the v1.2 `US-SKILL-001` extension (`learner-trajectory-api.md:9`) |
| Data-leakage posture (board's #1 concern) | ✅ Built | PII forbidden-key rejection (DEF-DEC-008-PII) + canonical PII-stripped receipt snapshot (DEF-DEC-007), both `completed` in `ceo_fact-check_actions` plan; `extractCanonicalSnapshot` (`engine.ts:65-81`) |

**Single capability gap:** the plain-language "why" — exactly the CEO's ask. Everything else needed for the controlled evaluation is built or is a narrow extension.

> **Correction vs. earlier working analysis:** the trajectory API is **implemented** (flat fields); only *per-skill* trajectory remains. The "earlier identification" story is demonstrable today at the flat-field level — do not budget trajectory as net-new P1.

## 4. Decisions

**Architecture decisions (resolved 2026-06-23 — owned by engineering/solutions architecture; do not need meeting-owner sign-off):**
- [x] Controlled-evaluation scope = **local/SQLite**, manually-mapped **pseudonymous** flat-file export, **no AWS control-layer deploy gate** (tier A) and **no live LMS integration** (tier B). Source-of-record: `internal-docs/pilot-operations/controlled-evaluation-runbook.md`.
- [x] Dashboard access for the eval = **local, 8P3P-run during the review session** by default; **tier-C** lightweight hosting optional only on leadership request (runbook §2). Resolves the "hosted portal vs. local-only" tension.

**Strategic decisions (TODO — confirm with meeting owner):**
- [ ] Formally approve building the AI educator-explanation layer as the milestone P0. (TODO confirm)
- [ ] Confirm "lead with data-leakage posture" as the district pitch. (TODO confirm)

## 5. Action Items → Specs/Plans

| # | Action | Priority | Artifact | Status |
|---|--------|----------|----------|--------|
| A1 | Build AI educator-explanation layer (Bedrock Converse, fail-safe to template, PII-safe, single write) | P0 | `docs/specs/ai-educator-explanations.md` → `.cursor/plans/ai-educator-explanations.plan.md` | Plan generated 2026-06-23; run `/implement-spec` |
| A2 | Fix Decision Panel "D1" inversion (educator summary at L0, rule id + rationale in L1 Sheet) + freshness/refresh | P0 | `.cursor/plans/dashboard-uiux-improvements.plan.md` (TASK-026) | Planned |
| A3 | Verify + scope **per-skill** trajectory (v1.2 `US-SKILL-001`); flat trajectory already shippable | P1 | `docs/specs/learner-trajectory-api.md` §v1.2 | **Scoped** 2026-06-23 |
| A4 | Package a controlled-evaluation runbook (SQLite + seed → ingest pseudonymous export → decisions + receipts + explanations) **+ pin the dashboard access decision (tier C)** | P1 | `internal-docs/pilot-operations/controlled-evaluation-runbook.md` | Drafted 2026-06-23 (tier-C decision resolved; engagement fields TODO) |
| A5 | Commit the proposal + meeting notes as dated artifacts (this report) for provenance | P0.5 | this file | In progress (TODO fill confirmations) |
| A6 | Defer full AWS deploy, tenant field-mapping automation, webhook adapters (live-pilot, not eval) | P2 | existing specs | Deferred |

## 6. Open Questions (TODO)

- Confirm the district/prospect name and the evaluation's success criteria.
- ~~Attach the controlled-evaluation proposal~~ — **Done:** attached at `internal-docs/Proposal for Controlled Data Evaluation.pdf` (scope-of-record).
- Confirm Bedrock enablement timeline for the explanation layer's live demo (eval can run with `BEDROCK_ENABLED=false` using the template fallback if needed).
- Confirm whether leadership wants the **optional tier-C host** for async review, or **local-presented only** (runbook §2).

---

*Reconstructed 2026-06-23 from `ai-educator-explanations.md` (verifiable 2026-06-22 voice note) + working analysis. Replace all `TODO` markers with meeting-owner confirmations before circulating as a decision record.*
