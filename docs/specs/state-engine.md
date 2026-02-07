# STATE Engine Specification

> Derived from Component Interface Contracts, Contract Test Matrix, and Interface Validation Ruleset.

## Overview

The STATE Engine is the **single source of truth** for learner state within the control layer. It applies signals from the Signal Log to compute and maintain canonical learner state with full version tracking and provenance. The STATE Engine is an **internal component** with no external API surface—state cannot be set or overridden by external systems.

**Lifecycle Position:** Stage 3 of 5 (Ingestion → Signal Log → **STATE Engine** → Decision Engine → Output)

## Core Principle: STATE Authority

The PRD mandates **STATE authority**: the control layer owns learner state exclusively. There is no "setState" endpoint. State evolves only through signal application. This ensures:

- Complete audit trail (every state change traced to signals)
- No external overrides or corruption
- Deterministic state reconstruction from signals

## Data Schemas

### 3.1 LearnerState (Snapshot Schema)

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "state_id": "string",
  "state_version": "integer",
  "updated_at": "string (RFC3339)",
  "state": {},
  "provenance": {
    "last_signal_id": "string",
    "last_signal_timestamp": "string (RFC3339)"
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `org_id` | string | Tenant identifier (1–128 characters) |
| `learner_reference` | string | Learner identifier (1–256 characters) |
| `state_id` | string | Unique identifier for this state snapshot (format: UUID or `{org_id}:{learner_ref}:v{version}`) |
| `state_version` | integer | Monotonically increasing version number |
| `updated_at` | string | When state was last updated (RFC3339) |
| `state` | object | Opaque state object (no domain semantics) |
| `provenance.last_signal_id` | string | ID of last applied signal |
| `provenance.last_signal_timestamp` | string | Timestamp of last applied signal |

### 3.2 ApplySignalsRequest (Internal Invocation)

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "signal_ids": ["string"],
  "requested_at": "string (RFC3339)"
}
```

### 3.3 ApplySignalsResult (Internal Response)

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "prior_state_version": "integer",
  "new_state_version": "integer",
  "state_id": "string",
  "applied_signal_ids": ["string"],
  "updated_at": "string (RFC3339)"
}
```

### 3.4 ApplySignalsOutcome (Discriminated Result)

`applySignals` returns a discriminated outcome rather than throwing on rejection. Internal consumers **must** inspect the `ok` field before accessing results.

**Success:**

```json
{
  "ok": true,
  "result": "ApplySignalsResult (see 3.3)"
}
```

**Rejection:**

```json
{
  "ok": false,
  "errors": [
    {
      "code": "string (canonical error code)",
      "message": "string (human-readable description)",
      "field_path": "string | undefined (dot-delimited path to offending field)"
    }
  ]
}
```

Each entry in the `errors` array is a `RejectionReason` (defined in `src/shared/types.ts`).

**Determinism requirement (per foundation G4):** Identical invalid input must always produce the same error code and field_path, excluding timestamps. Callers should not rely on error message text for branching; use `code` exclusively.

**Error codes returned in rejection outcomes:**

| Code | Trigger |
|------|---------|
| `org_scope_required` | `org_id` missing or blank |
| `missing_required_field` | `learner_reference` or `signal_ids` missing/empty |
| `unknown_signal_id` | Signal ID not found in Signal Log |
| `signals_not_in_org_scope` | Signal belongs to a different org |
| `state_payload_not_object` | Computed state is not a plain object |
| `forbidden_semantic_key_detected` | Computed state contains a forbidden key |
| `state_version_conflict` | Optimistic lock failed after retry |

## Core Constraints

### State Authority (No External Override)

- **No setState endpoint** - State cannot be set directly by any external request
- **Signal-only updates** - State evolves exclusively through signal application
- **No backdoors** - No admin API, no migration endpoint, no escape hatch

### Org Isolation

- All operations **must** include `org_id`
- Signals from org A cannot be applied to learners in org B
- Cross-org signal application → `signals_not_in_org_scope` error

