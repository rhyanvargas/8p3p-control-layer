---
name: State Delta Detection
overview: |
  Adds automatic delta computation inside computeNewState() in src/state/engine.ts. For every top-level numeric field that changes between the prior and new state version, the engine writes companion fields {field}_delta (numeric difference) and {field}_direction ("improving" | "declining" | "stable") before validateStateObject and saveStateWithAppliedSignals are called. Delta fields are first-class state fields visible in GET /v1/state responses and decision traces. Covers v1.1 flat-field scope only.
todos:
  - id: TASK-001
    content: Implement computeStateDeltas() in src/state/engine.ts
    status: completed
  - id: TASK-002
    content: Integrate computeStateDeltas() into applySignals() pipeline
    status: completed
  - id: TASK-003
    content: Handle null-removal propagation for companion delta fields
    status: completed
  - id: TASK-004
    content: Verify forbidden-keys.ts does not block _delta/_direction suffixes
    status: completed
  - id: TASK-005
    content: Write unit tests for computeStateDeltas() (DELTA-001 through DELTA-007)
    status: completed
  - id: TASK-006
    content: Write integration test for delta fields in decision trace (DELTA-005)
    status: completed
  - id: TASK-007
    content: Update plan status to complete
    status: completed
isProject: false
---

# State Delta Detection

**Spec**: `docs/specs/state-delta-detection.md`

## Prerequisites

Before starting implementation:

- `computeNewState()` + `applySignals()` in `src/state/engine.ts` — **Complete**
- `LearnerState` type with `state: Record<string, unknown>` — **Complete**
- `saveStateWithAppliedSignals()` — **Complete**
- `extractCanonicalSnapshot()` in decision engine — **Complete**
- {PREREQ-001} Confirm `_delta`/`_direction` suffixes are NOT in `FORBIDDEN_KEYS` set in `src/ingestion/forbidden-keys.ts` (addressed by TASK-004)

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Implement computeStateDeltas()

- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
Export a new pure function `computeStateDeltas(prior: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown>`.
  - Iterate over all keys in `next`.
  - For each key `F`:
    - Skip if `prior[F]` is absent (first-signal case — no prior value for this field).
    - Skip if `typeof next[F] !== 'number'` or `typeof prior[F] !== 'number'` (non-numeric field guard).
    - Compute `delta = (next[F] as number) - (prior[F] as number)`.
    - Set `result[F + '_delta'] = delta`.
    - Set `result[F + '_direction'] = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable'`.
  - Return a copy of `next` merged with the computed delta fields (do not mutate `next`).
  - If `next[F]` is numeric but `prior[F]` is not (type change across signals), skip silently and log at `debug` level.
- **Depends on**: none
- **Verification**:
  - `computeStateDeltas({ stabilityScore: 0.55 }, { stabilityScore: 0.28 })` → result contains `stabilityScore_delta: -0.27`, `stabilityScore_direction: "declining"`.
  - `computeStateDeltas({}, { stabilityScore: 0.40 })` → result does NOT contain `stabilityScore_delta` (no prior value).
  - `computeStateDeltas({ name: "Alice" }, { name: "Bob" })` → no `name_delta` or `name_direction` in result.

---

### TASK-002: Integrate computeStateDeltas() into applySignals() pipeline

- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
In `applySignals()`, after the call to `computeNewState(current, signals)` and before `validateStateObject(newState)`:

```ts
  const priorStateObj: Record<string, unknown> =
    current?.state && typeof current.state === 'object' && !Array.isArray(current.state)
      ? (current.state as Record<string, unknown>)
      : {};
  const newStateWithDeltas = computeStateDeltas(priorStateObj, newState);
  

```

  Then replace `newState` with `newStateWithDeltas` for the rest of the pipeline (validation, save, and the retry path).

  Also apply `computeStateDeltas` in the optimistic-lock retry path (after `computeNewState(refreshed, signals)` is recomputed).

- **Depends on**: TASK-001
- **Verification**:
  - After applying a second signal that changes a numeric field, `getState()` returns state containing `{field}_delta` and `{field}_direction`.
  - `GET /v1/state` response body includes delta fields automatically (no route changes needed).

---

### TASK-003: Null-removal propagation for companion delta fields

- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
Inside `computeStateDeltas()`, after the main delta pass, iterate over keys of `prior`:
  - For each key `F` in `prior`: if `next[F]` is absent (key was deleted by deep-merge null semantics), then also ensure `{F}_delta` and `{F}_direction` are absent from the result.
  - Since `deepMerge` already deletes null keys before this function is called, absent keys in `next` that existed in `prior` indicate a null-removal. Delete `result[F + '_delta']` and `result[F + '_direction']` from the returned object.
- **Depends on**: TASK-001
- **Verification**:
  - Prior state has `{ stabilityScore: 0.55, stabilityScore_delta: -0.1, stabilityScore_direction: "declining" }`.
  - Signal nulls `stabilityScore` (deep-merge removes the key).
  - After apply, `getState()` state does NOT contain `stabilityScore`, `stabilityScore_delta`, or `stabilityScore_direction`.

---

### TASK-004: Verify forbidden-keys.ts does not block _delta/_direction suffixes

- **Files**: `src/ingestion/forbidden-keys.ts`
- **Action**: Verify (no change expected)
- **Details**:
Audit `FORBIDDEN_KEYS` in `src/ingestion/forbidden-keys.ts`. Confirm that no entry ends with `_delta` or `_direction` and that the set contains no entries that would accidentally match computed companion field names (e.g., `masteryScore_delta`). The spec requires these suffixes be explicitly NOT forbidden.
If any such entry exists, remove it and add a comment explaining that `_delta` and `_direction` are reserved suffixes for the delta detection system.
- **Depends on**: none
- **Verification**:
  - Grep `FORBIDDEN_KEYS` — no `_delta` or `_direction` entries found.
  - Signal payloads containing `stabilityScore_delta` as an explicit client field are accepted by ingestion (computed value silently overwrites client value per spec).

---

### TASK-005: Unit tests for computeStateDeltas() — DELTA-001 through DELTA-007

- **Files**: `tests/unit/state-engine.test.ts`
- **Action**: Modify
- **Details**:
Add a new `describe('computeStateDeltas')` block importing `computeStateDeltas` from `../../src/state/engine.js`. Cover all 7 contract test IDs:

  | Test ID   | Scenario                                                                                       |
  | --------- | ---------------------------------------------------------------------------------------------- |
  | DELTA-001 | Prior `stabilityScore: 0.55` → new `0.28` → `_delta: -0.27`, `_direction: "declining"`         |
  | DELTA-002 | Prior `masteryScore: 0.40` → new `0.65` → `_delta: 0.25`, `_direction: "improving"`            |
  | DELTA-003 | No prior state (first signal) → no `_delta`, no `_direction`                                   |
  | DELTA-004 | Non-numeric field (`level: "beginner"` → `"intermediate"`) → no `level_delta`                  |
  | DELTA-005 | See TASK-006 (policy + decision trace — integration scope)                                     |
  | DELTA-006 | Prior `stabilityScore: 0.55` → new `0.55` → `_delta: 0`, `_direction: "stable"`                |
  | DELTA-007 | Null-removal: prior has `stabilityScore`, signal nulls it → no `_delta`/`_direction` in result |

  Also add integration-level tests in the existing `applySignals` suite:
  - Second signal on learner changes numeric field → `getState()` contains delta companions.
  - First signal on learner → `getState()` state has no delta companions.
- **Depends on**: TASK-001, TASK-002, TASK-003
- **Verification**: `npm test -- tests/unit/state-engine.test.ts` all pass.

---

### TASK-006: Integration test for delta fields in decision trace (DELTA-005)

- **Files**: `tests/contracts/state-engine.test.ts`
- **Action**: Modify
- **Details**:
Add a `describe('DELTA-005: Delta fields in decision trace')` block. Steps:
  1. Create a policy fixture with rule `{ field: "stabilityScore_delta", operator: "lt", value: -0.1 }`.
  2. Apply two signals: first sets `stabilityScore: 0.55`, second sets `stabilityScore: 0.28`.
  3. Call the decision engine with the above policy against the learner's state.
  4. Assert the decision is `"intervene"`.
  5. Assert `trace.state_snapshot` contains `stabilityScore_delta: -0.27`.
  6. Assert the rationale references `stabilityScore_delta`.
  Reference the existing decision engine test helpers (`tests/contracts/decision-engine.test.ts`) for setup patterns.
