---
name: STATE Engine Review Remediation (Round 3)
overview: "Address findings from the third /review cycle. Priority 1: harden getSignalsByIds to enforce org_id at the SQL level (ISS-R3-001), add a mixed-org batch contract test (ISS-R3-004), and update signal-log unit tests. Priority 2: strengthen state-engine.md spec by fixing the computeNewState signature drift, documenting consumer guidance for ApplySignalsOutcome, and checking off completed success criteria (ISS-R3-007). Priority 3: fix the DynamoDB State Table sort-key design in the playbook so Phase 2 preserves version history (ISS-R3-006). Priority 4: add a consolidated Deferred Items section to state-engine.md and signal-log.md so deferred work (ISS-R3-003 deepMerge cleanup, ISS-R3-005 requested_at validation, ISS-R3-002 saveState test-only usage) is tracked at the source."
todos:
  - id: TASK-001
    content: "Harden getSignalsByIds: add org_id to SQL WHERE clause while preserving unknown_signal_id vs signals_not_in_org_scope error distinction"
    status: completed
  - id: TASK-002
    content: Update signal-log unit tests for SQL-level org scoping behavior
    status: completed
  - id: TASK-003
    content: "Add contract test STATE-014: mixed-org batch (some valid, one cross-org)"
    status: completed
  - id: TASK-004
    content: "Update state-engine.md: fix computeNewState signature, add ApplySignalsOutcome consumer guidance, check success criteria"
    status: completed
  - id: TASK-005
    content: "Update signal-log.md: document org-scoped query pattern and DynamoDB readiness note"
    status: completed
  - id: TASK-006
    content: Fix DynamoDB State Table design in playbook — add state_version to sort key
    status: completed
  - id: TASK-007
    content: Add Deferred Items sections to state-engine.md and signal-log.md for clean future-work tracking
    status: completed
isProject: false
---

# STATE Engine Review Remediation (Round 3)

**Spec**: `docs/specs/state-engine.md`
**Prior Plan**: `.cursor/plans/state-engine-review-remediation-r2.plan.md` (completed)
**Review Source**: `/review` findings (ISS-R3-001 through ISS-R3-007)

## Context

From the third `/review` cycle, seven items were identified. This plan addresses them in four priority groups:

- **ISS-R3-001** (warning): `getSignalsByIds()` SQL query lacks `AND org_id = ?` — org isolation enforced only by post-query loop, not at the data layer. Won't translate to DynamoDB (where partition key is required in query).
- **ISS-R3-004** (info): No contract test for a mixed-org batch where some signals are valid and one is cross-org.
- **ISS-R3-007** (info): State-engine spec success criteria checkboxes unchecked; `computeNewState` signature in spec drifted from implementation.
- **ISS-R3-006** (warning): DynamoDB State Table design in playbook uses `PK=org_id, SK=learner_reference` — no room for version history.
- **ISS-R3-005** (info): `requested_at` validation deferred but not tracked in a persistent location.
- **ISS-R3-003** (info): `deepMerge` redundant null check — cosmetic cleanup.
- **ISS-R3-002** (warning): `saveState()` deprecated but still used in test helpers — acceptable for testing, note for Phase 2.

### Priority Order

1. **Conflict-path hardening** (TASK-001 → TASK-002 → TASK-003) — ISS-R3-001, ISS-R3-004
2. **Spec outcome documentation** (TASK-004 → TASK-005) — ISS-R3-007, outcome shape guidance
3. **Phase 2 prep docs** (TASK-006) — ISS-R3-006
4. **Deferred items tracking** (TASK-007) — ISS-R3-002, ISS-R3-003, ISS-R3-005

## Prerequisites

Before starting implementation:

- All 182 existing tests pass
- Prior remediation plan (R2) fully completed
- Review report (Round 3) accepted

---

## Tasks

### TASK-001: Harden getSignalsByIds — enforce org_id at the SQL level

