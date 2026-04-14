---
name: Skill-Level Tracking & Assessment Type Classification
overview: |
  Promotes US-SKILL-001 to v1.1 by delivering four additive changes: (1) dot-path policy evaluation so rules like `skills.fractions.stabilityScore lt 0.5` resolve nested state; (2) a documented skill + assessment_type payload convention that accumulates per-skill metrics via existing deepMerge; (3) recursive nested delta detection in computeStateDeltas (capped at 5 levels); and (4) optional skill/assessment_type query filters on GET /v1/signals and GET /v1/decisions, plus decision_context propagation. All changes are additive and backward-compatible with existing flat-field policies and signals.
todos:
  - id: TASK-001
    content: Create src/shared/dot-path.ts — export getAtPath, setAtPath, isRecord
    status: completed
  - id: TASK-002
    content: Refactor tenant-field-mappings.ts to import from src/shared/dot-path.ts
    status: completed
  - id: TASK-003
    content: Fix dot-path policy evaluation in policy-loader.ts (evaluateConditionCollecting)
    status: completed
  - id: TASK-004
    content: Fix extractCanonicalSnapshot in decision/engine.ts — nested get + setAtPath build
    status: completed
  - id: TASK-005
    content: Extend computeStateDeltas with recursive nested delta detection (max depth 5)
    status: completed
  - id: TASK-006
    content: Propagate skill, assessment_type, school_id into decision_context in decision/engine.ts
    status: completed
  - id: TASK-007
    content: Pass signal context overrides from ingestion/handler-core.ts into evaluateState
    status: completed
  - id: TASK-008
    content: Add skill + assessment_type query filters to GET /v1/signals
    status: completed
  - id: TASK-009
    content: Add skill + assessment_type query filters to GET /v1/decisions
    status: completed
  - id: TASK-010
    content: Unit tests SKL-001 through SKL-009 (dot-path eval + nested deltas)
    status: completed
  - id: TASK-011
    content: Integration/contract tests SKL-010 through SKL-014
    status: completed
  - id: TASK-012
    content: Update OpenAPI spec and shared types
    status: completed
isProject: false
---

# Skill-Level Tracking & Assessment Type Classification

**Spec**: `docs/specs/skill-level-tracking.md`

## Prerequisites

Before starting implementation:
- [x] `getAtPath` / `setAtPath` exist in `src/config/tenant-field-mappings.ts` (private — move to shared)
- [x] `computeStateDeltas` exists in `src/state/engine.ts` (extend with recursion)
- [x] `evaluateConditionCollecting` exists in `src/decision/policy-loader.ts` (change lookup)
- [x] `extractCanonicalSnapshot` exists in `src/decision/engine.ts` (change lookup + build)
- [x] `decision_context` is built in `src/decision/engine.ts` Step 9 (currently empty object)
- [ ] `GET /v1/state/trajectory` (`docs/specs/learner-trajectory-api.md`) — **not yet implemented**; `skill` sugar param (Change 4 last row) deferred until trajectory spec is implemented

## Existing Solutions Verification

| Requirement | Existing Solution | Justification |
|---|---|---|
| Dot-path traversal | `getAtPath` in `tenant-field-mappings.ts` | Already implemented, tested; move to shared |
| Nested object write | `setAtPath` in `tenant-field-mappings.ts` | Already implemented; move to shared |
| Object type guard | `isRecord` in `tenant-field-mappings.ts` | Already implemented; move to shared |
| Deep merge for payload accumulation | `deepMerge` in `src/state/engine.ts` | Already handles nested signal payload merge |
| Payload JSON storage | SQLite `payload TEXT` column | Already stores full payload JSON; JSON path filter via `json_extract` (SQLite built-in) |
| Query filtering | `better-sqlite3` parameterized queries | Use `json_extract(payload, '$.skill')` — no new library needed |

> **Custom code justification (recursive delta):** No library is installed (nor appropriate) for domain-specific delta+direction companion field generation at arbitrary nesting depth. The spec provides the exact algorithm. Custom implementation is simpler than any general-purpose deep-diff library.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

---

### TASK-001: Create `src/shared/dot-path.ts`

