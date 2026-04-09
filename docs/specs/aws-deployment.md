# AWS Deployment Specification

> Phase 2 infrastructure: deploy the 8P3P Control Layer to AWS using API Gateway, Lambda, and DynamoDB with infrastructure-as-code.

## Overview

Deploy the existing control-layer pipeline (signals → state → decisions) to AWS with zero business logic changes. Serverless-only services (API Gateway + Lambda + DynamoDB) keep costs near-zero during development and scale automatically under pilot load.

**Key principle:** The deployed system must pass the same contract tests that pass locally (462+ as of v1). If the tests pass, the deployment is correct. All four repository interfaces (Decision, State, Signal Log, Idempotency) are already extracted; DynamoDB adapters can slot in mechanically. See `.cursor/plans/` for completed extraction plans.

**Budget context:** Serverless-only architecture targeting minimal monthly spend during development and pilot. See Cost Estimate table below for per-service pricing (all public AWS rates). Internal budget targets are documented in `internal-docs/foundation/roadmap.md`.

---

## Architecture

```
                     ┌─────────────────────────────┐
                     │      Route 53 (DNS)          │
                     │   api.8p3p.dev (custom domain)│
                     └──────────┬──────────────────┘
                                │
                     ┌──────────▼──────────────────┐
                     │     API Gateway (REST)       │
                     │  • Usage Plans + API Keys    │
                     │  • Throttling / Rate Limits  │
                     │  • Request Validation        │
                     │  • Custom Domain Mapping     │
                     └──────────┬──────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
     ┌────────────────┐ ┌──────────────┐ ┌────────────────┐
     │ Lambda: Ingest │ │ Lambda: Query│ │ Lambda: Inspect│
     │ POST /v1/signals│ │ GET /v1/signals│ │ GET /v1/state   │
     │                │ │ GET /v1/decisions│ │ GET /v1/ingestion│
     └───────┬────────┘ └──────┬───────┘ └───────┬────────┘
             │                 │                  │
             ▼                 ▼                  ▼
     ┌─────────────────────────────────────────────────────┐
     │                    DynamoDB                          │
     │  signals │ learner_state │ decisions │ ingestion_log │
     │  tenants │ api_keys │ policies │ field_mappings      │
     └─────────────────────────────────────────────────────┘
```

### Service Map

| Component | AWS Service | Pricing | Justification |
|-----------|-------------|---------|---------------|
| API routing | API Gateway (REST API) | $3.50/million requests | Built-in API key validation, usage plans, throttling. REST API (not HTTP API) required for usage plans. |
| Compute | Lambda (Node.js 22.x) | $0.20/million invocations + duration | Zero cost at idle. Cold start < 500ms with ESM bundling. |
| Signal Log | DynamoDB (on-demand) | $1.25/million writes, $0.25/million reads | Pay-per-use, zero idle cost. Append-only access pattern maps cleanly to DynamoDB. |
| STATE Store | DynamoDB (on-demand) | Same | Versioned items, optimistic locking via condition expressions. |
| Decision Store | DynamoDB (on-demand) | Same | Append-only decisions with GSI for time-range queries. |
| Ingestion Log | DynamoDB (on-demand) | Same | New table for inspection API outcomes. |
| Tenant/Key Store | DynamoDB (on-demand) | Same | Tenant metadata and API key → org_id mapping. See `docs/specs/tenant-provisioning.md`. |
| Policies Store | DynamoDB (on-demand) | Same | Policy definitions with status field. See `docs/specs/policy-storage.md`. |
| Field Mappings Store | DynamoDB (on-demand) | Same | Per-tenant computed transforms for raw LMS payload → canonical fields. See `docs/specs/tenant-field-mappings.md`. |
| DNS | Route 53 | $0.50/hosted zone | Custom domain for pilot customers. |
| TLS | ACM | Free | Auto-renewed certificates for custom domain. |

### Cost Estimate (Pilot Phase)

