# 8P3P Learning Intelligence Control Layer

**A vendor-agnostic, contract-driven intelligence engine for adaptive learning systems**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## Overview

The 8P3P Control Layer is an enterprise-grade intelligence infrastructure that transforms learning signals into actionable decisions while maintaining complete separation from UI, workflows, and domain-specific implementations. Built on immutable principles and contract-first design, it provides the foundational intelligence layer for adaptive learning platforms at scale.

Each governed learning decision — signal ingested → state updated → policy applied → decision produced — is one **Learning Intelligence Unit (LIU)**, the core billing metric for 8P3P's usage-based pricing model.

### Core Capabilities

- **Signal Ingestion** — Accept learning events from any source system via API or event streams
- **Immutable State Management** — Maintain append-only learner state with full provenance tracking
- **Deterministic Decision Engine** — Generate consistent, traceable decisions from state
- **State Delta Detection** — Automatic `_delta` / `_direction` fields for every numeric state field (decay detection)
- **Multi-Tenant Architecture** — Built-in org-level isolation with zero cross-tenant leakage
- **Policy Management** — Admin CRUD for policy lifecycle with validation, soft enable/disable, and versioning
- **LIU Usage Metering** — Per-org monthly LIU consumption tracking for billing transparency
- **Contract-First Design** — Comprehensive interface contracts with structural validation
- **Vendor Neutrality** — No platform lock-in, no domain assumptions, pure intelligence layer

---

## Architecture

> Full architecture details: [`docs/foundation/architecture.md`](docs/foundation/architecture.md)

### System Overview

```mermaid
architecture-beta
    group api_in(cloud)[API_IN]
    group control_layer(server)[ControlLayer]
    group api_out(cloud)[API_OUT]

    service ext_systems(internet)[ExternalSystems] in api_in
    service ingestion(server)[Ingestion] in control_layer
    service signal_log(database)[SignalLog] in control_layer
    service state_engine(server)[STATEEngine] in control_layer
    service state_store(database)[STATEStore] in control_layer
    service decision_engine(server)[DecisionEngine] in control_layer
    service output(server)[Output] in control_layer
    service downstream(internet)[Downstream] in api_out

    ext_systems:R --> L:ingestion
    ingestion:R --> L:signal_log
    signal_log:R --> L:state_engine
    state_engine:B <--> T:state_store
    state_engine:R --> L:decision_engine
    decision_engine:R --> L:output
    output:R --> L:downstream
```

### Lifecycle Stages

| Stage | Component | Responsibility |
|-------|-----------|----------------|
| **1** | Signal Ingestion | Receive, validate, and accept signals from external systems |
| **2** | Signal Log | Store signals immutably with full provenance |
| **3** | STATE Engine | Apply signals to learner state; compute delta/direction fields |
| **4** | Decision Engine | Evaluate state and generate deterministic decisions |
| **5** | Output Interfaces | Expose decisions via API and/or events |

### Key Principles

| Principle | Description |
|-----------|-------------|
| **API-First** | All access via defined interface contracts |
| **Immutability** | Append-only signal log, no state overwrites |
| **Determinism** | Same state always produces same decision |
| **STATE Authority** | No external state overrides permitted |
| **Idempotency** | Safe retry for all operations |
| **Vendor Neutrality** | Zero platform or domain coupling |

---

## Decision Types

The control layer supports four decision types, forming a closed set (see `src/contracts/schemas/decision.json`). The default policy maps conceptual variants such as escalate, recommend, and reroute into these four types.

| Decision Type | Description |
|--------------|-------------|
| `reinforce` | Continue current learning path |
| `advance` | Progress to next level |
| `intervene` | Require assistance |
| `pause` | Possible learning decay detected; watch closely |

---

## Interface Contracts