- **Files**: `src/shared/dot-path.ts`
- **Action**: Create
- **Details**:
  Move `isRecord`, `getAtPath`, and `setAtPath` from `src/config/tenant-field-mappings.ts` into a new shared module and export them. These three functions are identical to what already exists — no logic change. The new file should export all three.

  

```typescript
  export function isRecord(value: unknown): value is Record<string, unknown>
  export function getAtPath(obj: Record<string, unknown>, path: string): unknown
  export function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void
  

```

- **Depends on**: none
- **Verification**: File exists with 3 exports; TypeScript compiles with no errors

---

### TASK-002: Refactor `tenant-field-mappings.ts` to import from shared

- **Files**: `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**:
  Replace the private `isRecord`, `getAtPath`, and `setAtPath` function definitions with imports from `src/shared/dot-path.ts`. All call-sites within the file remain unchanged — only the definitions move.

  

```typescript
  import { isRecord, getAtPath, setAtPath } from '../shared/dot-path.js';
  

```

- **Depends on**: TASK-001
- **Verification**: `npm run typecheck` passes; existing field-mappings unit tests still pass (`tests/unit/field-mappings-resolve.test.ts`)

---

### TASK-003: Fix dot-path policy evaluation in `policy-loader.ts`

- **Files**: `src/decision/policy-loader.ts`
- **Action**: Modify
- **Details**:
  1. Import `getAtPath` from `src/shared/dot-path.js`.
  2. In `evaluateConditionCollecting()` at the leaf case (currently line ~464), replace:
     

```typescript
     const raw = state[node.field];
     

```
     with:
     

```typescript
     const raw = getAtPath(state, node.field);
     

```
  No other changes needed. `evaluateCondition()` delegates to `evaluateConditionCollecting()` so it inherits the fix automatically.

- **Depends on**: TASK-001
- **Verification**:
  - Unit test SKL-001: nested field `skills.fractions.stabilityScore` at `0.28` matches `lt 0.5`
  - Unit test SKL-002: nested field at `0.72` does not match `lt 0.5`
  - Unit test SKL-003: flat-field `stabilityScore` behavior unchanged (regression)

---

### TASK-004: Fix `extractCanonicalSnapshot` in `decision/engine.ts`

- **Files**: `src/decision/engine.ts`
- **Action**: Modify
- **Details**:
  1. Import `getAtPath`, `setAtPath` from `src/shared/dot-path.js`.
  2. In `extractCanonicalSnapshot()`, change the snapshot-build loop from direct key lookup to dot-path traversal. Crucially, write the resolved value back into the snapshot using `setAtPath` so nested structure is preserved (not flattened):

  **Current (lines ~72-76):**
  

```typescript
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(state, field)) {
      snapshot[field] = state[field];
    }
  }
  

```

  **New:**
  

```typescript
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    const value = getAtPath(state, field);
    if (value !== undefined) {
      setAtPath(snapshot, field, value);
    }
  }
  

```

  This produces `{ skills: { fractions: { stabilityScore: 0.28 } } }` instead of `{ "skills.fractions.stabilityScore": 0.28 }` when a policy references a nested path.

- **Depends on**: TASK-001
- **Verification**:
  - Unit test SKL-004: snapshot includes nested structure for nested policy field
  - Unit test SKL-005: `evaluated_fields[].actual_value` is `0.28` for `skills.fractions.stabilityScore`
  - Existing decision engine contract tests still pass

---

### TASK-005: Extend `computeStateDeltas` with nested recursion

- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
  1. Import `isRecord` from `src/shared/dot-path.js`.
  2. Add a private `computeNestedDeltas` helper (as specified in the spec) with a `depth` parameter (default `0`, max `5`):

  

```typescript
  function computeNestedDeltas(
    prior: Record<string, unknown>,
    next: Record<string, unknown>,
    result: Record<string, unknown>,
    depth = 0
  ): void {
    if (depth >= 5) {
      console.debug('[computeNestedDeltas] max recursion depth reached, skipping');
      return;
    }
    for (const key of Object.keys(next)) {
      const nextVal = next[key];
      const priorVal = prior[key];
      if (typeof nextVal === 'number' && typeof priorVal === 'number') {
        const delta = nextVal - priorVal;
        result[`${key}_delta`] = delta;
        result[`${key}_direction`] = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable';
      } else if (isRecord(nextVal) && isRecord(priorVal)) {
        const nestedResult = (isRecord(result[key]) ? result[key] : {}) as Record<string, unknown>;
        computeNestedDeltas(priorVal, nextVal, nestedResult, depth + 1);
        result[key] = nestedResult;
      }
    }
  }
  

