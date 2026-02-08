---
name: End-to-End Cycle Completion
overview: "Complete the signal → state → decision → output cycle with two cleanup actions: (1) Commit the pending Stage 4 cleanup (TASK-018 status update + docs/analyze deletion); (2) Fix the pre-existing graceful-shutdown gap (ISS-001) where only the Decision Store is closed on SIGTERM — add the remaining 3 store closers to prevent SQLite resource leaks."
todos:
  - id: TASK-001
    content: Commit pending Stage 4 cleanup (TASK-018 status + docs/analyze deletion)
    status: completed
  - id: TASK-002
    content: Fix graceful shutdown — close all 4 stores in server.ts onClose hook
    status: completed
  - id: TASK-003
    content: Regression check — all tests pass, build clean, lint clean
    status: completed
isProject: false
---

# End-to-End Cycle Completion

**Sources**: Review findings (ISS-001)

## Prerequisites

- Decision Engine (Stage 4) fully implemented and all 320 tests passing ✓
- Decision Engine spec finalized ✓
- No lint or type errors ✓

## Tasks

### TASK-001: Commit pending Stage 4 cleanup

- **Status**: completed
- **Files**: none (git only)
- **Action**: Commit
- **Depends on**: none
- **Details**:
Commit the staged changes from the Decision Engine implementation:
  - `.cursor/plans/decision-engine.plan.md` — TASK-018 status updated to `completed`
  - `docs/analyze/` — directory and all files deleted (superseded by spec)
  Commit message: `chore: complete Stage 4 cleanup — mark TASK-018 done, delete superseded docs/analyze/`
- **Verification**: `git status` shows clean working tree on `main`

### TASK-002: Fix graceful shutdown — close all 4 stores

- **Status**: completed
- **Files**: `src/server.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
The `onClose` hook currently only calls `closeDecisionStore()`. Add the remaining 3 store closers to prevent SQLite resource leaks on shutdown:
  ```typescript
  import { closeStateStore } from './state/store.js';
  import { closeSignalLogStore } from './signalLog/store.js';
  import { closeIdempotencyStore } from './ingestion/idempotency.js';

  server.addHook('onClose', () => {
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIdempotencyStore();
  });
  ```
  Order: decision → state → signal log → idempotency (reverse of init order).
- **Verification**: `npm run build` succeeds. `npm test` passes (320 tests).

### TASK-003: Regression check

- **Status**: completed
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-002
- **Details**:
Full verification suite:
  - `npm test` — all 320 tests pass
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
- **Verification**: All commands exit 0.

## Files Summary

### To Modify


| File            | Task     | Changes                                     |
| --------------- | -------- | ------------------------------------------- |
| `src/server.ts` | TASK-002 | Add 3 missing store closers to onClose hook |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- Graceful shutdown closes all 4 stores
- Git working tree clean after commit

## Implementation Order

```
TASK-001 (commit) → TASK-002 (shutdown fix) → TASK-003 (regression)
```

