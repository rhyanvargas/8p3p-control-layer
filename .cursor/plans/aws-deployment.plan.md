---
name: AWS Deployment
overview: Deploy the 8P3P Control Layer to AWS with API Gateway (REST), arm64 Node.js 22 Lambdas, on-demand DynamoDB, and CDK—without changing business logic. Requires Fastify handler-core extraction, DynamoDB repository adapters, Lambda entrypoints, parameterized contract tests against API_BASE_URL, then custom domain and CI/CD.
todos:
  - id: TASK-001
    content: Extract ingestion handler-core (framework-agnostic)
    status: pending
  - id: TASK-002
    content: Extract query-path handler cores (signal log, decisions, receipts)
    status: pending
  - id: TASK-003
    content: Extract inspection handler cores
    status: pending
  - id: TASK-004
    content: Bootstrap infra/ CDK project (bin, cdk.json, tsconfig, package)
    status: pending
  - id: TASK-005
    content: CDK — DynamoDB tables and GSIs
    status: pending
  - id: TASK-006
    content: CDK — API Gateway, usage plan, Lambdas, routes, unauthenticated /health and /docs
    status: pending
  - id: TASK-007
    content: Implement DynamoDB adapters for five repositories
    status: pending
  - id: TASK-008
    content: Wire PoliciesTable and FieldMappingsTable reads (policy-loader, tenant mappings)
    status: pending
  - id: TASK-009
    content: Lambda handlers, bundling, and repository init
    status: pending
  - id: TASK-010
    content: Unit tests for Lambda handler exports
    status: pending
  - id: TASK-011
    content: Parameterize contract tests (API_BASE_URL, API key)
    status: pending
  - id: TASK-012
    content: cdk synth validation and npm scripts
    status: pending
  - id: TASK-013
    content: Admin handler cores, AdminFunction, and admin routes (policy + mappings)
    status: pending
  - id: TASK-014
    content: Custom domain (ACM, Route 53, API mapping)
    status: pending
  - id: TASK-015
    content: GitHub Actions deploy workflow
    status: pending
  - id: TASK-016
    content: Post-deploy contract run and gateway 403 verification
    status: pending
isProject: false
---

# AWS Deployment

**Spec**: `docs/specs/aws-deployment.md`

## Prerequisites

Before starting implementation:

- **PREREQ-001** Repository interfaces and SQLite adapters are in place for Decision, State, Signal Log, Idempotency, Ingestion Log (per spec Prerequisites table — already complete in repo).
- **PREREQ-002** AWS account with CLI credentials configured for the target account/region (`us-east-1` per spec).
- **PREREQ-003** Align dependent specs before full admin/policies behavior in Lambda: `docs/specs/tenant-provisioning.md`, `docs/specs/policy-storage.md`, `docs/specs/policy-management-api.md`, `docs/specs/tenant-field-mappings.md` (spec flags some as pending; AdminFunction and table shapes depend on these).
- **PREREQ-004** Local dev remains valid: `npm run dev` continues to use SQLite and existing Fastify server unchanged in behavior after refactors.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Extract ingestion handler-core (framework-agnostic)

- **Files**: `src/ingestion/handler.ts`, `src/ingestion/handler-core.ts` (create), `src/ingestion/routes.ts` (modify if needed)
- **Action**: Modify | Create
- **Details**: Move validation + orchestration into `handler-core.ts` returning a plain result type (`statusCode`, body, headers as needed). Keep `handler.ts` as a thin Fastify wrapper calling the core. No behavior change; same responses as today.
- **Depends on**: none
- **Verification**: Existing ingestion contract tests (`tests/contracts/signal-ingestion.test.ts`, SIG-API-*) pass unchanged.

### TASK-002: Extract query-path handler cores (signal log, decisions, receipts)

- **Files**: `src/signalLog/handler.ts`, `src/signalLog/handler-core.ts`, `src/decision/handler.ts`, `src/decision/handler-core.ts` (and related route files as needed)
- **Action**: Modify | Create
- **Details**: Same pattern as TASK-001 for GET query handlers used by API Gateway routes (`GET /v1/signals`, `GET /v1/decisions`, `GET /v1/receipts`).
- **Depends on**: TASK-001
- **Verification**: `tests/contracts/signal-log.test.ts`, `tests/contracts/output-api.test.ts`, `tests/contracts/receipts-api.test.ts` pass.

