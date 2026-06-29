# Launch a pilot customer

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Gate a pilot customer onto the Decision Panel and live API after engineering deploy is complete.

---

## Prerequisites

- AWS pilot stack deployed and [§ 4 smoke](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) green — see [deploy-aws-pilot.md](deploy-aws-pilot.md)
- Launch owner identified (CS / solutions / engineering)

---

## Path

1. [Pilot Deployment Checklist](../operators/deployment-checklist.md) — technical deploy gates (security, build, QA)
2. [Pilot Readiness Gates](../operators/pilot-readiness-gates.md) — committed go/no-go tables (8P3P + customer readiness)
3. [Pilot Launch Checklist](../operators/pilot-launch-checklist.md) — final sign-off before customer access
4. [Customer Onboarding Quick Start](../customers/customer-onboarding-quickstart.md) — hand off integrator-facing first-15-minutes flow
5. [AWS Pilot Runbook § 5](../operators/aws-pilot-runbook.md#5-customer-onboarding-sequence-predictable-pilot) — predictable onboarding sequence

---

## Gates / reference

- [Pilot Integration Guide](../customers/pilot-integration-guide.md) — full LMS integration reference for customer engineers
- [FAQ](../customers/faq.md) — common integrator questions
- [Onboarding field mappings](../customers/onboarding-field-mappings.md)

---

## Exit criteria

- [Pilot Launch Checklist](../operators/pilot-launch-checklist.md) signed — engineering, security, and functional smoke complete
- Customer has secure access credentials and onboarding quickstart
