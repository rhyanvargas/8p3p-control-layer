---
name: AWS Deployment
overview: |
  Deploy the 8P3P Control Layer to AWS using API Gateway (REST), Lambda (Node.js 22.x arm64), and DynamoDB (on-demand). All four repository interfaces are already extracted; this plan covers: (1) extracting the missing IngestionLogRepository interface, (2) adding AWS SDK v3 dependencies, (3) refactoring all five Fastify-coupled handlers into framework-agnostic cores, (4) implementing five DynamoDB repository adapters, (5) authoring the SAM template (infra/template.yaml), (6) writing three Lambda entry-point handlers, (7) making contract tests parameterizable via API_BASE_URL, (8) deploying and validating with sam deploy, (9) setting up the custom domain, and (10) adding a GitHub Actions CI/CD pipeline. Zero business logic changes.
todos:
  - id: TASK-001
    content: Extract IngestionLogRepository interface
    status: pending
  - id: TASK-002
    content: Add AWS SDK v3 dependencies
    status: pending
  - id: TASK-003
    content: Refactor ingestion handler → handler-core.ts
    status: pending
  - id: TASK-004
    content: Refactor signalLog + decision handlers → handler-core.ts files
    status: pending
  - id: TASK-005
    content: Refactor state + ingestion-log handlers → handler-core.ts files
    status: pending
  - id: TASK-006
    content: "DynamoDB adapter: DynamoDbDecisionRepository"
    status: pending
  - id: TASK-007
    content: "DynamoDB adapter: DynamoDbStateRepository"
    status: pending
  - id: TASK-008
    content: "DynamoDB adapter: DynamoDbSignalLogRepository"
    status: pending
  - id: TASK-009
    content: "DynamoDB adapter: DynamoDbIdempotencyRepository"
    status: pending
  - id: TASK-010
    content: "DynamoDB adapter: DynamoDbIngestionLogRepository"
    status: pending
  - id: TASK-011
    content: SAM template (infra/template.yaml + samconfig.toml + params/)
    status: pending
  - id: TASK-012
    content: "Lambda handler: src/lambda/ingest.ts"
    status: pending
  - id: TASK-013
    content: "Lambda handler: src/lambda/query.ts"
    status: pending
  - id: TASK-014
    content: "Lambda handler: src/lambda/inspect.ts"
    status: pending
  - id: TASK-015
    content: Make contract tests parameterizable with API_BASE_URL
    status: pending
  - id: TASK-016
    content: Deploy to AWS + run contract tests against deployed endpoint
    status: pending
  - id: TASK-017
    content: Custom domain + ACM + Route 53 DNS
    status: pending
  - id: TASK-018
    content: "CI/CD pipeline: .github/workflows/deploy.yml"
    status: pending
isProject: false
---

# AWS Deployment

**Spec**: `docs/specs/aws-deployment.md`

## Prerequisites

Before starting implementation:

- PREREQ-001: `DecisionRepository` interface extracted (`src/decision/repository.ts`)
- PREREQ-002: `StateRepository` interface extracted (`src/state/repository.ts`)
- PREREQ-003: `SignalLogRepository` interface extracted (`src/signalLog/repository.ts`)
- PREREQ-004: `IdempotencyRepository` interface extracted (`src/ingestion/idempotency-repository.ts`)
- PREREQ-005: AWS account with CLI configured and `us-east-1` region set
- PREREQ-006: SAM CLI installed (`brew install aws-sam-cli`)
- PREREQ-007: Route 53 hosted zone for `8p3p.dev` exists (for custom domain — can defer to TASK-017)

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

---

### TASK-001: Extract IngestionLogRepository Interface

- **Files**: `src/ingestion/ingestion-log-repository.ts` *(create)*, `src/ingestion/ingestion-log-store.ts` *(modify)*
- **Action**: Create interface + refactor store to implement it
- **Details**:
  - Create `IngestionLogRepository` interface with methods matching what `ingestion-log-store.ts` currently exports:

```ts
    export interface IngestionLogRepository {
      appendIngestionOutcome(entry: IngestionOutcomeEntry): void;
      getIngestionOutcomes(request: GetIngestionOutcomesRequest): { entries: IngestionOutcome[]; nextCursor: string | null };
      close(): void;
    }
    

```

- Rename the current `ingestion-log-store.ts` class/functions to `SqliteIngestionLogRepository` that implements this interface.
- Export a module-level singleton setter `setIngestionLogRepository` + getter following the pattern used in `src/decision/store.ts` (or equivalent pattern already established for other repos).
- Update `src/ingestion/handler.ts` and `src/ingestion/ingestion-log-handler.ts` to call through the repository interface instead of the store directly.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; `npm test` still passes (no behavior change)

---

### TASK-002: Add AWS SDK v3 Dependencies

- **Files**: `package.json`
- **Action**: Modify
- **Details**:
  - Add `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` (v3 document client) as production dependencies.
  - Add `@types/aws-lambda` as a devDependency — required for `APIGatewayProxyEvent` and `APIGatewayProxyResult` types used in TASK-012–014.
  - Pin to latest stable. Use `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb && npm install -D @types/aws-lambda`.
  - No code changes — just dependency addition to confirm tree-shaking is compatible with `"type": "module"` ESM build.
- **Depends on**: none
- **Verification**: `npm install` completes; `npm run build` succeeds with no new type errors

---

### TASK-003: Refactor Ingestion Handler → handler-core.ts

- **Files**: `src/ingestion/handler-core.ts` *(create)*, `src/ingestion/handler.ts` *(modify)*
- **Action**: Create + Modify
- **Details**:
Extract `handleSignalIngestion` body from the Fastify handler into a framework-agnostic function:

```ts
  // src/ingestion/handler-core.ts
  export interface IngestSignalRequest {
    body: unknown;
    log?: { warn?: (obj: unknown, msg: string) => void };
  }
  export interface IngestSignalResponse {
    statusCode: number;
    body: SignalIngestResult;
  }
  export async function ingestSignalCore(req: IngestSignalRequest): Promise<IngestSignalResponse>
  

```

- All validation, idempotency, state, and decision logic moves to `handler-core.ts`.
- `handler.ts` becomes a thin wrapper: calls `ingestSignalCore({ body: request.body, log: request.log })` then `reply.status(result.statusCode).send(result.body)`.
- No business logic changes — identical behavior, just framework isolation.
- **Depends on**: TASK-001
- **Verification**: `npm test` passes (all existing tests pass unchanged)

---

### TASK-004: Refactor signalLog + Decision Handlers → handler-core.ts

- **Files**:
  - `src/signalLog/handler-core.ts` *(create)*, `src/signalLog/handler.ts` *(modify)*
  - `src/decision/handler-core.ts` *(create)*, `src/decision/handler.ts` *(modify)*
- **Action**: Create + Modify
- **Details**:
For each handler, extract the core logic into a `*-core.ts` file with a plain function signature:

```ts
  // signalLog/handler-core.ts
  export interface QuerySignalsRequest { queryParams: Record<string, unknown> }
  export interface QuerySignalsResponse { statusCode: number; body: SignalLogReadResponse | SignalLogErrorResponse }
  export function querySignalsCore(req: QuerySignalsRequest): QuerySignalsResponse

  // decision/handler-core.ts
  export interface QueryDecisionsRequest { queryParams: Record<string, unknown> }
  export interface QueryDecisionsResponse { statusCode: number; body: GetDecisionsResponse | DecisionErrorResponse }
  export function queryDecisionsCore(req: QueryDecisionsRequest): QueryDecisionsResponse
  

```

- Fastify handlers become thin wrappers that map `request.query` → core request, then `reply.status().send()` the result.
- **Depends on**: TASK-001
- **Verification**: `npm test` passes

---

### TASK-005: Refactor State + Ingestion-Log Handlers → handler-core.ts

- **Files**:
  - `src/state/handler-core.ts` *(create)*, `src/state/handler.ts` *(modify)*
  - `src/ingestion/ingestion-log-handler-core.ts` *(create)*, `src/ingestion/ingestion-log-handler.ts` *(modify)*
