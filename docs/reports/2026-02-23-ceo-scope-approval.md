# CEO Scope Approval — Pilot Readiness v1

**Date:** 2026-02-23  
**Context:** CEO approval of CTO scope/timeline response with three edits.  
**References:** `2026-02-22-cto-response-ceo-scope-timeline.md`, `2026-02-20-pilot-readiness-v1-v1.1.md`

---

## Approval Summary

**Status: Approved** with three edits integrated below.

---

## Edit #1: Demo Anchors — REINFORCE + INTERVENE

**Principle:** Ship all 7 decision types; do not narrate all seven in the demo. Demo stays crisp and intuitive.

**Demo anchors (updated):**

For enterprise pilot conversion, anchor the walkthrough on **REINFORCE** + **INTERVENE** as the two primary decisions:

- **REINFORCE** = "prevent decay / prevent future failure before it happens"
- **INTERVENE** = "high-risk now; take action immediately"

These map directly to enterprise pain (waste + risk), and the receipts make them defensible. Enterprise buyers pay for preventing failure and improving readiness.

Advance is nice but not the pain point. Escalate implies workflow/human review which can drag into "approval checkpoint" discussions.

The other 5 decision types remain fully supported in the engine and can appear in the Decision Stream; we simply don't lead with them unless asked. If questions arise ("reroute vs pause"), Panel 4 receipts answer by showing the rule, thresholds, and rationale.

**Result:** Clean story, lower confusion, same capability.

---

## Edit #2: Minimum Security for Pilot — Enforcement Clarification

**Principle:** v1 does not need full enterprise hardening, but it cannot run on open endpoints.

**Explicit enforcement:**

- Add simple API key middleware for v1
- One key per pilot deployment
- Org is resolved server-side from the key
- Any `org_id` sent by the client is ignored/overridden (no self-declared org)
- Applied to every request (ingestion + inspection endpoints)

This prevents a security reviewer from stopping the deal and keeps the pilot controlled without overbuilding v1.1 provisioning.

---

## Edit #3: Timeline — Week 1 Checkpoint Demo

**Principle:** Do not wait until Week 3 to "see something."

**Week 1 checkpoint (by end of Week 1):**

A working checkpoint demo must show:

1. Queryable ingestion outcomes (accepted/rejected/duplicate)
2. Read-only `GET /v1/state`
3. API key enforced on endpoints
4. Decisions visible in stream (even if receipts are stubbed in early form)

Receipts remain the top priority and must be completed as specified, but the Week 1 checkpoint ensures we stay on track and prevents timeline drift.

---

## Approved Summary

| Item | Approved Position |
|------|-------------------|
| Decision types | Ship all 7; demo narrative anchored on REINFORCE + INTERVENE |
| Security | Minimal API key with server-side org enforcement (client org ignored) |
| Timeline | 3-week plan, with hard Week 1 checkpoint demo |

---

## Document Updates (Post-Approval)

The following documents were updated to reflect these edits:

- `docs/reports/2026-02-22-cto-response-ceo-scope-timeline.md` — Demo anchors amended to REINFORCE + INTERVENE
- `docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md` — Demo anchors, Week 1 checkpoint, Artifact 8 status
- `docs/guides/pilot-integration-guide.md` — Section 6 demo anchors

---

*Generated: 2026-02-23 | Supersedes: CTO proposal (escalate + advance anchors)*