- **Status**: pending
- **Files**: `src/signalLog/store.ts`
- **Action**: Modify
- **Details**:
Refactor `getSignalsByIds()` to use a two-step SQL pattern that pushes org isolation into the query:
  1. **Primary query**: `WHERE signal_id IN (?) AND org_id = ?` — returns only signals belonging to the requested org.
  2. **Missing-ID resolution**: If `foundIds.size < signalIds.length`, run a secondary existence check: `SELECT signal_id FROM signal_log WHERE signal_id IN (missing_placeholders)` (without org filter).
    - IDs found in the secondary check → `signals_not_in_org_scope` error
    - IDs not found at all → `unknown_signal_id` error
  3. Remove the post-query `for (const row of rows) { if (row.org_id !== orgId) … }` loop — it's now redundant.
  **Rationale**: The current approach fetches signals across all orgs then filters in-app. This won't translate to DynamoDB (where the partition key `org_id` must be part of the query) and leaks data across org boundaries at the query level.
  **Error semantics preserved**: The two-step approach maintains the same distinction between `unknown_signal_id` and `signals_not_in_org_scope` that consumers depend on.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes. Existing unit and contract tests pass. No behavioral change in error codes.

### TASK-002: Update signal-log unit tests for SQL-level org scoping

- **Status**: pending
- **Files**: `tests/unit/signal-log-store.test.ts`
- **Action**: Modify
- **Details**:
Update the existing `getSignalsByIds` describe block:
  1. **Existing org-isolation test** (currently "should isolate signals by org_id"): verify it still passes after TASK-001 refactor — no code change expected.
  2. **New test — mixed batch**: Append signal-A to org-A and signal-B to org-B. Call `getSignalsByIds('org-A', ['signal-A', 'signal-B'])`. Assert it throws with code `signals_not_in_org_scope` (not `unknown_signal_id`).
  3. **New test — mixed missing + cross-org**: Append signal-A to org-A and signal-B to org-B. Call `getSignalsByIds('org-A', ['signal-A', 'signal-B', 'totally-missing'])`. Assert the first error thrown is either `unknown_signal_id` or `signals_not_in_org_scope` depending on the priority order (unknown_signal_id should take precedence per spec — missing IDs checked first).
- **Depends on**: TASK-001
- **Verification**: `npm test -- tests/unit/signal-log-store.test.ts` passes with new tests.

### TASK-003: Add contract test STATE-014 — mixed-org batch

- **Status**: pending
- **Files**: `tests/contracts/state-engine.test.ts`
- **Action**: Modify
- **Details**:
Add a new `describe('STATE-014: Cross-org signal in mixed batch')` block:
  1. Append signal-A to org-A and signal-B to org-B (both for learner-1).
  2. Call `applySignals({ org_id: 'org-A', learner_reference: 'learner-1', signal_ids: [signal-A.signal_id, signal-B.signal_id], ... })`.
  3. Assert `outcome.ok === false` and `errors[0].code === 'signals_not_in_org_scope'`.
  4. Assert no state was persisted for learner-1 (the entire batch is rejected, not partially applied).
- **Depends on**: TASK-001 (org-scoped query changes the internal path, test verifies end-to-end)
- **Verification**: `npm test -- tests/contracts/state-engine.test.ts` passes with 16+ tests.

### TASK-004: Update state-engine.md — fix signature drift, add consumer guidance, check success criteria

- **Status**: pending
- **Files**: `docs/specs/state-engine.md`
- **Action**: Modify
- **Details**:
  1. **Fix `computeNewState` signature** (section "State Computation Strategy", around line 476):
    Current spec shows `currentState: Record<string, unknown> | null` but implementation takes `currentState: LearnerState | null`. Update the spec code block to match the implementation:
  2. **Add ApplySignalsOutcome consumer guidance** (after section 3.4, around line 107):
    Add a subsection "### Consumer Contract" with:
    - Internal consumers (Decision Engine, future pipeline stages) **must** pattern-match on `ok` before accessing `result` or `errors`.
    - Consumers **must not** branch on `message` text — use `code` exclusively.
    - When `ok === false`, callers should log the full `errors` array and propagate the first error's `code` for upstream reporting.
    - For `state_version_conflict`, callers may choose to retry at a higher level (the engine already retries once internally).
  3. **Check success criteria** (around line 426):
    Change all `- [ ]` to `- [x]` for the 11 criteria already implemented and verified by the test suite. This eliminates ISS-R3-007.
  4. **Add STATE-014 to contract test table** (around line 400):
    Add row: `STATE-014 | Cross-org signal in mixed batch | rejected, signals_not_in_org_scope, no partial state`
