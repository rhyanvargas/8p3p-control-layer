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

# Demo seeds
npm run seed:demo          # Seed org_demo (generic demo)
npm run seed:springs-demo  # Seed springs org (Canvas + Blackboard + Absorb, 14 signals)
```

## Architecture

## Planning Entry Point

- **Roadmap (living anchor):** `internal-docs/foundation/roadmap.md`
- **Execution plans:** `.cursor/plans/`
- **Rule of thumb:** specs define *what*, plans define *how*, reports define *why/when*.

### Source Structure (`src/`)

| Folder | Purpose |
|--------|---------|
| `contracts/` | JSON schemas and validators for API contracts |
| `ingestion/` | Signal ingestion and validation |
| `signalLog/` | Append-only signal storage |
| `state/` | STATE Engine - learner state management |
| `decision/` | Decision Engine - deterministic evaluation |
| `output/` | Placeholder for future webhook/event adapters; API output (GET /v1/decisions, GET /v1/receipts) implemented in `decision/` |
| `shared/` | Shared utilities and types |

### Data Flow

```
External System → POST /v1/signals → Ingestion → Signal Log → STATE Engine → Decision Engine → GET /v1/decisions
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
- Keep all `import` statements contiguous at the top of each module (no executable/type/function blocks between imports)

### Testing

- Tests live in `tests/` with structure mirroring `src/`
- Use Vitest globals (`describe`, `it`, `expect`)
- Coverage targets: `src/**/*.ts` (excluding `.d.ts`)

#### Test Coverage Policy

- **Every new public function or class** must have at least one direct test exercising its primary behavior
- **Every spec-defined contract test** (e.g., DEC-001–DEC-008) must have a corresponding test implementation in `tests/contracts/`
- **One spec test ID per `it(...)` block** for debuggability and explicit traceability
- **Error-path contract tests must assert exact expected error codes** (not only that a code exists)
- **New DI injection points, adapters, and interface implementations** must be tested both directly (class-level) and indirectly (through module-level delegation)
- **Spec → Plan → Test mapping**: If a spec defines contract tests, the plan must include test implementation tasks, and `/implement-spec` must verify they exist before marking complete

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

Use the spec-driven workflow (detailed workflow instructions live in `.cursor/skills/`):
1. `/draft-spec` - Generate spec from idea
2. `/plan-impl` - Create implementation plan
3. `/implement-spec` - Implement plan/spec
4. `/sync-contracts` - Detect and resolve contract drift
5. `/review` - Post-implementation quality check

For exploring existing code, use `/extract-spec`.
Canonical reference: `internal-docs/foundation/definitive-workflow.md`.

## Instruction Ownership (No Redundancy)

- **Rules (`.cursor/rules/`)**: durable standards, constraints, and policy
- **Commands (`.cursor/commands/`)**: short entrypoints and usage examples only
- **Skills (`.cursor/skills/`)**: step-by-step execution workflow

Do not duplicate detailed workflow instructions in rules or commands.

## Documentation

| Path | Purpose |
|------|---------|
| `docs/foundation/architecture.md` | System architecture overview |
| `docs/foundation/setup.md` | Environment setup guide |
| `internal-docs/foundation/roadmap.md` | Planning entry point (latest roadmap snapshot + execution plans) |
| `internal-docs/foundation/poc-playbooks/Component Interface Contracts.md` | JSON schemas for all interfaces |
| `internal-docs/foundation/poc-playbooks/Contract Test Matrix.md` | Required contract tests |
| `internal-docs/foundation/poc-playbooks/Interface Validation Ruleset.md` | Validation rules and forbidden keys |
| `internal-docs/archive/playbooks/solo-dev-execution-playbook.md` | Development workflow guide (archived) |
| `docs/specs/` | Generated specification files |