```

  3. In `computeStateDeltas()`, after the existing top-level loop (which handles flat fields), add a pass for nested objects:

  

```typescript
  // Nested delta pass — handles skills.{name}.{metric} pattern
  for (const key of Object.keys(next)) {
    if (isRecord(next[key]) && isRecord(prior[key])) {
      const nestedResult = (isRecord(result[key]) ? result[key] : { ...(next[key] as Record<string, unknown>) }) as Record<string, unknown>;
      computeNestedDeltas(prior[key] as Record<string, unknown>, next[key] as Record<string, unknown>, nestedResult);
      result[key] = nestedResult;
    }
  }
  

```

  The existing top-level flat numeric loop is **not changed** — backward compatibility guaranteed.

  > **Note:** The `isRecord` guard ensures that if `prior[key]` is absent (first signal for a skill), `computeNestedDeltas` is not called — no delta is emitted (SKL-007 requirement).

- **Depends on**: TASK-001
- **Verification**:
  - Unit test SKL-006: prior `0.72` → next `0.55` produces `_delta: -0.17`, `_direction: "declining"`
  - Unit test SKL-007: first signal (no prior) → no `_delta` fields
  - Unit test SKL-008: flat-field delta behavior unchanged
  - Unit test SKL-009: 6-level nesting → no crash, debug log emitted

---

### TASK-006: Propagate `skill`, `assessment_type`, `school_id` into `decision_context`

- **Files**: `src/decision/engine.ts`, `src/decision/validator.ts`
- **Action**: Modify
- **Details**:
  1. Extend `EvaluateStateForDecisionRequest` (defined in `src/decision/validator.ts` or types) with an optional field:
     

```typescript
     signal_context?: {
       skill?: string;
       assessment_type?: string;
       school_id?: string;
     };
     

```
  2. In `evaluateState()` at Step 9 (currently builds empty `decisionContext`), merge signal_context into it:
     

```typescript
     const decisionContext: Record<string, unknown> = {};
     if (request.signal_context?.skill) decisionContext['skill'] = request.signal_context.skill;
     if (request.signal_context?.assessment_type) decisionContext['assessment_type'] = request.signal_context.assessment_type;
     if (request.signal_context?.school_id) decisionContext['school_id'] = request.signal_context.school_id;
     

```
  3. No change to `validateDecisionContext` needed — it currently accepts any object.

- **Depends on**: none (engine.ts change is independent)
- **Verification**:
  - Integration test SKL-010: decision with `skill=fractions` signal has `decision_context.skill === "fractions"`
  - Existing decision engine tests still pass (signal_context is optional)

---

### TASK-007: Pass signal context from `ingestion/handler-core.ts` into `evaluateState`

- **Files**: `src/ingestion/handler-core.ts`
- **Action**: Modify
- **Details**:
  In `handleIngestionCore()`, when building `evalRequest` (around line ~179-186), add `signal_context` derived from the validated signal:

  

```typescript
  const evalRequest: EvaluateStateForDecisionRequest = {
    org_id: signal.org_id,
    learner_reference: signal.learner_reference,
    state_id: applyOutcome.result.state_id,
    state_version: applyOutcome.result.new_state_version,
    requested_at: new Date().toISOString(),
    user_type: userType,
    signal_context: {
      skill: typeof signal.payload?.skill === 'string' ? signal.payload.skill : undefined,
      assessment_type: typeof signal.payload?.assessment_type === 'string' ? signal.payload.assessment_type : undefined,
      school_id: typeof signal.metadata?.school_id === 'string' ? signal.metadata.school_id : undefined,
    },
  };
  

