---
name: Contract Drift Prevention
overview: |
  Implement defense-in-depth guardrails to prevent schema drift between JSON Schemas
  (src/contracts/schemas/), OpenAPI (docs/api/openapi.yaml), AsyncAPI (docs/api/asyncapi.yaml),
  and specs (docs/specs/). Adds automated validation scripts, a Cursor rule, a Cursor command,
  and updates to existing commands/rules/scripts. Derived from /review findings ISS-001 through ISS-009.
todos:
  - id: TASK-001
    content: Create validate-contracts.ts script
    status: completed
  - id: TASK-002
    content: Wire validate:contracts and validate:api into check script
    status: completed
  - id: TASK-003
    content: Create contract-enforcement Cursor rule
    status: completed
  - id: TASK-004
    content: Create /sync-contracts Cursor command
    status: completed
  - id: TASK-005
    content: Update /review checklist with API contract alignment
    status: completed
  - id: TASK-006
    content: Update /implement-spec checklist with contract propagation step
    status: completed
  - id: TASK-007
    content: Fix quick-start.md legacy .mdc reference
    status: completed
  - id: TASK-008
    content: E2E contract drift detection test
    status: completed
isProject: false
---

# Contract Drift Prevention

**Spec**: Derived from `/review` findings (ISS-001 through ISS-009)

**Problem Statement**: The Decision schema is defined in 3 places (`decision.json`, `openapi.yaml`, `asyncapi.yaml`) with manual sync only. The Signal schema has the same pattern (`signal-envelope.json`, `openapi.yaml`, `asyncapi.yaml`). Nothing automated prevents them from diverging. The existing rules/commands don't include contract alignment checks in their workflows.

**Success metric**: After implementation, introducing a schema mismatch (e.g., adding a field to `decision.json` but not `openapi.yaml`) will be caught by `npm run check` before it reaches a commit.

## Prerequisites

Before starting implementation:

- {PREREQ-001} `yaml` package already installed as devDependency (v2.8.2)
- {PREREQ-002} `validate-schemas.ts` pattern exists to follow
- {PREREQ-003} `@redocly/cli` already installed for OpenAPI linting

## Tasks

### TASK-001: Create `scripts/validate-contracts.ts`

