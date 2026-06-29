# Operate / ship pilot updates

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Ship code changes to an existing AWS pilot — API via CI/CD, dashboard via Amplify.

---

## Prerequisites

- Pilot already deployed — see [deploy-aws-pilot.md](deploy-aws-pilot.md)
- Write access to GitHub repo and AWS deploy roles
- Changes green locally: `npm run check`

---

## Path

1. [AWS Pilot Runbook § 6.1](../operators/aws-pilot-runbook.md#61-deploy-updates) — deploy updates workflow
2. [CI/CD pipeline spec](../../specs/ci-cd-pipeline.md) — CI jobs, deploy triggers, secrets
3. [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml) — API deploy (OIDC → CDK)
4. [AWS Pilot Runbook § 6.2](../operators/aws-pilot-runbook.md#62-monitoring) — monitoring and alarms
5. Re-run [§ 4 smoke](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) after material changes

---

## Gates / reference

- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — must be green before merge
- [Pilot Deployment Checklist](../operators/deployment-checklist.md) — build/test gates
- [AWS deployment spec](../../specs/aws-deployment.md)

---

## Exit criteria

- GitHub Actions CI green on release commit
- API deploy workflow succeeded; Amplify dashboard build green
- Post-deploy smoke (runbook § 4) passes on the target environment
