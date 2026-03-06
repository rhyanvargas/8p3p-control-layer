# AWS Deployment Specification

> Phase 2 infrastructure: deploy the 8P3P Control Layer to AWS using API Gateway, Lambda, and DynamoDB with infrastructure-as-code.

## Overview

This spec turns the solo-dev playbook's Phase 2 sketch into an implementable deployment specification. The goal is to deploy the existing control-layer pipeline (signals → state → decisions) to AWS with zero business logic changes. The deployment uses serverless-only services (API Gateway + Lambda + DynamoDB) to keep costs near-zero during development and scale automatically under pilot load.

**Key principle:** The deployed system must pass the same contract tests that pass locally (462+ as of v1). If the tests pass, the deployment is correct. All four repository interfaces (Decision, State, Signal Log, Idempotency) are already extracted; DynamoDB adapters can slot in mechanically. See `.cursor/plans/` for completed extraction plans.

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
     │  tenants │ api_keys                                  │
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

All four repository interfaces are extracted; the next step is implementing DynamoDB adapters and the SAM template.

---

## Infrastructure as Code

### Tool Choice: AWS SAM

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| AWS SAM | Native Lambda/API Gateway support, `sam local` for testing, minimal config | Less flexible than CDK for complex infra | **Selected** |
| AWS CDK | Full programming language, composable constructs | Heavier setup, overkill for serverless-only | Deferred |
| Serverless Framework | Popular, many plugins | Vendor lock-in to SLS Inc., v4 license changes | Rejected |
| Terraform | Multi-cloud, mature | HCL learning curve, no local invoke | Rejected |

SAM is the right fit: it's AWS-native, supports `sam local invoke` for testing Lambda functions against local DynamoDB, and the template is declarative YAML — easy to review and version.

### Template Structure

```
infra/
├── template.yaml              # SAM template (API Gateway, Lambdas, DynamoDB)
├── samconfig.toml              # Environment-specific deploy config
└── params/
    ├── dev.json                # Dev stage parameters
    └── prod.json               # Prod stage parameters (future)
```

### SAM Template: Key Resources

#### API Gateway

```yaml
ApiGateway:
  Type: AWS::Serverless::Api
  Properties:
    StageName: !Ref Stage
    Auth:
      ApiKeyRequired: true
      UsagePlan:
        CreateUsagePlan: PER_API
        Throttle:
          BurstLimit: 50
          RateLimit: 20
    Domain:
      DomainName: !Sub "api.${DomainName}"
      CertificateArn: !Ref Certificate
      Route53:
        HostedZoneId: !Ref HostedZoneId
```

API key requirement is enforced at the gateway level — requests without a valid `x-api-key` header are rejected before reaching Lambda. See `docs/specs/tenant-provisioning.md` for key management.

#### Lambda Functions

Three Lambda functions, grouped by access pattern:

| Function | Routes | Purpose |
|----------|--------|---------|
| `IngestFunction` | `POST /v1/signals` | Write-path: ingestion + state update + decision |
| `QueryFunction` | `GET /v1/signals`, `GET /v1/decisions` | Read-path: signal log and decision queries |
| `InspectFunction` | `GET /v1/state`, `GET /v1/state/list`, `GET /v1/ingestion` | Read-path: inspection API |

Separating write and read paths allows independent scaling and IAM scoping (IngestFunction gets read-write DynamoDB access; QueryFunction and InspectFunction get read-only).

```yaml
IngestFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: dist/lambda/ingest.handler
    Runtime: nodejs22.x
    Architectures: [arm64]
    MemorySize: 256
    Timeout: 10
    Environment:
      Variables:
        STAGE: !Ref Stage
        SIGNALS_TABLE: !Ref SignalsTable
        STATE_TABLE: !Ref StateTable
        DECISIONS_TABLE: !Ref DecisionsTable
        INGESTION_LOG_TABLE: !Ref IngestionLogTable
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref SignalsTable
      - DynamoDBCrudPolicy:
          TableName: !Ref StateTable
      - DynamoDBCrudPolicy:
          TableName: !Ref DecisionsTable
      - DynamoDBCrudPolicy:
          TableName: !Ref IngestionLogTable
    Events:
      IngestSignal:
        Type: Api
        Properties:
          RestApiId: !Ref ApiGateway
          Path: /v1/signals
          Method: POST
```

#### DynamoDB Tables

Table designs cover all v1 storage needs: signals, state, decisions, idempotency, ingestion log, and (v1.1) tenants.

```yaml
SignalsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: org_id
        KeyType: HASH
      - AttributeName: signal_id
        KeyType: RANGE
    GlobalSecondaryIndexes:
      - IndexName: gsi1-learner-time
        KeySchema:
          - AttributeName: org_id
            KeyType: HASH
          - AttributeName: learner_timestamp
            KeyType: RANGE

StateTable:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: org_learner
        KeyType: HASH
      - AttributeName: state_version
        KeyType: RANGE

DecisionsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: org_id
        KeyType: HASH
      - AttributeName: decision_id
        KeyType: RANGE
    GlobalSecondaryIndexes:
      - IndexName: gsi1-learner-time
        KeySchema:
          - AttributeName: org_id
            KeyType: HASH
          - AttributeName: learner_decided_at
            KeyType: RANGE
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

## Deployment Pipeline

### Manual Deploy (Phase 1 — solo dev)

```bash
npm run build
sam build
sam deploy --guided          # first time (creates samconfig.toml)
sam deploy                   # subsequent deploys
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
      - uses: aws-actions/setup-sam@v2
      - uses: aws-actions/configure-aws-credentials@v4
      - run: npm ci && npm run build
      - run: sam build && sam deploy --no-confirm-changeset
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
- [ ] Infrastructure is defined in SAM template (no manual AWS console configuration)
- [ ] Deploy is a single command (`sam deploy`)