| Scenario | Monthly Requests | Estimated Cost |
|----------|-----------------|----------------|
| Development (solo dev) | < 10K | < $1 |
| Single pilot customer | 50K–500K | $2–$15 |
| 3 pilot customers | 150K–1.5M | $5–$40 |

All estimates assume on-demand DynamoDB pricing, no provisioned capacity, and Lambda arm64.

---

## Prerequisites

| Prerequisite | Source | Status |
|-------------|--------|--------|
| DecisionRepository interface + SQLite adapter | `src/decision/repository.ts`, `src/decision/store.ts` | **Complete** — `.cursor/plans/` (Decision Store extraction done in v1) |
| StateRepository interface + SQLite adapter | `docs/specs/state-engine.md` §Phase 2, `src/state/repository.ts`, `src/state/store.ts` | **Complete** — `.cursor/plans/state-repository-extraction.plan.md` |
| SignalLogRepository interface + SQLite adapter | `docs/specs/signal-log.md` DEF-SIGLOG-001, `src/signalLog/repository.ts`, `src/signalLog/store.ts` | **Complete** — `.cursor/plans/signal-log-repository-extraction.plan.md` |
| IdempotencyRepository interface + SQLite adapter | `src/ingestion/idempotency.ts` (or equivalent), repository interface | **Complete** — `.cursor/plans/idempotency-repository-extraction.plan.md` |
| Ingestion Log (queryable) | `docs/specs/inspection-api.md` §1, `src/inspection/` or equivalent | **Complete** — implemented in v1 |
| AWS account with CLI configured | — | Manual prerequisite |

All four repository interfaces are extracted; the next step is implementing DynamoDB adapters and the CDK stack.

---

## Infrastructure as Code

### Tool Choice: AWS CDK

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| AWS CDK | TypeScript-native (same language as the codebase), composable constructs, full programming-language flexibility for growing infra (PoliciesTable, FieldMappingsTable, AdminFunction, future services) | Heavier initial setup than SAM | **Selected** |
| AWS SAM | Simple YAML template, `sam local` for testing | Insufficient flexibility for policy management API, admin endpoints, and DynamoDB-backed config tables; growing infra complexity exceeds YAML ergonomics | Deferred |
| Serverless Framework | Popular, many plugins | Vendor lock-in to SLS Inc., v4 license changes | Rejected |
| Terraform | Multi-cloud, mature | HCL learning curve, no local invoke | Rejected |

CDK is the right fit for v1.1: the infrastructure now includes multiple DynamoDB tables (PoliciesTable, FieldMappingsTable), an admin Lambda function, and tenant provisioning — complexity that benefits from TypeScript constructs, IDE autocomplete, and programmatic composition. Local testing uses `cdk synth` + DynamoDB Local.

### CDK Project Structure

```
infra/
├── bin/
│   └── control-layer.ts          # CDK app entry point
├── lib/
│   └── control-layer-stack.ts    # Main stack (API Gateway, Lambdas, DynamoDB)
├── cdk.json                      # CDK configuration
└── tsconfig.json                 # CDK TypeScript config (separate from app)
```

### CDK Stack: Key Resources

#### API Gateway

```typescript
const api = new apigateway.RestApi(this, 'ControlLayerApi', {
  restApiName: '8p3p-control-layer',
  deployOptions: { stageName: props.stage },
  apiKeySourceType: apigateway.ApiKeySourceType.HEADER,
  defaultMethodOptions: { apiKeyRequired: true },
});

const plan = api.addUsagePlan('PilotPlan', {
  throttle: { burstLimit: 50, rateLimit: 20 },
});
```

API key requirement is enforced at the gateway level — requests without a valid `x-api-key` header are rejected before reaching Lambda. See `docs/specs/tenant-provisioning.md` for key management.

#### Lambda Functions

Three Lambda functions, grouped by access pattern:

| Function | Routes | Purpose |
|----------|--------|---------|
| `IngestFunction` | `POST /v1/signals` | Write-path: ingestion + state update + decision |
| `QueryFunction` | `GET /v1/signals`, `GET /v1/decisions`, `GET /v1/receipts` | Read-path: signal log, decision, and receipt queries |
| `InspectFunction` | `GET /v1/state`, `GET /v1/state/list`, `GET /v1/ingestion`, `GET /v1/policies` | Read-path: inspection + policy inspection API |
| `AdminFunction` | `PUT/PATCH/DELETE /v1/admin/policies`, `PUT/GET /v1/admin/mappings` | Admin write-path: policy management + field mapping management (ADMIN_API_KEY auth) |

Separating write and read paths allows independent scaling and IAM scoping (IngestFunction gets read-write DynamoDB access; QueryFunction and InspectFunction get read-only).

```typescript
const ingestFn = new lambda.Function(this, 'IngestFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  handler: 'dist/lambda/ingest.handler',
  memorySize: 256,
  timeout: cdk.Duration.seconds(10),
  environment: {
    STAGE: props.stage,
    SIGNALS_TABLE: signalsTable.tableName,
    STATE_TABLE: stateTable.tableName,
    DECISIONS_TABLE: decisionsTable.tableName,
    INGESTION_LOG_TABLE: ingestionLogTable.tableName,
    POLICIES_TABLE: policiesTable.tableName,
    FIELD_MAPPINGS_TABLE: fieldMappingsTable.tableName,
  },
});
signalsTable.grantReadWriteData(ingestFn);
stateTable.grantReadWriteData(ingestFn);
decisionsTable.grantReadWriteData(ingestFn);
ingestionLogTable.grantReadWriteData(ingestFn);
policiesTable.grantReadData(ingestFn);
fieldMappingsTable.grantReadData(ingestFn);

api.root.addResource('v1').addResource('signals').addMethod('POST',
  new apigateway.LambdaIntegration(ingestFn));
```

#### DynamoDB Tables

Table designs cover all v1 storage needs: signals, state, decisions, idempotency, ingestion log, and (v1.1) tenants.

```typescript
const signalsTable = new dynamodb.Table(this, 'SignalsTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'signal_id', type: dynamodb.AttributeType.STRING },
});
signalsTable.addGlobalSecondaryIndex({
  indexName: 'gsi1-learner-time',
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'learner_timestamp', type: dynamodb.AttributeType.STRING },
});

const stateTable = new dynamodb.Table(this, 'StateTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_learner', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'state_version', type: dynamodb.AttributeType.NUMBER },
});

const decisionsTable = new dynamodb.Table(this, 'DecisionsTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'decision_id', type: dynamodb.AttributeType.STRING },
});
decisionsTable.addGlobalSecondaryIndex({
  indexName: 'gsi1-learner-time',
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'learner_decided_at', type: dynamodb.AttributeType.STRING },
});

// PoliciesTable — defined in docs/specs/policy-storage.md
const policiesTable = new dynamodb.Table(this, 'PoliciesTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'policy_key', type: dynamodb.AttributeType.STRING },
});

// FieldMappingsTable — defined in docs/specs/tenant-field-mappings.md
const fieldMappingsTable = new dynamodb.Table(this, 'FieldMappingsTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'source_system', type: dynamodb.AttributeType.STRING },
});
```

---

## Lambda Adapter Layer

The existing Fastify application handles HTTP parsing, validation, and routing. For Lambda, we need a thin adapter that translates API Gateway events into the same function calls.

### Approach: Direct Handler Invocation (Not Fastify-in-Lambda)

Running Fastify inside Lambda adds cold-start overhead and complexity. Instead, create lightweight Lambda handler files that import the same business logic functions directly:

```
src/
├── lambda/
│   ├── ingest.ts        # POST /v1/signals → calls ingestion handler logic
│   ├── query.ts         # GET /v1/signals, GET /v1/decisions → calls query logic
│   └── inspect.ts       # GET /v1/state, GET /v1/ingestion → calls inspect logic
```