- **Depends on**: TASK-001, TASK-002, TASK-005
- **Verification**: `npm test -- tests/contracts/state-engine.test.ts` all pass, including DELTA-005.

---

### TASK-007: Mark plan complete

- **Files**: `.cursor/plans/state-delta-detection.plan.md`
- **Action**: Modify
- **Details**: Update all `todos` statuses to `"completed"` in the frontmatter.
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006
- **Verification**: Plan frontmatter shows all tasks completed.

---

## Files Summary

### To Create


| File     | Task | Purpose                                 |
| -------- | ---- | --------------------------------------- |
| *(none)* | —    | All logic is additive to existing files |


### To Modify


| File                                   | Task                         | Changes                                                                                                                 |
| -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/state/engine.ts`                  | TASK-001, TASK-002, TASK-003 | Add `computeStateDeltas()` export; call it in `applySignals()` after `computeNewState()` in both normal and retry paths |
| `src/ingestion/forbidden-keys.ts`      | TASK-004                     | Verify only — remove any `_delta`/`_direction` entries if found (none expected)                                         |
| `tests/unit/state-engine.test.ts`      | TASK-005                     | Add `describe('computeStateDeltas')` block covering DELTA-001–004, DELTA-006–007 + integration cases                    |
| `tests/contracts/state-engine.test.ts` | TASK-006                     | Add DELTA-005 block: policy on `stabilityScore_delta`, assert decision + trace snapshot                                 |


---

## Test Plan


| Test ID   | Type                 | Description                                                                                | Task     |
| --------- | -------------------- | ------------------------------------------------------------------------------------------ | -------- |
| DELTA-001 | unit                 | Declining numeric field produces negative `_delta` and `"declining"` direction             | TASK-005 |
| DELTA-002 | unit                 | Improving numeric field produces positive `_delta` and `"improving"` direction             | TASK-005 |
| DELTA-003 | unit                 | First signal (no prior state) produces no delta companion fields                           | TASK-005 |
| DELTA-004 | unit                 | Non-numeric field produces no delta companions                                             | TASK-005 |
| DELTA-005 | contract/integration | Delta field referenced in policy rule fires correctly; trace snapshot includes delta value | TASK-006 |
| DELTA-006 | unit                 | Unchanged numeric field produces `_delta: 0` and `"stable"` direction                      | TASK-005 |
| DELTA-007 | unit                 | Null-removal of canonical field removes its delta companions                               | TASK-005 |


---

## Risks


| Risk                                                                   | Impact                                    | Mitigation                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Floating-point imprecision (e.g. `0.1 + 0.2 = 0.30000000000000004`)    | Low — pilot only                          | Document in spec notes; policy thresholds account for epsilon; no rounding in engine (per spec) |
| Client sends field literally named `stabilityScore_delta`              | Low — computed overwrites silently        | Spec documents this as expected; authoritative computed value wins                              |
| `_delta`/`_direction` accidentally added to `FORBIDDEN_KEYS` in future | Medium                                    | TASK-004 audit; add comment in `forbidden-keys.ts` reserving the suffixes                       |
| Optimistic-lock retry path skips `computeStateDeltas`                  | High — would produce stale delta on retry | TASK-002 explicitly applies deltas in both normal and retry paths                               |
| Type change across signals (field was numeric, now string)             | Low — silent skip                         | Log at `debug` level per spec; non-fatal                                                        |


---

## Verification Checklist

- All tasks completed
- `npm test` passes (all 7 DELTA contract test IDs present and green)
- `npm run lint` passes
- `npm run typecheck` passes
- `computeStateDeltas` is a named export (testable in isolation)
- Delta fields appear in `GET /v1/state` without route changes
- No new API endpoints added
- `forbidden-keys.ts` contains no `_delta`/`_direction` entries

---

## Implementation Order

```
TASK-004 (verify forbidden keys)
    ↓
TASK-001 (computeStateDeltas pure function)
    ↓
TASK-002 (integrate into applySignals normal path)
    ↓
TASK-003 (null-removal propagation in computeStateDeltas)
    ↓
TASK-005 (unit tests: DELTA-001–004, DELTA-006–007)
    ↓
TASK-006 (contract/integration test: DELTA-005 decision trace)
    ↓
TASK-007 (mark plan complete)
```

