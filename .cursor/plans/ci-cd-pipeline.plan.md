---
name: CI/CD Pipeline
overview: |
  Codify the three GitHub Actions pipelines that gate merges and deliver artifacts: (1) CI as the merge gate, adjusted to run the existing eight-step contract on a Node 20/22 matrix and exposed as a reusable workflow via `workflow_call`; (2) a new `deploy-fly.yml` that gates on CI, installs `superfly/flyctl-actions/setup-flyctl@master`, runs `flyctl deploy --remote-only` with the three `VITE_*` build-args, and verifies `/health` + `POST /v1/signals` using the verbatim smoke-test curl from the readiness brief; (3) the existing AWS `deploy.yml` preserved unchanged, with its shape (OIDC permissions, `test → build → cdk-synth → deploy` graph, `push:main` + `workflow_dispatch` triggers) pinned by new static YAML-shape contract tests. All nine static tests (CICD-001…009) run inside a dedicated `workflow-shape` job in `ci.yml`; CICD-010 (non-2xx smoke failure) stays a manual dispatch per spec § Contract Tests test-strategy note. No application behavior changes. Fly.io secrets (`API_KEY`, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`) stay out-of-band via `fly secrets set`; the workflow only reads `FLY_API_TOKEN` and `PILOT_API_KEY` from GitHub Actions secrets.
todos:
  - id: "TASK-001"
    content: Convert ci.yml to Node 20/22 matrix and expose workflow_call trigger (keep the 8-step order unchanged)
    status: "pending"
  - id: "TASK-002"
    content: Add workflow-shape job to ci.yml that runs the static YAML-shape contract tests
    status: "pending"
  - id: "TASK-003"
    content: Add npm script test:workflows in package.json
    status: "pending"
  - id: "TASK-004"
    content: Implement tests/contracts/cicd-pipeline.test.ts covering CICD-001…009
    status: "pending"
  - id: "TASK-005"
    content: Create .github/workflows/deploy-fly.yml with workflow_dispatch inputs, reusable CI gate, flyctl remote-only deploy, and verbatim smoke-test
    status: "pending"
  - id: "TASK-006"
    content: Verify .github/workflows/deploy.yml is unchanged and document the shape obligations it must preserve
    status: "pending"
  - id: "TASK-007"
    content: Document CICD-010 manual bring-up procedure (non-2xx smoke failure assertion) in docs/guides/operators/pilot-host-deployment.md
    status: "pending"
isProject: false
---

# CI/CD Pipeline

**Spec**: `docs/specs/ci-cd-pipeline.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Concrete Values Checklist — HTTP behavior — smoke test

```bash
curl -sS https://<pilot-host>/health && \
curl -sS -X POST "https://<pilot-host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <pilot_key>" \
  -d '{"signal_id":"dry-run-smoke","org_id":"springs","learner_reference":"stu-10042","source_system":"canvas-lms","event_type":"assessment_completed","occurred_at":"2026-04-18T13:00:00Z","data":{"masteryScore":0.75}}'
```

Prose normative rules attached to the curl block (spec § Concrete Values Checklist):

- `<pilot-host>` resolves to `${fly_app_name}.fly.dev` at workflow runtime.
- `<pilot_key>` resolves to `secrets.PILOT_API_KEY` (GitHub repository secret).
- Both curl invocations use `-sS` (silent but show errors) and rely on non-zero exit to fail the step.
- Success criteria: both commands exit 0; the second command's response body includes `"signal_id":"dry-run-smoke"` (asserted via `jq` or `grep`).

### From spec § Concrete Values Checklist — Env vars / inputs (Fly.io deploy workflow)

```
| Name | Source | Required | Default | Type | Description |
|------|--------|----------|---------|------|-------------|
| vite_api_base_url | workflow_dispatch input | yes | —        | string | Baked into dashboard at `vite build`. Example: https://8p3p-pilot-springs.fly.dev |
| vite_api_key      | workflow_dispatch input | yes | —        | string | Baked into dashboard. Should match the runtime API_KEY set via `fly secrets set`. |
| vite_org_id       | workflow_dispatch input | no  | springs  | string | Baked into dashboard. |
| fly_app_name      | workflow_dispatch input | yes | —        | string | Target Fly.io app. Example: 8p3p-pilot-springs. |
| FLY_API_TOKEN     | secrets.FLY_API_TOKEN   | yes | —        | string | Fly.io deploy token. Generate via `fly tokens create deploy`. |
| PILOT_API_KEY     | secrets.PILOT_API_KEY   | yes | —        | string | Passed to smoke-test x-api-key header. Matches runtime API_KEY on the target app. |
```

### From spec § Concrete Values Checklist — Env vars / inputs (AWS deploy workflow — existing, unchanged)

```
| Name | Source | Required | Default | Type |
|------|--------|----------|---------|------|
| stage                   | workflow_dispatch input        | no  | prod | string |
| AWS_DEPLOY_ROLE_ARN     | secrets.AWS_DEPLOY_ROLE_ARN    | yes | —    | string |
| ADMIN_API_KEY           | secrets.ADMIN_API_KEY          | yes | —    | string |
| CUSTOM_DOMAIN           | secrets.CUSTOM_DOMAIN          | yes | —    | string |
| HOSTED_ZONE_ID          | secrets.HOSTED_ZONE_ID         | yes | —    | string |
| HOSTED_ZONE_NAME        | secrets.HOSTED_ZONE_NAME       | yes | —    | string |
| CONTRACT_TEST_API_URL   | secrets.CONTRACT_TEST_API_URL  | no  | —    | string |
| CONTRACT_TEST_API_KEY   | secrets.CONTRACT_TEST_API_KEY  | no  | —    | string |
```

### From spec § Concrete Values Checklist — Constants / limits

```
- CI matrix: Node 20, 22. No OS matrix (ubuntu-latest only).
- Deploy job pins Node 22 (env.NODE_VERSION: '22').
- Concurrency group (AWS): deploy-${{ github.ref }}, cancel-in-progress: false.
- Concurrency group (Fly.io): fly-deploy-${{ inputs.fly_app_name }}, cancel-in-progress: false.
- Artifact retention: retention-days: 1 for the dist/ artifact passed between AWS deploy jobs.
- Smoke-test retry policy: no retries.
```

### From spec § Concrete Values Checklist — Workflows registered

```
| File                                  | Trigger                              | Target        | Blocks merge? |
|---------------------------------------|--------------------------------------|---------------|---------------|
| .github/workflows/ci.yml              | push:**, pull_request:**             | — (validate)  | yes           |
| .github/workflows/deploy-fly.yml      | workflow_dispatch                    | Fly.io pilot  | no            |
| .github/workflows/deploy.yml          | push:main, workflow_dispatch         | AWS prod      | no            |
```

### From spec § Requirements — FR-CI-003 (eight-step order)

```
npm ci
npm run build
npm run validate:schemas
npm run validate:contracts
npm run validate:api
npm run lint
npm test
npm run cdk:synth
```

### From spec § Contract Tests — test strategy note

```
CICD-001…009 are static YAML-shape tests (parse + assert). They run as a single
job in ci.yml called `workflow-shape`. CICD-010 is an end-to-end test that
dispatches the workflow against a stubbed host — run it manually during the
Friday bring-up; do not add it to the merge gate (would require a durable test
target).
```

## Prerequisites

Before starting implementation:
- [ ] PREREQ-001 `FLY_API_TOKEN` created via `fly tokens create deploy` and stored as a GitHub repository secret (documented in `docs/guides/operators/pilot-host-deployment.md` per `pilot-host-deployment.plan.md` TASK-005 — already `completed`).
- [ ] PREREQ-002 `PILOT_API_KEY` stored as a GitHub repository secret, matching the runtime `API_KEY` set via `fly secrets set` on the target app.
- [ ] PREREQ-003 `yaml@^2.8.2` is available in `devDependencies` (already present per `package.json:75`) so the shape tests can parse workflow files without a new dependency.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Convert `ci.yml` to Node 20/22 matrix and expose `workflow_call`
- **Files**: `.github/workflows/ci.yml`
- **Action**: Modify
- **Details**:
  - Add a third trigger alongside the existing `push:` / `pull_request:` — `workflow_call:` with no inputs — so `deploy-fly.yml` can reuse this workflow via `uses: ./.github/workflows/ci.yml` (satisfies FR-FLY-002 and the CICD-005 reusable-workflow path).
  - Replace the current single-node `check` job with a matrix job keyed on `strategy.matrix.node: [20, 22]`, `runs-on: ubuntu-latest`, `node-version: ${{ matrix.node }}` in `actions/setup-node@v4` with `cache: npm` (FR-CI-002, FR-CI-004).
  - Preserve the **existing eight-step order verbatim** as listed in § Spec Literals — "From spec § Requirements — FR-CI-003 (eight-step order)". Do not rename steps or reorder; CICD-001 parses `ci.yml` for exact `name:` matches.
  - Remove `node-version-file: ".nvmrc"` since the matrix now drives the Node version. The `.nvmrc` file stays (local dev / `deploy.yml`'s non-matrix pin remains independent at `env.NODE_VERSION: '22'`).
- **Depends on**: none
- **Verification**:
  - `rg "node: \[20, 22\]" .github/workflows/ci.yml` returns a match.
  - `rg "workflow_call:" .github/workflows/ci.yml` returns a match.
  - Pushing the branch triggers two CI runs visible in Actions tab (one per Node version), each executing all eight steps.

### TASK-002: Add `workflow-shape` job to `ci.yml`
- **Files**: `.github/workflows/ci.yml`
- **Action**: Modify
- **Details**:
  - Append a second job `workflow-shape` at the top level (peer of `check`, not `needs:` dependent — static parsing is independent of Node matrix build).
  - `runs-on: ubuntu-latest`, single Node 22 `actions/setup-node@v4`.
  - Steps: `checkout` → `setup-node 22 (cache npm)` → `npm ci` → `npm run test:workflows`.
  - Name aligns with the spec § Contract Tests test-strategy note verbatim: `workflow-shape`.
- **Depends on**: TASK-001
- **Verification**:
  - `rg "^  workflow-shape:" .github/workflows/ci.yml` returns a match.
  - Job runs in CI and invokes `npm run test:workflows`.

### TASK-003: Add `test:workflows` npm script
- **Files**: `package.json`
- **Action**: Modify
- **Details**:
  - Add `"test:workflows": "vitest run tests/contracts/cicd-pipeline.test.ts"` to `scripts`.
  - Keep script above `cdk:*` entries to group with the other `test:*` scripts for readability.
  - Do not add it to the `check` aggregate script — the `workflow-shape` job is the single runner per spec.
- **Depends on**: none
- **Verification**:
  - `npm run test:workflows` runs the new suite locally.
  - `jq '.scripts["test:workflows"]' package.json` returns the exact command.

### TASK-004: Implement `tests/contracts/cicd-pipeline.test.ts`
- **Files**: `tests/contracts/cicd-pipeline.test.ts`
- **Action**: Create
- **Details**:
  - Parse `.github/workflows/ci.yml`, `.github/workflows/deploy-fly.yml`, `.github/workflows/deploy.yml` with `yaml` (already in devDeps — no new dep per `.cursor/rules/prefer-existing-solutions/RULE.md`).
  - Implement assertions:
    - **CICD-001**: `ci.yml.jobs.check.steps[*].name` (filtered to steps with `run:` starting with `npm`) equals the eight-step list verbatim from § Spec Literals — "From spec § Requirements — FR-CI-003 (eight-step order)".
    - **CICD-002**: `ci.yml.jobs.check.strategy.matrix.node` deep-equals `[20, 22]`.
    - **CICD-003**: `deploy-fly.yml.on` has exactly one key `workflow_dispatch`.
    - **CICD-004**: `deploy-fly.yml.on.workflow_dispatch.inputs` contains keys `vite_api_base_url`, `vite_api_key`, `vite_org_id`, `fly_app_name`; `vite_api_base_url`, `vite_api_key`, `fly_app_name` have `required: true`; `vite_org_id` has `default: "springs"` (matches § Spec Literals — Env vars / inputs (Fly.io deploy workflow)).
    - **CICD-005**: `deploy-fly.yml.jobs.deploy.needs` includes either `check` or a `call-ci` alias whose job uses `./.github/workflows/ci.yml`.
    - **CICD-006**: The deploy-fly smoke-test `run:` block contains, as an exact substring, the verbatim curl body and headers from § Spec Literals — "From spec § Concrete Values Checklist — HTTP behavior — smoke test". Assert on the JSON body `{"signal_id":"dry-run-smoke",...,"data":{"masteryScore":0.75}}` and `-H "content-type: application/json"` / `-H "x-api-key: $PILOT_API_KEY"` headers.
    - **CICD-007**: At least one step in `deploy-fly.yml.jobs.deploy.steps[*].uses` equals `superfly/flyctl-actions/setup-flyctl@master`.
    - **CICD-008**: `deploy.yml.jobs.deploy.permissions` has both `id-token: write` and `contents: read`.
    - **CICD-009**: `deploy.yml.on` has keys `push` (with `branches: [main]`) and `workflow_dispatch` (with an input `stage` whose default is `prod`).
  - Use `describe('CI/CD pipeline shape', ...)` with one `it(...)` per test ID so failures map 1:1 to the CICD-00x number.
  - Read workflow files via `fs.readFileSync(path.join(process.cwd(), '.github/workflows/<file>.yml'), 'utf8')`.
- **Depends on**: TASK-003
- **Verification**:
  - `npm run test:workflows` passes with all nine tests green after TASK-005 lands (CICD-003…007 will fail until `deploy-fly.yml` exists — this is intentional; sequence TASK-005 before merge).
  - `rg -n "CICD-00" tests/contracts/cicd-pipeline.test.ts` lists nine matches.

### TASK-005: Create `.github/workflows/deploy-fly.yml`
- **Files**: `.github/workflows/deploy-fly.yml`
- **Action**: Create
- **Details**:
  - `name: Deploy → Pilot (Fly.io)`.
  - Triggers: `on.workflow_dispatch.inputs` with the four inputs verbatim from § Spec Literals — Env vars / inputs (Fly.io deploy workflow): `vite_api_base_url` (required), `vite_api_key` (required), `vite_org_id` (default `springs`), `fly_app_name` (required). No `push:` or `pull_request:` triggers (FR-FLY-001, CICD-003, Assumption A4).
  - Top-level `concurrency`: `group: fly-deploy-${{ inputs.fly_app_name }}`, `cancel-in-progress: false` (FR-FLY-007, § Spec Literals — Constants / limits).
  - Jobs:
    1. `check:` — `uses: ./.github/workflows/ci.yml` (reusable workflow call from TASK-001). Satisfies FR-FLY-002 + CICD-005.
    2. `deploy:` — `needs: [check]`, `runs-on: ubuntu-latest`, pins Node 22 via `env.NODE_VERSION: '22'` (§ Spec Literals — Constants / limits).
       - Step 1: `actions/checkout@v4`.
       - Step 2: `superfly/flyctl-actions/setup-flyctl@master` (FR-FLY-003, CICD-007; official action per spec § Existing Solutions Consulted).
       - Step 3: `flyctl deploy --remote-only --app "${{ inputs.fly_app_name }}" --build-arg VITE_API_BASE_URL="${{ inputs.vite_api_base_url }}" --build-arg VITE_API_KEY="${{ inputs.vite_api_key }}" --build-arg VITE_ORG_ID="${{ inputs.vite_org_id }}"` with `env.FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}` (FR-FLY-004, FR-FLY-005).
       - Step 4: Smoke-test `run: |` block that quotes the verbatim curl from § Spec Literals — "From spec § Concrete Values Checklist — HTTP behavior — smoke test". Rules:
         - Set `PILOT_HOST="${{ inputs.fly_app_name }}.fly.dev"` at the top of the block, then substitute `<pilot-host>` with `$PILOT_HOST`.
         - Read `PILOT_API_KEY` from `env.PILOT_API_KEY: ${{ secrets.PILOT_API_KEY }}` and substitute `<pilot_key>` with `$PILOT_API_KEY` **inside the shell**, not in the YAML template, so GitHub Actions log masking still works (spec § Production Correctness Notes — Secrets scope).
         - Use `-sS` on both curl calls; use `&&` between them so a non-zero exit from the first fails the step (FR-FLY-006, CICD-010).
         - Pipe the POST response to `grep -q '"signal_id":"dry-run-smoke"'` to assert body content (spec § Concrete Values Checklist — HTTP behavior — smoke test success criteria).
         - Do not wrap the step in `continue-on-error:` — "no retries" per § Spec Literals — Constants / limits.
  - Runtime secrets (`API_KEY`, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`) are **not** read by this workflow — FR-FLY-008. Add a YAML comment at the top of the file stating this rule and linking to `docs/guides/operators/pilot-host-deployment.md § Secrets`.
- **Depends on**: TASK-001
- **Verification**:
  - `npm run test:workflows` passes (CICD-003…007 green).
  - A manual `workflow_dispatch` against the `8p3p-pilot-springs` app completes: CI gate runs, image builds on Fly builders, `/health` returns 200, `POST /v1/signals` returns 2xx with `"signal_id":"dry-run-smoke"` echoed, workflow concludes `success`.
  - Two concurrent dispatches to the same `fly_app_name` — second queues, neither is cancelled (spec § Acceptance Criteria final bullet).

### TASK-006: Verify `deploy.yml` unchanged and pin its shape via tests
- **Files**: `.github/workflows/deploy.yml`
- **Action**: (no edits — verification only)
- **Details**:
  - Confirm `deploy.yml` already satisfies FR-AWS-001 (triggers `push:main` + `workflow_dispatch` with `stage` input default `prod`), FR-AWS-002 (`test → build → cdk-synth → deploy` job graph), FR-AWS-003 (`aws-actions/configure-aws-credentials@v4` + `secrets.AWS_DEPLOY_ROLE_ARN`), FR-AWS-004 (env vars `ADMIN_API_KEY`, `CUSTOM_DOMAIN`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME`), FR-AWS-005 (`if: ${{ secrets.CONTRACT_TEST_API_URL != '' }}` gate on post-deploy tests), FR-AWS-006 (concurrency `deploy-${{ github.ref }}`, `cancel-in-progress: false`).
  - CICD-008 and CICD-009 tests from TASK-004 lock this shape — any future regression breaks CI.
  - No file modifications in this PR.
- **Depends on**: TASK-004
- **Verification**:
  - `git diff origin/main -- .github/workflows/deploy.yml` is empty after the PR is prepared.
  - `npm run test:workflows` passes for CICD-008 and CICD-009.

### TASK-007: Document CICD-010 manual bring-up procedure
- **Files**: `docs/guides/operators/pilot-host-deployment.md`
- **Action**: Modify
- **Details**:
  - Append a short section titled `## CICD-010 — manual smoke-failure assertion (Friday bring-up only)`.
  - Describe the out-of-band procedure for validating that the smoke-test step fails the workflow when `/health` returns non-2xx: (1) temporarily point the Fly.io app at a stub that returns 503 from `/health`, or run the smoke-test block locally against a 503 echo server; (2) confirm `curl -sS` exits non-zero and the step fails; (3) revert.
  - State explicitly that CICD-010 is **not** wired into the merge gate (quotes spec § Contract Tests test-strategy note: "do not add it to the merge gate (would require a durable test target)").
- **Depends on**: TASK-005
- **Verification**:
  - `rg "CICD-010" docs/guides/operators/pilot-host-deployment.md` returns a match.
  - Section appears in the rendered markdown TOC.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `.github/workflows/deploy-fly.yml` | TASK-005 | Fly.io pilot deploy workflow (dispatch-only, gated on CI, verbatim smoke-test) |
| `tests/contracts/cicd-pipeline.test.ts` | TASK-004 | Static YAML-shape contract tests for CICD-001…009 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `.github/workflows/ci.yml` | TASK-001, TASK-002 | Add `workflow_call:` trigger, Node 20/22 matrix, new `workflow-shape` job |
| `package.json` | TASK-003 | Add `scripts.test:workflows` |
| `docs/guides/operators/pilot-host-deployment.md` | TASK-007 | Append CICD-010 manual bring-up section |

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| FR-CI-001: Run on every `push` to any branch and every `pull_request` to any branch. | spec § Requirements — CI | TASK-001 |
| FR-CI-002: Execute in a Node matrix (`20`, `22`) on `ubuntu-latest`. | spec § Requirements — CI | TASK-001 |
| FR-CI-003: Run these steps in order, failing fast: `npm ci`, `npm run build`, `npm run validate:schemas`, `npm run validate:contracts`, `npm run validate:api`, `npm run lint`, `npm test`, `npm run cdk:synth`. | spec § Requirements — CI | TASK-001, TASK-004 (CICD-001) |
| FR-CI-004: Use `actions/setup-node@v4` with `cache: npm` to cache the root lockfile. | spec § Requirements — CI | TASK-001 |
| FR-CI-005: A failing CI run MUST block merge to `main` (branch protection). | spec § Requirements — CI | TASK-001 (contract obligation — enforced in GitHub branch-protection settings, out-of-repo) |
| FR-FLY-001: Trigger: `workflow_dispatch` with inputs `vite_api_base_url` (required), `vite_api_key` (required), `vite_org_id` (default `springs`), `fly_app_name` (required). | spec § Requirements — Fly.io | TASK-005, TASK-004 (CICD-003, CICD-004) |
| FR-FLY-002: Before deploy, run the full CI gate. Deploy MUST NOT execute if CI fails. | spec § Requirements — Fly.io | TASK-001, TASK-005, TASK-004 (CICD-005) |
| FR-FLY-003: Install `flyctl` via `superfly/flyctl-actions/setup-flyctl@master`. | spec § Requirements — Fly.io | TASK-005, TASK-004 (CICD-007) |
| FR-FLY-004: Authenticate using `FLY_API_TOKEN` from GitHub Secrets. | spec § Requirements — Fly.io | TASK-005 |
| FR-FLY-005: Execute `flyctl deploy --remote-only --app <fly_app_name> --build-arg VITE_API_BASE_URL=... --build-arg VITE_API_KEY=... --build-arg VITE_ORG_ID=...`. | spec § Requirements — Fly.io | TASK-005 |
| FR-FLY-006: After `flyctl deploy` succeeds, run the verbatim smoke-test curl against `https://<fly_app_name>.fly.dev`. Fail the job on non-2xx. | spec § Requirements — Fly.io | TASK-005, TASK-004 (CICD-006) |
| FR-FLY-007: Concurrency `fly-deploy-${{ inputs.fly_app_name }}`, `cancel-in-progress: false`. | spec § Requirements — Fly.io | TASK-005 |
| FR-FLY-008: Runtime secrets (`API_KEY`, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`) set out-of-band via `fly secrets set`; workflow MUST NOT read or write them. | spec § Requirements — Fly.io | TASK-005 |
| FR-AWS-001: Preserve existing triggers: `push:main` + `workflow_dispatch` with `stage` default `prod`. | spec § Requirements — AWS | TASK-006, TASK-004 (CICD-009) |
| FR-AWS-002: Preserve `test → build → cdk-synth → deploy` job graph. | spec § Requirements — AWS | TASK-006 |
| FR-AWS-003: Authenticate via OIDC using `aws-actions/configure-aws-credentials@v4` and `secrets.AWS_DEPLOY_ROLE_ARN`. | spec § Requirements — AWS | TASK-006, TASK-004 (CICD-008) |
| FR-AWS-004: Pass `ADMIN_API_KEY`, `CUSTOM_DOMAIN`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME` from repository secrets. | spec § Requirements — AWS | TASK-006 |
| FR-AWS-005: Post-deploy contract tests run only when `secrets.CONTRACT_TEST_API_URL` is set. | spec § Requirements — AWS | TASK-006 |
| FR-AWS-006: Concurrency `deploy-${{ github.ref }}`, `cancel-in-progress: false`. | spec § Requirements — AWS | TASK-006 |
| AC-1: Given a PR to `main`, when CI runs, then all eight steps in FR-CI-003 execute on Node 20 and 22, and merge is blocked if any step fails. | spec § Acceptance Criteria | TASK-001, TASK-004 (CICD-001, CICD-002) |
| AC-2: Given a `workflow_dispatch` on the Fly.io workflow with valid inputs and a passing CI, when `flyctl deploy` succeeds, then the smoke-test curl against `https://<fly_app_name>.fly.dev/health` returns 200 and the POST `/v1/signals` returns 200/202 and the workflow concludes `success`. If either HTTP call fails, the workflow concludes `failure`. | spec § Acceptance Criteria | TASK-005, TASK-004 (CICD-006), TASK-007 (CICD-010 manual) |
| AC-3: Given a push to `main`, when the AWS deploy workflow runs, then `cdk deploy --require-approval never` completes without prompting and the optional post-deploy contract tests run if `CONTRACT_TEST_API_URL` is configured. | spec § Acceptance Criteria | TASK-006 |
| AC-4: Given two concurrent dispatches targeting the same `fly_app_name`, when the second starts, then it queues behind the first (no in-flight cancellation). | spec § Acceptance Criteria | TASK-005 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| CICD-001 | contract (static) | `ci.yml` contains all eight FR-CI-003 steps in exact order (match by `name:`) | TASK-004 |
| CICD-002 | contract (static) | `ci.yml` matrix is `[20, 22]` | TASK-004 |
| CICD-003 | contract (static) | `deploy-fly.yml.on` has exactly one key: `workflow_dispatch` | TASK-004 |
| CICD-004 | contract (static) | `deploy-fly.yml` has the four required inputs with correct `required`/`default` per § Spec Literals | TASK-004 |
| CICD-005 | contract (static) | `deploy-fly.yml.jobs.deploy.needs` includes the CI gate (reusable workflow call) | TASK-004 |
| CICD-006 | contract (static) | `deploy-fly.yml` smoke-test step contains the verbatim curl body + headers from § Spec Literals | TASK-004 |
| CICD-007 | contract (static) | `deploy-fly.yml` uses `superfly/flyctl-actions/setup-flyctl@master` | TASK-004 |
| CICD-008 | contract (static) | `deploy.yml` retains OIDC `permissions: id-token: write, contents: read` | TASK-004 |
| CICD-009 | contract (static) | `deploy.yml` triggers unchanged: `push:main` + `workflow_dispatch` with `stage` input | TASK-004 |
| CICD-010 | e2e (manual) | Smoke-test step fails the workflow when `/health` returns non-2xx | TASK-007 (documented bring-up procedure; not in merge gate per spec § Contract Tests) |

## Deviations from Spec

None — plan is literal-compatible with spec.

All literals used in tasks (`[20, 22]` matrix, `fly-deploy-${{ inputs.fly_app_name }}` concurrency, `deploy-${{ github.ref }}` concurrency, `env.NODE_VERSION: '22'`, `superfly/flyctl-actions/setup-flyctl@master`, `retention-days: 1`, `cancel-in-progress: false`, default `vite_org_id: "springs"`, and the verbatim smoke-test curl body + headers) are copied from spec § Concrete Values Checklist and spec § Spec Literals without modification.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Matrix change to `[20, 22]` doubles CI minutes. | Low | `ubuntu-latest` minutes are cheap for this repo; rolling back to single-node is a one-line change if budget pressure appears. |
| Reusable workflow (`workflow_call`) changes GitHub Actions semantics — forks/PRs may lose the ability to trigger it. | Medium | `workflow_call` on `ci.yml` is additive; existing `push`/`pull_request` triggers still fire for PRs. The reuse path is only invoked from `deploy-fly.yml`, which is `workflow_dispatch`-only and not fork-triggerable. |
| `superfly/flyctl-actions/setup-flyctl@master` pins `master`, not a tag — breaking changes upstream would fail pilot deploys. | Medium | Spec § Dependencies explicitly names `@master` as the official action reference. Reassess after pilot: consider pinning to a commit SHA in a follow-up PR. Tracked as a post-pilot hardening item. |
| Smoke-test uses verbatim curl, including the hardcoded `"signal_id":"dry-run-smoke"` sentinel. A future spec change to that sentinel would require updating both the spec, `pilot-host-deployment.plan.md` § Spec Literals, and this plan. | Low | § Spec Literals in this plan is the single quoted copy; `/review --spec` catches drift. |
| `VITE_API_KEY` is echoed into `flyctl deploy --build-arg` command line and baked into image layers. | Medium (accepted) | Documented in spec § Production Correctness Notes — Build-arg leakage and § Constraints — Dashboard env bake-in; accepted per readiness-brief guardrail #1 for pilot only. GitHub Actions masks registered secrets in logs; `--build-arg` passes via process argv (not `env:`), so rely on shell variable substitution from `env.VITE_API_KEY_INPUT: ${{ inputs.vite_api_key }}` inside the `run:` block rather than inline template expansion. TASK-005 details specify this pattern for the smoke-test; apply the same pattern to the `flyctl deploy` step. |
| `check` job in `deploy-fly.yml` via `uses: ./.github/workflows/ci.yml` runs the full CI matrix before every deploy, adding ~3–5 minutes to each pilot deploy. | Low | Matches spec FR-FLY-002 obligation. If deploy latency becomes an issue, extract only the eight FR-CI-003 steps into a smaller reusable workflow in a follow-up. |
| CICD-010 is not automated, so a regression that stops smoke-test failures from failing the workflow could ship unnoticed. | Medium | TASK-007 documents the manual bring-up. Flag to re-automate once a durable stub host is available (out of scope per spec § Out of Scope). |

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm test` passes (pre-existing suites unaffected)
- [ ] `npm run test:workflows` passes (CICD-001…009 green)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `ci.yml` runs two matrix legs (Node 20 + Node 22), each executes the eight FR-CI-003 steps in order
- [ ] `workflow-shape` job appears in Actions UI alongside `check`
- [ ] Manual `workflow_dispatch` of `deploy-fly.yml` against `8p3p-pilot-springs` succeeds end-to-end (CI gate → flyctl remote build → smoke-test returns 200)
- [ ] `deploy.yml` diff is empty vs. `origin/main`
- [ ] `docs/guides/operators/pilot-host-deployment.md` contains the CICD-010 manual bring-up section
- [ ] Branch protection on `main` requires the `check` matrix checks and the `workflow-shape` check (configured out-of-repo in GitHub Settings)

## Implementation Order

```
TASK-001 ─┬─► TASK-002 ─► TASK-003 ─► TASK-004 ─► TASK-005 ─► TASK-006 ─► TASK-007
          └───────────────────────────────────────► TASK-005
```

TASK-001 (reusable `ci.yml`) unblocks both TASK-002 (workflow-shape job) and TASK-005 (deploy-fly can call it). TASK-004 (the contract tests) is wired before TASK-005 so the tests fail red on the missing `deploy-fly.yml`, then turn green as TASK-005 lands — classic TDD order per `.agents/skills/test-driven-development/SKILL.md`. TASK-006 is a verification pass only. TASK-007 closes out CICD-010.
