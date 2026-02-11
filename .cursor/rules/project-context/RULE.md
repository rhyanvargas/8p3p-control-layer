---
description: "Project context for 8P3P Control Layer - tech stack, architecture, commands, coding standards"
alwaysApply: true
---

# Project Context

**8P3P Control Layer** - A vendor-agnostic, contract-driven intelligence engine for adaptive learning systems.

This is a backend API service that processes learning signals through a deterministic pipeline: Ingestion → Signal Log → STATE Engine → Decision Engine → Output.

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Language | TypeScript | ^5.9.3 |
| Runtime | Node.js | ES2022 target |
| Framework | Fastify | ^5.7.2 |
| Database | better-sqlite3 | ^12.6.2 |
| Package Manager | npm | - |
| Test Framework | Vitest | ^4.0.18 |
| Linter | ESLint + @typescript-eslint | ^9.39.2 |
| Module System | ES Modules | "type": "module" |

## Key Commands

```bash
# Development
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run production server

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run test:contracts # Run contract tests only
npm run test:integration # Run integration tests only
npm run test:unit    # Run unit tests only

# Quality
npm run lint         # Run ESLint on src/ and tests/
npm run typecheck    # Type check without emitting

# Validation
npm run validate:schemas    # Validate JSON schemas
npm run validate:contracts  # Validate contract alignment (JSON Schema ↔ OpenAPI ↔ AsyncAPI)
npm run validate:api        # Lint OpenAPI spec (Redocly)

# Full pipeline
npm run check              # build → validate:schemas → validate:contracts → validate:api → lint → test
```

## Architecture

### Source Structure (`src/`)

| Folder | Purpose |
|--------|---------|
| `contracts/` | JSON schemas and validators for API contracts |
| `ingestion/` | Signal ingestion and validation |
| `signalLog/` | Append-only signal storage |
| `state/` | STATE Engine - learner state management |
| `decision/` | Decision Engine - deterministic evaluation |
| `output/` | API/event output interfaces |
| `shared/` | Shared utilities and types |

### Data Flow

```
External System → POST /signals → Ingestion → Signal Log → STATE Engine → Decision Engine → GET /decisions
```

### Key Properties

- **Unidirectional Flow**: Data moves left-to-right through the lifecycle
- **Determinism**: Same input state always produces same decision
- **Immutability**: Signal Log is append-only; STATE updates are versioned
- **Multi-tenant**: Isolated by `org_id` at every stage

## Coding Standards

### TypeScript

- Strict mode enabled (`strict: true`)
- No implicit returns (`noImplicitReturns: true`)
- No unchecked indexed access (`noUncheckedIndexedAccess: true`)
- Use verbatim module syntax (`verbatimModuleSyntax: true`)
- Target ES2022 with NodeNext module resolution

### General

- Keep files focused and small
- Use clear, descriptive names
- Follow existing patterns in the codebase
- Document non-obvious decisions
- Write tests for all new functionality

### Testing

- Tests live in `tests/` with structure mirroring `src/`
- Use Vitest globals (`describe`, `it`, `expect`)
- Coverage targets: `src/**/*.ts` (excluding `.d.ts`)

## Environment Variables

```
PORT=3000                    # Server port
LOG_LEVEL=info               # Logging verbosity (debug, info, warn, error)
SIGNAL_BODY_LIMIT=1048576    # Max request size for POST /v1/signals (bytes)

# SQLite database paths (created on first use)
IDEMPOTENCY_DB_PATH=./data/idempotency.db
SIGNAL_LOG_DB_PATH=./data/signal-log.db
STATE_STORE_DB_PATH=./data/state.db
DECISION_DB_PATH=./data/decisions.db

# Optional (defaults to src/decision/policies/default.json)
DECISION_POLICY_PATH=./src/decision/policies/default.json
```

## Workflow

Use the spec-driven workflow:
1. `/draft-spec` - Generate spec from idea
2. `/plan-impl` - Create implementation plan
3. `/implement-spec` - Generate code from spec
4. `/sync-contracts` - Detect and resolve contract drift
5. `/review` - Post-implementation quality check

For exploring existing code, use `/extract-spec`.

## Documentation

| Path | Purpose |
|------|---------|
| `docs/foundation/architecture.md` | System architecture overview |
| `docs/foundation/setup.md` | Environment setup guide |
| `docs/foundation/[POC Playbook]...Interface Contracts.md` | JSON schemas for all interfaces |
| `docs/foundation/[POC Playbook]...Contract Test Matrix.md` | Required contract tests |
| `docs/foundation/[POC Playbook]...Validation Ruleset.md` | Validation rules and forbidden keys |
| `docs/foundation/solo-dev-execution-playbook.md` | Development workflow guide |
| `docs/specs/` | Generated specification files |
| `docs/cursor agent/` | Cursor workflow documentation |