Each Lambda handler:
1. Parses the API Gateway event (path, query params, body)
2. Initializes the DynamoDB repository adapters (warm via Lambda execution context reuse)
3. Calls the same validation + business logic functions used by Fastify handlers
4. Returns an API Gateway-compatible response

```typescript
// src/lambda/ingest.ts (conceptual)
import { setDecisionRepository } from '../decision/store.js';
import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import { handleIngestSignal } from '../ingestion/handler.js';

let initialized = false;

function init() {
  if (initialized) return;
  setDecisionRepository(new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!));
  // ... similar for state, signal log, idempotency
  initialized = true;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  init();
  const body = JSON.parse(event.body ?? '{}');
  const result = await handleIngestSignal(body);
  return { statusCode: result.statusCode, body: JSON.stringify(result.body) };
}
```

### Handler Refactoring Requirement

The current Fastify handlers (`src/ingestion/handler.ts`, `src/signalLog/handler.ts`, `src/decision/handler.ts`) are tightly coupled to Fastify's `request`/`reply` objects. To share logic between Fastify and Lambda, the core logic must be extracted into framework-agnostic functions:

```
src/ingestion/
├── handler.ts           # Fastify route handler (thin wrapper)
├── handler-core.ts      # Framework-agnostic logic (validate + process + return result)
```

This is a refactoring step — no behavior change, just separating HTTP framework concerns from business logic.

---

## DynamoDB Repository Adapters

Each store needs a DynamoDB adapter implementing the same repository interface:

| Repository | Interface | SQLite Adapter | DynamoDB Adapter |
|-----------|-----------|----------------|------------------|
| Decision | `DecisionRepository` | `SqliteDecisionRepository` | `DynamoDbDecisionRepository` |
| State | `StateRepository` | `SqliteStateRepository` | `DynamoDbStateRepository` |
| Signal Log | `SignalLogRepository` | `SqliteSignalLogRepository` | `DynamoDbSignalLogRepository` |
| Idempotency | `IdempotencyRepository` | `SqliteIdempotencyRepository` | `DynamoDbIdempotencyRepository` |
| Ingestion Log | `IngestionLogRepository` | `SqliteIngestionLogRepository` | `DynamoDbIngestionLogRepository` |

### DynamoDB-Specific Concerns

| Concern | SQLite | DynamoDB | Adapter Handles |
|---------|--------|----------|-----------------|
| Transactions | `db.transaction()` | `TransactWriteItems` | Yes — adapter translates |
| Optimistic locking | `WHERE state_version = ?` | `ConditionExpression` | Yes — adapter translates |
| JSON storage | `JSON.stringify()` to TEXT | Native Map type | Yes — no serialization needed |
| Pagination | Cursor-based (row ID) | `ExclusiveStartKey` | Yes — token format changes |
| Composite keys | Separate columns | Concatenated strings (e.g., `org_id#learner_ref`) | Yes — adapter handles key construction |

---

## Signal Ordering Guarantees

### Why Synchronous Lambda (Not SQS FIFO)

An earlier architectural proposal used SQS FIFO with `MessageGroupId = orgId#learnerId` to guarantee per-learner signal ordering. This spec uses synchronous Lambda processing instead. The rationale:

| Concern | SQS FIFO Approach | Synchronous Lambda Approach |
|---------|-------------------|----------------------------|
| Ordering guarantee | FIFO queue serializes per message group | Optimistic locking on `state_version` prevents stale writes; DynamoDB `ConditionExpression` rejects concurrent writes atomically |
| Concurrent writes | Impossible (serialized by queue) | Rare at pilot volume (~70 signals/hour avg); on conflict, client gets error and retries — data integrity is never at risk |
| API response | 202 Accepted (async) — client must poll for result | 200 with full result (synchronous) — simpler client integration |
| Operational overhead | Queue + DLQ + worker service + replay tooling | None — Lambda is the only compute |
| Failure model | DLQ monitoring, manual replay for stuck messages | Standard Lambda error + CloudWatch; no DLQ to manage |
| Cost | SQS FIFO + additional Lambda/ECS worker | Lambda only |

