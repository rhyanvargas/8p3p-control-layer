# Solo Developer Execution Playbook

A disciplined, milestone-driven plan for building the 8P3P Control Layer as a solo developer with AI agent assistance.

---

## Core Principle

You are not "building the platform." You are proving the control layer works by delivering one thin vertical slice:

**Signal Ingestion → Immutable Signal Log → STATE Update → Decision → Output**

Everything else is noise until this slice is running end-to-end with contract tests.

---

## Current State Assessment

Before starting any session, verify where you are:

| Artifact | Status | Location |
|----------|--------|----------|
| Interface Contracts | ✅ Complete | `docs/foundation/...Component Interface Contracts.md` |
| Contract Test Matrix | ✅ Complete | `docs/foundation/...Contract Test Matrix.md` |
| Validation Ruleset | ✅ Complete | `docs/foundation/...Interface Validation Ruleset.md` |
| Architecture Diagram | ✅ Complete | `docs/foundation/architecture.md` |
| Setup Guide | ✅ Complete | `docs/foundation/setup.md` |
| Project Scaffolding | ✅ Complete | `src/`, `tests/`, `scripts/` |
| Implementation | ⬜ Not started | — |

**Last updated:** 2025-01-29 — Phase 0 complete, ready for Phase 1.

---

## Phase 0: Complete the Agent-Ready Doc Pack

**Goal:** A small set of documents that prevent drift and let Cursor agents generate consistent code.

**Time estimate:** 1-2 focused sessions

### Deliverables

| Item | Purpose | Format | Status |
|------|---------|--------|--------|
| Architecture Diagram | Visual reference for agents and humans | Mermaid in `docs/foundation/architecture.md` | ✅ |
| Setup Guide | How to run, test, deploy locally | Markdown in `docs/foundation/setup.md` | ✅ |

### Architecture Diagram Requirements

Create a Mermaid diagram that shows:
- The five lifecycle stages (boxes)
- Data flow between stages (arrows)
- External boundaries (API in, API/Event out)
- Storage touchpoints (Signal Log, STATE store)

### Setup Guide Requirements

Document must include:
- Prerequisites (Node.js version, npm/pnpm)
- Install commands
- How to run locally
- How to run tests
- How to validate contracts
- Environment variables (if any)

✅ All requirements met in `docs/foundation/setup.md`

### Phase 0 Completion Criteria

You are done with Phase 0 when:
- [x] Architecture diagram exists and matches the README lifecycle flow
- [x] Setup guide is written and accurate (`docs/foundation/setup.md`)
- [x] All foundation docs are in `docs/foundation/`
- [x] Project scaffolding complete (directories, configs, dependencies)
- [x] `npm run dev` starts server, `/health` returns 200

**✅ Phase 0 Complete (2025-01-29)**

---

## Phase 1: Build the Local Control Layer

**Goal:** Run the full lifecycle locally with deterministic behavior and contract tests.

**Time estimate:** 4-6 focused sessions (weekend-sized blocks)

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Compile-time safety, better AI agent performance |
| Framework | Fastify | Minimal abstraction, explicit lifecycle, schema integration |
| Validation | Ajv | Industry-standard JSON Schema validator |
| Local Storage | SQLite | Simple, file-based, zero-config |
| Test Runner | Vitest or Jest | Fast, TypeScript-native |

### Project Structure

```
src/
├── contracts/           # JSON schemas + Ajv validators
│   ├── schemas/         # Raw JSON Schema files
│   └── validators/      # Compiled Ajv validators
├── ingestion/           # Signal ingestion API
├── signalLog/           # Append-only signal storage
├── state/               # STATE engine
├── decision/            # Decision engine
├── output/              # Decision output API
└── shared/              # Utilities, types, error codes
```

### Implementation Order

Work through components in lifecycle order. Each component follows the same pattern:

1. Create JSON Schema in `src/contracts/schemas/`
2. Build Ajv validator in `src/contracts/validators/`
3. Implement component logic
4. Add tests from Contract Test Matrix
5. Verify all tests pass before moving on

#### Session 1-2: Ingestion

| Task | Test IDs to Implement |
|------|----------------------|
| POST /signals endpoint | SIG-API-001 through SIG-API-011 |
| SignalEnvelope validation | All structural validations |
| Idempotency by (org_id, signal_id) | SIG-API-010 |
| Forbidden semantic key detection | SIG-API-007, SIG-API-008 |