- **Action**: Create + Modify
- **Details**:
Same pattern as TASK-004 for the two inspection-path handlers:

```ts
  // state/handler-core.ts
  export function getStateCore(params: Record<string, unknown>): { statusCode: number; body: unknown }
  export function getStateByVersionCore(params: Record<string, unknown>): { statusCode: number; body: unknown }
  export function listLearnersCore(params: Record<string, unknown>): { statusCode: number; body: unknown }

  // ingestion/ingestion-log-handler-core.ts
  export function getIngestionOutcomesCore(params: Record<string, unknown>): { statusCode: number; body: unknown }
  

```

- Fastify handlers delegate to core, forwarding `request.query` as `Record<string, unknown>`.
- **Depends on**: TASK-001
- **Verification**: `npm test` passes

---

### TASK-006: DynamoDB Adapter — DynamoDbDecisionRepository

- **Files**: `src/decision/dynamodb-repository.ts` *(create)*
- **Action**: Create
- **Details**:
Implement `DecisionRepository` interface from `src/decision/repository.ts` using `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient`.
  - Constructor: `(tableName: string, client?: DynamoDBDocumentClient)`
  - `saveDecision`: `PutCommand` with `org_id` (HASH) + `decision_id` (RANGE)
  - `getDecisions`: `QueryCommand` on `org_id`, using `gsi1-learner-time` GSI for time-range queries; cursor maps to `ExclusiveStartKey` (base64-encoded JSON)
  - `getDecisionById`: `GetCommand` with exact keys
  - `close()`: no-op (SDK manages connections)
  - Key mapping: `org_id` + `decision_id` per spec table schema; `learner_decided_at` for GSI sort key
- **Depends on**: TASK-002
- **Verification**: Unit test with `@aws-sdk/client-dynamodb` mock (or DynamoDB Local) — constructor resolves; interface compliance checked by TypeScript

---

### TASK-007: DynamoDB Adapter — DynamoDbStateRepository

- **Files**: `src/state/dynamodb-repository.ts` *(create)*
- **Action**: Create
- **Details**:
Implement `StateRepository` interface from `src/state/repository.ts`.
  - Table key: `org_learner` (HASH, composite `{org_id}#{learner_reference}`) + `state_version` (RANGE)
  - `getState`: `QueryCommand` on `org_learner`, descending, `Limit: 1` → latest version
  - `getStateByVersion`: `GetCommand` with exact `org_learner` + `state_version`
  - `saveState`: `PutCommand`
  - `saveStateWithAppliedSignals`: `TransactWriteCommand` — `PutItem` for state record (sort key `STATE#{state_version}`) + `PutItem` for each applied signal record (sort key `APPLIED#{signal_id}`) in the same `StateTable`. No separate table needed; single-table design keeps the TransactWriteItems within one partition.
  - Optimistic locking: `ConditionExpression: "attribute_not_exists(state_version)"` on state write
  - `isSignalApplied`: `GetCommand` on applied-signals item
  - `recordAppliedSignals`: `TransactWriteCommand` with `ConditionExpression: "attribute_not_exists(signal_id)"` (INSERT OR IGNORE semantic)
  - `close()`: no-op
- **Depends on**: TASK-002
- **Verification**: TypeScript compiles; `StateVersionConflictError` thrown on condition failure; `npm run typecheck` passes

---

### TASK-008: DynamoDB Adapter — DynamoDbSignalLogRepository

- **Files**: `src/signalLog/dynamodb-repository.ts` *(create)*
- **Action**: Create
- **Details**:
Implement `SignalLogRepository` interface from `src/signalLog/repository.ts`.
  - Table key: `org_id` (HASH) + `signal_id` (RANGE)
  - GSI `gsi1-learner-time`: `org_id` (HASH) + `learner_timestamp` (RANGE) for time-range queries
  - `appendSignal`: `PutCommand` — immutable; no UPDATE allowed
  - `querySignals`: `QueryCommand` on `org_id`, with optional learner filter via GSI; cursor maps to `ExclusiveStartKey`
  - `getSignalsByIds`: `BatchGetCommand` on `org_id` + `signal_id[]`; throws `unknown_signal_id` / `signals_not_in_org_scope` per interface contract
  - `close()`: no-op