```

  All three fields are optional strings — no validation change needed (`payload` is opaque `object`).

- **Depends on**: TASK-006
- **Verification**:
  - Integration test SKL-010: end-to-end signal → decision has `decision_context.skill`
  - Existing ingestion contract tests pass

---

### TASK-008: Add `skill` + `assessment_type` filters to `GET /v1/signals`

- **Files**:
  - `src/shared/types.ts` (`SignalLogReadRequest`)
  - `src/signalLog/validator.ts`
  - `src/signalLog/store.ts` (`SqliteSignalLogRepository.querySignals`)
  - `src/signalLog/handler-core.ts`
- **Action**: Modify
- **Details**:
  1. **Types** — add optional fields to `SignalLogReadRequest`:
     

```typescript
     skill?: string;
     assessment_type?: string;
     

```
  2. **Validator** — parse and pass through optional string params (no format enforcement per spec constraint — "assessment type is not an enum"):
     

```typescript
     if (typeof params.skill === 'string' && params.skill.trim() !== '') parsed.skill = params.skill.trim();
     if (typeof params.assessment_type === 'string' && params.assessment_type.trim() !== '') parsed.assessment_type = params.assessment_type.trim();
     

```
  3. **Store** — extend the SQLite query in `querySignals` to add optional `json_extract` conditions. Use SQLite's built-in `json_extract(payload, '$.skill')` — no additional library needed:
     

```sql
     AND (? IS NULL OR json_extract(payload, '$.skill') = ?)
     AND (? IS NULL OR json_extract(payload, '$.assessment_type') = ?)
     

```
     Pass `request.skill ?? null` and `request.assessment_type ?? null` (twice each for the IS NULL check pattern, or use dynamic query building).

     > **Dynamic query building is preferred** to keep the query readable: build the WHERE clause string and params array conditionally in TypeScript before calling `this.db.prepare()`. `better-sqlite3` supports this pattern well.

- **Depends on**: none
- **Verification**:
  - Contract test SKL-013: `GET /v1/signals?assessment_type=diagnostic` returns only diagnostic signals

---

### TASK-009: Add `skill` + `assessment_type` filters to `GET /v1/decisions`

- **Files**:
  - `src/shared/types.ts` (`DecisionReadRequest` or equivalent)
  - `src/decision/validator.ts` (decision query validator)
  - `src/decision/store.ts` (`SqliteDecisionRepository.queryDecisions`)
  - `src/decision/handler-core.ts` (if separate from routes)
- **Action**: Modify
- **Details**:
  Same pattern as TASK-008. The `decisions` table stores `decision_context` as a JSON column. Filter using:
  

```sql
  AND (? IS NULL OR json_extract(decision_context, '$.skill') = ?)
  AND (? IS NULL OR json_extract(decision_context, '$.assessment_type') = ?)
  

