# Pilot Deployment Checklist (v1)

Use this checklist before deploying any pilot environment reachable by a customer (or any shared environment with more than one org’s data present).

This checklist is intentionally **v1** (single-tenant, one org per deployment). For multi-tenant (2–3 concurrent pilots in one environment), use v1.1 tenant provisioning: `docs/specs/tenant-provisioning.md`.

> **Context:** This checklist covers the *technical deployment* gates. For the full pilot onboarding workflow (including customer readiness, onboarding call, and first-week monitoring), see [Pilot Readiness Definition](../../internal-docs/pilot-operations/pilot-readiness-definition.md) and [Onboarding Runbook](../../internal-docs/pilot-operations/onboarding-runbook.md).

---

## Non-Negotiable Security Gates

- [ ] **`API_KEY` is set** in the runtime environment (auth enforced on `/v1/*`)
- [ ] **`API_KEY_ORG_ID` is set** in the runtime environment (org_id resolved server-side; caller cannot self-declare org)
- [ ] **One org per deployment**: this environment serves exactly one `org_id`
- [ ] **No secrets committed**: `.env*` files are not committed; keys are stored only in the deployment secret manager / environment

Reference: `docs/specs/api-key-middleware.md` (Deployment Requirements).

---

## Build / Test Gates

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run typecheck`

---

## QA Gates (Manual)

Run: `docs/testing/qa-test-post-repository-extraction.md`

- [ ] QA-RE-001 through QA-RE-012 executed
- [ ] **QA-RE-012 passed** (proves `API_KEY_ORG_ID` override blocks org impersonation)
- [ ] Failures (if any) recorded with environment, request, and response

---

## Runtime Verification (Smoke)

- [ ] `GET /health` returns `200`
- [ ] `GET /docs` loads
- [ ] `/v1/*` without `x-api-key` returns `401` when `API_KEY` is set
- [ ] Requests that include an `org_id` different from `API_KEY_ORG_ID` still behave as the overridden org (see QA-RE-012)