- **Depends on**: TASK-002
- **Verification**: TypeScript compiles; error contracts match interface spec

---

### TASK-009: DynamoDB Adapter — DynamoDbIdempotencyRepository

- **Files**: `src/ingestion/dynamodb-idempotency-repository.ts` *(create)*
- **Action**: Create
- **Details**:
Implement `IdempotencyRepository` interface from `src/ingestion/idempotency-repository.ts`.
  - Strategy: Use the `SignalsTable` with a conditional write for duplicate detection (or a separate idempotency item in SignalsTable with sort key `IDEMPOTENCY#{signal_id}`).
  - `checkAndStore`: Attempt `PutCommand` with `ConditionExpression: "attribute_not_exists(signal_id)"`.
    - If succeeds: `{ isDuplicate: false }`
    - If `ConditionalCheckFailedException`: fetch existing item to get `received_at`, return `{ isDuplicate: true, receivedAt }`
  - `close()`: no-op
  - This eliminates the need for a separate idempotency table — DynamoDB conditional writes replace the SQLite INSERT OR IGNORE.
- **Depends on**: TASK-002
- **Verification**: TypeScript compiles; conditional write mock verifies duplicate detection path

---

### TASK-010: DynamoDB Adapter — DynamoDbIngestionLogRepository

- **Files**: `src/ingestion/dynamodb-ingestion-log-repository.ts` *(create)*
- **Action**: Create
- **Details**:
Implement `IngestionLogRepository` interface from TASK-001.
  - Table: `IngestionLogTable`; key: `org_id` (HASH) + `received_at#signal_id` (RANGE, composite to ensure uniqueness and sort order)
  - `appendIngestionOutcome`: `PutCommand`
  - `getIngestionOutcomes`: `QueryCommand` on `org_id` descending; optional `outcome` filter via `FilterExpression`; cursor maps to `ExclusiveStartKey`
  - Note: DynamoDB `FilterExpression` does not reduce consumed RCUs — acceptable for pilot volume. Document this trade-off.
  - `close()`: no-op
- **Depends on**: TASK-001, TASK-002
- **Verification**: TypeScript compiles; `npm run typecheck` passes

---

### TASK-011: SAM Template

- **Files**:
  - `infra/template.yaml` *(create)*
  - `infra/samconfig.toml` *(create)*
  - `infra/params/dev.json` *(create)*
  - `infra/params/pilot.json` *(create)*
- **Action**: Create
- **Details**:
`template.yaml` defines:
  - **Parameters**: `Stage`, `DomainName`, `HostedZoneId`, `CertificateArn`
  - **Globals**: `Function.Runtime: nodejs22.x`, `Architectures: [arm64]`, `Timeout: 10`, `MemorySize: 256`
  - **API Gateway**: `AWS::Serverless::Api` with `ApiKeyRequired: true`, usage plan (BurstLimit: 50, RateLimit: 20), custom domain mapping
  - **Lambda Functions** (3): `IngestFunction` (POST /v1/signals), `QueryFunction` (GET /v1/signals + GET /v1/decisions), `InspectFunction` (GET /v1/state + GET /v1/state/list + GET /v1/ingestion)
  - IAM: IngestFunction gets `DynamoDBCrudPolicy` on all 4 tables; Query/Inspect get `DynamoDBReadPolicy`
  - **DynamoDB Tables** (6): `SignalsTable`, `StateTable`, `DecisionsTable`, `IngestionLogTable`, `TenantsTable`, `ApiKeysTable` — all `PAY_PER_REQUEST`, with GSIs per spec schema
  - **Outputs**: `ApiGatewayUrl`, `ApiGatewayId` (needed for custom domain mapping)
  `samconfig.toml` sets default stack name, region (`us-east-1`), S3 bucket for artifacts.
  `params/dev.json` + `params/pilot.json` contain stage-specific overrides (domain, cert ARN).
  `/health` and `/docs` routes must NOT have `ApiKeyRequired: true` (use `Auth: ApiKeyRequired: false` per-route override).
