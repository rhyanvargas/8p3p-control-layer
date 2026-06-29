# Integrate a customer LMS

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Connect a customer LMS or custom data source so signals flow in and decisions are readable — **Tier B** (live integration), not dashboard/API hosting.

---

## Prerequisites

- Live API URL and `x-api-key` from 8P3P (post-deploy handoff)
- Agreed `org_id` for this pilot (e.g. `southwest-charter`)
- Integration engineer with REST client access

---

## Path

1. [Customer Onboarding Quick Start](../customers/customer-onboarding-quickstart.md) — verify access, send one signal, read one decision (< 15 min)
2. [Pilot Integration Guide](../customers/pilot-integration-guide.md) — end-to-end: signals → decisions, identity, idempotency, policy routing
3. [Ingestion preflight spec](../../specs/ingestion-preflight.md) — validate payloads before production ingest
4. [Onboarding field mappings](../customers/onboarding-field-mappings.md) — tenant field mapping workflow (deep dive)
5. [Pilot Integration Guide § 9](../customers/pilot-integration-guide.md#9-integration-checklist) — integration checklist sign-off

---

## Gates / reference

- [FAQ](../customers/faq.md) — payload structure, empty decisions, policy customization
- [Signal ingestion spec](../../specs/signal-ingestion.md)
- [Webhook adapters spec](../../specs/webhook-adapters.md)
- [API reference (OpenAPI)](../../api/openapi.yaml)

---

## Exit criteria

- First production signal ingested for the pilot `org_id`
- At least one decision returned for a learner via `GET /v1/learners/{ref}/decisions` (or equivalent summary path)