At pilot volume (1 customer, ~50K signals/month), the probability of two concurrent signals for the **same learner** is negligible. Optimistic locking + idempotency ensures correctness regardless.

### When to Add SQS FIFO

SQS FIFO becomes the right choice when:

- A customer sends high-frequency, bursty signals for the same learner (e.g., real-time LMS event streams at >1K signals/hour per learner)
- Intake latency must be decoupled from processing latency (return 202 immediately, process later)
- Multiple consumers need to process the same ordered stream

**Migration path:** The repository interfaces and `handler-core.ts` extraction make this a bounded change. Adding SQS means: (1) modify the Lambda ingest handler to enqueue instead of process, (2) add a worker Lambda that calls the same `ingestSignalCore()` function. Zero business logic changes. This is a scale optimization for a future engineering hire, not a pilot requirement.

---

## Deployment Pipeline

### Manual Deploy (Phase 1 — solo dev)

```bash
npm run build
cd infra && npx cdk diff       # preview changes
cd infra && npx cdk deploy     # deploy stack
```

### CI/CD (Phase 2 — when pilot customers are active)

GitHub Actions workflow:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
      - run: npm ci && npm run build
      - run: cd infra && npm ci && npx cdk deploy --require-approval never
```

**Gate:** Deploy only happens if all tests pass. Contract tests are the deployment guardrail.

---

## Custom Domain Strategy

| Environment | Domain | Purpose |
|-------------|--------|---------|
| Dev | `api-dev.8p3p.dev` | Solo dev testing |
| Pilot | `api.8p3p.dev` | Pilot customer access |

Set up via Route 53 + ACM + API Gateway custom domain mapping. The domain should be provisioned early — DNS propagation and certificate validation take time.

---

## Requirements

### Functional

- [ ] All existing API endpoints (`POST /v1/signals`, `GET /v1/signals`, `GET /v1/decisions`, `GET /health`) work via API Gateway + Lambda
- [ ] Inspection API endpoints (`GET /v1/state`, `GET /v1/state/list`, `GET /v1/ingestion`) work via API Gateway + Lambda
- [ ] DynamoDB tables created with correct schema and GSIs
- [ ] API Gateway enforces API key requirement on all `/v1/*` routes
- [ ] `/health` and `/docs` do not require API key
- [ ] All 462+ contract tests pass against deployed endpoints
- [ ] Infrastructure is defined in CDK stack (`infra/lib/control-layer-stack.ts`, no manual AWS console configuration)
- [ ] Deploy is a single command (`cdk deploy`)

### Acceptance Criteria

- Given a deployed stack, when `POST /v1/signals` is called with a valid API key and signal, then the response matches the local behavior exactly
- Given a deployed stack, when any `/v1/*` endpoint is called without an API key, then API Gateway returns 403 Forbidden before Lambda is invoked
- Given a deployed stack, when `npm test` is run against the deployed URL, then all contract tests pass
- Given a `cdk deploy`, when the stack is applied, then all DynamoDB tables (including PoliciesTable and FieldMappingsTable), Lambda functions (including AdminFunction), and API Gateway routes are created/updated without manual intervention

---

## Constraints

- **Serverless only** — no ECS, no RDS, no always-on compute
- **On-demand DynamoDB** — no provisioned capacity (pilot-phase cost optimization)
- **arm64 Lambda** — 20% cheaper and faster cold starts than x86
- **No VPC** — Lambda runs in default networking (no NAT Gateway costs)
- **Single region** — `us-east-1` (cheapest, required for API Gateway edge-optimized)
- **Monthly cost cap** — serverless-only; target minimal spend during development and pilot (see internal-docs for specific targets)
- **Zero business logic changes** — Lambda handlers call the same functions as Fastify handlers

---

## Out of Scope (with Rationale)

| Item | Rationale | Revisit When |
|------|-----------|-------------|
| SQS FIFO ordering queue | Synchronous Lambda + optimistic locking provides ordering guarantees at pilot volume. See §Signal Ordering Guarantees. | Customer sends >1K signals/hour per learner |
| Customer-facing dashboard | Inspection panels (`/inspect`) + Swagger UI (`/docs`) cover pilot debugging, demos, and integration needs. The core IP is the decision engine, not a CRUD dashboard. | 2+ paying customers request self-service API key management and usage visibility |
| Cognito / user auth | API Gateway native API keys are sufficient for pilot. No user-level auth needed without a dashboard. | Dashboard is built |
| WAF (Web Application Firewall) | API Gateway API keys + rate limits provide baseline protection. WAF is overhead for trusted pilot traffic. | Before opening API to untrusted/public traffic |
| Secrets Manager | API keys are managed by API Gateway natively, not application secrets. No credentials to rotate at pilot scale. | When application-level secrets (DB creds, third-party API keys) are introduced |
| Multi-region deployment | Single region (`us-east-1`) is sufficient for pilot. | Production / SLA > 99.9% required |
| Custom authorizer Lambda | API Gateway native API keys are sufficient for pilot. | Need user-level or JWT-based auth |
| CloudWatch dashboards and alarms | Basic Lambda metrics are sufficient for one engineer monitoring one customer. | 2+ customers or operational incidents requiring faster triage |
| Blue/green or canary deployments | Manual `cdk deploy` is acceptable at current deploy frequency. | Deploy frequency > 1x/week or second engineer joins |
| Inspection panels hosting (S3/CloudFront) | Panels are static files served by Fastify locally; not needed on AWS for pilot. | Panels need public access independent of the API |
| VPC configuration | Lambda runs in default networking. No NAT Gateway costs. | Need to access private resources (RDS, ElastiCache) |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `DecisionRepository` interface | `src/decision/repository.ts` | **Complete** — SqliteDecisionRepository in store.ts |
| `StateRepository` interface | `src/state/repository.ts` | **Complete** — state-repository-extraction.plan.md |
| `SignalLogRepository` interface | `src/signalLog/repository.ts` | **Complete** — signal-log-repository-extraction.plan.md |
| `IdempotencyRepository` interface | Idempotency module repository | **Complete** — idempotency-repository-extraction.plan.md |
| Inspection API endpoints | `docs/specs/inspection-api.md` | **Complete** — GET /v1/state, /v1/ingestion, etc. implemented in v1 |
| Tenant provisioning + API keys | `docs/specs/tenant-provisioning.md` | Spec'd — implementation follows AWS deployment |
| Policy storage (PoliciesTable) | `docs/specs/policy-storage.md` | Spec update pending (TASK-002 in alignment plan) |
| Policy management API (AdminFunction) | `docs/specs/policy-management-api.md` | Spec creation pending (TASK-004 in alignment plan) |
| Field mappings (FieldMappingsTable) | `docs/specs/tenant-field-mappings.md` | Spec update pending (TASK-016 in alignment plan) |

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| Deployed API Gateway endpoint | Tenant provisioning (API key validation) |
| DynamoDB tables (signals, state, decisions, ingestion_log, tenants) | All repository adapters |
| PoliciesTable | Policy storage, policy management API, policy inspection API |
| FieldMappingsTable | Tenant field mappings (Canvas data mapper) |
| AdminFunction Lambda | Policy management API, field mapping admin API |
| Custom domain | Pilot customers |

---

## Error Codes

No new error codes. Deployment infrastructure does not introduce application-level errors. API Gateway returns standard HTTP 403 for missing/invalid API keys.

---

## Contract Tests as Deployment Guard

The existing contract tests (462+ as of v1) are the primary deployment verification mechanism. After deploy:

```bash
API_BASE_URL=https://api.8p3p.dev npm test
```

Tests must be parameterizable to run against either `http://localhost:3000` or the deployed URL. This requires:
1. An environment variable (`API_BASE_URL`) that test setup reads
2. Integration tests use this URL instead of hardcoded localhost
3. For deployed testing, API key must be injected via a test header

---

## File Structure

```
infra/
├── bin/
│   └── control-layer.ts             # CDK app entry point
├── lib/
│   └── control-layer-stack.ts       # Main stack definition
├── cdk.json                         # CDK configuration
└── tsconfig.json                    # CDK TypeScript config

src/
├── lambda/
│   ├── ingest.ts                    # Lambda handler: POST /v1/signals
│   ├── query.ts                     # Lambda handler: GET queries
│   ├── inspect.ts                   # Lambda handler: inspection + policy inspection endpoints
│   └── admin.ts                     # Lambda handler: admin policy + mapping management
├── decision/
│   ├── repository.ts                # DecisionRepository interface (from extraction plan)
│   ├── store.ts                     # SqliteDecisionRepository (local)
│   └── dynamodb-repository.ts       # DynamoDbDecisionRepository (AWS)
├── state/
│   ├── repository.ts                # StateRepository interface
│   ├── store.ts                     # SqliteStateRepository (local)
│   └── dynamodb-repository.ts       # DynamoDbStateRepository (AWS)
├── signalLog/
│   ├── repository.ts                # SignalLogRepository interface
│   ├── store.ts                     # SqliteSignalLogRepository (local)
│   └── dynamodb-repository.ts       # DynamoDbSignalLogRepository (AWS)
└── ingestion/
    ├── repository.ts                # IdempotencyRepository interface
    └── dynamodb-repository.ts       # DynamoDbIdempotencyRepository (AWS)

.github/
└── workflows/
    └── deploy.yml                   # CI/CD pipeline
```

---

## Success Criteria

### Implementation Complete

- [ ] `cdk deploy` creates all resources without errors
- [ ] All `/v1/*` endpoints respond correctly via API Gateway
- [ ] API key enforcement works (403 without key, 200 with valid key)
- [ ] DynamoDB tables have correct schema and GSIs
- [ ] All 462+ contract tests pass against the deployed endpoint
- [ ] Custom domain resolves and serves the API
- [ ] Cold start < 1 second (measured via CloudWatch)
- [ ] Monthly cost within internal budget targets (see internal-docs)
- [ ] Local development still works unchanged (`npm run dev` uses SQLite)
- [ ] `cdk synth` + DynamoDB Local works for local Lambda testing

### 90-Day Pilot Success

Measurable outcomes defining a successful pilot. Each has a clear pass/fail at day 90.

| # | Criterion | Measurement | Pass Definition |
|---|-----------|-------------|-----------------|
| 1 | Signal processing correctness | Contract tests against deployed endpoint | 100% of 462+ tests pass on every deploy |
| 2 | Data integrity under concurrent load | Optimistic locking conflict rate in CloudWatch Logs | Zero stale-write data corruption; conflicts resolved via retry |
| 3 | Signal reliability | Lambda error rate metric | < 0.1% invocation errors over 90 days |
| 4 | Tenant data isolation | Cross-tenant query test using different API keys | Zero cases of Org A data accessible via Org B API key |
| 5 | API uptime | API Gateway 5xx rate | > 99.5% successful responses over 90 days |
| 6 | Intake latency | API Gateway + Lambda p99 latency | < 500ms p99 for POST /v1/signals |
| 7 | Budget adherence | AWS Cost Explorer at day 90 | Total spend within internal budget target for pilot period |
| 8 | Zero-touch operation | Alert count requiring manual intervention | < 5 manual interventions over 90 days |

---

## Implementation Order

```
1. Repository extractions (Decision, State, Signal Log, Idempotency) — COMPLETE
2. Handler refactoring (extract core logic from Fastify wrappers)
3. CDK stack + DynamoDB table definitions (including PoliciesTable, FieldMappingsTable)
4. DynamoDB adapters for each repository
5. Lambda handler files (ingest, query, inspect, admin)
6. Deploy + contract test verification
7. Custom domain + DNS
8. CI/CD pipeline
```

Steps 1 is done. Steps 2–4 are local/build changes (handler refactor, adapters). Steps 5–8 are AWS-specific (Lambda, deploy, domain, CI/CD).

---

## Notes

- **Why not Fastify-in-Lambda?** Wrapping Fastify in a Lambda handler (via `@fastify/aws-lambda`) adds ~200ms cold start overhead and pulls in the full Fastify dependency. Direct handler invocation is leaner and makes the Lambda functions independently testable.
- **DynamoDB Local for testing:** `cdk synth` generates a CloudFormation template that can be used alongside DynamoDB Local for local validation of DynamoDB adapters without incurring AWS costs.
- **Why REST API, not HTTP API?** API Gateway REST APIs support usage plans and API keys natively. HTTP APIs are cheaper but require a custom authorizer Lambda for key validation — more code, more complexity, more cost at low volume.
- **Why shared tables, not table-per-tenant?** Shared DynamoDB tables with `org_id` as partition key are simpler to manage (one CDK stack, one set of GSIs) and provide sufficient isolation for pilot. Table-per-tenant requires dynamic table name resolution, per-tenant IAM policies, and a provisioning step for each new org. If hard isolation is required later (e.g., compliance), the repository interfaces make per-tenant tables a bounded migration.
- **Why CDK, not SAM?** v1.1 infrastructure now includes PoliciesTable, FieldMappingsTable, AdminFunction Lambda, and admin API routes — complexity that exceeds SAM's YAML ergonomics. CDK provides TypeScript-native construct composition, IDE autocomplete, and programmatic patterns (e.g., `table.grantReadWriteData(fn)`) that reduce IAM boilerplate. SAM was the right choice for initial serverless-only infra; CDK is the right choice now that the stack has grown.
- **Stack flexibility for future team:** The repository pattern (4 extracted interfaces) + handler-core extraction means the business logic is portable across: Fastify (local dev), Lambda (pilot), ECS/Fargate (scale), or any other compute. SQS FIFO, Aurora, CDK, dashboards — all are additive changes that slot in without rewriting core logic.

---

## Next Steps

1. **Handler refactoring** — Extract framework-agnostic core from Fastify handlers (`ingestion/handler.ts`, `decision/handler.ts`, signal log, state, inspection) so Lambda handlers can call the same logic.
2. **CDK stack** — Add `infra/lib/control-layer-stack.ts` with API Gateway, Lambda functions (Ingest, Query, Inspect, Admin), and DynamoDB tables (signals, learner_state, decisions, ingestion_log, tenants/api_keys, policies, field_mappings).
3. **DynamoDB adapters** — Implement `DynamoDbDecisionRepository`, `DynamoDbStateRepository`, `DynamoDbSignalLogRepository`, `DynamoDbIdempotencyRepository`, `DynamoDbIngestionLogRepository` (or equivalent) and wire them in Lambda init.
4. **Lambda handlers** — Add `src/lambda/ingest.ts`, `query.ts`, `inspect.ts`, `admin.ts`; deploy and run contract tests against deployed URL.
5. Run `/plan-impl docs/specs/aws-deployment.md` to generate a detailed implementation plan with tasks and acceptance criteria.

---

*Spec created: 2026-02-19 | Updated: 2026-03-28 (SAM → CDK throughout; added PoliciesTable, FieldMappingsTable, AdminFunction; added policy-management-api.md and tenant-field-mappings.md dependencies). Depends on: state-engine.md, signal-log.md, inspection-api.md, tenant-provisioning.md, policy-storage.md, policy-management-api.md, tenant-field-mappings.md*