### TASK-003: Extract inspection handler cores

- **Files**: Under `src/` for inspection/state list/ingestion routes (e.g. `src/state/`, `src/ingestion/` or inspection module — match existing layout)
- **Action**: Modify | Create
- **Details**: Extract framework-agnostic cores for `GET /v1/state`, `GET /v1/state/list`, `GET /v1/ingestion`, and policy inspection endpoints if present in server routes.
- **Depends on**: TASK-002
- **Verification**: `tests/contracts/inspection-api.test.ts` (INSP-*) passes.

### TASK-004: Bootstrap infra/ CDK project (bin, cdk.json, tsconfig, package)

- **Files**: `infra/bin/control-layer.ts`, `infra/lib/control-layer-stack.ts` (stub), `infra/cdk.json`, `infra/tsconfig.json`, `infra/package.json`, root `package.json` scripts (optional convenience)
- **Action**: Create
- **Details**: TypeScript CDK v2 app; entry instantiates stack with stage prop; separate tsconfig from app. Add `aws-cdk-lib`, `constructs` dependencies in `infra/package.json`.
- **Depends on**: none (can parallelize with TASK-001–003)
- **Verification**: `cd infra && npm ci && npx cdk synth` produces a CloudFormation template without errors (stack can be minimal until TASK-005–006 fill it).

### TASK-005: CDK — DynamoDB tables and GSIs

- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: On-demand billing; partition/sort keys and GSIs per `docs/specs/aws-deployment.md` (signals + `gsi1-learner-time`, state, decisions + `gsi1-learner-time`, policies, field mappings). Add **idempotency** table (or explicit design doc if folded into another table with conditional writes). Add **ingestion log** table. Add **tenant/API key** storage as required by `docs/specs/tenant-provisioning.md` if application resolves org from key in Lambda (API Gateway keys alone may not replace tenant table — follow tenant spec).
- **Depends on**: TASK-004
- **Verification**: `cdk synth`; table definitions match spec snippets and cross-specs (policy-storage, tenant-field-mappings).

### TASK-006: CDK — API Gateway, usage plan, Lambdas, routes, unauthenticated /health and /docs

- **Files**: `infra/lib/control-layer-stack.ts`, possibly `infra/lib/*-construct.ts` if split
- **Action**: Modify
- **Details**: REST API; `apiKeySourceType: HEADER`; usage plan with throttle limits per spec; **defaultMethodOptions.apiKeyRequired: true** for `/v1/`*. Wire four Lambdas (Ingest, Query, Inspect, Admin) with Node.js 22, arm64, env vars for table names, IAM grants (ingest read/write where needed; query/inspect read-mostly; admin write to policies/mappings). Map routes per spec table. `**/health` and `/docs` must not require API key**: implement via separate integrations (e.g. minimal Lambda for health; docs Lambda or static hosting pattern — spec requires behavior, not a specific AWS feature).
- **Depends on**: TASK-005
- **Verification**: `cdk synth`; resource graph includes API, usage plan, keys association pattern, four functions, and explicit route key requirements for public paths.

### TASK-007: Implement DynamoDB adapters for five repositories

- **Files**: `src/decision/dynamodb-repository.ts`, `src/state/dynamodb-repository.ts`, `src/signalLog/dynamodb-repository.ts`, `src/ingestion/dynamodb-repository.ts` (idempotency) or dedicated file per repo interface, `src/ingestion/dynamodb-ingestion-log-repository.ts` (or equivalent next to ingestion log store)
- **Action**: Create | Modify
- **Details**: Implement repository interfaces already used by SQLite adapters; handle `TransactWriteItems`, `ConditionExpression` for optimistic locking, pagination tokens (`ExclusiveStartKey`), composite key encoding per spec table “DynamoDB-Specific Concerns”.
- **Depends on**: TASK-005 (table names/props stable enough for env wiring)
- **Verification**: New unit tests against DynamoDB Local or mocked DocumentClient; existing unit tests for SQLite unchanged; typecheck passes.

