# Guides

Practical integration guides for common business use-cases. These are written to reduce time-to-value by showing how to compose the existing APIs into higher-level workflows.

**Start here:** New to the API? Do [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) first (under 15 minutes). Then use the [Pilot Integration Guide](pilot-integration-guide.md) for the full integration flow and [FAQ](faq.md) when questions come up.

---

## By role / use-case


| Guide                                                                       | Audience                          | Use-case                                                                                                  |
| --------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Customer Onboarding Quick Start](customer-onboarding-quickstart.md)        | New pilot customers               | **First 15 minutes** — verify access, send one signal, read one decision                                  |
| [Pilot Integration Guide (v1)](pilot-integration-guide.md)                  | Integration engineers             | End-to-end: signals → decisions, canonical fields, idempotency, identity, policy routing, webhook pattern |
| [FAQ (Pilot)](faq.md)                                                       | Pilot customers                   | Common questions: payload, state accumulation, policy customization, decisions, identity, access          |
| [Get all learner decisions from org](get-all-learner-decisions-from-org.md) | Integration / analytics           | Export decisions for **all learners** in an org (fan-out: state/list → decisions per learner)             |
| [Demo Walkthrough](demo-walkthrough.md)                                     | Presenters, investors, enterprise | ~60s inspection-panel demo script (REINFORCE + INTERVENE anchors)                                         |
| [Springs Demo Walkthrough](springs-demo-walkthrough.md)                     | Springs IT / CTO, pilot stakeholders | ~3 min: two populations, three LMS systems, one decision record per person (Canvas, Blackboard, Absorb)   |
| [Pilot Deployment Checklist (v1)](deployment-checklist.md)                  | Operators / 8P3P                  | Pre-deployment gates: API_KEY, API_KEY_ORG_ID, build/test/QA, smoke checks                                |


---

## Quick reference


| I want to…                                                               | Go to                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Get my first decision in minutes                                         | [Customer Onboarding Quick Start](customer-onboarding-quickstart.md)        |
| Build the full integration (LMS → signals → decisions)                   | [Pilot Integration Guide](pilot-integration-guide.md)                       |
| Understand state merge, policy customization, or why decisions are empty | [FAQ](faq.md)                                                               |
| Export decisions for every learner in my org                             | [Get all learner decisions from org](get-all-learner-decisions-from-org.md) |
| Run or narrate the inspection-panel demo                                 | [Demo Walkthrough](demo-walkthrough.md)                                     |
| Run or narrate the **Springs** demo (Canvas + Blackboard + Absorb)      | [Springs Demo Walkthrough](springs-demo-walkthrough.md)                     |
| Deploy a pilot environment safely                                        | [Deployment Checklist](deployment-checklist.md)                             |