| Contract | Schema | Validator |
|----------|--------|-----------|
| **REST API** | [`docs/api/openapi.yaml`](docs/api/openapi.yaml) | Served at `/docs` (Swagger UI) |
| **Events** | [`docs/api/asyncapi.yaml`](docs/api/asyncapi.yaml) | — |
| **Signal Envelope** | [`src/contracts/schemas/signal-envelope.json`](src/contracts/schemas/signal-envelope.json) | [`src/contracts/validators/signal-envelope.ts`](src/contracts/validators/signal-envelope.ts) |
| **Decision Object** | [`src/contracts/schemas/decision.json`](src/contracts/schemas/decision.json) | [`src/contracts/validators/decision.ts`](src/contracts/validators/decision.ts) |

For detailed contract specifications, see the API specs in [`docs/api/`](docs/api/).

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Primary language |
| **Fastify** | HTTP server framework |
| **@fastify/swagger** | OpenAPI spec serving |
| **@fastify/swagger-ui** | Interactive API docs at `/docs` |
| **Ajv** | JSON Schema validation |
| **better-sqlite3** | SQLite database driver (local dev) |
| **@aws-sdk/client-dynamodb** | DynamoDB client (AWS deployment) |
| **aws-lambda-fastify** | Lambda adapter bridge |
| **AWS CDK** | Infrastructure as code (`infra/`) |
| **Vitest** | Test framework |
| **ESLint** | Code quality |
| **Redocly CLI** | OpenAPI linting |

> See [`package.json`](package.json) for current versions and all dependencies.

---

## Environment variables

The server loads `.env` then `.env.local` at startup (see `src/server.ts`). Copy [`.env.example`](.env.example) to `.env` and set values as needed; use `.env.local` for secrets you do not commit.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | Log level |
| `API_KEY` | *(unset)* | If set, `/v1/*` requires header `x-api-key`. If unset, tenant API key auth is off (typical for local dev). Generate: `npm run generate:api-key` |
| `API_KEY_ORG_ID` | *(unset)* | If set, the server forces this `org_id` for the tenant key (client cannot choose org). If unset, `org_id` comes from the request |
| `SIGNAL_BODY_LIMIT` | `1048576` | Max body size in bytes for `POST /v1/signals` |
| `IDEMPOTENCY_DB_PATH` | `./data/idempotency.db` | SQLite path (created on first use) |
| `SIGNAL_LOG_DB_PATH` | `./data/signal-log.db` | SQLite path |
| `STATE_STORE_DB_PATH` | `./data/state.db` | SQLite path |
| `INGESTION_LOG_DB_PATH` | `./data/ingestion-log.db` | SQLite path (ingestion audit log) |
| `DECISION_DB_PATH` | `./data/decisions.db` | SQLite path |
| `DECISION_POLICY_PATH` | `<cwd>/src/decision/policies/default.json` | Decision policy JSON file |
| `TENANT_FIELD_MAPPINGS_PATH` | *(unset)* | Static JSON for tenant payload mappings ([DEF-DEC-006](docs/specs/tenant-field-mappings.md)). If unset, file-based mappings are off unless you use DynamoDB |
| `FIELD_MAPPINGS_TABLE` | *(unset)* | DynamoDB table for field mappings (v1.1). If unset, DynamoDB lookup is skipped; ingestion uses file config or prior behavior |
| `FIELD_MAPPINGS_CACHE_TTL_MS` | `300000` (5 min) | In-memory TTL for FieldMappingsTable cache |
| `ADMIN_API_KEY` | *(unset)* | If set, `/v1/admin/*` requires header `x-admin-api-key`. Generate: `openssl rand -hex 32` |
| `DASHBOARD_ACCESS_CODE` | *(unset)* | If set (non-empty), enables the passphrase gate for `/dashboard/*`. If unset or empty, the Decision Panel is served without a login gate (typical local dev). See [Dashboard passphrase gate](docs/specs/dashboard-passphrase-gate.md) |
| `DASHBOARD_SESSION_TTL_HOURS` | `8` | Signed session cookie lifetime in hours when the gate is enabled |
| `COOKIE_SECRET` | *(unset)* | Required when `DASHBOARD_ACCESS_CODE` is set: secret used to sign `dp_session` cookies (min 32 characters). Generate: `openssl rand -hex 32`. Rotating this value revokes all active dashboard sessions |

### Dashboard access gate