### TASK-008: Wire PoliciesTable and FieldMappingsTable reads (policy-loader, tenant mappings)

- **Files**: `src/decision/policy-loader.ts`, `src/config/tenant-field-mappings.ts` (or equivalents), possibly new small DynamoDB helper modules
- **Action**: Modify | Create
- **Details**: Follow `docs/specs/policy-storage.md` (DynamoDB ahead of filesystem, status field, cache/TTL) and `docs/specs/tenant-field-mappings.md` for runtime reads in Lambda. Ingest Lambda needs read access to policies + field mappings tables per stack snippet in aws-deployment spec.
- **Depends on**: TASK-007
- **Verification**: Contract tests that touch policies/mappings still pass locally; decision engine tests unaffected or updated per policy-storage spec.

### TASK-009: Lambda handlers, bundling, and repository init

- **Files**: `src/lambda/ingest.ts`, `src/lambda/query.ts`, `src/lambda/inspect.ts`, `src/lambda/admin.ts`, build config (esbuild or `tsc` + copy), CDK `NodejsFunction` or `lambda.Code.fromAsset` pointing at built output
- **Action**: Create | Modify
- **Details**: Parse `APIGatewayProxyEvent`, call handler-cores from TASK-001–003 and TASK-013 for admin, initialize DynamoDB clients and `set*Repository` / store singletons once per execution context (module-level `init()` pattern in spec). Return API Gateway-compatible responses. Handler paths should match CDK expectations (e.g. `dist/lambda/ingest.handler` after build).
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-007, TASK-008; **TASK-013** for `admin.ts` behavior
- **Verification**: Deploy to a dev stage or invoke locally with synthetic API GW event; smoke test POST/GET paths.

### TASK-010: Unit tests for Lambda handler exports

- **Files**: `tests/unit/lambda-*.test.ts` (or under `tests/unit/lambda/`)
- **Action**: Create
- **Details**: Minimal tests: mock DocumentClient or use stub repositories; assert handlers return correct status/body shape for one happy path per function. Covers new public `handler` exports.
- **Depends on**: TASK-009
- **Verification**: `npm run test:unit` includes these tests and passes.

### TASK-011: Parameterize contract tests (API_BASE_URL, API key)

- **Files**: `tests/contracts/**/*.test.ts`, shared helper e.g. `tests/helpers/http-client.ts` or `tests/contracts/test-app.ts`, `vitest.config.ts` if needed, `.env.example` or docs only if user allows
- **Action**: Modify | Create
- **Details**: Today contracts use in-process Fastify `inject`. Add mode: when `API_BASE_URL` is set, use `fetch` to the remote/base URL with `x-api-key` from env (`API_KEY` or dedicated `CONTRACT_TEST_API_KEY`). When unset, keep current inject behavior for fast local runs. Ensure no hardcoded `localhost:3000` in contract assertions for the HTTP path.
- **Depends on**: TASK-001, TASK-002, TASK-003 (cores stable)
- **Verification**: Local default: `npm run test:contracts` passes with no env. Document command for remote: `API_BASE_URL=https://... API_KEY=... npm run test:contracts`.

### TASK-012: cdk synth validation and npm scripts

- **Files**: `package.json` (root and/or `infra/package.json`), `.github/workflows/*.yml` (optional tie-in)
- **Action**: Modify
- **Details**: Add script e.g. `npm run cdk:synth` from repo root or `infra`; run `cdk synth` in CI as a gate before deploy job. Align with spec “single command deploy” story (`cd infra && npx cdk deploy`).
- **Depends on**: TASK-006
- **Verification**: Synth succeeds in clean checkout; documented in README only if user requests doc updates.

### TASK-013: Admin handler cores, AdminFunction, and admin routes (policy + mappings)