#### Session 3: Signal Log

| Task | Test IDs to Implement |
|------|----------------------|
| Append-only SQLite storage | SIGLOG-005 (immutability) |
| Read interface with pagination | SIGLOG-001, SIGLOG-003, SIGLOG-004 |
| Time range queries | SIGLOG-002 |

**Storage Design Note:** Design access patterns with DynamoDB in mind. Your primary access patterns will be:
- Write: Insert by (org_id, signal_id)
- Read: Query by (org_id, learner_reference) with time range

#### Session 4: STATE Engine

| Task | Test IDs to Implement |
|------|----------------------|
| Apply signals to state | STATE-001 |
| Monotonic state_version | STATE-006 |
| Cross-org isolation | STATE-003 |
| Idempotent apply | STATE-007 |
| Deterministic conflict resolution | STATE-008 |
| Forbidden semantic key blocking | STATE-005 |

#### Session 5: Decision Engine

| Task | Test IDs to Implement |
|------|----------------------|
| Evaluate state for decision | DEC-001 |
| Decision type enforcement | DEC-002 |
| Trace requirement | DEC-005 |
| Deterministic output | DEC-006 |
| Forbidden semantic key blocking | DEC-004 |

**Decision Logic for Phase 1:** Implement one real decision rule that reads state:
- If `state.signal_count >= 3`, return `advance`
- Otherwise, return `reinforce`

This proves the wiring works without requiring complex decision logic.

#### Session 6: Output

| Task | Test IDs to Implement |
|------|----------------------|
| GET /decisions endpoint | OUT-API-001, OUT-API-002, OUT-API-003 |
| Pagination | OUT-API-003 |

### Phase 1 Completion Criteria

You are done with Phase 1 when:
- [ ] `POST /signals` accepts valid SignalEnvelope and rejects invalid ones
- [ ] `GET /decisions` returns decisions for a learner
- [ ] All Contract Test Matrix tests pass (SIG-*, SIGLOG-*, STATE-*, DEC-*, OUT-*)
- [ ] Idempotency works: duplicate signals return `duplicate` status
- [ ] Determinism works: same input always produces same output
- [ ] Forbidden semantic keys are blocked at all entry points
- [ ] You can run the full lifecycle locally: signal in → decision out

---

## Phase 2: Deploy to AWS (Minimal Footprint)

**Goal:** Deploy the same vertical slice with minimal moving parts and minimal spend.

**Time estimate:** 2-4 focused sessions

### Before migrating storage (Phase 2 prep)

Before converting any store (Signal Log, STATE, Decision) to DynamoDB, extract a repository/interface from the current SQLite module so the engine or handlers depend on that interface; then implement one adapter for SQLite and one for DynamoDB. That keeps business logic unchanged and preserves all contract tests as the migration guard. Apply the same approach for STATE Store (StateRepository), Signal Log, and Decision Store when each is migrated.

#### StateRepository interface (reference)

```typescript
interface StateRepository {
  getState(orgId: string, learnerRef: string): LearnerState | null;
  getStateByVersion(orgId: string, learnerRef: string, version: number): LearnerState | null;
  saveStateWithAppliedSignals(state: LearnerState, entries: AppliedSignalEntry[]): void;
  isSignalApplied(orgId: string, learnerRef: string, signalId: string): boolean;
  close(): void;
}
```

#### Migration checklist (STATE Store → DynamoDB)

- [ ] Define `StateRepository` interface (recommended: `src/state/types.ts`)
- [ ] Implement `SqliteStateRepository` by extracting logic from `src/state/store.ts`
- [ ] Refactor STATE Engine construction to accept a `StateRepository` (constructor/factory), removing reliance on module-level singletons
- [ ] Ensure all contract + unit tests pass using `SqliteStateRepository`
- [ ] Implement `DynamoDbStateRepository`
- [ ] Ensure all contract + unit tests pass using `DynamoDbStateRepository`
- [ ] Repeat the same pattern for Signal Log (`SignalLogRepository`) and Decision persistence

#### Key design notes