### Monotonic Versioning

- `state_version` always increases (never decreases)
- Each signal application increments version
- Version 0 = initial state (no signals applied)

### Immutable History

- Previous state versions are preserved (append-only history)
- Current state is the highest version
- Full audit trail maintained

### Determinism

- Same signals in same order → same resulting state
- State can be reconstructed by replaying signals from Signal Log
- Concurrent signal application must resolve deterministically

### Signal Ordering

- Signals are always applied in `accepted_at` ascending order
- This ensures determinism regardless of the order in `signal_ids` array
- Ties broken by internal `id` (insertion order)

### Concurrency Control

- Use optimistic locking: read current `state_version`, compute new state, save with version check
- If `prior_state_version` doesn't match current version at save time, re-fetch and retry
- This ensures STATE-008 (deterministic conflict resolution)

## Validation Rules

### ApplySignals Validation

| Condition | Result |
|-----------|--------|
| `org_id` missing/blank | `rejected`, `org_scope_required` |
| `learner_reference` missing/blank | `rejected`, `missing_required_field` |
| `signal_ids` empty array | `rejected`, `missing_required_field` |
| Signal ID not found in Signal Log | `rejected`, `unknown_signal_id` |
| Signal belongs to different org | `rejected`, `signals_not_in_org_scope` |

### State Object Validation

| Condition | Result |
|-----------|--------|
| `state` is not an object | `rejected`, `state_payload_not_object` |
| `state` contains forbidden semantic key | `rejected`, `forbidden_semantic_key_detected` |

### Forbidden Semantic Keys in State

The same forbidden keys from Signal Ingestion apply to the `state` object:

```
ui, screen, view, page, route, url, link, button, cta
workflow, task, job, assignment, assignee, owner
status, step, stage, completion, progress_percent
course, lesson, module, quiz, score, grade
content_id, content_url
```

## Error Codes

### Existing (reuse from Signal Ingestion/Log)

| Code | Description |
|------|-------------|
| `org_scope_required` | Missing or blank org_id |
| `missing_required_field` | Required field absent |
| `forbidden_semantic_key_detected` | Forbidden key in state |

### New (add to `src/shared/error-codes.ts`)

| Code | Description | Example Trigger |
|------|-------------|-----------------|
| `unknown_signal_id` | Signal ID not in Signal Log | `signal_ids=["nonexistent"]` |
| `signals_not_in_org_scope` | Signal belongs to different org | Apply org B signal to org A learner |
| `state_payload_not_object` | State is not a JSON object | Internal state corruption |
| `state_version_conflict` | Optimistic lock failure | Concurrent update detected |

## Implementation Components

### 1. STATE Store (`src/state/store.ts`)

SQLite-backed storage for learner state:

```sql
CREATE TABLE IF NOT EXISTS learner_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  learner_reference TEXT NOT NULL,
  state_id TEXT NOT NULL UNIQUE,
  state_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  state TEXT NOT NULL,
  last_signal_id TEXT NOT NULL,
  last_signal_timestamp TEXT NOT NULL,
  UNIQUE(org_id, learner_reference, state_version)
);

CREATE INDEX idx_learner_state_lookup 
  ON learner_state(org_id, learner_reference);
  
CREATE INDEX idx_learner_state_current
  ON learner_state(org_id, learner_reference, state_version DESC);
```

**Functions:**
- `initStateStore(dbPath: string): void` - Initialize database with schema
- `getState(orgId: string, learnerReference: string): LearnerState | null` - Get current state
- `getStateByVersion(orgId: string, learnerReference: string, version: number): LearnerState | null` - Get specific version
- `saveState(state: LearnerState): void` - Persist new state version
- `closeStateStore(): void` - Close database connection
- `clearStateStore(): void` - Clear for testing

### 2. STATE Types (`src/shared/types.ts`)

Add new types:

```typescript
interface LearnerState {
  org_id: string;
  learner_reference: string;
  state_id: string;
  state_version: number;
  updated_at: string;
  state: Record<string, unknown>;
  provenance: {
    last_signal_id: string;
    last_signal_timestamp: string;
  };
}

interface ApplySignalsRequest {
  org_id: string;
  learner_reference: string;
  signal_ids: string[];
  requested_at: string;
}

interface ApplySignalsResult {
  org_id: string;
  learner_reference: string;
  prior_state_version: number;
  new_state_version: number;
  state_id: string;
  applied_signal_ids: string[];
  updated_at: string;
}
```

### 3. STATE Engine (`src/state/engine.ts`)

Core state computation logic:

**Functions:**
- `applySignals(request: ApplySignalsRequest): ApplySignalsOutcome` - Apply signals to state (see 3.4 for outcome shape)
- `computeNewState(currentState: LearnerState | null, signals: SignalRecord[]): Record<string, unknown>` - Compute state from signals (reducer pattern)
- `validateStateObject(state: Record<string, unknown>): ValidationResult` - Check for forbidden keys

**State Computation:**
The `computeNewState` function acts as a reducer:
1. Start with current state (or empty object for new learner)
2. Apply each signal's payload in order
3. Return new state object

Initial implementation: merge signal payloads into state (shallow or deep merge configurable). Future: pluggable state reducers.

### 4. STATE Validator (`src/state/validator.ts`)

Validate state-related inputs:
- `validateApplySignalsRequest(request: unknown): ValidationResult`
- `validateStateObject(state: Record<string, unknown>): ValidationResult` - Check for forbidden semantic keys

### 5. Integration with Signal Log

The STATE Engine queries the Signal Log to:
1. Verify signal_ids exist and belong to correct org
2. Retrieve signal payloads for state computation
3. Maintain provenance chain

**Dependency:** Requires `getSignalsByIds()` function from Signal Log (see `docs/specs/signal-log.md`).

### 6. Applied Signals Tracking

Track which signals have been applied to prevent duplicate application:

```sql
CREATE TABLE IF NOT EXISTS applied_signals (
  org_id TEXT NOT NULL,
  learner_reference TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  state_version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(org_id, learner_reference, signal_id)
);
```

Before applying a signal, check if it's already been applied. This ensures idempotency (STATE-007).

## Signal Application Flow

```
ApplySignalsRequest
        │
        ▼
┌──────────────────┐
│ Validate Request │ ← Check org_id, learner_reference, signal_ids
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Fetch Signals    │ ← Query Signal Log for signal_ids
│ from Signal Log  │ ← Verify org scope
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Get Current      │ ← Load from STATE Store (or null if new)
│ Learner State    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Compute New      │ ← Apply signals in order
│ State (Reducer)  │ ← Validate no forbidden keys
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Save New State   │ ← Increment version
│ Version          │ ← Update provenance (retry once on conflict)
└────────┬─────────┘
         │
         ▼
  ApplySignalsOutcome (ok: true → result | ok: false → errors)
```

## Contract Tests

Implement all tests from the Contract Test Matrix:

| Test ID | Description | Expected |
|---------|-------------|----------|
| STATE-001 | ApplySignals happy path | `new_state_version >= prior_state_version`, `applied_signal_ids` = input |
| STATE-002 | Unknown signal ID | `rejected`, `unknown_signal_id` |
| STATE-003 | Cross-org signal leakage block | `rejected`, `signals_not_in_org_scope` |
| STATE-004 | State object must be object | `rejected`, `state_payload_not_object` |
| STATE-005 | Forbidden semantic keys in state | `rejected`, `forbidden_semantic_key_detected` |
| STATE-006 | Monotonic state_version | After sequential applies: M > N |
| STATE-007 | ApplySignals idempotency | Same signals + same prior version = same result |
| STATE-008 | Deterministic conflict resolution | Concurrent applies resolve identically |

