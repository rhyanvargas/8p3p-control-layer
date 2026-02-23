# Scope & Timeline Feedback

**Date:** 2026-02-22  
**Context:** feedback on 7 decision types, demo narrative, security, and timeline. response with evidence-based justification.  
**References:** `2026-02-20-pilot-readiness-v1-v1.1.md`, `docs/specs/decision-engine.md`, `src/decision/`

---

## Feedback Summary

1. **7 decision types** — If confident we can ship all seven without compromising receipts/audit clarity, okay with it. Caution: buyer confusion ("reroute vs intervene vs escalate?") and edge-case debates ("stability 79 but confidence medium?") can slow pilots and hurt conversions.
2. **Demo narrative** — Suggest leading with two primary decisions that are undeniable and easy to explain; keep other five as supported/secondary. Keeps story crisp, reduces decision sprawl, maximizes conversion.
3. **Security** — Minimum access control for pilot: at least an API key so we're not running on open endpoints. Not full enterprise hardening; enough to keep environment controlled, enforce org scoping server-side, prevent security objection from stopping the deal.
4. **Timeline** — If we scope pilot demo to two primary decision types, can we tighten the estimate below 4 weeks?

---

## Response

### On the 7 Decision Types — We're Saying the Same Thing

All 7 types are already built, tested, and passing (343 tests, POC v2 QA verified Feb 18). The policy engine evaluates a priority-ordered rule set — `escalate` evaluates first, `recommend` last — and the entire closed set ships as a unit. Removing 5 types from the engine wouldn't save a single day of build time because the work is done.

**Proposal:** Lead the demo with **`escalate`** and **`advance`** — the two bookend decisions. Escalate = "something is wrong, elevate to human review." Advance = "learner is ready, move forward." Both are immediately intuitive to a buyer, and both produce the clearest contrast in the audit receipt (high-risk vs. high-confidence).

The other 5 are visible in the system (they'll appear in the Decision Stream panel if someone scrolls), but we don't narrate them in the walkthrough. If a buyer asks "what about reroute vs. intervene?" the panel shows the exact rule that fired and why. That's the receipts layer answering the question, not us.

This keeps the story crisp — "two clear decisions, full audit trail on each" — without artificially limiting the engine. If a pilot participant's data triggers a `pause` or `reroute`, it just works.

### On Security — Agreed, Adding It

The current codebase has zero auth — no API key, no middleware. The tenant provisioning spec exists for full v1.1 (API Gateway + DynamoDB key management), but that's overbuilt for a single-tenant pilot.

**For v1:** Add a simple API key middleware — one key per pilot deployment, checked on every request, org_id resolved server-side. ~1 day of work. Not the full provisioning system, just enough that (a) endpoints aren't open, (b) org scoping is enforced by the key, not self-declared by the caller, and (c) no security reviewer can flag "unauthenticated API" as a blocker.

### On Timeline with Reduced Scope — Honest Assessment

The scope reduction on decision types saves approximately zero engineering days. The types are built. What drives the timeline:

| Work Item | Effort | Status |
|-----------|--------|--------|
| Decision repository extraction | 2 days | **Done** (shipped) |
| Ingestion log + State query API | 2 days | Not built |
| Enriched decision trace | 2-3 days | Not built (hardest piece — modifies core evaluation pipeline) |
| 4 inspection panels | 5-6 days | Not built |
| API key middleware | 1 day | Not built (new, per  feedback) |
| Demo seed script + rehearsal | 1 day | Not built |

The repository extraction being done already knocks 2 days off the original Week 1. Adding API key auth adds 1 day back. Net: ~1 day ahead of the original estimate.

**Revised timeline: 2.5 weeks build + 3-4 days buffer = ~3 weeks total** (down from 4).

- **Week 1:** Ingestion log, State query API, API key middleware, start enriched trace
- **Week 2:** Finish enriched trace, Panels 1-3, start Panel 4
- **Week 3 (partial):** Finish Panel 4, smoke tests, demo seed with `escalate` + `advance` narrative, rehearsal

The enriched decision trace is still the critical path item. It modifies `evaluateState()` and `evaluatePolicy()` — the same code paths that 343 tests validate — to capture frozen state snapshots and field-level threshold comparisons mid-evaluation. Won't compress below 2 days. It's the artifact that makes a compliance officer say "this is auditable."

### Bottom Line

- All 7 types ship. Demo narrative anchored on `escalate` + `advance`. Other 5 are supported, not narrated.
- API key auth added for v1. Not full tenant provisioning — just enough to close the security objection.
- **3 weeks to demo-ready** (down from 4), driven by the repo extraction already being done.
- The enriched trace + panels are the real timeline, not the decision types.

---

## Evidence Summary (for audit)

| Claim | Evidence |
|-------|----------|
| All 7 types built | `src/decision/policies/default.json` has all 7 rules; `src/decision/engine.ts` evaluates them |
| 343 tests passing | POC v2 QA report (2026-02-18), contract tests DEC-001 through DEC-008 |
| Repo extraction done | `src/decision/repository.ts` interface, `store.ts` SqliteDecisionRepository, `setDecisionRepository()` exported |
| No auth exists | `src/server.ts` — no middleware, no key check, no auth imports |
| Escalate + advance as demo anchors | Default policy: `escalate` = low confidence + instability/high risk; `advance` = high stability + mastery + low risk + high confidence |

---

## Updates to Pilot Readiness v1

The following items in `2026-02-20-pilot-readiness-v1-v1.1.md` are superseded or amended by this response:

1. **Minimum Scope — Auth:** Previously "No authentication/authorization (org_id scoping is sufficient for single-tenant pilot)." **Amended:** Add API key middleware for v1 to prevent security objection.
2. **Timeline:** Previously 3 weeks build + 1 week buffer = 4 weeks. **Revised:** 2.5 weeks build + 3-4 days buffer = ~3 weeks (repo extraction done).
3. **Demo seed scope:** Previously "all 7 decision types" in walkthrough. **Revised:** Demo narrative anchored on `escalate` + `advance`; other 5 supported but not narrated.
4. **Artifact #5 (Decision Repository):** Status updated from "not built" to **Done** (interface + SqliteDecisionRepository shipped).

---

*Generated: 2026-02-22 | Baseline: Pilot Readiness v1/v1.1 (2026-02-20),  feedback*
