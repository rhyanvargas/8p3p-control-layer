# CI/CD Pipeline

> Codify the GitHub Actions pipelines that gate merges to `main` and deliver artifacts to the pilot (Fly.io) and production (AWS CDK) environments. Source of truth for what runs, where, when, and what blocks a deploy.

## Overview

This spec defines two orthogonal GitHub Actions pipelines:

1. **CI** (existing, documented here): the merge gate. Runs on every push/PR to verify the repository builds, passes contract tests, and synthesizes the AWS CDK template.
2. **Deploy → Pilot (Fly.io)** (new): builds the multi-stage Docker image from `Dockerfile`, bakes the `VITE_*` dashboard envs, pushes to Fly.io via `flyctl`, and verifies `/health` over TLS using the verbatim smoke-test from the readiness brief.
3. **Deploy → Prod (AWS)** (existing, documented here): `cdk deploy` via OIDC-assumed role. Preserved unchanged.

The two deploy tracks are independent: Fly.io is the pilot path per `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` § Decision 1 Option A (explicitly **not** AWS CDK for pilot); AWS CDK remains the prod target per `docs/specs/aws-deployment.md`.

This spec does **not** change any application behavior. It codifies existing `.github/workflows/ci.yml` + `deploy.yml` so future changes are contract-driven, and it adds the missing Fly.io deploy workflow required by `.cursor/plans/pilot-host-deployment.plan.md`.

---

## Assumptions

> These were inferred from repo state because the clarifying questions were skipped. Overrule any before running `/plan-impl`.

| # | Assumption | Evidence |
|---|------------|----------|
| A1 | CI platform is **GitHub Actions** | `.github/workflows/ci.yml`, `deploy.yml` already present |
| A2 | Pilot target is **Fly.io only** for v1; Render deferred | `fly.toml` exists; `render.yaml` is `TASK-004 pending` in `pilot-host-deployment.plan.md` |
| A3 | Two environments: **pilot** (Fly.io) and **prod** (AWS). No staging. | Readiness brief § Decision 1: "not AWS CDK" for pilot; AWS CDK is prod per `aws-deployment.md` |
| A4 | Fly.io deploy triggers: **`workflow_dispatch` only for v1** (manual) | Readiness brief § pre-Saturday schedule: "No code deploys after 12:30 PM". Manual dispatch matches human-controlled release cadence during pilot. Automatic `push:main` can be added later without breaking the contract. |
| A5 | AWS deploy triggers: **unchanged** (`push:main` + `workflow_dispatch`) | `.github/workflows/deploy.yml:3-11` |
| A6 | Node version for CI matrix: **20 and 22**; deploy jobs pin **22** | `ci.yml:16` + `deploy.yml:18` |
| A7 | Post-deploy smoke test for Fly.io is the **verbatim curl** from readiness brief § Single Go/No-Go Gate | `.cursor/plans/pilot-host-deployment.plan.md` § Spec Literals |
| A8 | `VITE_*` bake-in at image build time is **accepted for pilot**, not refactored here | Readiness brief § What We Are Explicitly NOT Doing item 1 |
| A9 | No per-PR preview environments | Out of scope; adds cost + Fly.io review-apps complexity not justified by current pilot scale |

---

## Requirements

### Functional — CI (merge gate)

- [ ] FR-CI-001: Run on every `push` to any branch and every `pull_request` to any branch.
- [ ] FR-CI-002: Execute in a Node matrix (`20`, `22`) on `ubuntu-latest`.
- [ ] FR-CI-003: Run these steps in order, failing fast on any non-zero exit: `npm ci`, `npm run build`, `npm run validate:schemas`, `npm run validate:contracts`, `npm run validate:api`, `npm run lint`, `npm test`, `npm run cdk:synth`.
- [ ] FR-CI-004: Use `actions/setup-node@v4` with `cache: npm` to cache the root lockfile.
- [ ] FR-CI-005: A failing CI run MUST block merge to `main` (branch protection policy — enforced in GitHub settings, not YAML, but listed here as a contract obligation).

### Functional — Deploy → Pilot (Fly.io)