### Acceptance Criteria

- Given a deployed stack, when `POST /v1/signals` is called with a valid API key and signal, then the response matches the local behavior exactly
- Given a deployed stack, when any `/v1/*` endpoint is called without an API key, then API Gateway returns 403 Forbidden before Lambda is invoked
- Given a deployed stack, when `npm test` is run against the deployed URL, then all contract tests pass
- Given a `sam deploy`, when the template is applied, then all DynamoDB tables, Lambda functions, and API Gateway routes are created/updated without manual intervention

---

## Constraints

- **Serverless only** — no ECS, no RDS, no always-on compute
- **On-demand DynamoDB** — no provisioned capacity (pilot-phase cost optimization)
- **arm64 Lambda** — 20% cheaper and faster cold starts than x86
- **No VPC** — Lambda runs in default networking (no NAT Gateway costs)
- **Single region** — `us-east-1` (cheapest, required for API Gateway edge-optimized)
- **Monthly cost cap** — must stay under $50/month during development, $100/month during pilot
- **Zero business logic changes** — Lambda handlers call the same functions as Fastify handlers

---

## Out of Scope

- Multi-region deployment
- WAF (Web Application Firewall) — deferred until production
- Custom authorizer Lambda (API Gateway native API keys are sufficient for pilot)
- CloudWatch dashboards and alarms (basic Lambda metrics are sufficient)
- Blue/green or canary deployments
- Inspection panels hosting (panels are static files; can be served from S3+CloudFront or kept on the Fastify server for demos)
- VPC configuration
- Secrets Manager integration (API keys are managed via API Gateway, not application secrets)

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

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| Deployed API Gateway endpoint | Tenant provisioning (API key validation) |
| DynamoDB tables | All repository adapters |
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
├── template.yaml                    # SAM template
├── samconfig.toml                   # Deploy configuration
└── params/
    ├── dev.json                     # Dev parameters
    └── pilot.json                   # Pilot parameters

src/
├── lambda/
│   ├── ingest.ts                    # Lambda handler: POST /v1/signals
│   ├── query.ts                     # Lambda handler: GET queries
│   └── inspect.ts                   # Lambda handler: inspection endpoints
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

Implementation is complete when:

- [ ] `sam deploy` creates all resources without errors
- [ ] All `/v1/*` endpoints respond correctly via API Gateway
- [ ] API key enforcement works (403 without key, 200 with valid key)
- [ ] DynamoDB tables have correct schema and GSIs
- [ ] All 462+ contract tests pass against the deployed endpoint
- [ ] Custom domain resolves and serves the API
- [ ] Cold start < 1 second (measured via CloudWatch)
- [ ] Monthly cost < $50 during development
- [ ] Local development still works unchanged (`npm run dev` uses SQLite)
- [ ] `sam local invoke` works for local Lambda testing against DynamoDB Local

---

## Implementation Order

```
1. Repository extractions (Decision, State, Signal Log, Idempotency) — COMPLETE
2. Handler refactoring (extract core logic from Fastify wrappers)
3. SAM template + DynamoDB table definitions
4. DynamoDB adapters for each repository
5. Lambda handler files
6. Deploy + contract test verification
7. Custom domain + DNS
8. CI/CD pipeline
```

Steps 1 is done. Steps 2–4 are local/build changes (handler refactor, adapters). Steps 5–8 are AWS-specific (Lambda, deploy, domain, CI/CD).

---

## Notes

- **Why not Fastify-in-Lambda?** Wrapping Fastify in a Lambda handler (via `@fastify/aws-lambda`) adds ~200ms cold start overhead and pulls in the full Fastify dependency. Direct handler invocation is leaner and makes the Lambda functions independently testable.
- **DynamoDB Local for testing:** `sam local invoke` + DynamoDB Local allows running the full DynamoDB-backed stack locally before deploying. This is how we validate DynamoDB adapters without incurring AWS costs.
- **Why REST API, not HTTP API?** API Gateway REST APIs support usage plans and API keys natively. HTTP APIs are cheaper but require a custom authorizer Lambda for key validation — more code, more complexity, more cost at low volume.

---

## Next Steps

1. **Handler refactoring** — Extract framework-agnostic core from Fastify handlers (`ingestion/handler.ts`, `decision/handler.ts`, signal log, state, inspection) so Lambda handlers can call the same logic.
2. **SAM template** — Add `infra/template.yaml` with API Gateway, Lambda functions, and DynamoDB tables (signals, learner_state, decisions, ingestion_log, tenants/api_keys per tenant-provisioning.md).
3. **DynamoDB adapters** — Implement `DynamoDbDecisionRepository`, `DynamoDbStateRepository`, `DynamoDbSignalLogRepository`, `DynamoDbIdempotencyRepository`, `DynamoDbIngestionLogRepository` (or equivalent) and wire them in Lambda init.
4. **Lambda handlers** — Add `src/lambda/ingest.ts`, `query.ts`, `inspect.ts`; deploy and run contract tests against deployed URL.
5. Run `/plan-impl docs/specs/aws-deployment.md` to generate a detailed implementation plan with tasks and acceptance criteria.

---

*Spec created: 2026-02-19 | Updated: 2026-03-01 (prerequisites: all four repository extractions complete). Depends on: state-engine.md, signal-log.md, inspection-api.md, tenant-provisioning.md*