When `DASHBOARD_ACCESS_CODE` is set, staff must enter the shared access code once per session before the Decision Panel SPA loads. Behavior, cookie shape, and rate limits are specified in [`docs/specs/dashboard-passphrase-gate.md`](docs/specs/dashboard-passphrase-gate.md). Set `COOKIE_SECRET` to a strong random value (for example `openssl rand -hex 32`) in the same environment.

Behind a reverse proxy or load balancer, configure Fastify `trustProxy` appropriately so `request.ip` reflects the client IP for login rate limiting; otherwise all clients may appear as the proxy address.

For hands-on setup steps, see [Local environment setup](docs/foundation/setup.md).

---

## Project Structure

```
src/
├── admin/               # Admin policy management
│   ├── policies-dynamodb.ts        # DynamoDB PoliciesTable adapter
│   └── policy-management-routes.ts # Admin policy CRUD handlers
├── auth/                # Authentication middleware
│   ├── admin-api-key-middleware.ts  # x-admin-api-key auth
│   ├── api-key-middleware.ts       # x-api-key tenant auth
│   ├── dashboard-gate.ts           # Decision Panel session gate
│   ├── dashboard-login.ts          # Dashboard login/logout routes
│   ├── session-cookie.ts           # HMAC session cookie helpers
│   └── login-rate-limiter.ts       # Login attempt rate limiter
├── config/              # Tenant configuration
│   └── tenant-field-mappings.ts    # Payload normalization + aliases
├── contracts/           # JSON schemas and validators
│   ├── schemas/         # signal-envelope.json, decision.json
│   └── validators/      # Ajv-based validation
├── ingestion/           # Signal ingestion layer
│   ├── handler.ts / handler-core.ts  # Fastify wrapper + framework-agnostic core
│   ├── forbidden-keys.ts
│   ├── idempotency.ts / idempotency-repository.ts
│   ├── ingestion-log-store.ts / ingestion-log-handler.ts
│   ├── dynamodb-idempotency-repository.ts
│   └── dynamodb-ingestion-log-repository.ts
├── signalLog/           # Immutable signal storage
│   ├── handler.ts / handler-core.ts
│   ├── store.ts / repository.ts
│   └── dynamodb-repository.ts
├── state/               # STATE engine + delta detection
│   ├── engine.ts        # applySignals, computeStateDeltas
│   ├── store.ts / repository.ts
│   ├── handler.ts / handler-core.ts
│   └── dynamodb-repository.ts
├── decision/            # Decision engine
│   ├── engine.ts        # evaluateState() — policy evaluation
│   ├── policy-loader.ts # Policy loading, validation, DynamoDB resolution
│   ├── handler.ts / handler-core.ts
│   ├── store.ts / repository.ts
│   ├── dynamodb-repository.ts
│   └── policies/        # Policy definitions (default + per-org)
├── lambda/              # AWS Lambda entrypoints
│   ├── ingest.ts        # POST /v1/signals
│   ├── query.ts         # GET /v1/signals, /v1/decisions, /v1/receipts
│   ├── inspect.ts       # GET /v1/state, /v1/ingestion
│   ├── admin.ts         # Admin policy + mapping management
│   └── admin-handler.ts # Fastify-based admin Lambda bridge
├── shared/              # Shared types and error codes
│   ├── types.ts
│   └── error-codes.ts
└── server.ts            # Application entry point

infra/
├── bin/
│   └── control-layer.ts          # CDK app entry point
├── lib/
│   └── control-layer-stack.ts    # Main stack (API Gateway, Lambdas, DynamoDB)
├── cdk.json
└── tsconfig.json

scripts/
├── validate-schemas.ts    # JSON Schema compilation check
├── validate-contracts.ts  # Contract alignment (JSON Schema ↔ OpenAPI ↔ AsyncAPI)
└── validate-api.sh        # OpenAPI linting (Redocly)

tests/
├── contracts/        # Contract tests (spec-driven)
│   ├── signal-ingestion.test.ts
│   ├── signal-log.test.ts
│   ├── state-engine.test.ts
│   ├── decision-engine.test.ts
│   ├── output-api.test.ts
│   ├── inspection-api.test.ts
│   ├── policy-management-api.test.ts
│   ├── receipts-api.test.ts
│   ├── api-key-middleware.test.ts
│   └── contract-drift.test.ts
├── integration/      # End-to-end integration tests
│   ├── e2e-signal-to-decision.test.ts
│   ├── springs-pilot.test.ts
│   ├── inspection-panels.test.ts
│   ├── dashboard-gate.test.ts
│   └── gateway-403.test.ts
├── unit/             # Unit tests
│   ├── forbidden-keys.test.ts
│   ├── idempotency.test.ts
│   ├── signal-log-store.test.ts
│   ├── ingestion-log-store.test.ts
│   ├── state-engine.test.ts
│   ├── state-store.test.ts
│   ├── state-validator.test.ts
│   ├── decision-engine.test.ts
│   ├── decision-store.test.ts
│   ├── decision-validator.test.ts
│   ├── policy-loader.test.ts
│   ├── api-key-middleware.test.ts
│   ├── session-cookie.test.ts
│   └── lambda/
│       └── lambda-handlers.test.ts
└── helpers/          # Shared test utilities
```

