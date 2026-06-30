# Integration Guides

Practical guides for integrating and operating the 8P3P Control Layer. **New here?** Start at [`docs/README.md`](../README.md) and pick a scenario path — ordered links only; authority stays in the runbooks and specs below.

> For ordered AWS deploy steps, use [`scenarios/deploy-aws-pilot.md`](scenarios/deploy-aws-pilot.md), not this index alone.

---

## Scenario paths

Thin how-to routers — prerequisites, numbered links, exit criteria. No duplicated commands.

| I want to… | Scenario |
| ---------- | -------- |
| Run locally | [scenarios/run-locally.md](scenarios/run-locally.md) |
| Deploy AWS charter pilot | [scenarios/deploy-aws-pilot.md](scenarios/deploy-aws-pilot.md) |
| Launch a pilot customer | [scenarios/launch-pilot-customer.md](scenarios/launch-pilot-customer.md) |
| Integrate a customer LMS | [scenarios/integrate-customer-lms.md](scenarios/integrate-customer-lms.md) |
| Operate / ship pilot updates | [scenarios/operate-pilot-updates.md](scenarios/operate-pilot-updates.md) |
| Run organic educator wave (Zoom 50–100) | [scenarios/organic-educator-wave.md](scenarios/organic-educator-wave.md) |
| Build a feature (spec-driven) | [scenarios/build-a-feature.md](scenarios/build-a-feature.md) |
| Fly fallback deploy (optional) | [scenarios/deploy-fly-fallback.md](scenarios/deploy-fly-fallback.md) |

---

## Customer guides (`customers/`)

| Guide | Audience | Use-case |
| ----- | -------- | -------- |
| [Customer Onboarding Quick Start](customers/customer-onboarding-quickstart.md) | New customers | **First 15 minutes** — verify access, send one signal, read one decision |
| [Pilot Integration Guide (v3)](customers/pilot-integration-guide.md) | Integration engineers | End-to-end integration — **start here before** [field mappings deep dive](customers/onboarding-field-mappings.md) |
| [FAQ](customers/faq.md) | Pilot customers | Common questions: payload structure, state, policy customization, identity |
| [Get all learner decisions from org](customers/get-all-learner-decisions-from-org.md) | Integration / analytics | Org-wide decision export (fan-out pattern) |
| [Onboarding field mappings](customers/onboarding-field-mappings.md) | Integration engineers | **Deep dive** — tenant mapping workflow; overview in Integration Guide §5 |

---

## Operator guides (`operators/`)

| Guide | Audience | Use-case |
| ----- | -------- | -------- |
| [AWS Pilot Runbook](operators/aws-pilot-runbook.md) | Engineering / operators | **Primary pilot path:** CDK API + Amplify dashboard |
| [Pilot Deployment Checklist (v1)](operators/deployment-checklist.md) | Operators | Pre-deployment gates: `API_KEY`, `API_KEY_ORG_ID`, build/test/QA |
| [Pilot Launch Checklist](operators/pilot-launch-checklist.md) | Launch owner | Final sign-off before customer access |
| [Pilot Readiness Gates](operators/pilot-readiness-gates.md) | CS / Solutions / Engineering | Committed normative go/no-go tables — gate criteria SSoT |
| [Pilot host deployment (Fly fallback)](operators/pilot-host-deployment.md) | Engineering | Docker / Fly.io / Render when AWS is unavailable |
| [Internal Operations Index](operators/internal-operations-stub.md) | CS / Solutions / Leadership | Index of gitignored runbooks (no public hrefs) |
| [Local Dev & Testing](../foundation/setup.md) | Internal engineers | Run locally — API + dashboard, env profiles, seed, test |

**Checklist layering (not duplicates):** [Deployment Checklist](operators/deployment-checklist.md) → [Readiness Gates](operators/pilot-readiness-gates.md) → [Launch Checklist](operators/pilot-launch-checklist.md). Follow [scenarios/launch-pilot-customer.md](scenarios/launch-pilot-customer.md) for order.

---

## Playbooks (`playbooks/`)

| Guide | Audience | Use-case |
| ----- | -------- | -------- |
| [Springs Pilot Demo](playbooks/springs-pilot-demo.md) | Sales / solutions / demos | Local stakeholder walkthrough (Springs seed + dashboard routes) |
| [Organic Educator Wave — Zoom runbook](playbooks/organic-educator-wave-zoom.md) | CS / solutions / host | Hosted Zoom 50–100 session — dual codes, two-path demo, host checklist |

---

## Quick reference (edge cases)

Scenario paths cover most tasks — use this table only when the scenario table does not apply.

| I want to… | Start here |
| ---------- | ---------- |
| Integrate a custom-built LMS or send raw LMS data | [Pilot Integration Guide §13](customers/pilot-integration-guide.md#13-custom-lms-integration-detailed) |
| Configure field mappings (deep dive) | [Onboarding field mappings](customers/onboarding-field-mappings.md) — overview in [Integration Guide §5](customers/pilot-integration-guide.md#5-how-field-mappings-work-you-may-not-need-to-normalize) |
| Understand state merge, empty decisions, or policy customization | [FAQ](customers/faq.md) |
| Export decisions for every learner in my org | [Get all learner decisions from org](customers/get-all-learner-decisions-from-org.md) |
| Run a local stakeholder demo (Springs) | [Springs Pilot Demo](playbooks/springs-pilot-demo.md) |
| Host organic educator wave on Zoom | [Organic educator wave scenario](scenarios/organic-educator-wave.md) → [Zoom runbook](playbooks/organic-educator-wave-zoom.md) |
| Work on the Decision Panel (Next.js) | [Local Dev & Testing § Making changes](../foundation/setup.md#making-changes) |
| Find internal-only runbooks | [Internal Operations Index](operators/internal-operations-stub.md) |

---

## Related

- **Docs hub:** [`docs/README.md`](../README.md) — scenario table, audience split, tier legend
- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml) — full REST contract, served interactively at `/docs`
- **Endpoint specs:** [`docs/specs/`](../specs/) — detailed spec per endpoint/feature
- **Architecture:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