- **Depends on**: TASK-002 (to know runtime/module format)
- **Verification**: `sam validate --template infra/template.yaml` passes; `sam build` succeeds

---

### TASK-012: Lambda Handler — src/lambda/ingest.ts

- **Files**: `src/lambda/ingest.ts` *(create)*
- **Action**: Create
- **Details**:

```ts
  import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
  import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
  import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
  import { setDecisionRepository } from '../decision/store.js';
  import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
  // ... similar for state, signalLog, idempotency, ingestion-log
  import { ingestSignalCore } from '../ingestion/handler-core.js';

  let initialized = false;
  function init() {
    if (initialized) return;
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    setDecisionRepository(new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!, client));
    // ... other repos
    initialized = true;
  }

  export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    init();
    const body = event.body ? JSON.parse(event.body) : {};
    const result = await ingestSignalCore({ body });
    return { statusCode: result.statusCode, body: JSON.stringify(result.body),
             headers: { 'Content-Type': 'application/json' } };
  }
  

```

- org_id extraction: from `event.requestContext.identity` or from the parsed body (per current auth model — API key maps to org_id at Gateway level; inject as header `x-org-id` from usage plan or authorizer context)
- Handle malformed JSON gracefully (return 400)
- **Depends on**: TASK-003, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011
- **Verification**: `sam local invoke IngestFunction --event tests/fixtures/ingest-event.json` returns 200 with accepted status

---

### TASK-013: Lambda Handler — src/lambda/query.ts

- **Files**: `src/lambda/query.ts` *(create)*
- **Action**: Create
- **Details**:
Handles `GET /v1/signals` and `GET /v1/decisions` by routing on `event.path`:

```ts
  export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    init();
    const params = { ...event.queryStringParameters, org_id: event.headers['x-org-id'] } as Record<string, unknown>;
    if (event.path.endsWith('/signals')) {
      const result = querySignalsCore({ queryParams: params });
      return { statusCode: result.statusCode, body: JSON.stringify(result.body), ... };
    }
    if (event.path.endsWith('/decisions')) {
      const result = queryDecisionsCore({ queryParams: params });
      return { statusCode: result.statusCode, body: JSON.stringify(result.body), ... };
    }
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }
  

```

- **Depends on**: TASK-004, TASK-006, TASK-008, TASK-011
- **Verification**: `sam local invoke QueryFunction --event tests/fixtures/query-signals-event.json` returns correct signal log page

---

### TASK-014: Lambda Handler — src/lambda/inspect.ts

- **Files**: `src/lambda/inspect.ts` *(create)*
- **Action**: Create
- **Details**:
Handles `GET /v1/state`, `GET /v1/state/list`, `GET /v1/ingestion` by routing on `event.path`:
  - Delegates to `getStateCore`, `listLearnersCore`, `getIngestionOutcomesCore` from TASK-005
  - Same pattern as TASK-013: `init()` → route on path → call core → return Gateway result
- **Depends on**: TASK-005, TASK-007, TASK-010, TASK-011
- **Verification**: `sam local invoke InspectFunction --event tests/fixtures/inspect-state-event.json` returns correct state

---

### TASK-015: Make Contract Tests Parameterizable via API_BASE_URL

- **Files**: `tests/` (integration test setup files) *(modify)*
- **Action**: Modify
- **Details**:
  - Identify where test base URL is hardcoded (likely `http://localhost:3000` in integration test helpers or vitest setup).
  - Replace with `process.env.API_BASE_URL ?? 'http://localhost:3000'`.
  - For deployed testing, also inject API key: `process.env.TEST_API_KEY` → added as `x-api-key` header in all `/v1/`* test requests.
  - No test logic changes — only URL + header injection in the test HTTP client setup.
  - Add to README / `docs/guides/` instructions:

```bash
    API_BASE_URL=https://api.8p3p.dev TEST_API_KEY=<key> npm test
    

```

- **Depends on**: none (can run in parallel with TASK-011)
- **Verification**: `npm test` still passes locally (falls back to localhost); `API_BASE_URL=http://localhost:3000 npm test` also passes

---

### TASK-016: Deploy to AWS + Run Contract Tests Against Deployed Endpoint

- **Files**: none (operational task)
- **Action**: Execute
- **Details**:

```bash
  npm run build
  sam build
  sam deploy --guided   # first time; saves samconfig.toml
  # Then:
  API_BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/dev \
  TEST_API_KEY=<provisioned-key> npm test
  

```

- Create a test API key in API Gateway and associate with the usage plan.
- Verify all 462+ contract tests pass against the deployed endpoint.
- Check cold start < 1s via CloudWatch Lambda logs.
- Verify 403 is returned without `x-api-key` header on any `/v1/*` route.
- **Depends on**: TASK-011, TASK-012, TASK-013, TASK-014, TASK-015
- **Verification**: All contract tests pass; CloudWatch shows cold start < 1000ms; 403 confirmed without key

---

### TASK-017: Custom Domain + ACM + Route 53 DNS

- **Files**: `infra/template.yaml` *(modify)* — confirm domain parameters wired
- **Action**: Modify + Execute
- **Details**:
  - ACM certificate: request `api.8p3p.dev` in `us-east-1` (required for API Gateway edge-optimized; confirm REST API regional vs. edge choice).
  - Validate certificate via Route 53 DNS validation (automatic if hosted zone is in same account).
  - Update `infra/params/dev.json` with `DomainName: "8p3p.dev"`, `HostedZoneId: <id>`, `CertificateArn: <arn>`.
  - `sam deploy` applies the `AWS::ApiGateway::DomainName` + `AWS::Route53::RecordSet` resources.
  - Dev: `api-dev.8p3p.dev` → dev stack; Pilot: `api.8p3p.dev` → pilot stack.
  - DNS propagation: allow up to 48h; test with `curl https://api-dev.8p3p.dev/health`.
- **Depends on**: TASK-016
- **Verification**: `curl https://api-dev.8p3p.dev/health` returns 200; `curl https://api-dev.8p3p.dev/v1/signals` without key returns 403

---

### TASK-018: CI/CD Pipeline — .github/workflows/deploy.yml

- **Files**: `.github/workflows/deploy.yml` *(create)*
- **Action**: Create
- **Details**:

```yaml
  on:
    push:
      branches: [main]
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '22' }
        - run: npm ci && npm test
    deploy:
      needs: test
      runs-on: ubuntu-latest
      permissions:
        id-token: write   # OIDC for keyless AWS auth
        contents: read
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '22' }
        - uses: aws-actions/setup-sam@v2
        - uses: aws-actions/configure-aws-credentials@v4
          with:
            role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
            aws-region: us-east-1
        - run: npm ci && npm run build
        - run: sam build && sam deploy --no-confirm-changeset --parameter-overrides Stage=dev
  

```

- Use OIDC (keyless) AWS auth — no long-lived credentials in secrets.
- Deploy gate: tests must pass before deploy job runs.
- Add `AWS_DEPLOY_ROLE_ARN` to GitHub repo secrets.
- **Depends on**: TASK-016, TASK-017
- **Verification**: Push to `main` triggers workflow; all jobs pass; stack updates visible in CloudFormation console

---

## Files Summary

### To Create


