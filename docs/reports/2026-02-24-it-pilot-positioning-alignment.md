# IT Pilot Positioning — Alignment Assessment

**Date:** 2026-02-24 (updated with CEO directive)  
**Purpose:** Evidence-based assessment of IT/cybersecurity pilot positioning against current implementation and roadmap. Shareable with CEO for sales/investor language.

---

## CEO Directive (2026-02-24)

> For the pilot we will operate using pseudonymous IDs and we will configure receipts to exclude PII. Any inbound PII fields are rejected or stripped.

---

## Canonical Pilot Description

> 8P3P is API-only and does not require rip-and-replace. For a pilot, we can operate with pseudonymous IDs only — no PII required — and we enforce access with API keys and server-side tenant isolation. Decisions are deterministic and come with receipts that show exactly why each decision occurred. In deployed environments we use TLS, and our AWS deployment provides encryption at rest by default. AI is optional; the pilot can run with zero model calls.

---

## Alignment Summary

| Claim | Status | Evidence |
|-------|--------|----------|
| No rip/replace; API-only | **Aligned** | API-first control layer; optional inspection UI at `/inspect` |
| Pseudonymous IDs; no PII required | **Done** | `learner_reference` accepts any string (e.g., `user-123`). PII keys rejected at ingestion (`src/ingestion/forbidden-keys.ts` — DEF-DEC-008-PII). Receipt `state_snapshot` canonical-only (`src/decision/engine.ts` — DEF-DEC-007). |
| API key + tenant separation | **Aligned** | `src/auth/api-key-middleware.ts`; `API_KEY_ORG_ID` overrides org server-side |
| Encryption in transit | **Aligned (deployed)** | TLS via ACM + API Gateway in v1.1 AWS spec; local dev is HTTP |
| Encryption at rest | **v1.1** | v1 uses SQLite (plaintext); v1.1 DynamoDB has AWS-managed encryption by default |
| Every decision has receipt | **Aligned** | `Decision.trace` required; `GET /v1/receipts` exists; legacy rows backfilled with placeholders |
| Deploy in customer AWS/VPC | **Future option** | v1.1 is *our* AWS deployment; customer-hosted VPC is a post-pilot enterprise offering |
| AI optional; fully deterministic | **Aligned** | Decision engine is deterministic policy evaluation; zero LLM calls |

---

## Implementation Gap (v1 — Pilot Hardening) — Resolved

DEF-DEC-007 (canonical `state_snapshot`) and DEF-DEC-008-PII (PII forbidden keys at ingestion) are implemented. See `docs/foundation/roadmap.md` and `docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md` for status.

---

## References

- `docs/specs/api-key-middleware.md` — API key + org override
- `docs/specs/signal-ingestion.md` — PII forbidden keys (added 2026-02-24)
- `docs/specs/inspection-api.md` — Canonical receipt snapshot (updated 2026-02-24)
- `docs/specs/decision-engine.md` — DEF-DEC-007, DEF-DEC-008-PII deferred items
- `docs/specs/aws-deployment.md` — TLS, DynamoDB, v1.1 scope
- `docs/guides/deployment-checklist.md` — pilot security gates
- `docs/foundation/ip-defensibility-and-value-proposition.md` — PII posture (updated 2026-02-24)
