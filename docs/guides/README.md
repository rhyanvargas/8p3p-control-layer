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
| [AWS Pilot Runbook](aws-pilot-runbook.md) | Engineering / operators | **Primary pilot path:** CDK API + Amplify dashboard in one AWS account; smoke, onboarding, account migration |
| [Pilot Deployment Checklist (v1)](deployment-checklist.md) | Operators | Pre-deployment gates: `API_KEY`, `API_KEY_ORG_ID`, build/test/QA, smoke checks |
| [Pilot Launch Checklist](pilot-launch-checklist.md) | Launch owner | Final gate before customer access: Wave 3 engineering + security + smoke sign-off |
| [Pilot Readiness Gates](pilot-readiness-gates.md) | CS / Solutions / Engineering | Committed normative go/no-go gate tables for pilot onboarding |
| [Pilot host deployment (Fly fallback)](pilot-host-deployment.md) | Engineering | Docker / Fly.io / Render API when AWS account is unavailable |

---

## Quick reference

| I want to… | Guide |
| ---------- | ----- |
| Get my first decision in under 15 minutes | [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) |
| Build the full integration (LMS → signals → decisions) | [Pilot Integration Guide](pilot-integration-guide.md) |
| Integrate a custom-built LMS or send raw LMS data | [Pilot Integration Guide §13](pilot-integration-guide.md#13-custom-lms-integration-detailed) |
| Understand state merge, policy customization, or why decisions are empty | [FAQ](faq.md) |
| Export decisions for every learner in my org | [Get all learner decisions from org](get-all-learner-decisions-from-org.md) |
| Deploy a pilot on AWS (API + dashboard) | [AWS Pilot Runbook](aws-pilot-runbook.md) |
| Deploy a pilot environment safely | [Deployment Checklist](deployment-checklist.md) |
| Launch a pilot customer on the Decision Panel | [Pilot Launch Checklist](pilot-launch-checklist.md) |
| Check if we're ready to onboard a prospect | [Pilot Readiness Gates](pilot-readiness-gates.md) |

---

## Internal team (8P3P only)

Guides for the internal team — CS, solutions, engineering, and leadership. Customer-facing guides are in the tables above.

| Guide | Audience | Use-case |
| ----- | -------- | -------- |
| [Local Dev & Testing](../foundation/setup.md) | Internal engineers | **Run locally** — two-process setup (API + Next.js dashboard), env profiles, seed, test, make changes |
| [Internal Operations Index](internal-operations-stub.md) | CS / Solutions / Leadership | Index of gitignored runbooks, compliance docs, and ops artifacts (no public hrefs) |

| I want to… | Guide |
| ---------- | ----- |
| Run and test locally (no AWS) | [Local Dev & Testing](../foundation/setup.md) |
| Work on the Decision Panel (Next.js) | [Local Dev & Testing § Making changes](../foundation/setup.md#making-changes) |
| Find internal-only runbooks (onboarding, pilot ops, compliance) | [Internal Operations Index](internal-operations-stub.md) |
| Verify pilot gate criteria (committed SSoT) | [Pilot Readiness Gates](pilot-readiness-gates.md) |

---

## Related

- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml) — full REST contract, served interactively at `/docs`
- **Endpoint specs:** [`docs/specs/`](../specs/) — detailed spec per endpoint/feature
- **Architecture:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
