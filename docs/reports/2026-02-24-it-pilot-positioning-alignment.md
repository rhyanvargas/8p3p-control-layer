# IT Pilot Positioning — Alignment Assessment

**Date:** 2026-02-24  
**Purpose:** Evidence-based assessment of suggested IT/cybersecurity pilot positioning against current implementation and roadmap. Shareable with CEO for sales/investor language.

---

## Source Statement

> When it comes to IT departments, we don't force any rip and replace. We are simply providing an API. Cybersecurity will be something that we will need to look into with each IT department to ensure we are aligned. The way I believe we keep this low-risk for regulated companies when piloting, we don't need names, emails, birthdays, or anything personal. We can use anonymous IDs only (like "user-123"), so no PII is required. Access is locked down with an API key, and tenant separation is enforced on the server so one customer can't ever see another customer's data. All data is encrypted while it moves over the internet and while it's stored, and every decision we make has an audit trail ("receipt") showing what happened and why. If the customer prefers maximum control, we can deploy the pilot inside their own AWS/VPC so they control the network and encryption keys. And AI is optional. The pilot can run fully deterministic with zero LLM/model calls so there's no "AI risk" in the decision engine.

---

## Alignment Summary

| Claim | Status | Evidence |
|-------|--------|----------|
| No rip/replace; API-only | **Aligned** | API-first control layer; optional inspection UI at `/inspect` |
| No PII required (anonymous IDs) | **Intent aligned; not enforced** | `learner_reference` can be `user-123`; receipts currently snapshot full STATE (may include partner-sent fields) |
| API key + tenant separation | **Aligned** | `src/auth/api-key-middleware.ts`; `API_KEY_ORG_ID` overrides org server-side |
| Encryption in transit | **Aligned (deployed)** | TLS via ACM + API Gateway in v1.1 AWS spec; local dev is HTTP |
| Encryption at rest | **Not yet** | v1 uses SQLite (plaintext); v1.1 DynamoDB has AWS-managed encryption by default |
| Every decision has receipt | **Aligned** | `Decision.trace` required; `GET /v1/receipts` exists; legacy rows backfilled with placeholders |
| Deploy in customer AWS/VPC | **Not in roadmap** | v1.1 is *our* AWS deployment; customer-hosted VPC is future option |
| AI optional; fully deterministic | **Aligned** | Decision engine is deterministic policy evaluation; zero LLM calls |

---

## Recommended CEO-Safe Phrasing

Lead with: **API-only, anonymous IDs, deterministic, receipts.** Then:

- **"TLS in deployed environments; at-rest encryption comes with the v1.1 AWS deployment."**
- **"Customer VPC deployment is a future/optional enterprise offering"** — not a v1 promise.

---

## References

- `docs/specs/api-key-middleware.md` — API key + org override
- `docs/specs/aws-deployment.md` — TLS, DynamoDB, v1.1 scope
- `docs/guides/deployment-checklist.md` — pilot security gates
- `docs/reports/2026-02-24-ceo-statement-fact-check.md` — receipt canonicalization gap (state_snapshot PII)