- `StateVersionConflictError` is already vendor-neutral (STATE engine should not depend on SQLite error codes/messages)
- DynamoDB uses transactional writes (e.g., `TransactWriteItems`) rather than `db.transaction()`
- DynamoDB stores JSON-like structures as native Maps instead of `JSON.stringify(...)` to TEXT columns
- Connection management should move from module singletons to injected instances (DI) to make backend swaps mechanical

### AWS Architecture

| Component | AWS Service | Pricing Model |
|-----------|-------------|---------------|
| API | API Gateway + Lambda | Pay per request |
| Signal Log | DynamoDB | Pay per usage |
| STATE Store | DynamoDB | Pay per usage |
| Decision Store | DynamoDB | Pay per usage |
| Events (optional) | EventBridge | Pay per event |

### DynamoDB Table Design

**Signals Table:**
- Partition Key: `org_id`
- Sort Key: `signal_id`
- GSI1: `org_id` + `learner_reference` + `timestamp` (for time-range queries)

**State Table:**
- Partition Key: `org_id#learner_reference` (composite)
- Sort Key: `state_version` (number)
- GSI1 PK: `org_id`, GSI1 SK: `learner_reference` (for cross-learner queries if needed)

> Each state version is a separate item (append-only). `getState()` queries with `ScanIndexForward=false, Limit=1` to get the latest version. `getStateByVersion()` queries with exact sort key.

**Decisions Table:**
- Partition Key: `org_id`
- Sort Key: `decision_id`
- GSI1: `org_id` + `learner_reference` + `decided_at` (for time-range queries)

### Cost Guardrails

- Use on-demand pricing (no provisioned capacity)
- Set TTL on signals/decisions while prototyping (30-day retention)
- Configure billing alerts at $10, $50, $100 thresholds
- Avoid always-on services (no ECS, no RDS)

### Phase 2 Completion Criteria

You are done with Phase 2 when:
- [ ] Lambda functions deploy successfully
- [ ] API Gateway routes to correct handlers
- [ ] DynamoDB tables created with correct schema
- [ ] All contract tests pass against deployed endpoints
- [ ] Billing alerts configured
- [ ] Cost stays under $50/month during development

---

## Phase 3: Add EDA Backbone (Future)

Only proceed to Phase 3 when you have:
- At least 2 external signal producers, OR
- At least 2 decision consumers, OR
- Fanout requirements that justify the complexity

Until then, Phase 2 is sufficient.

---

## Session Execution Protocol

### Session Start Checklist

Before writing any code:

1. **Verify context:** Read last session's commit messages
2. **Confirm stability:** Run `npm test` — all tests must pass
3. **Locate position:** Which component are you working on?
4. **Load contracts:** Open relevant schema from `docs/foundation/`
5. **Set goal:** Define one specific outcome for this session

### During Session

