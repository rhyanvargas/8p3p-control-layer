# Integration Guides

Practical guides for integrating the 8P3P Control Layer API. Each guide covers a specific workflow and is designed to minimize time-to-first-value.

**Start here:** New to the API? Run through [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) first (under 15 minutes). Then use the [Pilot Integration Guide](pilot-integration-guide.md) for the full integration flow, and [FAQ](faq.md) for common questions.

---

## Guides

| Guide | Audience | Use-case |
| ----- | -------- | -------- |
| [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) | New customers | **First 15 minutes** — verify access, send one signal, read one decision; **Step 4 (v1.1):** view active policies via `GET /v1/policies` |
| [Pilot Integration Guide (v1)](pilot-integration-guide.md) | Integration engineers | End-to-end: signals → decisions, canonical fields, idempotency, identity, policy routing |
| [FAQ](faq.md) | Pilot customers | Common questions: payload structure, state accumulation, policy customization, decisions, identity, access |
| [Get all learner decisions from org](get-all-learner-decisions-from-org.md) | Integration / analytics engineers | Export decisions for **all learners** in an org (fan-out: `state/list` → decisions per learner) |
| [Pilot Deployment Checklist (v1)](deployment-checklist.md) | Operators | Pre-deployment gates: `API_KEY`, `API_KEY_ORG_ID`, build/test/QA, smoke checks |

---

## Quick reference

| I want to… | Guide |
| ---------- | ----- |
| Get my first decision in under 15 minutes | [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) |
| Build the full integration (LMS → signals → decisions) | [Pilot Integration Guide](pilot-integration-guide.md) |
| Understand state merge, policy customization, or why decisions are empty | [FAQ](faq.md) |
| Export decisions for every learner in my org | [Get all learner decisions from org](get-all-learner-decisions-from-org.md) |
| Deploy a pilot environment safely | [Deployment Checklist](deployment-checklist.md) |

---

## Related

- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml) — full REST contract, served interactively at `/docs`
- **Endpoint specs:** [`docs/specs/`](../specs/) — detailed spec per endpoint/feature
- **Architecture:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