---

## Documentation

### Guides

Common business use-cases and integration workflows (built from the existing API contracts):

| Guide | Description |
|------|-------------|
| [Guides Index](docs/guides/README.md) | Entry point for integration workflows |
| [Customer Onboarding Quick Start](docs/guides/customer-onboarding-quickstart.md) | First 15 minutes: real data and meaningful API output |
| [FAQ (Pilot)](docs/guides/faq.md) | Common questions: payload, state, policy, decisions, identity |
| [Pilot Integration Guide (v1)](docs/guides/pilot-integration-guide.md) | "Send signals → consume decisions" |
| [Get all learner decisions from my org](docs/guides/get-all-learner-decisions-from-org.md) | Org-wide decision export (list learners → fetch decisions per learner) |
| [Pilot Deployment Checklist (v1)](docs/guides/deployment-checklist.md) | Pre-deployment gates (requires `API_KEY_ORG_ID`) |

### Foundation

| Document | Description |
|----------|-------------|
| [Architecture](docs/foundation/architecture.md) | System architecture, data flow, and lifecycle stages |
| [Terminology](docs/foundation/terminology.md) | Decision types, canonical fields, and core terms |
| [Setup](docs/foundation/setup.md) | Local environment setup and runbook |

### Specifications (prose)

| Spec | Phase | Status |
|------|-------|--------|
| [Signal Ingestion](docs/specs/signal-ingestion.md) | v1 | **Implemented** |
| [Signal Log](docs/specs/signal-log.md) | v1 | **Implemented** |
| [State Engine](docs/specs/state-engine.md) | v1 | **Implemented** |
| [Decision Engine](docs/specs/decision-engine.md) | v1 | **Implemented** |
| [Inspection API](docs/specs/inspection-api.md) | v1 | **Implemented** |
| [Inspection Panels](docs/specs/inspection-panels.md) | v1 | **Implemented** |
| [API Key Middleware](docs/specs/api-key-middleware.md) | v1 | **Implemented** |
| [Receipts API](docs/specs/receipts-api.md) | v1 | **Implemented** |
| [State Delta Detection](docs/specs/state-delta-detection.md) | v1.1 | **Implemented** |
| [Policy Storage](docs/specs/policy-storage.md) | v1.1 | **Implemented** |
| [Policy Management API](docs/specs/policy-management-api.md) | v1.1 | **Implemented** |
| [AWS Deployment](docs/specs/aws-deployment.md) | v1.1 | **In Progress** — CDK, Lambda, DynamoDB |
| [Tenant Provisioning](docs/specs/tenant-provisioning.md) | v1.1 | Spec'd |
| [Policy Inspection API](docs/specs/policy-inspection-api.md) | v1.1 | Spec'd |
| [Tenant Field Mappings](docs/specs/tenant-field-mappings.md) | v1.1 | Spec'd |
| [Webhook Adapters](docs/specs/webhook-adapters.md) | v1.1 | Spec'd |
| [Learner Trajectory API](docs/specs/learner-trajectory-api.md) | v1.1 | Spec'd |
| [Learner Summary API](docs/specs/learner-summary-api.md) | v1.1 | Spec'd |
| [LIU Usage Meter](docs/specs/liu-usage-meter.md) | v1.1 | Spec'd |

