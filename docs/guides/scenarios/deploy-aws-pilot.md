# Deploy AWS charter pilot

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Deploy **Tier A** (CDK API — Lambda + API Gateway + DynamoDB) and **Tier C** (Amplify dashboard) in one AWS account. Tier B (live LMS integration) is customer work — see [integrate-customer-lms.md](integrate-customer-lms.md).

**Charter pilot `org_id`:** `southwest-charter` (policies at `src/decision/policies/southwest-charter/`).

---

## Prerequisites

- AWS account with CDK bootstrap permissions
- GitHub Actions OIDC configured for API deploy (recommended path)
- Release commit green on CI (`npm run check`)

---

## Path

Follow [AWS Pilot Runbook](../operators/aws-pilot-runbook.md) in order:

1. [§ 0. Pre-flight](../operators/aws-pilot-runbook.md#0-pre-flight-local-before-any-aws-spend) — local gates before AWS spend
2. [§ 1. AWS account setup](../operators/aws-pilot-runbook.md#1-aws-account-setup-first-time-only) — CDK bootstrap, GitHub OIDC
3. [§ 2. Deploy the API](../operators/aws-pilot-runbook.md#2-deploy-the-api-cdk) — **Tier A** via `deploy.yml` or manual CDK; set `API_KEY_ORG_ID=southwest-charter`
4. [§ 3. Deploy the dashboard](../operators/aws-pilot-runbook.md#3-deploy-the-dashboard-amplify) — **Tier C** Amplify app + runtime env
5. [§ 4. Post-deploy smoke](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) — go / no-go gates

**Local pilot-like testing before deploy:** [setup.md Profile B](../../foundation/setup.md#profile-b--pilot-like-local) with `API_KEY_ORG_ID=southwest-charter` (or `springs` for demo seed only).

---

## Gates / reference

- [Pilot Deployment Checklist](../operators/deployment-checklist.md)
- [AWS deployment spec](../../specs/aws-deployment.md)
- [API key middleware spec](../../specs/api-key-middleware.md)
- [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml)

---

## Exit criteria

- Runbook [§ 4](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) smoke green: API ingest + dashboard Overview with live org data
- Pilot environment record filled (runbook § 0 template)