- Work on ONE component at a time
- Implement contract → validator → logic → tests (in that order)
- Run tests frequently (after each significant change)
- Commit working increments (don't batch large changes)

### Session End Checklist

A session is complete when:

- [ ] All existing tests still pass
- [ ] Any new code has corresponding tests
- [ ] Changes are committed with a descriptive message
- [ ] You can explain what you did in one sentence

**End-of-session commit template:**
```
[component] Brief description of what was accomplished

- Specific change 1
- Specific change 2

Tests: X passing, Y added
```

---

## Cursor Agent Collaboration

### Build Rules (Add to `.cursor/rules/`)

Create a rule file that agents must follow:

```markdown
## 8P3P Build Constraints

1. **Lifecycle Only:** Implement ONLY what is required for: ingest → log → state → decide → output
2. **No Scope Creep:** Reject any UI, workflow, or domain logic
3. **Contract Conformance:** All inputs/outputs must match schemas in `docs/foundation/`
4. **Tests First:** Reference Contract Test Matrix before writing integration code
5. **No Premature AWS:** No AWS service decisions unless explicitly required

## Forbidden Patterns

- Do not add endpoints not defined in Interface Contracts
- Do not add fields not defined in schemas
- Do not skip validation for "convenience"
- Do not add logging/monitoring infrastructure (yet)
```

### Agent Prompting by Phase

**Phase 0 prompts:**
```
Generate a Mermaid architecture diagram for the 8P3P control layer.
It must show: Signal Ingestion, Signal Log, STATE Engine, Decision Engine, Output.
Data flows left to right. External systems are on the left and right edges.
Use the lifecycle from docs/foundation/...Component Interface Contracts.md
```

**Phase 1 prompts:**
```
Implement the [component] following these constraints:
1. Schema is defined in docs/foundation/...Component Interface Contracts.md
2. Tests are defined in docs/foundation/...Contract Test Matrix.md (Test IDs: X, Y, Z)
3. Use Ajv for validation
4. Implementation is complete when all referenced tests pass
5. Do not add features not in the contract
```

**Phase 2 prompts:**
```
Convert [component] from local SQLite to DynamoDB Lambda.
Requirements:
1. Preserve all existing test assertions
2. Do not change business logic
3. Use the table schema defined in solo-dev-playbook.md Phase 2
4. Add IAM permissions to serverless.yml
```

### Agent Completion Signals

Tell agents explicitly when they're done:

> "Implementation is complete when:
> 1. All Contract Test Matrix cases for this component pass
> 2. No new dependencies are added without approval
> 3. The function signature matches the contract exactly
> 4. Forbidden semantic keys are rejected with correct error codes"

---

## Recovery Playbook

### If tests fail after an agent-generated change

1. Run `git diff` to see what changed
2. Identify which test failed and why
3. If the change is wrong: `git checkout -- [file]`
4. Re-prompt agent with: "The previous implementation failed test [ID] with error [message]. Fix only the failing case without changing passing tests."

### If scope creep is detected

1. Identify the offending code (UI logic, workflow logic, domain semantics)
2. Delete it: `git checkout -- [file]` or manual removal
3. Add the pattern to Build Rules as an explicit rejection
4. Re-prompt with narrower scope

### If AWS costs spike unexpectedly

1. Check CloudWatch for unexpected invocations
2. Disable API Gateway endpoint if needed
3. Review DynamoDB consumed capacity
4. Add/lower TTL on tables
5. Consider adding API throttling

### If you're stuck for more than 30 minutes

1. Stop coding
2. Write down what you're trying to accomplish in one sentence
3. Write down what's blocking you
4. Check if you're solving the right problem (is this in scope?)
5. If in scope: search for similar patterns in the codebase
6. If out of scope: add to "future considerations" and move on

---

## Milestone 1 Definition of Done

You have achieved Milestone 1 when you have:

### Working System
- [ ] `POST /signals` — accepts SignalEnvelope, validates, stores
- [ ] `GET /decisions` — returns decisions for learner + time window
- [ ] Full lifecycle works: signal in → state update → decision out
- [ ] Deterministic behavior: same input always produces same output

### Documentation
- [ ] Architecture diagram in `docs/foundation/`
- [ ] Interface contracts in `docs/foundation/`
- [ ] Validation ruleset in `docs/foundation/`
- [ ] Contract test matrix in `docs/foundation/`
- [ ] Execution plan with run/test instructions

### Test Coverage
- [ ] All SIG-API-* tests passing
- [ ] All SIGLOG-* tests passing
- [ ] All STATE-* tests passing
- [ ] All DEC-* tests passing
- [ ] All OUT-API-* tests passing
- [ ] All META-* tests passing

### Agent Safety
- [ ] Cursor agents can assist without drifting into forbidden scope
- [ ] Build rules documented and enforced
- [ ] Contract tests catch regressions automatically

---

## Quick Reference

### Forbidden Semantic Keys (Block These Everywhere)

```
ui, screen, view, page, route, url, link, button, cta
workflow, task, job, assignment, assignee, owner
status, step, stage, completion, progress_percent
course, lesson, module, quiz, score, grade
content_id, content_url
```

### Allowed Decision Types (Closed Set)

```
reinforce | advance | intervene | pause | escalate | recommend | reroute
```

### Error Codes (Standard Set)

```
missing_required_field, invalid_type, invalid_format
invalid_timestamp, invalid_length, invalid_charset
invalid_schema_version, payload_not_object
forbidden_semantic_key_detected, duplicate_signal_id
org_scope_required, request_too_large
```

---

## Why This Approach Works

- **Contracts outlive code:** Your foundation docs are stable; implementations can change
- **Local correctness first:** AWS won't fix bugs that exist locally
- **Tests are your second brain:** They catch regressions and guide agents
- **Complexity is earned:** Only add AWS/EDA when the simple version works
- **Agents need guardrails:** Explicit constraints prevent scope creep

Most importantly: **You learn architectural thinking by doing, without being crushed by it.**