### API specifications (machine-readable)

| Spec | Description |
|------|-------------|
| [OpenAPI](docs/api/openapi.yaml) | REST API contract (v1); interactive docs at `/docs` |
| [AsyncAPI](docs/api/asyncapi.yaml) | Event contracts (e.g. `signal.ingested`, `decision.emitted`) |
| [API Specs Index](docs/api/README.md) | Index for OpenAPI/AsyncAPI specs |

### Testing

| Document | Description |
|----------|-------------|
| [QA Testing POC v1](docs/testing/qa-test-pocv1.md) | Manual QA test cases (historical POC v1 policy) |
| [QA Testing POC v2](docs/testing/qa-test-pocv2.md) | Manual QA test cases for current POC v2 policy |

---

## Project Status

**503 tests passing** across 27 test files. Full pipeline proven end-to-end: signal → validate → store → state accumulate → delta detect → policy evaluate → decision with trace. All 4 decision types verified with JSON evidence. Admin policy CRUD operational.

### Milestone Summary

| Milestone | Status |
|-----------|--------|
| **POC v1** — single-rule pipeline | **Complete** |
| **POC v2** — 4-rule policy, all decision types | **Complete** |
| **POC v2 QA** — full test execution with JSON trace evidence | **Complete** |
| **v1: 1-Customer Pilot-Ready** — enriched trace, inspection panels, demo dataset, PII hardening | **Complete** |
| **v1.1: Pre-Month 0** — AWS deployment, tenant provisioning, admin APIs, LIU metering, trajectory/summary | **In Progress** (specs complete, build underway) |

### What's Built (v1 — Complete)

- [x] **Signal Ingestion** — POST `/v1/signals`, validation, forbidden key detection, idempotency
- [x] **Signal Log** — append-only storage, time-range queries, pagination, org isolation
- [x] **STATE Engine** — signal application, deep merge, optimistic locking, provenance tracking, atomic `saveStateWithAppliedSignals`
- [x] **State Delta Detection** — automatic `_delta` / `_direction` companion fields for numeric state (decay detection)
- [x] **Decision Engine** — policy evaluation, deterministic decisions, full trace provenance
- [x] **Policy Management API** — admin CRUD (PUT, PATCH, DELETE, validate), `x-admin-api-key` auth, DynamoDB PoliciesTable
- [x] **Policy Storage** — DynamoDB-backed with status field, resolution chain, cache/TTL
- [x] **Policy Expansion** — 4 rules covering all decision types, org-scoped policies with routing
- [x] **Output API** — GET `/v1/decisions`, GET `/v1/receipts` with trace
- [x] **Inspection API** — GET `/v1/state`, GET `/v1/state/list`, GET `/v1/ingestion`
- [x] **Inspection Panels** — 4 read-only panels at `/inspect` (Signal Intake, State Viewer, Decision Stream, Decision Trace)
- [x] **API Key Middleware** — org-level isolation, forbidden on `/v1/*`
- [x] **PII Hardening** — forbidden keys (DEF-DEC-008-PII), canonical snapshot (DEF-DEC-007)
- [x] **Contract System** — JSON Schemas, OpenAPI, AsyncAPI, Ajv validators, contract drift detection
- [x] **Repository Interfaces** — Decision, State, Signal Log, Idempotency, Ingestion Log (vendor-agnostic)
- [x] **DynamoDB Adapters** — all five repository implementations for AWS deployment
- [x] **Lambda Handlers** — ingest, query, inspect, admin entrypoints
- [x] **CDK Stack** — API Gateway + Lambda + DynamoDB table definitions
- [x] **Demo Seed Script** — `npm run seed:demo`, Springs pilot data
- [x] **503 tests** — unit, contract, integration, and drift detection across 27 files

### v1.1: Pre-Month 0 (In Progress)