| File                                                 | Task     | Purpose                                   |
| ---------------------------------------------------- | -------- | ----------------------------------------- |
| `src/ingestion/ingestion-log-repository.ts`          | TASK-001 | IngestionLogRepository interface          |
| `src/ingestion/handler-core.ts`                      | TASK-003 | Framework-agnostic ingest logic           |
| `src/signalLog/handler-core.ts`                      | TASK-004 | Framework-agnostic signal log query       |
| `src/decision/handler-core.ts`                       | TASK-004 | Framework-agnostic decision query         |
| `src/state/handler-core.ts`                          | TASK-005 | Framework-agnostic state inspection       |
| `src/ingestion/ingestion-log-handler-core.ts`        | TASK-005 | Framework-agnostic ingestion log query    |
| `src/decision/dynamodb-repository.ts`                | TASK-006 | DynamoDbDecisionRepository                |
| `src/state/dynamodb-repository.ts`                   | TASK-007 | DynamoDbStateRepository                   |
| `src/signalLog/dynamodb-repository.ts`               | TASK-008 | DynamoDbSignalLogRepository               |
| `src/ingestion/dynamodb-idempotency-repository.ts`   | TASK-009 | DynamoDbIdempotencyRepository             |
| `src/ingestion/dynamodb-ingestion-log-repository.ts` | TASK-010 | DynamoDbIngestionLogRepository            |
| `infra/template.yaml`                                | TASK-011 | SAM template (API GW + Lambda + DynamoDB) |
| `infra/samconfig.toml`                               | TASK-011 | SAM deploy configuration                  |
| `infra/params/dev.json`                              | TASK-011 | Dev stage parameters                      |
| `infra/params/pilot.json`                            | TASK-011 | Pilot stage parameters                    |
| `src/lambda/ingest.ts`                               | TASK-012 | Lambda: POST /v1/signals                  |
| `src/lambda/query.ts`                                | TASK-013 | Lambda: GET /v1/signals + /v1/decisions   |
| `src/lambda/inspect.ts`                              | TASK-014 | Lambda: GET /v1/state + /v1/ingestion     |
| `.github/workflows/deploy.yml`                       | TASK-018 | CI/CD pipeline                            |


### To Modify


| File                                     | Task     | Changes                                                                 |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `src/ingestion/ingestion-log-store.ts`   | TASK-001 | Rename to SqliteIngestionLogRepository; implement interface; add setter |
| `src/ingestion/handler.ts`               | TASK-003 | Thin Fastify wrapper delegating to handler-core.ts                      |
| `src/signalLog/handler.ts`               | TASK-004 | Thin Fastify wrapper                                                    |
| `src/decision/handler.ts`                | TASK-004 | Thin Fastify wrapper                                                    |
| `src/state/handler.ts`                   | TASK-005 | Thin Fastify wrapper                                                    |
| `src/ingestion/ingestion-log-handler.ts` | TASK-005 | Thin Fastify wrapper                                                    |
| `package.json`                           | TASK-002 | Add @aws-sdk/client-dynamodb + @aws-sdk/lib-dynamodb                    |
| `tests/` (integration setup)             | TASK-015 | API_BASE_URL + TEST_API_KEY env var injection                           |


---

## Test Plan


| Test ID       | Type       | Description                                                                                               | Task                         |
| ------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC-DEPLOY-001 | acceptance | `POST /v1/signals` via API GW + Lambda returns same response as local                                     | TASK-016                     |
| AC-DEPLOY-002 | acceptance | `GET /v1/`* without `x-api-key` returns 403 before Lambda invoked                                         | TASK-016                     |
| AC-DEPLOY-003 | acceptance | All 462+ contract tests pass against deployed URL (`API_BASE_URL=...`)                                    | TASK-015, TASK-016           |
| AC-DEPLOY-004 | acceptance | `sam deploy` creates all DynamoDB tables, Lambda functions, and API GW routes without manual intervention | TASK-011, TASK-016           |
| AC-DOMAIN-001 | acceptance | `https://api-dev.8p3p.dev/health` returns 200                                                             | TASK-017                     |
| AC-DOMAIN-002 | acceptance | `https://api-dev.8p3p.dev/v1/signals` without key returns 403                                             | TASK-017                     |
| AC-CICD-001   | acceptance | Push to `main` triggers test + deploy; deploy blocked if tests fail                                       | TASK-018                     |
| UNIT-REPO-001 | unit       | DynamoDbDecisionRepository implements interface; TypeScript compiles                                      | TASK-006                     |
| UNIT-REPO-002 | unit       | DynamoDbStateRepository: conditional write throws StateVersionConflictError                               | TASK-007                     |
| UNIT-REPO-003 | unit       | DynamoDbSignalLogRepository: getSignalsByIds throws on cross-org IDs                                      | TASK-008                     |
| UNIT-REPO-004 | unit       | DynamoDbIdempotencyRepository: ConditionalCheckFailedException → isDuplicate=true                         | TASK-009                     |
| UNIT-REPO-005 | unit       | DynamoDbIngestionLogRepository: appendIngestionOutcome stores all fields                                  | TASK-010                     |
| REFACTOR-001  | regression | All existing tests pass unchanged after handler refactoring (TASK-003–005)                                | TASK-003, TASK-004, TASK-005 |