- **Status**: pending
- **Files**: `scripts/validate-contracts.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create a script that:
  1. Loads all JSON schemas from `src/contracts/schemas/` (currently `decision.json`, `signal-envelope.json`)
  2. Parses `docs/api/openapi.yaml` using the `yaml` package
  3. Parses `docs/api/asyncapi.yaml` using the `yaml` package
  4. For each JSON schema, finds the corresponding OpenAPI/AsyncAPI schema by matching on `$id` or `title`
  5. Compares:
    - `required` arrays (set equality)
    - `properties` keys (set equality)
    - `enum` values where present (e.g., `decision_type`)
    - Nested `required`/`properties` on sub-objects (e.g., `trace`)
  6. Reports mismatches with clear error messages identifying which file is the source and which is the drift
  7. Exits with code 1 if any mismatches found
  **Mapping table** (hardcoded, since we control the naming):

  | JSON Schema `$id` | OpenAPI path                        | AsyncAPI path                 |
  | ----------------- | ----------------------------------- | ----------------------------- |
  | `decision`        | `components.schemas.Decision`       | `components.schemas.Decision` |
  | `signal-envelope` | `components.schemas.SignalEnvelope` | `components.schemas.Signal`   |

  **Comparison depth**: Top-level `required` + `properties` keys, plus one level of nesting for objects that have their own `required`/`properties` (e.g., `trace`, `metadata`). Enum values compared as sorted arrays.
  **Pattern**: Follow `validate-schemas.ts` structure (console output with checkmarks, exit codes, clear error messages).
- **Verification**: Run `tsx scripts/validate-contracts.ts` — should pass with current aligned schemas. Manually introduce a mismatch (e.g., remove a `required` field from OpenAPI) and verify it fails with a descriptive error.

### TASK-002: Wire `validate:contracts` and `validate:api` into `check` script

- **Status**: pending
- **Files**: `package.json`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
  1. Add new script entry:
    ```json
     "validate:contracts": "tsx scripts/validate-contracts.ts"
    ```
  2. Update `check` script to include both `validate:contracts` and `validate:api`:
    ```json
     "check": "npm run build && npm run validate:schemas && npm run validate:contracts && npm run validate:api && npm run lint && npm test"
    ```
  **Rationale for ordering**: `validate:schemas` confirms JSON schemas compile → `validate:contracts` confirms they match API docs → `validate:api` confirms OpenAPI syntax is valid → then lint/test.
  Also addresses ISS-004 and ISS-009: `validate:api` was referenced in rules/docs but never included in `check`.
- **Verification**: Run `npm run check` — all validation steps should execute and pass.

### TASK-003: Create `contract-enforcement` Cursor rule

- **Status**: pending
- **Files**: `.cursor/rules/contract-enforcement/RULE.md`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create a glob-scoped rule that activates when the agent touches contract-related files. Per Cursor best practices: keep rules focused, actionable, and under 500 lines. Reference files instead of copying content.
**Globs**: `src/contracts/**`, `docs/api/**`
**Content** (key directives):
  - `src/contracts/schemas/*.json` is the single source of truth for data shapes
  - When modifying any schema: update JSON Schema first → propagate to OpenAPI → propagate to AsyncAPI
  - Never add fields/enums to OpenAPI/AsyncAPI that don't exist in the JSON Schema
  - After schema changes, run `npm run validate:contracts` before considering the task complete
  - Reference `docs/specs/*.md` for requirements that drive schema changes
  This rule complements (not replaces) the existing `control-layer-constraints` rule. The constraints rule defines *what* contracts must exist; this rule defines *how* to keep them in sync.
- **Verification**: In a new Cursor chat, open `docs/api/openapi.yaml` — the rule should appear in applied context. Confirm by checking Cursor Settings > Rules.

### TASK-004: Create `/sync-contracts` Cursor command

- **Status**: pending
- **Files**: `.cursor/commands/sync-contracts.md`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create a command that fits into the existing workflow chain:
`/draft-spec` → `/plan-impl` → `/implement-spec` → **`/sync-contracts`** → `/review`
**Command behavior**:
  1. Read all JSON schemas from `src/contracts/schemas/`
  2. Read `docs/api/openapi.yaml` and `docs/api/asyncapi.yaml`
  3. Compare schemas (same logic as validate-contracts.ts, but with richer output)
  4. For each mismatch, report:
    - Which field/enum is mismatched
    - What the JSON Schema says (source of truth)
    - What the API doc says (drifted value)
    - Suggested fix (update the API doc to match JSON Schema)
  5. Optionally apply fixes if user confirms
  6. Suggest next step: run `/review` to verify overall quality
  **Suggested next step text**: "Run `/review` to verify contract alignment and overall quality."
- **Verification**: Invoke `/sync-contracts` in chat — should report "all contracts aligned" or list specific mismatches.

### TASK-005: Update `/review` checklist with API contract alignment

- **Status**: pending
- **Files**: `.cursor/commands/review.md`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Add a new checklist section after "Document Traceability":
  ```markdown
  ### API Contract Alignment
  - [ ] JSON Schemas (`src/contracts/schemas/`) match OpenAPI (`docs/api/openapi.yaml`)
  - [ ] JSON Schemas match AsyncAPI (`docs/api/asyncapi.yaml`)
  - [ ] Decision type enum consistent across all contract files
  - [ ] New schema fields propagated to all relevant contract files
  - [ ] `npm run validate:contracts` passes
  ```
  Also add to the "Instructions" section (step 2, "For each file in scope"):
  - If file is in `src/contracts/` or `docs/api/`, run `npm run validate:contracts` and include results in report
- **Verification**: Read `review.md` and confirm new section exists. Invoke `/review` on a contract file — should include contract alignment in the report.

### TASK-006: Update `/implement-spec` checklist with contract propagation

- **Status**: pending
- **Files**: `.cursor/commands/implement-spec.md`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Add two items to the "Verification Checklist" section (after "No regressions in existing tests"):
  ```markdown
  - [ ] API contract files updated if schemas changed (`docs/api/openapi.yaml`, `docs/api/asyncapi.yaml`)
  - [ ] Contract alignment verified (`npm run validate:contracts`)
  ```
  Add a note in the "Implementation Guidelines" section:
  ```markdown
  ### Contract Propagation
  - If JSON Schemas in `src/contracts/schemas/` are modified, propagate changes to OpenAPI and AsyncAPI docs
  - Run `npm run validate:contracts` to confirm alignment
  - See `.cursor/rules/contract-enforcement/RULE.md` for the propagation protocol
  ```
- **Verification**: Read `implement-spec.md` and confirm new items appear in both sections.

### TASK-007: Fix `quick-start.md` legacy `.mdc` reference

- **Status**: pending
- **Files**: `.cursor/commands/quick-start.md`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Replace all references to `.cursor/rules/project.mdc` with `.cursor/rules/project-context/RULE.md` (the actual current rule).
Lines to update:
  - Line 30: `Updates .cursor/rules/project.mdc with:` → `Updates .cursor/rules/project-context/RULE.md with:`
  - Line 56: `4. Update .cursor/rules/project.mdc with:` → `4. Update .cursor/rules/project-context/RULE.md with:`
  - Line 83: `Updated .cursor/rules/project.mdc with project context.` → `Updated .cursor/rules/project-context/RULE.md with project context.`
  Per Cursor docs: "`.mdc` cursor rules will remain functional however all new rules will now be created as folders in `.cursor/rules`."
- **Verification**: Read `quick-start.md` and confirm no `.mdc` references remain.

### TASK-008: E2E contract drift detection test

- **Status**: pending
- **Files**: `tests/contracts/contract-drift.test.ts`
- **Action**: Create
- **Depends on**: TASK-001
- **Details**:
Create a Vitest test that runs the same validation logic as `validate-contracts.ts` but as an automated test within the test suite. This ensures `npm test` (which runs in CI) also catches contract drift — belt and suspenders with the script.
**Test cases**:

  | Test ID   | Description                                                                                  | Assertion                        |
  | --------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
  | DRIFT-001 | Decision JSON Schema `required` fields match OpenAPI `Decision.required`                     | Set equality                     |
  | DRIFT-002 | Decision JSON Schema `properties` keys match OpenAPI `Decision.properties` keys              | Set equality                     |
  | DRIFT-003 | Decision `decision_type` enum matches across JSON Schema, OpenAPI, and AsyncAPI              | Array equality (sorted)          |
  | DRIFT-004 | Decision `trace.required` fields match across all 3 sources                                  | Set equality                     |
  | DRIFT-005 | Signal Envelope JSON Schema `required` fields match OpenAPI `SignalEnvelope.required`        | Set equality                     |
  | DRIFT-006 | Signal Envelope JSON Schema `properties` keys match OpenAPI `SignalEnvelope.properties` keys | Set equality                     |
  | DRIFT-007 | AsyncAPI `Decision` schema matches OpenAPI `Decision` schema (required + properties + enums) | Deep equality on structural keys |
  | DRIFT-008 | AsyncAPI `Signal` schema matches OpenAPI `SignalEnvelope` schema (required + properties)     | Deep equality on structural keys |

  **Pattern**: Use `yaml` package to parse YAML files, standard `fs` to read JSON schemas. Place in `tests/contracts/` to be picked up by `npm run test:contracts`.
  **E2E step-by-step test plan** (manual verification after implementation):
  1. Run `npm run validate:contracts` — expect all green
  2. Run `npm run test:contracts` — expect DRIFT-001 through DRIFT-008 pass
  3. **Introduce intentional drift**: Remove `matched_rule_id` from `openapi.yaml` `Decision.trace.required`
  4. Run `npm run validate:contracts` — expect failure naming the exact field and files
  5. Run `npm run test:contracts` — expect DRIFT-004 to fail with descriptive assertion
  6. Run `npm run check` — expect early failure at `validate:contracts` step
  7. **Revert the drift**: Restore `matched_rule_id`
  8. Run `npm run check` — expect full pass
  9. **Introduce enum drift**: Add `"promote"` to `asyncapi.yaml` `Decision.decision_type.enum`
  10. Run `npm run validate:contracts` — expect failure on enum mismatch
  11. Run `npm run test:contracts` — expect DRIFT-003 or DRIFT-007 to fail
  12. **Revert and confirm**: Full pass on `npm run check`
- **Verification**: Run `npm run test:contracts` — all DRIFT-* tests pass. Follow E2E plan steps 3-8 to confirm drift detection works end-to-end.

## Files Summary

### To Create


| File                                         | Task     | Purpose                                  |
| -------------------------------------------- | -------- | ---------------------------------------- |
| `scripts/validate-contracts.ts`              | TASK-001 | Automated schema consistency checker     |
| `.cursor/rules/contract-enforcement/RULE.md` | TASK-003 | Glob-scoped rule for contract file edits |
| `.cursor/commands/sync-contracts.md`         | TASK-004 | Workflow command for schema propagation  |
| `tests/contracts/contract-drift.test.ts`     | TASK-008 | Automated drift detection in test suite  |


### To Modify


| File                                 | Task     | Changes                                                |
| ------------------------------------ | -------- | ------------------------------------------------------ |
| `package.json`                       | TASK-002 | Add `validate:contracts` script, update `check` script |
| `.cursor/commands/review.md`         | TASK-005 | Add API Contract Alignment checklist section           |
| `.cursor/commands/implement-spec.md` | TASK-006 | Add contract propagation step to checklist             |
| `.cursor/commands/quick-start.md`    | TASK-007 | Replace `.mdc` references with folder-based rule paths |


## Test Plan


| Test ID   | Type     | Description                                    | Task     |
| --------- | -------- | ---------------------------------------------- | -------- |
| DRIFT-001 | contract | Decision required fields match OpenAPI         | TASK-008 |
| DRIFT-002 | contract | Decision properties keys match OpenAPI         | TASK-008 |
| DRIFT-003 | contract | Decision type enum consistency (3 sources)     | TASK-008 |
| DRIFT-004 | contract | Decision trace required fields consistency     | TASK-008 |
| DRIFT-005 | contract | Signal required fields match OpenAPI           | TASK-008 |
| DRIFT-006 | contract | Signal properties keys match OpenAPI           | TASK-008 |
| DRIFT-007 | contract | AsyncAPI Decision matches OpenAPI Decision     | TASK-008 |
| DRIFT-008 | contract | AsyncAPI Signal matches OpenAPI SignalEnvelope | TASK-008 |
| E2E-DRIFT | manual   | 12-step manual drift injection/detection test  | TASK-008 |


## Risks


| Risk                                                                                                 | Impact | Mitigation                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| YAML parsing differences between `yaml` package and OpenAPI spec semantics (e.g., `$ref` resolution) | Medium | Compare raw schema properties only, don't resolve `$ref`s. OpenAPI/AsyncAPI `Decision` schemas are inline, not referenced. |
| False positives from intentional OpenAPI-only fields (e.g., `description`, `example`)                | Low    | Compare only structural keys: `required`, `properties` (keys), `enum`, `type`. Ignore documentation-only fields.           |
| New schemas added without updating the mapping table in validate-contracts.ts                        | Medium | Script warns if a JSON schema has no OpenAPI/AsyncAPI counterpart. Add to the contract-enforcement rule as a reminder.     |
| `npm run check` becomes slower with additional validation steps                                      | Low    | `validate:contracts` is pure file parsing — should complete in <1s. No network or compilation involved.                    |


## Cleanup Recommendations (Spec ↔ Code Inconsistencies)

These are not tasks in this plan but should be addressed separately:

1. `**control-layer-constraints/RULE.md` line 20** references `npm run validate:api` as the contract enforcement command, but after this plan, the correct command is `npm run validate:contracts` (which is more comprehensive). Consider updating the rule to reference both.
2. `**project-context/RULE.md**` does not list `validate:contracts` in its Key Commands section. Should be added after TASK-002.
3. `**docs/api/` REVIEW files** — There are 4 `REVIEW-*.md` files in `docs/api/` that appear to be review artifacts, not living docs. Consider archiving or removing them to reduce clutter.

## Verification Checklist

- All tasks completed
- `npm run validate:contracts` passes
- `npm run validate:api` passes
- `npm run test:contracts` passes (including DRIFT-* tests)
- `npm run check` passes (full pipeline)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Manual E2E drift injection test passes (12 steps)
- No regressions in existing tests

## Implementation Order

```
TASK-001 (validate-contracts.ts)
    ↓
TASK-002 (package.json wiring)
    ↓
TASK-008 (contract drift tests)

TASK-003 (contract-enforcement rule)     ─┐
TASK-004 (/sync-contracts command)       ─┤── parallel, no dependencies
TASK-005 (update /review)                ─┤
TASK-006 (update /implement-spec)        ─┤
TASK-007 (fix quick-start.md)            ─┘
```

Critical path: TASK-001 → TASK-002 → TASK-008 (the automated guardrails).
TASK-003–007 are independent documentation/rule updates that can be done in parallel.