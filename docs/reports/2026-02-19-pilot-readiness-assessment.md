# 8P3P Control Layer — Pilot Readiness Assessment

**Date:** 2026-02-19  
**Context:** CEO request for enterprise pilot timeline and inspection panel strategy  
**Baseline:** POC v2 QA complete (2026-02-18), 343 tests passing

---

## Current State

The core control-plane loop is proven end-to-end:

| Milestone | Date | Status |
|-----------|------|--------|
| POC v1 — single-rule pipeline (signal → state → decision + trace) | Feb 10 | Complete |
| POC v2 — 7-rule policy covering all decision types | Feb 17 | Complete |
| POC v2 — full QA execution with JSON trace evidence | Feb 18 | Complete |
| 343 tests, 17 files, contract drift guards | Feb 18 | Passing |

**What's proven:** A signal enters → gets validated → stored immutably → state accumulated → policy evaluated → deterministic decision emitted with full trace (state version + policy version + matched rule). This works for all 7 decision types.

---

## Panel Alignment with Architecture

The CEO's four panels are **inspection surfaces**, not product UI. They are read-only views over control-plane data that prove the loop: **signals → state → decisions → receipts**. This aligns with the "no UI ownership" doctrine because:

- They expose only data the control layer already owns
- They are read-only (no workflow, no enforcement, no mutations)
- They serve integration debugging, auditability, and enterprise trust
- They do not create user-facing product surfaces

---

## Gap Analysis: What Each Panel Needs

### Panel 1: Signal Intake

| Requirement | Available Today | Gap |
|-------------|----------------|-----|
| Last N events received | `GET /v1/signals` returns accepted signals | Endpoint exists |
| Event type, timestamp, source system | `source_system`, `timestamp`, `schema_version` in response | Available |
| Pass/fail schema validation | Validation runs at ingestion; failures returned as 400 | **Rejected signals not persisted** — returned to caller but not logged for inspection |
| Idempotency/retry status | `duplicate` status returned on re-submission | Available in response, not queryable after the fact |

**Backend work required:** Persist validation outcomes (accepted/rejected/duplicate) in a queryable ingestion log. Currently, rejected signals are returned to the caller but not stored.

### Panel 2: State Viewer

| Requirement | Available Today | Gap |
|-------------|----------------|-----|
| learnerId + skillId list | `learner_reference` + `org_id` stored per state | Available in store |
| masteryScore, stabilityScore, timestamps | Canonical state fields exist in state object | Available in store |
| confidence/risk fields | `confidenceInterval`, `riskSignal` in state | Available in store |
| State version | `state_version` tracked with monotonic versioning | Available in store |

**Backend work required:** New `GET /v1/state` endpoint. The data exists internally but the STATE Engine spec explicitly marks external API as out of scope ("No REST API endpoint for state queries"). This is a scoped addition — the endpoint is read-only and does not violate STATE authority (no mutations).

### Panel 3: Decision Stream

| Requirement | Available Today | Gap |
|-------------|----------------|-----|
| decisionType | `decision_type` in decision record | Available |
| Time emitted | `decided_at` in decision record | Available |
| matched_rule_id | In `trace.matched_rule_id` | Available |
| priority | Not in data model | **New field needed** — rule priority from policy evaluation order |
| TTL | Not in data model | **New field needed** — decision time-to-live for downstream consumers |
| downstream target(s) | Not in data model | **New field needed** — intended consumer/target system |

**Backend work required:** Extend decision trace or decision_context with `priority`, `ttl`, and `downstream_targets`. These are output-facing metadata fields, not decision logic fields.

### Panel 4: Decision Trace / Receipt

| Requirement | Available Today | Gap |
|-------------|----------------|-----|
| State snapshot at decision time | `trace.state_id` + `trace.state_version` (reference only) | **State snapshot not frozen in decision** — referenced by ID but not embedded |
| Rule/policy condition that fired | `trace.matched_rule_id` identifies the rule | **Rule condition details not in trace** — only the rule ID |
| Threshold values | Not in trace | **Threshold values not captured** |
| Rationale fields | Not in trace | **Rationale not captured** |

**Backend work required:** This is the highest-effort, highest-value gap. The decision trace must be enriched to include: (a) the frozen state snapshot at evaluation time, (b) the matched rule's condition tree, (c) the threshold values that were compared, and (d) a rationale summary. This makes every decision fully self-contained and auditable without needing to reconstruct state after the fact.

---

## Sequence to Demo-Ready

| Phase | Work | Depends On | Estimate |
|-------|------|------------|----------|
| 1 | **Repository extraction** — abstract persistence behind interfaces | — | ~1 week |
| 2 | **Inspection API** — state endpoint, enriched trace, ingestion log, decision stream fields | Phase 1 | ~1–2 weeks |
| 3 | **Inspection panels** — 4 read-only panels consuming Phase 2 APIs | Phase 2 | ~2–3 weeks |
| **Total** | | | **4–6 weeks** |

### Why this sequence matters

- **Phase 1 first:** Repository extraction (already planned, `.cursor/plans/repository-extraction.plan.md`) abstracts SQLite behind interfaces. Without it, we demo on SQLite, which undermines enterprise trust on first technical question about scale. Every panel built on top of properly abstracted persistence is a panel we never rebuild.
- **Phase 2 before 3:** The panels are only as good as their data source. Enriching the API first means the panels render real, complete data from day one.
- **Phase 3 last:** The panels are the thinnest layer — static read-only views consuming JSON APIs. No state management, no mutations, no complex UI logic.

### Early demo option

Panels can be demonstrated against the local stack before Phase 1 completes. If enterprise conversations need to start sooner, a demo against SQLite-backed APIs is viable — just not production-representative. The panels themselves don't change; only the backing store does.

---

## Recommendations

1. **Don't compress the sequence.** Repository extraction de-risks everything downstream. Skipping it means rebuilding persistence wiring later under pilot pressure.
2. **Scope panels to exactly 4.** The four panels cover the full loop. Resist adding workflow, configuration, or management surfaces — those violate the doctrine.
3. **Enriched trace is the enterprise differentiator.** Panel 4 (Decision Trace / Receipt) is what makes enterprises trust the system. Prioritize the trace enrichment in Phase 2 over cosmetic panel polish in Phase 3.
4. **Use the panels as the QA surface.** Once built, the panels replace manual curl/Swagger QA for regression validation. They pay for themselves immediately.

---

## Specs Created

| Spec | Path | Purpose |
|------|------|---------|
| Inspection API | `docs/specs/inspection-api.md` | Backend: new read-only query endpoints, enriched trace, ingestion log |
| Inspection Panels | `docs/specs/inspection-panels.md` | Frontend: 4 read-only panels consuming inspection APIs |

---

*Generated: 2026-02-19 | Baseline: POC v2 QA (2026-02-18)*
