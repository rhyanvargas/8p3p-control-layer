# CI/CD Pipeline

> Codify the GitHub Actions pipelines that gate merges to `main` and deliver artifacts to hosted environments. **Charter pilot (2026-06):** AWS CDK via [`deploy.yml`](../../.github/workflows/deploy.yml) + Amplify dashboard per [`aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md). Fly.io remains a **fallback** path only.

**Status (2026-06):** Merge gate is implemented in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) as two jobs — `dashboard` (Next.js build, typecheck, Playwright e2e) and `check` (API build, validate, lint, test, cdk:synth), both on **Node 22**. AWS [`deploy.yml`](../../.github/workflows/deploy.yml) is the **recommended** charter-pilot API deploy path (OIDC, no local `cdk deploy`). **`deploy-fly.yml` is not yet in the repo** — Fly API deploy remains manual per [`pilot-host-deployment.md`](../guides/operators/pilot-host-deployment.md). Legacy `VITE_*` dashboard bake-in is **retired**; the API Docker image is API-only.

## Overview

This spec defines three GitHub Actions deploy tracks (CI merge gate is separate):

1. **CI** (implemented): the merge gate. Runs on every push/PR — **`dashboard`** job (Next.js) + **`check`** job (API + CDK synth).
2. **Deploy → Charter pilot (AWS)** (existing, **recommended**): `cdk deploy` via OIDC-assumed role in [`deploy.yml`](../../.github/workflows/deploy.yml). Ops runbook: [`aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md) § 1.2 + § 2.0. Dashboard deploys separately on Amplify (§ 3 of same runbook).
3. **Deploy → Pilot (Fly.io)** (planned, fallback): builds the API-only Docker image from `Dockerfile`, pushes via `flyctl`. Superseded for charter pilot by the AWS path in [`roadmap.md`](../foundation/roadmap.md) § Current Objective.

The AWS and Fly deploy tracks are independent. Do not assume Fly.io is the active pilot path — see [`pilot-charter-onboarding.plan.md`](../../.cursor/plans/pilot-charter-onboarding.plan.md) for the current P0 ops sequence.

This spec does **not** change application behavior. It codifies existing `.github/workflows/ci.yml` + `deploy.yml`. The Fly.io workflow remains planned in [`.cursor/plans/pilot-host-deployment.plan.md`](../../.cursor/plans/pilot-host-deployment.plan.md) for non-AWS fallback only.

---

## Assumptions

> These were inferred from repo state because the clarifying questions were skipped. Overrule any before running `/plan-impl`.