- **Files**: `src/` admin route modules per `docs/specs/policy-management-api.md`, `src/lambda/admin.ts`, `infra/lib/control-layer-stack.ts` (admin routes + `ADMIN_API_KEY` or equivalent), `src/server.ts` (register admin under `/v1` with separate auth if spec requires)
- **Action**: Create | Modify
- **Details**: Implement admin HTTP semantics from policy-management-api; separate from pilot API key where spec says `ADMIN_API_KEY`. CDK wires Admin Lambda to `PUT/PATCH/DELETE` policies and mapping endpoints. If spec not finalized, gate this task behind PREREQ-003 and still reserve IAM/table writes in stack to avoid rework.
- **Depends on**: TASK-003, TASK-005, TASK-007, TASK-008; **policy-management-api.md** stable enough to implement
- **Verification**: Contract or integration tests for admin endpoints; `cdk synth` includes Admin routes.

### TASK-014: Custom domain (ACM, Route 53, API mapping)

- **Files**: `infra/lib/control-layer-stack.ts` (DomainName, BasePathMapping), optional stage parameters for `api-dev.8p3p.dev` vs `api.8p3p.dev`
- **Action**: Modify
- **Details**: Per spec Custom Domain Strategy; certificate DNS validation; early provisioning (propagation delay).
- **Depends on**: TASK-006
- **Verification**: HTTPS hits custom domain reach API; `curl` health check succeeds.

### TASK-015: GitHub Actions deploy workflow

- **Files**: `.github/workflows/deploy.yml` (create)
- **Action**: Create
- **Details**: Pipeline from spec: test job (`npm ci && npm test`), deploy job with `aws-actions/configure-aws-credentials`, `npm run build`, `cd infra && npm ci && npx cdk deploy --require-approval never`. Protect branch and OIDC/secrets per org standards.
- **Depends on**: TASK-012, TASK-006
- **Verification**: Workflow file validates (YAML); dry-run or test deploy to dev account.

### TASK-016: Post-deploy contract run and gateway 403 verification

- **Files**: `tests/integration/` or `tests/contracts/` for gateway-specific test, CI docs
- **Action**: Create | Modify
- **Details**: After deploy: run `API_BASE_URL=... npm test` (or `test:contracts`) and achieve **all contract tests passing** per spec. Add explicit test that `**GET` or `POST` `/v1/...` without `x-api-key` returns 403** from API Gateway (not application JSON), matching acceptance criteria.
- **Depends on**: TASK-011, TASK-009, TASK-014 (optional for 403 test on real stage), TASK-015 optional
- **Verification**: AWS-DEPLOY-CT-004 and AWS-DEPLOY-CT-005 rows below satisfied in a real or staging account.

## Files Summary

### To Create


| File                                                                                                                                                            | Task         | Purpose                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| `src/ingestion/handler-core.ts`                                                                                                                                 | TASK-001     | Framework-agnostic ingest logic |
| `src/signalLog/handler-core.ts`, `src/decision/handler-core.ts`                                                                                                 | TASK-002     | Query path cores                |
| Inspection `*handler-core.ts` (paths TBD)                                                                                                                       | TASK-003     | Inspection path cores           |
| `infra/bin/control-layer.ts`, `infra/lib/control-layer-stack.ts`, `infra/cdk.json`, `infra/package.json`, `infra/tsconfig.json`                                 | TASK-004–006 | CDK app and stack               |
| `src/decision/dynamodb-repository.ts`, `src/state/dynamodb-repository.ts`, `src/signalLog/dynamodb-repository.ts`, idempotency + ingestion log DynamoDB modules | TASK-007     | AWS persistence adapters        |
| `src/lambda/ingest.ts`, `query.ts`, `inspect.ts`, `admin.ts`                                                                                                    | TASK-009     | Lambda entrypoints              |
| `tests/unit/lambda-*.test.ts`                                                                                                                                   | TASK-010     | Handler smoke tests             |
| `tests/helpers/` (or similar) for shared HTTP client                                                                                                            | TASK-011     | Remote contract support         |
| `.github/workflows/deploy.yml`                                                                                                                                  | TASK-015     | CI/CD deploy                    |


### To Modify