### Additional Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| STATE-009 | New learner state | First signal creates version 1 |
| STATE-010 | Empty state object allowed | `state: {}` is valid |
| STATE-011 | Provenance tracking | `last_signal_id` matches last applied signal |
| STATE-012 | Get state by version | Historical versions retrievable |
| STATE-013 | State isolation by learner | Learner A state independent of learner B |

## File Structure

```
src/
├── state/
│   ├── store.ts                      # SQLite storage layer
│   ├── engine.ts                     # Signal application logic
│   └── validator.ts                  # Request/state validation
├── shared/
│   ├── types.ts                      # Add LearnerState, ApplySignals* types
│   └── error-codes.ts                # Add STATE error codes
└── signalLog/
    └── store.ts                      # Queried for signal verification

tests/
├── contracts/
│   └── state-engine.test.ts          # STATE-* contract tests
└── unit/
    ├── state-store.test.ts           # Store unit tests
    └── state-engine.test.ts          # Engine unit tests
```

## Success Criteria

Implementation is complete when:

- [ ] `applySignals()` applies signals and returns ApplySignalsResult
- [ ] Signal IDs verified against Signal Log
- [ ] Cross-org signal application blocked
- [ ] State object validated for forbidden semantic keys
- [ ] `state_version` monotonically increases
- [ ] Provenance tracks last applied signal
- [ ] Idempotent: same signals + same prior state = same result
- [ ] Deterministic: order-independent for concurrent applies
- [ ] Historical state versions preserved and queryable
- [ ] All STATE-001 through STATE-008 contract tests pass
- [ ] No external setState endpoint exists (STATE authority maintained)

## Dependencies

- **better-sqlite3** - Already installed (used for Signal Log and idempotency)
- **Signal Log Store** - Requires `getSignalsByIds()` function (defined in `docs/specs/signal-log.md`)

## Integration Points

### Receives From

- **Signal Log** (`getSignalsByIds`) - Retrieves signal payloads by ID for application (internal; see `docs/specs/signal-log.md`)

### Feeds Into

- **Decision Engine** (Stage 4) - Provides `LearnerState` for decision evaluation

**Exposed function for Decision Engine:**
```typescript
getState(orgId: string, learnerReference: string): LearnerState | null
```
Returns the current (highest version) state for the learner, or `null` if no state exists.

## Triggering State Updates

State updates can be triggered:

1. **Synchronously during ingestion** - After a signal is accepted, immediately apply it
2. **Asynchronously via batch** - Periodic job applies pending signals
3. **On-demand** - When Decision Engine needs current state

Initial implementation: **synchronous during ingestion** (simplest, consistent with Signal Log integration pattern).

## State Computation Strategy

The initial state computation uses **payload merge**:

```typescript
function computeNewState(
  currentState: Record<string, unknown> | null,
  signals: SignalRecord[]
): Record<string, unknown> {
  let state = currentState ?? {};
  
  for (const signal of signals) {
    // Deep merge signal payload into state
    state = deepMerge(state, signal.payload);
  }
  
  return state;
}
```

**Deep Merge Semantics:**
- Objects merge recursively (nested objects combined)
- Arrays replace entirely (not concatenated)
- Explicit `null` value removes the key from state
- Primitives overwrite previous values

This is intentionally simple and domain-agnostic. Future enhancements:
- Pluggable reducers per signal type
- Conflict resolution strategies
- State schema evolution

## Notes

- **Internal only** - No REST API endpoint for STATE Engine
- **No direct state manipulation** - All changes via signal application
- **Opaque state** - No interpretation of state semantics
- **Version history** - All versions preserved, not just current
- **Audit friendly** - Full provenance from state back to signals
- **Replay capability** - State reconstructable from Signal Log

## Out of Scope

- External API for state queries (Decision Engine handles output)
- State schema validation (state is opaque)
- Domain-specific state reducers (future enhancement)
- State snapshots/checkpoints for performance (future optimization)
- Event emission for state changes (future: StateUpdatedEvent)