| # | Assumption | Evidence |
|---|------------|----------|
| A1 | CI platform is **GitHub Actions** | `.github/workflows/ci.yml`, `deploy.yml` already present |
| A2 | **Charter pilot** target is **AWS CDK + Amplify** per [`roadmap.md`](../foundation/roadmap.md) and [`aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md). Fly.io remains fallback (`fly.toml`, [`pilot-host-deployment.md`](../guides/operators/pilot-host-deployment.md)) | Active plan: `.cursor/plans/pilot-charter-onboarding.plan.md` |
| A3 | **`STAGE` naming:** charter pilot uses `stage=pilot` via `workflow_dispatch` (default push-to-`main` deploy uses `prod` until changed). No separate staging account required for first pilot. | [`deploy.yml`](../../.github/workflows/deploy.yml) `STAGE` env; runbook § 2.0 |
| A4 | Fly.io deploy triggers: **`workflow_dispatch` only for v1** (manual) | Readiness brief § pre-Saturday schedule: "No code deploys after 12:30 PM". Manual dispatch matches human-controlled release cadence during pilot. Automatic `push:main` can be added later without breaking the contract. |
| A5 | AWS deploy triggers: **unchanged** (`push:main` + `workflow_dispatch`) | `.github/workflows/deploy.yml:3-11` |
| A6 | Node version for CI: **22** (both jobs) | `ci.yml` — `dashboard` and `check` use Node 22 / `.nvmrc` |
| A7 | Post-deploy smoke test for Fly.io is the **verbatim curl** from readiness brief § Single Go/No-Go Gate | `.cursor/plans/pilot-host-deployment.plan.md` § Spec Literals |
| A8 | Dashboard API key is **server-side runtime env** (`CONTROL_LAYER_API_KEY`), not `VITE_*` build args | `docs/specs/nextjs-amplify-dashboard-migration.md`, `Dockerfile` (API-only) |
| A9 | No per-PR preview environments | Out of scope; adds cost + Fly.io review-apps complexity not justified by current pilot scale |

---

## Requirements

### Functional — CI (merge gate)

- [x] FR-CI-001: Run on every `push` to any branch and every `pull_request` to any branch.
- [x] FR-CI-002: **`dashboard` job** on `ubuntu-latest`, Node **22**: `npm ci`, `npm run build`, `npm run typecheck`, Playwright e2e (`dashboard/` working directory).
- [x] FR-CI-003: **`check` job** on `ubuntu-latest`, Node **22**: `npm ci`, `npm run build`, `npm run validate:schemas`, `npm run validate:contracts`, `npm run validate:api`, `npm run lint`, `npm test`, `npm run cdk:synth`.
- [x] FR-CI-004: Use `actions/setup-node@v4` with npm cache (root lockfile for `check`; `dashboard/package-lock.json` for `dashboard`).
- [ ] FR-CI-005: A failing CI run MUST block merge to `main` (branch protection policy — enforced in GitHub settings, not YAML).

### Functional — Deploy → Pilot (Fly.io)

> **Not implemented** — workflow file pending. When added, it deploys the **API-only** image; dashboard is out of scope for this workflow.

- [ ] FR-FLY-001: Trigger: `workflow_dispatch` with inputs `fly_app_name` (string, required). Optional: `control_layer_org_id` for smoke payload only.
- [ ] FR-FLY-002: Before deploy, require green **`check`** job (reuse via `needs:` or reusable workflow).
- [ ] FR-FLY-003: Install `flyctl` via `superfly/flyctl-actions/setup-flyctl@master`.
- [ ] FR-FLY-004: Authenticate to Fly.io using `FLY_API_TOKEN` from GitHub Secrets.
- [ ] FR-FLY-005: Execute `flyctl deploy --remote-only --app <fly_app_name>` (**no** `VITE_*` build args — API Dockerfile only).
- [ ] FR-FLY-006: After deploy success, run the verbatim smoke-test curl from § Spec Literals against `https://<fly_app_name>.fly.dev`.
- [ ] FR-FLY-007: Concurrency: one pilot deploy at a time per `fly_app_name`.
- [ ] FR-FLY-008: Runtime secrets (`API_KEY`, `ADMIN_API_KEY`) are set out-of-band via `fly secrets set`. Dashboard secrets (`CONTROL_LAYER_*`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`) are set on the **dashboard host**, not the API Fly app.

### Functional — Deploy → AWS (CDK via `deploy.yml`)

- [ ] FR-AWS-001: Preserve existing triggers: `push` to `main` and `workflow_dispatch` with `stage` input (`prod` default; use `pilot` for charter pilot per [`aws-pilot-runbook.md`](../guides/operators/aws-pilot-runbook.md) § 2.0).
- [ ] FR-AWS-002: Preserve existing job graph: `test → build → cdk-synth → deploy`. No functional change.
- [ ] FR-AWS-003: Authenticate via OIDC using `aws-actions/configure-aws-credentials@v4` and `secrets.AWS_DEPLOY_ROLE_ARN`. No long-lived AWS keys in repository secrets.
- [ ] FR-AWS-004: Pass deploy-time env vars: `ADMIN_API_KEY`, `API_KEY_ORG_ID`, `CUSTOM_DOMAIN`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME` from repository secrets.
- [ ] FR-AWS-005: Post-deploy contract tests run only when `secrets.CONTRACT_TEST_API_URL` is set (preserves existing conditional behavior).
- [ ] FR-AWS-006: Concurrency: `group: deploy-${{ github.ref }}`, `cancel-in-progress: false`.

### Acceptance Criteria

- Given a PR to `main`, when CI runs, then the **`dashboard`** and **`check`** jobs execute on Node 22, and merge is blocked if either job fails.
- Given a `workflow_dispatch` on the Fly.io workflow with valid inputs and a passing CI, when `flyctl deploy` succeeds, then the smoke-test curl against `https://<fly_app_name>.fly.dev/health` returns 200 and the POST `/v1/signals` returns 200/202 and the workflow concludes `success`. If either HTTP call fails, the workflow concludes `failure`.
- Given a push to `main`, when the AWS deploy workflow runs, then `cdk deploy --require-approval never` completes without prompting and the optional post-deploy contract tests run if `CONTRACT_TEST_API_URL` is configured.
- Given two concurrent dispatches targeting the same `fly_app_name`, when the second starts, then it queues behind the first (no in-flight cancellation).

---

## Constraints

- **Image registry**: Fly.io manages the registry for API deploys. Dashboard artifacts are built in CI (`dashboard` job) and deployed separately (Amplify / other Next host).
- **Dashboard credentials**: `CONTROL_LAYER_API_KEY` is runtime env on the dashboard host, never a Docker build arg. Rotating the API key requires updating both Fly `API_KEY` and dashboard `CONTROL_LAYER_API_KEY`.
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
| `docs/guides/operators/pilot-host-deployment.md` § Secrets (fly secrets set reference) | `pilot-host-deployment.plan.md` TASK-005 | **GAP** — pending in referenced plan |

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
| CICD-002 | `ci.yml` runs API gate on Node 22 | Parse `check` job | Node `22` or `node-version-file: .nvmrc` |
| CICD-002b | `ci.yml` has `dashboard` job with build + e2e | Parse `dashboard` job steps | `npm run build`, `npm run test:e2e` present |
| CICD-003 | `deploy-fly.yml` only triggers on `workflow_dispatch` | Parse `deploy-fly.yml` `on:` | **GAP** — file not committed yet |
| CICD-004 | `deploy-fly.yml` requires `fly_app_name` input | Parse workflow inputs | **GAP** — no `vite_*` inputs when implemented |
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

### Env vars / inputs (Fly.io deploy workflow — planned)

| Name | Source | Required | Default | Type | Description |
|------|--------|----------|---------|------|-------------|
| `fly_app_name` | `workflow_dispatch` input | yes | — | string | Target Fly.io API app. Example: `8p3p-pilot-springs`. |
| `FLY_API_TOKEN` | `secrets.FLY_API_TOKEN` | yes | — | string | Fly.io deploy token. |
| `PILOT_API_KEY` | `secrets.PILOT_API_KEY` | yes | — | string | Passed to smoke-test `x-api-key` header. Matches runtime `API_KEY` on the target app. |

Dashboard deploy workflow (Amplify or other) is a **separate** spec/workflow with `CONTROL_LAYER_*` runtime env — not part of `deploy-fly.yml`.

### Env vars / inputs (AWS deploy workflow — existing, unchanged)

| Name | Source | Required | Default | Type | Description |
|------|--------|----------|---------|------|-------------|
| `stage` | `workflow_dispatch` input | no | `prod` | string | Passed to CDK as `STAGE` env var. |
| `AWS_DEPLOY_ROLE_ARN` | `secrets.AWS_DEPLOY_ROLE_ARN` | yes | — | string | OIDC-assumed IAM role. |
| `ADMIN_API_KEY` | `secrets.ADMIN_API_KEY` | yes | — | string | Injected at `cdk deploy` time. |
| `API_KEY_ORG_ID` | `secrets.API_KEY_ORG_ID` | yes (single-tenant pilot) | — | string | e.g. `southwest-charter` — Lambda org override. |
| `CUSTOM_DOMAIN` | `secrets.CUSTOM_DOMAIN` | no | — | string | API Gateway custom domain. |
| `HOSTED_ZONE_ID` | `secrets.HOSTED_ZONE_ID` | no | — | string | Route 53 zone. |
| `HOSTED_ZONE_NAME` | `secrets.HOSTED_ZONE_NAME` | no | — | string | Route 53 zone name. |
| `CONTRACT_TEST_API_URL` | `secrets.CONTRACT_TEST_API_URL` | no | — | string | Optional. When set, enables post-deploy contract tests. |
| `CONTRACT_TEST_API_KEY` | `secrets.CONTRACT_TEST_API_KEY` | no | — | string | Required when `CONTRACT_TEST_API_URL` is set. |

### Constants / limits

- CI matrix: Node **22** only (`ubuntu-latest`). No OS matrix.
- Deploy job pins Node `22` (`env.NODE_VERSION: '22'`).
- Concurrency group (AWS): `deploy-${{ github.ref }}`, `cancel-in-progress: false`.
- Concurrency group (Fly.io): `fly-deploy-${{ inputs.fly_app_name }}`, `cancel-in-progress: false`.
- Artifact retention: `retention-days: 1` for the `dist/` artifact passed between AWS deploy jobs (preserved from existing `deploy.yml:70`).
- Smoke-test retry policy: **no retries**. A transient failure at 6:00 PM Friday is a real signal — pivot to Option B per readiness brief rather than mask a flaky deploy.

### Workflows registered

| File | Trigger | Target | Blocks merge? |
|------|---------|--------|---------------|
| `.github/workflows/ci.yml` | `push:**`, `pull_request:**` | — (validation only) | yes |
| `.github/workflows/deploy-fly.yml` | `workflow_dispatch` (planned) | Fly.io API | no |
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
- **Error-code surface**: pipeline logs MUST NOT echo `CONTROL_LAYER_API_KEY`, `FLY_API_TOKEN`, `PILOT_API_KEY`, or AWS secrets.
- **Build-arg leakage**: N/A for dashboard — API image contains no client API key. Dashboard secrets stay on the Next.js host runtime env.

---

## Notes

- **Why no per-PR preview environments?** Fly.io review apps are straightforward (`flyctl` supports them), but they add a second Fly.io bill line and a second secret-injection path for every PR. The pilot is small enough that reviewing changes locally plus a single manual `workflow_dispatch` against staging covers the need. Revisit after the pilot.
- **Why no `push:main` auto-deploy to Fly.io for v1?** The readiness brief explicitly forbids deploys after 12:30 PM Saturday. Manual `workflow_dispatch` makes the human gate explicit; an automatic trigger would require adding a "deploy freeze" mechanism, which is out of scope for this week. Add `push:main` in a follow-up once the dry run completes.
- **Coexistence with `aws-deployment.md`**: this spec is additive. Nothing in `deploy.yml` changes. The only AWS-relevant change is documenting the existing triggers as contract obligations (FR-AWS-001..006) so future edits don't silently regress OIDC or break the `test → build → cdk-synth → deploy` gate.
- **Render target**: when `render.yaml` lands (`pilot-host-deployment.plan.md` TASK-004), extend this spec with a parallel `deploy-render.yml` mirroring the Fly.io workflow. Do not generalize the Fly.io workflow prematurely — the two providers diverge on auth model and build-arg injection.

