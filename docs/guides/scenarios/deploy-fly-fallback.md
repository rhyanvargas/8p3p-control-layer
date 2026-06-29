# Fly fallback deploy (optional)

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Deploy the API to Fly.io or Render when an AWS account is unavailable. **Not** the primary charter pilot path — use [deploy-aws-pilot.md](deploy-aws-pilot.md) when AWS is available.

---

## Prerequisites

- Fly.io or Render account
- Docker build context from repo root
- Runtime secrets provisioned out of band (no committed `.env*`)

---

## Path

1. [Pilot host deployment (full doc)](../operators/pilot-host-deployment.md) — host pick, secrets, deploy steps
2. [Pilot host deployment § 1](../operators/pilot-host-deployment.md#1-decision-1--deployment-path-readiness-brief) — when to use Fly vs AWS
3. [Pilot host deployment § 2](../operators/pilot-host-deployment.md#2-secrets-provisioning) — API secrets
4. Deploy API container; capture TLS URL with `/health`
5. Dashboard hosted separately — [setup.md](../../foundation/setup.md) or Amplify per [pilot-host-deployment](../operators/pilot-host-deployment.md)

---

## Gates / reference

- [AWS Pilot Runbook](../operators/aws-pilot-runbook.md) — primary path when AWS is available
- [Deployment Checklist](../operators/deployment-checklist.md) — security gates apply to any reachable environment
- [`fly.toml`](../../../fly.toml) at repo root

---

## Exit criteria

- `GET https://{your-host}/health` returns 200
- `API_KEY` and `API_KEY_ORG_ID` enforced on `/v1/*`
- Dashboard reachable separately if customer UI is required