---

## Risks


| Risk                                                                           | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DynamoDB TransactWriteItems 25-item limit                                      | Medium | `saveStateWithAppliedSignals` — signal batches are small (1 signal per request); document limit                                                                                                                                                                                                                                                                                                    |
| DynamoDB FilterExpression doesn't reduce RCU (outcome filter on ingestion log) | Low    | Acceptable at pilot volume; document trade-off; add GSI on `outcome` if needed at scale                                                                                                                                                                                                                                                                                                            |
| Lambda cold start > 1s with full AWS SDK import                                | Medium | Use ESM tree-shaking; import only needed SDK clients; `arm64` + 256MB keeps cold starts < 500ms                                                                                                                                                                                                                                                                                                    |
| Fastify handler refactoring breaks existing tests                              | High   | Refactor is pure extraction (no logic change); run `npm test` after each TASK-003/004/005 before continuing                                                                                                                                                                                                                                                                                        |
| API Gateway REST API domain requires edge-optimized ACM cert in us-east-1      | Low    | Template already targets us-east-1; cert must be in same region                                                                                                                                                                                                                                                                                                                                    |
| SAM local invoke requires DynamoDB Local for adapter testing                   | Medium | Use `docker run -p 8000:8000 amazon/dynamodb-local` for local integration tests before deploy                                                                                                                                                                                                                                                                                                      |
| org_id extraction in Lambda context (API key → org_id mapping)                 | High   | **Resolved**: IngestFunction reads `org_id` from POST body (already in signal envelope). QueryFunction/InspectFunction read `org_id` from query params. API key → org_id enforcement is deferred to tenant-provisioning.md Phase 2 — Phase 1 trusts `org_id` in the request, mirroring local Fastify behavior. If `API_KEY_ORG_ID` env override is needed, add it as a Lambda env var in TASK-011. |


---

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- `sam validate` passes
- `sam build` completes without errors
- `sam deploy` creates stack without errors
- All 462+ contract tests pass against deployed endpoint
- `/health` returns 200 without API key
- `/v1/`* returns 403 without API key
- Cold start < 1s (CloudWatch Logs)
- Local dev unchanged (`npm run dev` uses SQLite)
- Matches spec requirements (`docs/specs/aws-deployment.md`)

---

## Implementation Order

```
TASK-001 (IngestionLogRepository interface)
TASK-002 (AWS SDK deps)
      │
      ├──→ TASK-003 (ingest handler-core)
      │         │
      ├──→ TASK-004 (query handler-cores)
      │         │
      ├──→ TASK-005 (inspect handler-cores)
      │         │
      ├──→ TASK-006 (DynamoDB Decision)
      ├──→ TASK-007 (DynamoDB State)     ← TASK-011 (SAM template, parallel)
      ├──→ TASK-008 (DynamoDB SignalLog)
      ├──→ TASK-009 (DynamoDB Idempotency)
      └──→ TASK-010 (DynamoDB IngestionLog)
                │
                ▼
         TASK-012 (λ ingest)  TASK-015 (test parameterize, parallel)
         TASK-013 (λ query)
         TASK-014 (λ inspect)
                │
                ▼
         TASK-016 (deploy + contract tests)
                │
                ▼
         TASK-017 (custom domain)
                │
                ▼
         TASK-018 (CI/CD)
```

---

*Plan created: 2026-03-01 | Spec: `docs/specs/aws-deployment.md`*