The v1.1 milestone completes all requirements for starting Phase 1 of the [24-Month Product Roadmap](#roadmap-alignment).

- [x] State delta detection (`_delta` / `_direction` fields)
- [x] Policy management API (admin CRUD + soft enable/disable)
- [x] Policy storage (DynamoDB PoliciesTable)
- [x] Handler-core extraction (framework-agnostic business logic)
- [x] DynamoDB repository adapters (5 repositories)
- [x] Lambda entrypoints (ingest, query, inspect, admin)
- [x] CDK stack bootstrap (tables, API Gateway, Lambdas)
- [ ] AWS deployment completion — custom domain, CI/CD ([plan](.cursor/plans/aws-deployment.plan.md))
- [ ] Policy inspection API — tenant read-only policy view ([spec](docs/specs/policy-inspection-api.md))
- [ ] Tenant field mappings — Canvas integration, computed transforms ([spec](docs/specs/tenant-field-mappings.md))
- [ ] Webhook adapters — raw LMS webhook ingestion ([spec](docs/specs/webhook-adapters.md))
- [ ] Learner trajectory API — version-range field trend view ([spec](docs/specs/learner-trajectory-api.md))
- [ ] Learner summary API — educator-readable aggregated handoff view ([spec](docs/specs/learner-summary-api.md))
- [ ] LIU usage meter — per-org monthly LIU metering ([spec](docs/specs/liu-usage-meter.md))

### GitHub Environment Secrets (CI/CD)

The `deploy.yml` pipeline authenticates to AWS via OIDC and requires the following secrets configured in the **`prod`** (and optionally `dev`) GitHub environment:

| Secret | Required | Description |
|--------|----------|-------------|
| `AWS_DEPLOY_ROLE_ARN` | ✅ | IAM role ARN the OIDC provider assumes (`arn:aws:iam::<account>:role/<role>`) |
| `ADMIN_API_KEY` | ✅ | Admin API key injected into the Lambda environment at deploy time |
| `CUSTOM_DOMAIN` | Optional | API custom domain, e.g. `api.8p3p.dev` — triggers ACM + Route 53 provisioning |
| `HOSTED_ZONE_ID` | If `CUSTOM_DOMAIN` set | Route 53 hosted zone ID for the custom domain |
| `HOSTED_ZONE_NAME` | If `CUSTOM_DOMAIN` set | Route 53 zone name, e.g. `8p3p.dev` |
| `CONTRACT_TEST_API_URL` | Optional | Base URL for post-deploy contract tests — skipped if unset |
| `CONTRACT_TEST_API_KEY` | If above set | API key passed to contract tests |

Set secrets via: **GitHub → repo → Settings → Environments → prod → Add secret**

The OIDC trust policy on the IAM role must allow `token.actions.githubusercontent.com` as the identity provider and scope to this repo.

### Roadmap Alignment

The investor deck defines a 24-month product roadmap. The control layer's engineering milestones map to it:

| Phase | Timeline | Control Layer Work |
|-------|----------|-------------------|
| **Pre-Phase 1** | Now | v1.1 completion — AWS deploy, metering, integrations |
| **Phase 1** | 0–6 months | Repeatable deployments, decision visibility, school-system integrations |
| **Phase 2** | 6–12 months | Standardized ingestion, multi-school onboarding, API foundations |
| **Phase 3** | 12–18 months | Public API, Zapier, workflow automation |
| **Phase 4** | 18–24 months | Developer SDK, partner embedding, B2B2C |

### v1.2 Backlog

User stories approved, specs deferred: [`docs/backlog/user-stories-v1.2.md`](docs/backlog/user-stories-v1.2.md)

- US-SKILL-001: Skill-level signal ingestion + dot-path policy evaluation
- US-POLICY-BUILDER-001: AI-assisted policy generation (decoupled LLM service)

### Deferred (Full Contract / Production)

- [ ] JWT/OAuth authentication
- [ ] EventBridge integration
- [ ] Public documentation site (Stripe/Plaid-quality UX)
- [ ] Multi-region deployment
- [ ] Usage-based rate limiting (per-LIU throttling)

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

---

**Maintained by the 8P3P Team**
