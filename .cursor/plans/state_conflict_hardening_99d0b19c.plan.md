---
name: STATE conflict hardening
overview: Harden STATE Engine optimistic-lock conflict handling to preserve determinism under concurrent applies, and document the applySignals outcome/rejection shape in the State Engine spec to reduce internal-consumer drift.
todos:
  - id: TASK-001
    content: Harden SQLite constraint/conflict detection in STATE engine
    status: completed
  - id: TASK-002
    content: Add deterministic unit test for retry-on-conflict path
    status: completed
  - id: TASK-003
    content: Update state-engine spec to document outcome/rejection shape
    status: completed
isProject: false
---

## Goal

- Ensure `applySignals()` reliably detects SQLite constraint conflicts and retries deterministically (per STATE-008 / determinism doctrine).
- Update the STATE Engine spec to explicitly document the `applySignals` success vs rejection/outcome shape.

## Context (current state)

- Conflict detection currently relies on a thrown error’s `code === "SQLITE_CONSTRAINT"` in `src/state/engine.ts`.
- Foundation doctrine emphasizes determinism and deterministic conflict resolution (STATE-008) in `docs/foundation/`.

## Implementation plan

### TASK-001: Harden SQLite constraint/conflict detection in engine

- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
  - Introduce a small helper (e.g. `isSqliteConstraintError(err)`) that returns true when the error appears to be a unique/constraint violation.
  - Detection strategy:
    - Prefer `err.code === 'SQLITE_CONSTRAINT'` when present.
    - Add a fallback based on `err.message` containing typical SQLite constraint phrases (e.g. `UNIQUE constraint failed`, `SQLITE_CONSTRAINT`).
  - Use the helper in the optimistic-lock save path so conflict detection is resilient across sqlite driver variants.
- **Verification**:
  - Lint and typecheck pass.

### TASK-002: Add a deterministic unit test for the retry-on-conflict path

- **Files**: `tests/unit/state-engine.test.ts`
- **Action**: Modify
- **Details**:
  - Add a test that forces a version-conflict on the first save attempt and asserts the engine retries and succeeds.
  - Recommended approach (single-threaded, deterministic):
    - Use `vitest` spying to wrap `stateStore.saveState` for the first call.
    - Just before delegating to the real `saveState`, insert a conflicting `learner_state` row directly via `getStateStoreDatabase()` with the same `(org_id, learner_reference, state_version)` but a different `state_id`.
    - Assert:
      - `applySignals(...)` returns `ok: true`.
      - `new_state_version` is incremented beyond the conflicting version (e.g. becomes 2).
      - `getState(...)` reflects the later version.
  - (Optional) Add a second test that forces conflicts on both attempts to assert deterministic `state_version_conflict` rejection.
- **Verification**:
  - `npm test -- tests/unit/state-engine.test.ts` passes.

### TASK-003: Document ApplySignalsOutcome / rejection shape in spec

- **Files**: `docs/specs/state-engine.md`
- **Action**: Modify
- **Details**:
  - Add a concise section describing the outcome shape:
    - Success: `ApplySignalsResult`
    - Rejection: `{ ok: false, errors: RejectionReason[] }` (or the equivalent documented representation)
  - Explicitly note determinism expectations for rejections (same invalid input → same error code and field_path), aligning with foundation determinism doctrine.
- **Verification**:
  - Spec remains consistent with `src/state/engine.ts` and existing tests.

## Test plan

- Unit: `npm test -- tests/unit/state-engine.test.ts`
- Full regression: `npm test`
- Quality gates: `npm run lint` and `npm run typecheck`

## Risks

- SQLite error message strings vary; keep fallback matching narrow but robust.
- Spying on ESM exports can be tricky; prefer inserting the conflict via DB access and wrapping `saveState` in a controlled way.