- **Depends on**: TASK-003 (STATE-014 should exist before documenting it)
- **Verification**: Spec reads consistently with implementation. No code changes.

### TASK-005: Update signal-log.md — document org-scoped query pattern

- **Status**: pending
- **Files**: `docs/specs/signal-log.md`
- **Action**: Modify
- **Details**:
  1. **Update Behavior section** (around line 192) for `getSignalsByIds`:
    Add a bullet: "Enforces org isolation at the query level (`WHERE org_id = ?`), not just application logic. This ensures DynamoDB-readiness where partition key must be included in queries."
  2. **Add implementation note** after the Error Conditions table (around line 204):
    "When a requested signal_id is missing from results, the function distinguishes between truly missing signals (`unknown_signal_id`) and signals that exist in another org (`signals_not_in_org_scope`) via a secondary existence check."
- **Depends on**: TASK-001 (spec should reflect the new implementation)
- **Verification**: Spec reads consistently with implementation. No code changes.

### TASK-006: Fix DynamoDB State Table design in playbook

- **Status**: pending
- **Files**: `docs/foundation/solo-dev-execution-playbook.md`
- **Action**: Modify
- **Details**:
Update the "DynamoDB Table Design" section (around line 246):
**Current** (broken for version history):
  ```
  State Table:
  - Partition Key: org_id
  - Sort Key: learner_reference
  ```
  **Updated** (supports immutable version history):
  ```
  State Table:
  - Partition Key: org_id#learner_reference  (composite)
  - Sort Key: state_version (number)
  - GSI1 PK: org_id, GSI1 SK: learner_reference  (for cross-learner queries if needed)
  ```
  Add a note: "Each state version is a separate item (append-only). `getState()` queries with `ScanIndexForward=false, Limit=1` to get the latest version. `getStateByVersion()` queries with exact sort key."
- **Depends on**: none
- **Verification**: Playbook reads cleanly, design matches the immutable-history requirement from state-engine spec.

### TASK-007: Add Deferred Items sections for clean future-work tracking

- **Status**: pending
- **Files**: `docs/specs/state-engine.md`, `docs/specs/signal-log.md`
- **Action**: Modify
- **Details**:
No dedicated backlog file exists. Rather than creating a new document, embed deferred items in the specs where they originate (single source of truth). Each spec's "Out of Scope" section becomes the canonical tracking location.
  1. `**docs/specs/state-engine.md**` — Expand "Out of Scope" (line 547) to include a "### Deferred Items" subsection with a table:

    | ID            | Item                                                                     | Origin       | Deferred To          |
    | ------------- | ------------------------------------------------------------------------ | ------------ | -------------------- |
    | DEF-STATE-001 | Validate `requested_at` as RFC3339                                       | ISS-R3-005   | Next tightening pass |
    | DEF-STATE-002 | Remove redundant `sourceVal !== null` check in `deepMerge`               | ISS-R3-003   | Next cleanup pass    |
    | DEF-STATE-003 | Remove `saveState()` usage from test helpers once Phase 2 DI is in place | ISS-R3-002   | Phase 2              |
    | DEF-STATE-004 | Refactor module singleton to DI (`StateRepository`)                      | ISS-007 (R2) | Phase 2              |

  2. `**docs/specs/signal-log.md**` — Add a "### Deferred Items" subsection after the "Out of Scope" or at the end of the spec:

    | ID             | Item                                                                             | Origin           | Deferred To |
    | -------------- | -------------------------------------------------------------------------------- | ---------------- | ----------- |
    | DEF-SIGLOG-001 | Extract `SignalLogRepository` interface for DI (mirrors StateRepository pattern) | Playbook Phase 2 | Phase 2     |