```
  `decision_context.skill` is populated by TASK-006+007, so this filter is only meaningful for decisions created after those tasks land. Existing decisions (no `skill` in context) will not match a `skill=X` filter — correct behavior.

- **Depends on**: TASK-006
- **Verification**:
  - Contract test SKL-011: `GET /v1/decisions?skill=fractions` returns 1 of 2 seeded decisions
  - Contract test SKL-012: `GET /v1/decisions` without filter returns both

---

### TASK-010: Unit tests SKL-001 through SKL-009

- **Files**: `tests/unit/skill-level-tracking.test.ts`
- **Action**: Create
- **Details**:
  Create a single focused unit test file covering all 9 unit test IDs:

  | Test ID | Target | Scenario |
  |---------|--------|----------|
  | SKL-001 | `evaluateConditionCollecting` | nested field `skills.fractions.stabilityScore = 0.28` matches `lt 0.5` |
  | SKL-002 | `evaluateConditionCollecting` | nested field at `0.72` does not match `lt 0.5` |
  | SKL-003 | `evaluateConditionCollecting` | flat `stabilityScore = 0.28` matches `lt 0.5` (regression) |
  | SKL-004 | `extractCanonicalSnapshot` | snapshot includes nested structure `{ skills: { fractions: { stabilityScore: 0.28 } } }` |
  | SKL-005 | `evaluatePolicy` | `evaluated_fields[].actual_value` is `0.28` for `skills.fractions.stabilityScore` |
  | SKL-006 | `computeStateDeltas` | prior `0.72` → next `0.55` produces `stabilityScore_delta: -0.17`, `_direction: "declining"` at `skills.fractions` level |
  | SKL-007 | `computeStateDeltas` | first signal (empty prior) → no `_delta` fields in nested result |
  | SKL-008 | `computeStateDeltas` | flat-field `stabilityScore_delta` still produced correctly (regression) |
  | SKL-009 | `computeStateDeltas` | 6-level nesting → no crash, no delta fields emitted for that depth |

  Import directly from source modules (not via HTTP). Use vitest.

- **Depends on**: TASK-003, TASK-004, TASK-005
- **Verification**: `npx vitest run tests/unit/skill-level-tracking.test.ts` — all 9 pass

---

### TASK-011: Integration/contract tests SKL-010 through SKL-014

- **Files**: `tests/integration/skill-level-tracking.test.ts`
- **Action**: Create
- **Details**:
  Use Fastify `inject()` pattern (matching `tests/integration/e2e-signal-to-decision.test.ts`) plus seeded in-memory SQLite stores.

  | Test ID | Type | Scenario |
  |---------|------|----------|
  | SKL-010 | integration | POST signal with `payload.skill: "fractions"` → GET /v1/decisions → `decision_context.skill === "fractions"` |
  | SKL-011 | contract | Seed 2 decisions (1 fractions, 1 reading); `GET /v1/decisions?skill=fractions` → 1 result |
  | SKL-012 | contract | Same seed; `GET /v1/decisions` without filter → 2 results |
  | SKL-013 | contract | Seed 2 signals (1 diagnostic, 1 formative); `GET /v1/signals?assessment_type=diagnostic` → 1 result |
  | SKL-014 | integration | Full pipeline: POST fractions signal → nested state with `stabilityScore_delta` → dot-path policy match → decision with `decision_context.skill`, `evaluated_fields` includes nested actual_value |

- **Depends on**: TASK-007, TASK-008, TASK-009
- **Verification**: `npx vitest run tests/integration/skill-level-tracking.test.ts` — all 5 pass

---

### TASK-012: Update OpenAPI spec and shared types

- **Files**:
  - `docs/api/openapi.yaml`
  - `src/shared/types.ts`
- **Action**: Modify
- **Details**:
  1. **OpenAPI** — Add `skill` and `assessment_type` as optional query parameters to:
     - `GET /v1/signals`
     - `GET /v1/decisions`
  2. **OpenAPI** — Update `DecisionContext` schema to include optional `skill` and `assessment_type` string fields (alongside existing `school_id` if present).
  3. **Shared types** — Ensure `EvaluateStateForDecisionRequest` (or its validator interface) includes `signal_context?` per TASK-006.
  4. **Integration guide note** — Add a comment block in OpenAPI or a doc section describing the payload convention for `skill`, `assessment_type`, and `skills.{name}.{metric}`. (Per spec: "Document the convention in the pilot integration guide and in connector templates.")

- **Depends on**: TASK-008, TASK-009
- **Verification**: `npm run lint` passes; `@redocly/cli lint docs/api/openapi.yaml` passes (if configured)

---

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/shared/dot-path.ts` | TASK-001 | Shared `getAtPath`, `setAtPath`, `isRecord` utilities |
| `tests/unit/skill-level-tracking.test.ts` | TASK-010 | SKL-001 through SKL-009 unit tests |
| `tests/integration/skill-level-tracking.test.ts` | TASK-011 | SKL-010 through SKL-014 integration/contract tests |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/config/tenant-field-mappings.ts` | TASK-002 | Remove private function defs; import from shared |
| `src/decision/policy-loader.ts` | TASK-003 | `state[node.field]` → `getAtPath(state, node.field)` |
| `src/decision/engine.ts` | TASK-004, TASK-006 | `extractCanonicalSnapshot` dot-path build; `decision_context` propagation |
| `src/decision/validator.ts` | TASK-006 | Add `signal_context?` to `EvaluateStateForDecisionRequest` |
| `src/state/engine.ts` | TASK-005 | Add `computeNestedDeltas` helper + nested pass in `computeStateDeltas` |
| `src/ingestion/handler-core.ts` | TASK-007 | Pass `signal_context` into `evalRequest` |
| `src/shared/types.ts` | TASK-008, TASK-009, TASK-012 | Add `skill?`, `assessment_type?` to request types; `signal_context?` |
| `src/signalLog/validator.ts` | TASK-008 | Parse optional `skill` + `assessment_type` params |
| `src/signalLog/store.ts` | TASK-008 | Dynamic WHERE clause with `json_extract` for skill/assessment_type |
| `src/decision/store.ts` | TASK-009 | Dynamic WHERE clause with `json_extract(decision_context, ...)` |
| `docs/api/openapi.yaml` | TASK-012 | Add query params + decision_context schema fields |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| SKL-001 | unit | Dot-path policy eval — nested field matches | TASK-010 |
| SKL-002 | unit | Dot-path policy eval — nested field does not match | TASK-010 |
| SKL-003 | unit | Flat-field backward compatibility | TASK-010 |
| SKL-004 | unit | `extractCanonicalSnapshot` includes nested structure | TASK-010 |
| SKL-005 | unit | Decision trace `evaluated_fields` has correct `actual_value` for nested field | TASK-010 |
| SKL-006 | unit | Nested delta detection — declining direction | TASK-010 |
| SKL-007 | unit | Nested delta — first signal, no prior, no delta | TASK-010 |
| SKL-008 | unit | Flat-field delta regression | TASK-010 |
| SKL-009 | unit | Max recursion depth — no crash, debug log | TASK-010 |
| SKL-010 | integration | Signal with skill → decision_context.skill propagation | TASK-011 |
| SKL-011 | contract | `GET /v1/decisions?skill=fractions` filters correctly | TASK-011 |
| SKL-012 | contract | `GET /v1/decisions` without skill returns all | TASK-011 |
| SKL-013 | contract | `GET /v1/signals?assessment_type=diagnostic` filters correctly | TASK-011 |
| SKL-014 | integration | End-to-end: skill signal → nested state → dot-path policy → skill-scoped decision | TASK-011 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `extractCanonicalSnapshot` using `setAtPath` for nested fields may produce unexpected shapes if two policy fields share a path prefix (e.g., `skills.fractions` and `skills.fractions.stabilityScore`) | Medium | `setAtPath` overwrites intermediate nodes if they're not objects — test both patterns in SKL-004 |
| Dynamic SQL query construction in `store.ts` (TASK-008/009) risks param count mismatch | Medium | Unit-test the store layer directly; use typed param arrays, not string interpolation |
| `computeNestedDeltas` mutates `result[key]` in place — if `result[key]` already has values (from a prior pass), they may be clobbered | Low | Initialize `nestedResult` from `result[key]` if it's already a record, then pass it in — spec implementation already accounts for this |
| `signal_context` is derived from opaque `payload` — malicious or malformed payloads could inject arbitrary strings into `decision_context` | Low | Fields are optional strings; no further execution of those values — acceptable for pilot phase |
| Trajectory `skill` sugar param (spec Change 4, last row) depends on `learner-trajectory-api.md` which is not yet implemented | Low | Explicitly deferred — noted in Prerequisites; trajectory spec task can reference this plan when ready |

## Verification Checklist

- [x] All tasks completed
- [x] All tests pass (`npm test`)
- [x] Linter passes (`npm run lint`)
- [x] Type check passes (`npm run typecheck`)
- [x] Existing tests unaffected (flat-field regression: SKL-003, SKL-008)
- [x] Matches spec requirements (all 14 functional requirements in Requirements section)

## Implementation Order

```
TASK-001 (dot-path shared)
  ├─→ TASK-002 (tenant-field-mappings refactor)
  ├─→ TASK-003 (policy-loader fix)
  ├─→ TASK-004 (extractCanonicalSnapshot fix)
  └─→ TASK-005 (nested delta detection)
        │
TASK-006 (decision_context propagation — independent)
  └─→ TASK-007 (ingestion handler passes signal_context)
        │
TASK-008 (signals query filters — independent of 006/007)
TASK-009 (decisions query filters)
  └─ depends on TASK-006 (decision_context.skill must exist to be filterable)
        │
TASK-010 ← depends on TASK-003, TASK-004, TASK-005
TASK-011 ← depends on TASK-007, TASK-008, TASK-009
TASK-012 ← depends on TASK-008, TASK-009
```