- [ ] FR-FLY-001: Trigger: `workflow_dispatch` with inputs `vite_api_base_url` (string, required), `vite_api_key` (string, required, secret-ish), `vite_org_id` (string, default `springs`), and `fly_app_name` (string, required).
- [ ] FR-FLY-002: Before deploy, run the full CI gate (reuse the `check` job via `needs:` or a reusable workflow). If CI fails, the deploy job MUST NOT execute.
- [ ] FR-FLY-003: Install `flyctl` via `superfly/flyctl-actions/setup-flyctl@master` (official action from Fly.io).
- [ ] FR-FLY-004: Authenticate to Fly.io using `FLY_API_TOKEN` from GitHub Secrets (repository scope).
- [ ] FR-FLY-005: Execute `flyctl deploy --remote-only --app <fly_app_name> --build-arg VITE_API_BASE_URL=... --build-arg VITE_API_KEY=... --build-arg VITE_ORG_ID=...`. Use `--remote-only` so image build runs on Fly builders (no local buildx needed).
- [ ] FR-FLY-006: After `flyctl deploy` returns success, run the verbatim smoke-test curl from the readiness brief against `https://<fly_app_name>.fly.dev`. The job MUST fail if either the `/health` GET or the `/v1/signals` POST returns non-2xx.
- [ ] FR-FLY-007: Concurrency: one pilot deploy at a time per `fly_app_name` (`concurrency.group: fly-deploy-${{ inputs.fly_app_name }}`, `cancel-in-progress: false`).
- [ ] FR-FLY-008: Runtime secrets (`API_KEY`, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`) are set out-of-band via `fly secrets set`. The workflow MUST NOT read or write them. This is called out in `docs/guides/pilot-host-deployment.md` (see `pilot-host-deployment.plan.md` TASK-005).

### Functional — Deploy → Prod (AWS)

- [ ] FR-AWS-001: Preserve existing triggers: `push` to `main` and `workflow_dispatch` with `stage` input (`prod` default, `dev` optional).
- [ ] FR-AWS-002: Preserve existing job graph: `test → build → cdk-synth → deploy`. No functional change.
- [ ] FR-AWS-003: Authenticate via OIDC using `aws-actions/configure-aws-credentials@v4` and `secrets.AWS_DEPLOY_ROLE_ARN`. No long-lived AWS keys in repository secrets.
- [ ] FR-AWS-004: Pass deploy-time env vars: `ADMIN_API_KEY`, `CUSTOM_DOMAIN`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME` from repository secrets.
- [ ] FR-AWS-005: Post-deploy contract tests run only when `secrets.CONTRACT_TEST_API_URL` is set (preserves existing conditional behavior).
- [ ] FR-AWS-006: Concurrency: `group: deploy-${{ github.ref }}`, `cancel-in-progress: false`.

### Acceptance Criteria

- Given a PR to `main`, when CI runs, then all eight steps in FR-CI-003 execute on Node 20 and 22, and merge is blocked if any step fails.
- Given a `workflow_dispatch` on the Fly.io workflow with valid inputs and a passing CI, when `flyctl deploy` succeeds, then the smoke-test curl against `https://<fly_app_name>.fly.dev/health` returns 200 and the POST `/v1/signals` returns 200/202 and the workflow concludes `success`. If either HTTP call fails, the workflow concludes `failure`.
- Given a push to `main`, when the AWS deploy workflow runs, then `cdk deploy --require-approval never` completes without prompting and the optional post-deploy contract tests run if `CONTRACT_TEST_API_URL` is configured.
- Given two concurrent dispatches targeting the same `fly_app_name`, when the second starts, then it queues behind the first (no in-flight cancellation).

---

## Constraints

- **Image registry**: Fly.io manages the registry for its deploys (`registry.fly.io/<app>`). We do not publish to GHCR or ECR from this pipeline. Rationale: single-consumer artifact; no need for a shared registry.
- **Dashboard env bake-in**: `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_ORG_ID` are build-args, not runtime env. Rebuilding the dashboard requires a new image. This is accepted per readiness-brief guardrail; `liu-usage-meter.md`-style key rotation is out of scope.
- **No shared state**: CI and deploy workflows do not share caches beyond the per-job `actions/setup-node` npm cache. Artifact sharing (`actions/upload-artifact` → `actions/download-artifact`) is preserved only where `deploy.yml` already uses it (dist passing between `build` and `cdk-synth`/`deploy`).
- **Smoke-test payload is frozen**: the curl body in § Spec Literals is copied verbatim from the readiness brief. Do not paraphrase it; change it only by updating the source doc and re-syncing.
- **Manual-only Fly.io dispatch for v1**: no `push:main` trigger until after the Saturday dry run lands. Rationale: human-gated release during pilot window.

## Out of Scope

- Per-PR preview environments (Fly.io review apps, Render preview services).
- Render.yaml deploy pipeline (Render target is deferred — `pilot-host-deployment.plan.md` TASK-004 is `pending`).
- Blue/green or canary deploys on AWS (current CDK stack is a single environment per stage).
- Image scanning (Trivy, Snyk) — add when we move past pilot.
- SBOM generation — add when we move past pilot.
- Migrating CI to a matrix of OSes — `ubuntu-latest` only.
- Secret rotation automation (`API_KEY`, `COOKIE_SECRET`) — out-of-band via `fly secrets set` / AWS Secrets Manager per `aws-deployment.md`.
- Persistent volume provisioning on Fly.io — SQLite ephemerality is documented in `fly.toml:5-7` and accepted as a dry-run-only deviation.

## Dependencies

### Required from Other Specs / Artifacts

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Multi-stage `Dockerfile` (builder + runtime) | `Dockerfile` (repo root) | Defined ✓ |
| `fly.toml` Fly.io app config with `[build.args]` slots | `fly.toml` (repo root) | Defined ✓ |
| Verbatim smoke-test curl | `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` § Single Go/No-Go Gate, mirrored in `.cursor/plans/pilot-host-deployment.plan.md` § Spec Literals | Defined ✓ |
| AWS CDK stack + OIDC role ARN | `docs/specs/aws-deployment.md` § Deployment | Defined ✓ |
| npm scripts (`build`, `validate:*`, `lint`, `test`, `cdk:synth`, `typecheck`) | `package.json:9-31` | Defined ✓ |
| `superfly/flyctl-actions/setup-flyctl` | [GitHub: superfly/flyctl-actions](https://github.com/superfly/flyctl-actions) — official Fly.io GitHub Action | Defined ✓ |
| `aws-actions/configure-aws-credentials@v4` with OIDC | Currently in use at `deploy.yml:126-129` | Defined ✓ |
| `docs/guides/pilot-host-deployment.md` § Secrets (fly secrets set reference) | `pilot-host-deployment.plan.md` TASK-005 | **GAP** — pending in referenced plan |

### Provides to Other Specs

| Artifact | Used By |
|----------|---------|
| `.github/workflows/ci.yml` | Branch protection (merge gate) |
| `.github/workflows/deploy-fly.yml` | `pilot-host-deployment.plan.md` TASK-003 (replaces manual `fly deploy` from laptop) |
| `.github/workflows/deploy.yml` | AWS prod deploys per `aws-deployment.md` |

### Existing Solutions Consulted

> Per `.cursor/rules/prefer-existing-solutions/RULE.md`: do not reinvent what vendors supply.

- **Fly.io deploy**: use `superfly/flyctl-actions/setup-flyctl@master` + `flyctl deploy --remote-only`. Rejected alternatives: custom Docker build + `flyctl` install script (more surface area, no benefit); `fly` CLI via `run:` without setup action (no auth handling).
- **AWS OIDC**: already using `aws-actions/configure-aws-credentials@v4`. Keep.
- **Concurrency**: native `concurrency:` block in GitHub Actions. Already used correctly in `deploy.yml:13-15`.
- **Reusable CI gate**: GitHub Actions reusable workflows (`workflow_call`) — used so the Fly.io deploy can gate on the same `check` job that protects merges, without duplicating the step list.

---

## Error Codes

CI/CD pipelines do not emit application error codes. Failure surface is the GitHub Actions job status (`success` | `failure` | `cancelled` | `skipped`) plus the step log. No new error codes.

---

## Contract Tests

> These are pipeline-level tests — they verify the YAML + its behavior, not application code. They run as part of CI on changes to `.github/workflows/**`.

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| CICD-001 | `ci.yml` contains all eight steps from FR-CI-003 in order | Parse `ci.yml` steps | Exact match by `name:` |
| CICD-002 | `ci.yml` runs on Node 20 and 22 | Parse `ci.yml` matrix | `[20, 22]` |
| CICD-003 | `deploy-fly.yml` only triggers on `workflow_dispatch` | Parse `deploy-fly.yml` `on:` | Single key `workflow_dispatch` |
| CICD-004 | `deploy-fly.yml` requires all four inputs from FR-FLY-001 | Parse workflow inputs | `{vite_api_base_url, vite_api_key, vite_org_id, fly_app_name}` present; first, second, fourth marked `required: true` |
| CICD-005 | `deploy-fly.yml` `deploy` job has `needs: [check]` (or equivalent reusable-workflow reference) | Parse job graph | Deploy depends on CI gate |
| CICD-006 | `deploy-fly.yml` smoke-test step posts the verbatim payload from § Spec Literals | `rg` job script body against verbatim string | Exact substring match (JSON body and headers) |
| CICD-007 | `deploy-fly.yml` uses `superfly/flyctl-actions/setup-flyctl@master` | Parse `uses:` values | Match |
| CICD-008 | `deploy.yml` (AWS) retains OIDC `permissions: id-token: write, contents: read` | Parse `deploy` job permissions | Both present |
| CICD-009 | `deploy.yml` (AWS) triggers unchanged: `push:main` + `workflow_dispatch` with `stage` input | Parse `on:` | Match current definition |
| CICD-010 | Smoke-test step fails the workflow when `/health` returns non-2xx | Run workflow against a host that returns 503 | Job status `failure` |

> **Test strategy note:** CICD-001…009 are static YAML-shape tests (parse + assert). They run as a single job in `ci.yml` called `workflow-shape`. CICD-010 is an end-to-end test that dispatches the workflow against a stubbed host — run it manually during the Friday bring-up; do not add it to the merge gate (would require a durable test target).

---

## Concrete Values Checklist

> Every normative literal pinned here.

### Wire formats / signed payloads

N/A — no payloads signed by the CI/CD system.

### HTTP behavior — smoke test

Verbatim from `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` § Single Go/No-Go Gate (also mirrored in `.cursor/plans/pilot-host-deployment.plan.md` § Spec Literals):

```bash
curl -sS https://<pilot-host>/health && \
curl -sS -X POST "https://<pilot-host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <pilot_key>" \
  -d '{"signal_id":"dry-run-smoke","org_id":"springs","learner_reference":"stu-10042","source_system":"canvas-lms","event_type":"assessment_completed","occurred_at":"2026-04-18T13:00:00Z","data":{"masteryScore":0.75}}'
```

- `<pilot-host>` resolves to `${fly_app_name}.fly.dev` at workflow runtime.
- `<pilot_key>` resolves to `secrets.PILOT_API_KEY` (GitHub repository secret).
- Both curl invocations use `-sS` (silent but show errors) and rely on non-zero exit to fail the step.
- Success criteria: both commands exit 0; the second command's response body includes `"signal_id":"dry-run-smoke"` (asserted via `jq` or `grep`).

### Cookies

N/A — CI/CD does not set cookies.

### Env vars / inputs (Fly.io deploy workflow)

| Name | Source | Required | Default | Type | Description |
|------|--------|----------|---------|------|-------------|
| `vite_api_base_url` | `workflow_dispatch` input | yes | — | string | Baked into dashboard at `vite build`. Example: `https://8p3p-pilot-springs.fly.dev` |
| `vite_api_key` | `workflow_dispatch` input | yes | — | string | Baked into dashboard. Should match the runtime `API_KEY` set via `fly secrets set`. |
| `vite_org_id` | `workflow_dispatch` input | no | `springs` | string | Baked into dashboard. |
| `fly_app_name` | `workflow_dispatch` input | yes | — | string | Target Fly.io app. Example: `8p3p-pilot-springs`. |
| `FLY_API_TOKEN` | `secrets.FLY_API_TOKEN` | yes | — | string | Fly.io deploy token. Generate via `fly tokens create deploy`. |
| `PILOT_API_KEY` | `secrets.PILOT_API_KEY` | yes | — | string | Passed to smoke-test `x-api-key` header. Matches runtime `API_KEY` on the target app. |

### Env vars / inputs (AWS deploy workflow — existing, unchanged)

| Name | Source | Required | Default | Type | Description |
|------|--------|----------|---------|------|-------------|
| `stage` | `workflow_dispatch` input | no | `prod` | string | Passed to CDK as `STAGE` env var. |
| `AWS_DEPLOY_ROLE_ARN` | `secrets.AWS_DEPLOY_ROLE_ARN` | yes | — | string | OIDC-assumed IAM role. |
| `ADMIN_API_KEY` | `secrets.ADMIN_API_KEY` | yes | — | string | Injected at `cdk deploy` time. |
| `CUSTOM_DOMAIN` | `secrets.CUSTOM_DOMAIN` | yes | — | string | API Gateway custom domain. |
| `HOSTED_ZONE_ID` | `secrets.HOSTED_ZONE_ID` | yes | — | string | Route 53 zone. |
| `HOSTED_ZONE_NAME` | `secrets.HOSTED_ZONE_NAME` | yes | — | string | Route 53 zone name. |
| `CONTRACT_TEST_API_URL` | `secrets.CONTRACT_TEST_API_URL` | no | — | string | Optional. When set, enables post-deploy contract tests. |
| `CONTRACT_TEST_API_KEY` | `secrets.CONTRACT_TEST_API_KEY` | no | — | string | Required when `CONTRACT_TEST_API_URL` is set. |

### Constants / limits

- CI matrix: Node `20`, `22`. No OS matrix (`ubuntu-latest` only).
- Deploy job pins Node `22` (`env.NODE_VERSION: '22'`).
- Concurrency group (AWS): `deploy-${{ github.ref }}`, `cancel-in-progress: false`.
- Concurrency group (Fly.io): `fly-deploy-${{ inputs.fly_app_name }}`, `cancel-in-progress: false`.
- Artifact retention: `retention-days: 1` for the `dist/` artifact passed between AWS deploy jobs (preserved from existing `deploy.yml:70`).
- Smoke-test retry policy: **no retries**. A transient failure at 6:00 PM Friday is a real signal — pivot to Option B per readiness brief rather than mask a flaky deploy.

### Workflows registered

| File | Trigger | Target | Blocks merge? |
|------|---------|--------|---------------|
| `.github/workflows/ci.yml` | `push:**`, `pull_request:**` | — (validation only) | yes |
| `.github/workflows/deploy-fly.yml` | `workflow_dispatch` | Fly.io pilot | no |
| `.github/workflows/deploy.yml` | `push:main`, `workflow_dispatch` | AWS prod | no |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A at CI/CD layer — handled at the application layer per `docs/specs/dashboard-passphrase-gate.md`. CI/CD does not touch Fastify config.
- **CORS**: N/A — pipelines do not serve HTTP traffic.
- **CSP / security headers**: N/A at pipeline layer.
- **Cookie prefix vs Path scoping**: N/A.
- **Content-type parsing**: N/A.
- **Body size limits**: N/A. Smoke-test payload is ~350 bytes, well under Fastify's default 1 MB and the app's `SIGNAL_BODY_LIMIT=1048576`.
- **Secrets scope**: GitHub Actions secrets are repository-scoped. OIDC minimizes long-lived AWS key surface; Fly.io uses a scoped `deploy` token (not a personal access token). Rotate `FLY_API_TOKEN` and `PILOT_API_KEY` if the pilot window extends past the dry run — track in `pilot-host-deployment.plan.md` § Secrets.
- **Rate-limit storage scope**: N/A.
- **Error-code surface**: pipeline failures are visible to repo collaborators via GitHub Actions logs. Logs MUST NOT echo `VITE_API_KEY`, `FLY_API_TOKEN`, `PILOT_API_KEY`, or any AWS secret — GitHub Actions masks registered secrets automatically, but any custom shell script that constructs curl commands MUST use `-H "x-api-key: $PILOT_API_KEY"` (variable substitution happens inside the shell, not in the YAML) rather than `run: |` blocks that echo the token.
- **Horizontal scaling**: N/A — CI/CD jobs are ephemeral GitHub-hosted runners.
- **Build-arg leakage**: `VITE_API_KEY` is baked into the image layer and visible in the built image's JS bundle. This is accepted per readiness-brief guardrail #1 for pilot only and documented in `pilot-host-deployment.plan.md`. Do not treat the Fly.io image as confidential.

---

## Notes

- **Why no per-PR preview environments?** Fly.io review apps are straightforward (`flyctl` supports them), but they add a second Fly.io bill line and a second secret-injection path for every PR. The pilot is small enough that reviewing changes locally plus a single manual `workflow_dispatch` against staging covers the need. Revisit after the pilot.
- **Why no `push:main` auto-deploy to Fly.io for v1?** The readiness brief explicitly forbids deploys after 12:30 PM Saturday. Manual `workflow_dispatch` makes the human gate explicit; an automatic trigger would require adding a "deploy freeze" mechanism, which is out of scope for this week. Add `push:main` in a follow-up once the dry run completes.
- **Coexistence with `aws-deployment.md`**: this spec is additive. Nothing in `deploy.yml` changes. The only AWS-relevant change is documenting the existing triggers as contract obligations (FR-AWS-001..006) so future edits don't silently regress OIDC or break the `test → build → cdk-synth → deploy` gate.
- **Render target**: when `render.yaml` lands (`pilot-host-deployment.plan.md` TASK-004), extend this spec with a parallel `deploy-render.yml` mirroring the Fly.io workflow. Do not generalize the Fly.io workflow prematurely — the two providers diverge on auth model and build-arg injection.