- **Depends on**: none
- **Verification**: Specs have clear deferred-items tables that can be searched by `DEF-` prefix across the codebase.

---

## Files Summary

### To Modify


| File                                             | Task               | Changes                                                                      |
| ------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------- |
| `src/signalLog/store.ts`                         | TASK-001           | Refactor `getSignalsByIds` to use org-scoped SQL + secondary existence check |
| `tests/unit/signal-log-store.test.ts`            | TASK-002           | Add mixed-batch and mixed-missing+cross-org tests                            |
| `tests/contracts/state-engine.test.ts`           | TASK-003           | Add STATE-014 contract test                                                  |
| `docs/specs/state-engine.md`                     | TASK-004, TASK-007 | Fix signature, add consumer guidance, check criteria, add deferred items     |
| `docs/specs/signal-log.md`                       | TASK-005, TASK-007 | Document org-scoped query, add deferred items                                |
| `docs/foundation/solo-dev-execution-playbook.md` | TASK-006           | Fix DynamoDB State Table sort-key design                                     |


### No New Files

All changes are modifications to existing files.

---

## Test Plan


| Test ID            | Type            | Description                                                        | Task     |
| ------------------ | --------------- | ------------------------------------------------------------------ | -------- |
| SIGLOG-ORGSCOPE-01 | unit            | Mixed batch: valid + cross-org signal → `signals_not_in_org_scope` | TASK-002 |
| SIGLOG-ORGSCOPE-02 | unit            | Mixed missing + cross-org → `unknown_signal_id` takes precedence   | TASK-002 |
| STATE-014          | contract        | Mixed-org batch rejected, no partial state persisted               | TASK-003 |
| (existing)         | unit + contract | All 182 existing tests remain green after refactor                 | TASK-001 |


---

## Risks


| Risk                                                                      | Impact | Mitigation                                                                                                                                     |
| ------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-step SQL in `getSignalsByIds` adds an extra query on the unhappy path | Low    | Secondary query only fires when IDs are missing (uncommon in production); still O(1) SQL calls on happy path                                   |
| Changing `WHERE` clause could alter ordering edge cases                   | Low    | `ORDER BY accepted_at ASC, id ASC` is preserved; only filtering changes                                                                        |
| STATE-003 contract test may need adjustment if error priority changes     | Medium | TASK-001 preserves same error priority: missing IDs checked before cross-org; existing test verifies single cross-org signal which still works |
| Spec drift: deferred items may go stale                                   | Low    | `DEF-` prefix makes items grep-searchable; Phase 2 plan should include a "resolve deferred items" task                                         |


---

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`) — target: 185+ tests (182 existing + 3 new)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- `getSignalsByIds` query includes `AND org_id = ?` in primary path
- Error semantics preserved: `unknown_signal_id` vs `signals_not_in_org_scope` distinction intact
- State-engine spec `computeNewState` signature matches implementation
- State-engine spec success criteria all checked
- DynamoDB State Table design supports version history
- Deferred items tracked with `DEF-` prefix in source specs
- STATE-014 contract test passes

---

## Implementation Order

```
TASK-001 (org-scoped SQL in getSignalsByIds)
    │
    ├──→ TASK-002 (signal-log unit tests)
    │
    └──→ TASK-003 (STATE-014 contract test)
              │
              ▼
         TASK-004 (state-engine spec: signature + outcome + criteria + STATE-014)
              │
              ▼
         TASK-005 (signal-log spec: org-scoped query docs)

TASK-006 (playbook DynamoDB table fix)     ← parallel with all above

TASK-007 (deferred items in both specs)    ← parallel with all above
```

**Critical path**: TASK-001 → TASK-002 + TASK-003 → TASK-004 → TASK-005
**Parallel lanes**: TASK-006 and TASK-007 can start immediately