| File                                                          | Task                   | Changes                              |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------ |
| `src/ingestion/handler.ts`, route files                       | TASK-001               | Thin Fastify wrappers                |
| `src/signalLog/handler.ts`, `src/decision/handler.ts`, routes | TASK-002               | Same pattern                         |
| Inspection/state route handlers                               | TASK-003               | Same pattern                         |
| `src/decision/policy-loader.ts`, tenant mapping module        | TASK-008               | DynamoDB read path                   |
| `src/server.ts`                                               | TASK-013               | Register admin routes if not present |
| `package.json`, `vitest` config                               | TASK-011, TASK-012     | Scripts and test setup               |
| `infra/lib/control-layer-stack.ts`                            | TASK-005–006, TASK-014 | Tables, API, domain                  |


## Test Plan

The spec’s **Contract Tests as Deployment Guard** section does not assign numeric IDs; the following IDs map **1:1** to its three implementation bullets plus full-suite and gateway acceptance.


| Test ID            | Type           | Description                                                                      | Task     |
| ------------------ | -------------- | -------------------------------------------------------------------------------- | -------- |
| AWS-DEPLOY-CT-001  | contract infra | Test setup reads `API_BASE_URL` to choose inject vs HTTP client                  | TASK-011 |
| AWS-DEPLOY-CT-002  | contract infra | Contract tests use configurable base URL (no hardcoded localhost in remote path) | TASK-011 |
| AWS-DEPLOY-CT-003  | contract infra | Remote runs send `x-api-key` from environment                                    | TASK-011 |
| AWS-DEPLOY-CT-004  | contract       | Full contract suite passes against deployed API (`API_BASE_URL` + key)           | TASK-016 |
| AWS-DEPLOY-CT-005  | integration    | `/v1/`* without API key returns **403 at API Gateway** before Lambda             | TASK-016 |
| AWS-DEPLOY-IAC-001 | unit/CI        | `cdk synth` succeeds; infra matches spec (no console-only steps)                 | TASK-012 |
| AWS-DEPLOY-UT-001  | unit           | Lambda `handler` exports handle minimal API GW events                            | TASK-010 |


> **Coverage note**: Existing contract IDs (e.g. SIG-API-*, INSP-*, SIGLOG-*, OUT-API-*, RCPT-API-*, DEC-*) remain authoritative for **behavior**; when AWS-DEPLOY-CT-001–003 are satisfied, that full catalog must pass under both local inject and remote HTTP modes.

## Risks


| Risk                                               | Impact | Mitigation                                                                                                                                               |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract tests tightly coupled to Fastify `inject` | High   | TASK-011 introduces a dual transport layer; refactor incrementally per package.                                                                          |
| Admin and policy specs still evolving              | Medium | TASK-013 gated on `policy-management-api.md`; reserve CDK routes/IAM early in TASK-006.                                                                  |
| `/docs` and `/inspect` static UX on API Gateway    | Medium | Spec requires unauthenticated `/docs` on deploy; use dedicated Lambda or edge hosting—avoid blocking pilot on full Swagger parity if scope is clarified. |
| DynamoDB key design drift vs SQLite semantics      | High   | Lock keys/GSIs to aws-deployment + policy-storage + tenant-field-mappings specs; add adapter unit tests with Local.                                      |
| Cold start / bundle size                           | Medium | arm64 + tree-shake Lambda bundle; measure p99 after TASK-016 (spec target: cold start under 1s).                                                         |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Matches spec requirements in `docs/specs/aws-deployment.md` (Functional, Acceptance, Success Criteria)

## Implementation Order

```
TASK-004 ─────────────────────────────┐
                                      ├──► TASK-005 → TASK-006 → TASK-012 / TASK-014 / TASK-015
TASK-001 → TASK-002 → TASK-003 ───────┤
                                      │
                    TASK-007 → TASK-008 ──► TASK-009 ──► TASK-010
                                      │           ▲
                                      └──► TASK-013 (admin) ─┘
TASK-011 (parallel after TASK-003) ─────────────────────────► TASK-016
TASK-012, TASK-014, TASK-015 feed TASK-016 when deploying
```

## Next Steps

- Review task ordering against team capacity (handler extraction before Lambda is critical path).
- Run `/implement-spec .cursor/plans/aws-deployment.plan.md` when ready to execute.

