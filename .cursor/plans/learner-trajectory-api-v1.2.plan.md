---
name: Learner Trajectory API v1.2 — Per-Skill Dot-Path Trajectory
overview: "Extend the existing trajectory and learner-summary read paths to accept skills.{skillId}.{metric} dot-path field names, resolving values and direction companions via getAtPath with no query-time recomputation and no store changes."
todos:
  - id: TASK-001
    content: Add directionPathForField and shared dot-path validator; rewire buildVersions and validateTrajectoryParams in trajectory-handler-core
    status: pending
  - id: TASK-002
    content: Align summary-handler-core trajectory_fields validation with shared validator
    status: pending
  - id: TASK-003
    content: Align Lambda inspect trajectory and summary validation and version-build with core
    status: pending
  - id: TASK-004
    content: Update OpenAPI fields and trajectory_fields descriptions and examples
    status: pending
  - id: TASK-005
    content: Update learner-summary-api Out of Scope cross-ref
    status: pending
  - id: TASK-006
    content: Update TRAJ-006 and add TRAJ-009 through TRAJ-012 contract tests
    status: pending
  - id: TASK-007
    content: Add unit tests for directionPathForField and pattern validator
    status: pending
isProject: false
---

# Learner Trajectory API v1.2 — Per-Skill Dot-Path Trajectory

**Spec**: `docs/specs/learner-trajectory-api.md` (§v1.2 — Per-Skill Dot-Path Trajectory, US-SKILL-001 Extension)

> **Scope**: v1.2 addendum **only**. Per the spec's Next Step (line 289), do **not** re-plan v1.1 — that work is archived at `archive/plans/learner-trajectory-api.plan.md` and already shipped in `src/state/trajectory-handler-core.ts`, `src/learners/summary-handler-core.ts`, `src/lambda/inspect.ts`, and `tests/contracts/learner-trajectory-api.test.ts`.

## Spec Literals

> Verbatim copies of normative blocks from the spec §v1.2. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § v1.2 In Scope (narrow)

```
2. Allowed path pattern: skills.{skillId}.{metric} where:
   - {skillId} matches ^[A-Za-z0-9_-]{1,64}$ (same charset as skill keys in seed/pilot data, e.g. text_evidence, fractions).
   - {metric} is a leaf numeric metric name (stabilityScore, masteryScore, or future numeric leaves written by signals) — not a companion suffix (_delta, _direction).
   - Total path depth ≤ 5 segments (aligned with computeNestedDeltas recursion cap).
3. Read semantics unchanged: for each version, return the numeric value at the path (or null if absent/non-numeric) and the stored direction companion — no query-time recomputation.
4. Direction companion resolution: for a requested field path P, the direction key is the sibling {leaf}_direction at the same parent object:
   - Flat (v1.1, unchanged): stabilityScore → stabilityScore_direction
   - Nested (v1.2): skills.fractions.stabilityScore → read direction at skills.fractions.stabilityScore_direction via getAtPath(state, directionPath(P)) where directionPath(P) replaces the final segment S with S_direction.
5. Limits unchanged: max 10 fields per request; max 128 characters per field path; pagination and version-range filters unchanged.
6. Error behavior: paths outside the allowed pattern return 400 invalid_format with message "Field path must match skills.{skillId}.{metric}". Paths containing .., empty segments, or companion-suffix leaves return 400 invalid_format.
7. Remove v1.1 dot-path rejection in validateTrajectoryParams, summary trajectory_fields validation, and Lambda inspect.ts mirrors — replace with pattern validation above.
8. OpenAPI + contract tests: extend OpenAPI fields / trajectory_fields descriptions; add TRAJ-009–TRAJ-012. Update TRAJ-006 from "rejected" to "accepted when pattern-valid" (or supersede with TRAJ-009).
```

### From spec § v1.2 Error behavior (exact message)

```
"Field path must match skills.{skillId}.{metric}"
```

### From spec § v1.2 Response Shape

```
No breaking changes. Dot-path field names appear as keys in fields, versions[].values, versions[].directions, and summary exactly as requested (e.g. "skills.fractions.stabilityScore").
```

### From spec § v1.2 Implementation Touch Points

```
| Surface | File(s) | Change |
| Trajectory validation + version build | src/state/trajectory-handler-core.ts | Replace dot rejection with pattern check; getAtPath for values/directions; export directionPathForField() helper |
| Summary trajectory fields | src/learners/summary-handler-core.ts | Same validation; resolveTrajectoryFields unchanged for default (flat URS keys only) |
| Lambda routing | src/lambda/inspect.ts | Align validation with core (two duplicate checks today) |
| OpenAPI | docs/api/openapi.yaml | Update fields / trajectory_fields param descriptions + examples |
| Learner summary spec cross-ref | docs/specs/learner-summary-api.md §Out of Scope | Move nested trajectory row to "implemented in trajectory §v1.2" when impl lands |

Estimated blast radius: ~4 production files, ~2 spec files, ~6 test files. No store/repository changes.
```

### From spec § v1.2 Contract Tests (additions)

```
| TRAJ-009 | Per-skill trajectory across 3 versions | Learner with nested skills.fractions.stabilityScore history (seed via saveStateWithAppliedSignals) | 200; ascending versions; values/directions from nested companions |
| TRAJ-010 | Direction null on first skill observation | Version 1 has metric but no {metric}_direction | directions.skills…stabilityScore: null for v1 |
| TRAJ-011 | Invalid path rejected | fields=aggregation.overall.masteryScore | 400 invalid_format with pattern message |
| TRAJ-012 | Companion suffix rejected as leaf | fields=skills.fractions.stabilityScore_direction | 400 invalid_format |
```

### From spec § v1.2 Prerequisites (all satisfied)

```
| getAtPath() dot-path resolver | src/shared/dot-path.ts | Complete |
| Nested {metric}_delta / {metric}_direction at write time | src/state/engine.ts computeNestedDeltas() (max depth 5) | Complete |
| getStateVersionRange() pagination | src/state/store.ts | Complete |
| v1.1 trajectory response shape + buildSummary semantics | This spec §Endpoint | Complete |
```

## Prerequisites

All §v1.2 prerequisites are marked **Complete** in the spec and verified in code:
- [x] PREREQ-001 `getAtPath(obj, path)` exists — `src/shared/dot-path.ts:11`
- [x] PREREQ-002 Nested `{metric}_direction` written at state-write time — `src/state/engine.ts:93` `computeNestedDeltas` (depth cap 5)
- [x] PREREQ-003 `getStateVersionRange()` pagination — `src/state/store.ts`
- [x] PREREQ-004 v1.1 `buildVersions` / `buildSummary` exported — `src/state/trajectory-handler-core.ts`

## Existing-solution reuse (per `.cursor/rules/prefer-existing-solutions`)

- **Path resolution** reuses `getAtPath` from `src/shared/dot-path.ts` (PREREQ-001) — no new traversal code. `getAtPath` already returns `undefined` for absent/non-record paths, which maps cleanly to the spec's "null if absent".
- **Validation is centralized once** in `src/state/trajectory-handler-core.ts` and imported by `src/learners/summary-handler-core.ts`. The Lambda `src/lambda/inspect.ts` runs in a separate bundle but imports the same core helpers (it already imports `buildSummary`/`buildVersions`), so the validator and `directionPathForField` are shared rather than re-implemented. This directly addresses the spec note "align validation with core (two duplicate checks today)".
- **No store/repository changes** — confirmed by spec blast radius ("No store/repository changes"). `getStateVersionRange` is untouched.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Core — shared dot-path validator, directionPathForField, getAtPath-based buildVersions
- **Files**: `src/state/trajectory-handler-core.ts`
- **Action**: Modify
- **Details**:
  - **Export `directionPathForField(field: string): string`** — replaces the final dot-segment `S` with `S_direction`. Per spec §v1.2 #4: flat `stabilityScore` → `stabilityScore_direction`; nested `skills.fractions.stabilityScore` → `skills.fractions.stabilityScore_direction`. Implementation: split on `.`, append `_direction` to the last segment, re-join.
  - **Export a pure validator `validateTrajectoryFieldName(field: string): string | null`** returning an error message or `null` when valid. Order of checks (preserve existing v1.1 messages for the non-dot cases):
    1. empty → `'Field name must not be empty'`
    2. length > 128 → `` `Field name exceeds 128 characters: '${field}'` `` (spec §v1.2 #5: "max 128 characters per field path")
    3. if the field contains `.`: apply the §v1.2 pattern. Split on `.`. Reject (return the **exact** spec message `'Field path must match skills.{skillId}.{metric}'`) when ANY of:
       - any empty segment (covers leading/trailing dot and `..`)
       - segment count < 3 or > 5 (spec §v1.2 #2: "Total path depth ≤ 5 segments"; the named pattern `skills.{skillId}.{metric}` is the 3-segment minimum)
       - `segments[0] !== 'skills'` (per Out-of-Scope: arbitrary paths like `aggregation.overall.masteryScore` are rejected → TRAJ-011)
       - `segments[1]` does not match `/^[A-Za-z0-9_-]{1,64}$/`
       - the final (leaf) segment ends with `_delta` or `_direction` (companion suffix not allowed as a leaf → TRAJ-012)
    4. otherwise (flat, no dot) → `null` (unchanged v1.1 flat behavior; no charset restriction on flat canonical keys)
  - **Replace the dot-rejection block** in `validateTrajectoryParams` (currently lines ~84-94: the `field.includes('.')` branch emitting "Dot-path fields are not supported in v1.1...") with a loop calling `validateTrajectoryFieldName(field)` and returning `{ statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message, field_path: 'fields' } }` on the first non-null message. Keep the existing `fields.length > 10` check **after** the loop unchanged.
  - **Rewrite `buildVersions`** to resolve via `getAtPath` so flat and nested behave identically. For each field: `const raw = getAtPath(s.state, field); values[field] = raw === undefined ? null : raw;` and `const dirVal = getAtPath(s.state, directionPathForField(field)); directions[field] = (typeof dirVal === 'string' && VALID_DIRECTIONS.has(dirVal)) ? dirVal as Direction : null;`. This preserves v1.1 flat semantics: `getAtPath(state, 'stabilityScore')` === `state['stabilityScore']`, and `directionPathForField('stabilityScore')` === `'stabilityScore_direction'`.
  - **`buildSummary` unchanged** — it already keys off the literal `field` string in `versions[].values[field]`, which works for dot-path keys with no modification.
  - Import `getAtPath` from `../shared/dot-path.js`.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; existing `tests/unit/trajectory-handler-core.test.ts` flat cases still pass; `directionPathForField('a.b.c') === 'a.b.c_direction'` and `directionPathForField('x') === 'x_direction'`.

### TASK-002: Summary core — reuse shared validator for trajectory_fields
- **Files**: `src/learners/summary-handler-core.ts`
- **Action**: Modify
- **Details**:
  - In `validateTrajectoryFieldTokens` (currently lines ~118-169), **replace the `field.includes('.')` rejection block** (the "Dot-path fields are not supported in v1.1..." branch, `field_path: 'trajectory_fields'`) with a loop calling the exported `validateTrajectoryFieldName` from `../state/trajectory-handler-core.js`. On a non-null message return `{ statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message, field_path: 'trajectory_fields' } }`. Keep the `fields.length > 10` check unchanged.
  - **`resolveTrajectoryFields` unchanged** — per spec §v1.2 #1/Touch Points, the omitted-`trajectory_fields` default stays flat URS-projected numeric keys only (no auto-discovery of nested skills, per Out-of-Scope).
  - Add the import for `validateTrajectoryFieldName` (alongside existing `buildSummary`, `buildVersions` import).
- **Depends on**: TASK-001
- **Verification**: `npm run typecheck` passes; a `trajectory_fields=skills.fractions.stabilityScore` request to the summary endpoint is accepted; `trajectory_fields=aggregation.overall.masteryScore` returns 400 `invalid_format` with the pattern message.

### TASK-003: Lambda inspect — align both trajectory and summary validation + nested version build
- **Files**: `src/lambda/inspect.ts`
- **Action**: Modify
- **Details**:
  - Import `validateTrajectoryFieldName` and `directionPathForField` from `../state/trajectory-handler-core.js` (file already imports `buildSummary`, `buildVersions`) and `getAtPath` from `../shared/dot-path.js`.
  - **`handleGetStateTrajectory`**: replace the inline `field.includes('.')` rejection (line ~99) with a loop calling `validateTrajectoryFieldName(field)`, returning `jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message, field_path: 'fields' })` on first non-null message. Keep empty/length/`>10` behavior identical (the shared validator already covers empty + length; the `>10` check remains inline after the loop).
  - **`handleGetStateTrajectory` version build** (lines ~152-161): replace top-level key lookups with `getAtPath(s.state, field)` for `values[field]` (map `undefined` → `null`) and `getAtPath(s.state, directionPathForField(field))` for `directions[field]`.
  - **`validateSummaryTrajectoryFields`** (lines ~289-328): replace the inline `field.includes('.')` rejection (line ~309) with the shared `validateTrajectoryFieldName` loop, returning `jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message, field_path: 'trajectory_fields' })`. Keep `>10` check.
  - **`resolveSummaryTrajectoryFields` unchanged** (default stays flat URS-projected, matching TASK-002).
  - Note: the Lambda summary path builds field trajectories through the shared `buildVersions` (line ~447), which after TASK-001 already resolves nested paths — so no further change is needed there.
- **Depends on**: TASK-001
- **Verification**: `npm run typecheck` passes; `npm run build` (lambda bundle) succeeds; manual reasoning that DynamoDB path `s.state` is the same shape as SQLite `s.state` (both `Record<string, unknown>`), so `getAtPath` resolves nested skills identically.

### TASK-004: OpenAPI — update fields / trajectory_fields descriptions + examples
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**:
  - **`/v1/state/trajectory` `fields` param description** (lines ~555-557): replace "Dot-path fields are not supported in v1.1." with v1.2 wording, e.g. "Flat canonical field names, or per-skill dot-paths matching `skills.{skillId}.{metric}` (skillId `^[A-Za-z0-9_-]{1,64}$`, leaf metric only — not `_delta`/`_direction`). Max 10 fields, max 128 chars each." Add a dot-path example to the param description/examples.
  - **400 description** (line ~628) and the **`dot_path_field` example** (lines ~639-643): replace the "Dot-path field not supported" example with an **invalid path** example reflecting the new message — `code: invalid_format`, `message: 'Field path must match skills.{skillId}.{metric}'` (rename example key to e.g. `invalid_field_path`).
  - **`/v1/learners/{ref}/summary` `trajectory_fields` description** (lines ~715-717): mirror the same dot-path allowance wording.
  - Add a per-skill example value (e.g. `skills.text_evidence.stabilityScore`) to at least one of the two descriptions, matching spec §v1.2 Response Shape example.
- **Depends on**: TASK-001, TASK-002
- **Verification**: `npm run docs:validate` (or the repo's OpenAPI lint/validate script) passes; rendered `/docs` shows updated descriptions; no remaining "not supported in v1.1" string for `fields`/`trajectory_fields`.

### TASK-005: Spec cross-ref — learner-summary-api Out of Scope
- **Files**: `docs/specs/learner-summary-api.md`
- **Action**: Modify
- **Details**: Per spec §v1.2 Touch Points, update the Out-of-Scope row (line ~288) "Nested dot-path trajectory fields (`skills.{skillId}.{metric}`)" to reflect that nested trajectory is now **implemented in `learner-trajectory-api.md` §v1.2** and reachable via `trajectory_fields` on this endpoint. Either move it out of the table or change its Rationale/Revisit cells to "Implemented (trajectory §v1.2)". Keep the canonical-snapshot guidance (`current_state.mastery_breakdown`) intact.
- **Depends on**: TASK-002
- **Verification**: No stale "impl pending" claim for nested trajectory in `learner-summary-api.md`; cross-ref points to trajectory §v1.2.

### TASK-006: Contract tests — update TRAJ-006, add TRAJ-009–TRAJ-012
- **Files**: `tests/contracts/learner-trajectory-api.test.ts`
- **Action**: Modify
- **Details**:
  - **TRAJ-006** (currently asserts 400 for `skills.fractions.stabilityScore`): per spec §v1.2 #8, change from "rejected" to "accepted when pattern-valid" — seed a learner with nested `skills.fractions.stabilityScore` state and assert 200 with the dot-path key echoed in `fields`/`versions[].values`. (Alternatively supersede with TRAJ-009 and repurpose TRAJ-006 to assert acceptance.)
  - **TRAJ-009** — per-skill trajectory across 3 versions: seed 3 versions with nested `state.skills.fractions.stabilityScore` and `..._direction` companions (v2/v3); GET `fields=skills.fractions.stabilityScore`; assert 200, ascending versions, `values['skills.fractions.stabilityScore']` and `directions['skills.fractions.stabilityScore']` populated from the nested companions.
  - **TRAJ-010** — direction null on first skill observation: v1 has `skills.fractions.stabilityScore` but no `..._direction`; assert `directions['skills.fractions.stabilityScore']` is `null` for v1.
  - **TRAJ-011** — invalid path rejected: GET `fields=aggregation.overall.masteryScore`; assert 400 `invalid_format` with message `Field path must match skills.{skillId}.{metric}`.
  - **TRAJ-012** — companion suffix rejected as leaf: GET `fields=skills.fractions.stabilityScore_direction`; assert 400 `invalid_format`.
  - **Seeding**: reuse the existing `createState`/`saveState` helper in this file with nested `state` objects (e.g. `state: { skills: { fractions: { stabilityScore: 0.55, stabilityScore_direction: 'declining' } } }`). The spec test-strategy note references `saveStateWithAppliedSignals`/SKL-014 fixtures, but direct `saveState` with nested `state` is sufficient and matches the existing v1.1 contract-test pattern (read path is the only behavior under test).
- **Depends on**: TASK-001
- **Verification**: `npm test -- learner-trajectory-api` green; TRAJ-001–TRAJ-008 still pass; TRAJ-009–TRAJ-012 pass; updated TRAJ-006 passes.

### TASK-007: Unit tests — directionPathForField + validateTrajectoryFieldName
- **Files**: `tests/unit/trajectory-handler-core.test.ts`
- **Action**: Modify
- **Details**: Add direct unit tests for the new public exports from TASK-001:
  - `directionPathForField('stabilityScore') === 'stabilityScore_direction'`
  - `directionPathForField('skills.fractions.stabilityScore') === 'skills.fractions.stabilityScore_direction'`
  - `validateTrajectoryFieldName('stabilityScore') === null` (flat valid)
  - `validateTrajectoryFieldName('skills.fractions.stabilityScore') === null` (nested valid)
  - `validateTrajectoryFieldName('aggregation.overall.masteryScore')` returns the pattern message (wrong prefix)
  - `validateTrajectoryFieldName('skills.fractions.stabilityScore_direction')` returns the pattern message (companion leaf)
  - `validateTrajectoryFieldName('skills..stabilityScore')` returns the pattern message (empty segment / `..`)
  - `validateTrajectoryFieldName('skills.bad id.stabilityScore')` returns the pattern message (skillId charset)
  - `validateTrajectoryFieldName('skills.a.b.c.d.e')` returns the pattern message (> 5 segments)
  - Plus a `buildVersions` test asserting nested value + direction resolution and `null` for absent nested paths.
- **Depends on**: TASK-001
- **Verification**: `npm test -- trajectory-handler-core` green.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| _none_ | — | No new files; all changes extend existing modules (spec: "Extend existing endpoints only") |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/state/trajectory-handler-core.ts` | TASK-001 | Export `directionPathForField` + `validateTrajectoryFieldName`; pattern validation in `validateTrajectoryParams`; `getAtPath`-based `buildVersions` |
| `src/learners/summary-handler-core.ts` | TASK-002 | Reuse shared validator in `validateTrajectoryFieldTokens` |
| `src/lambda/inspect.ts` | TASK-003 | Reuse shared validator in both trajectory + summary validation; `getAtPath`/`directionPathForField` in version build |
| `docs/api/openapi.yaml` | TASK-004 | Update `fields`/`trajectory_fields` descriptions + 400 examples |
| `docs/specs/learner-summary-api.md` | TASK-005 | Out-of-Scope cross-ref → implemented in trajectory §v1.2 |
| `tests/contracts/learner-trajectory-api.test.ts` | TASK-006 | Update TRAJ-006; add TRAJ-009–TRAJ-012 |
| `tests/unit/trajectory-handler-core.test.ts` | TASK-007 | Unit tests for new exports |

## Requirements Traceability

> Every In-Scope item under spec §v1.2 In Scope (narrow) and every contract-test acceptance maps to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| Accept dot-path field names in `fields` and `trajectory_fields` | spec §v1.2 In Scope #1 | TASK-001, TASK-002, TASK-003 |
| Allowed pattern `skills.{skillId}.{metric}` (skillId charset, leaf metric, depth ≤ 5) | spec §v1.2 In Scope #2 | TASK-001 |
| Read semantics unchanged — value or null, stored direction, no recomputation | spec §v1.2 In Scope #3 | TASK-001, TASK-003 |
| Direction companion via `directionPath(P)` (final segment → `S_direction`) | spec §v1.2 In Scope #4 | TASK-001 |
| Limits unchanged — max 10 fields, max 128 chars/path | spec §v1.2 In Scope #5 | TASK-001 |
| Error: invalid path → 400 `invalid_format` "Field path must match skills.{skillId}.{metric}"; `..`/empty/companion-leaf → 400 | spec §v1.2 In Scope #6 | TASK-001, TASK-006, TASK-007 |
| Remove v1.1 dot-path rejection in all 3 mirrors | spec §v1.2 In Scope #7 | TASK-001, TASK-002, TASK-003 |
| OpenAPI + contract tests extended (TRAJ-009–012; TRAJ-006 updated) | spec §v1.2 In Scope #8 | TASK-004, TASK-006 |
| Default (omitted fields) stays flat URS-projected — no nested auto-discovery | spec §v1.2 Out of Scope | TASK-002, TASK-003 |
| No breaking response-shape changes; dot-path keys echoed verbatim | spec §v1.2 Response Shape | TASK-001, TASK-006 |
| learner-summary-api Out-of-Scope cross-ref updated | spec §v1.2 Touch Points | TASK-005 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TRAJ-006 | contract | Dot-path field now **accepted** when pattern-valid (updated from v1.1 rejection) | TASK-006 |
| TRAJ-009 | contract | Per-skill trajectory across 3 versions; nested values/directions | TASK-006 |
| TRAJ-010 | contract | Direction `null` on first skill observation (v1 has metric, no `_direction`) | TASK-006 |
| TRAJ-011 | contract | Invalid path `aggregation.overall.masteryScore` → 400 `invalid_format` (pattern message) | TASK-006 |
| TRAJ-012 | contract | Companion-suffix leaf `skills.fractions.stabilityScore_direction` → 400 `invalid_format` | TASK-006 |
| UNIT-V12-01 | unit | `directionPathForField` flat + nested | TASK-007 |
| UNIT-V12-02 | unit | `validateTrajectoryFieldName` accept/reject matrix (prefix, charset, depth, `..`, companion leaf) | TASK-007 |
| UNIT-V12-03 | unit | `buildVersions` resolves nested value + direction; `null` for absent nested path | TASK-007 |
| TRAJ-001..008 | contract (regression) | All v1.1 flat behavior unchanged | TASK-001 |
| UNIT-CORE-01/02 | unit (regression) | Existing core validation/summary unchanged | TASK-001 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| §v1.2 In Scope #2 | Pattern named as `skills.{skillId}.{metric}` (3 segments) yet "Total path depth ≤ 5 segments" | Validator accepts 3–5 segments **only** when `segments[0] === 'skills'` and `segments[1]` matches the skillId charset; the leaf must not be a companion suffix | Implementation detail — spec silent on 4–5 segment shape but explicitly permits depth ≤ 5; literal-compatible (3-segment named pattern is the minimum, deeper skill paths allowed up to the recursion cap) |
| §v1.2 #6 error message | `"Field path must match skills.{skillId}.{metric}"` | Same exact string reused for all dot-path violations (`..`, empty segment, wrong prefix, bad charset, >5 depth, companion leaf) | Implementation detail — spec says these cases "return 400 invalid_format" without mandating distinct messages; single message satisfies the contract |
| §v1.2 test strategy | "seed via `saveStateWithAppliedSignals`" / SKL-014 fixture pattern | Contract tests seed nested state directly via existing `saveState` helper (read path is the only new behavior) | Implementation detail — spec silent on requiring the write pipeline; direct seeding matches existing TRAJ-001..008 pattern and is lower-risk |

> All literal values (error message, skillId regex `^[A-Za-z0-9_-]{1,64}$`, 128-char cap, 10-field cap, `directionPath` final-segment rule) match the spec verbatim. **None of the above changes any spec-stated literal — the plan is literal-compatible with the spec.**

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Three validation mirrors drift again (core, summary core, Lambda) | Medium | Centralize the validator + `directionPathForField` in `trajectory-handler-core.ts`; summary core and Lambda **import** it rather than re-implement (TASK-001..003) |
| `buildVersions` rewrite subtly changes v1.1 flat semantics | High | `getAtPath(state, 'flatKey')` === `state['flatKey']`; map `undefined`→`null` to match current behavior; TRAJ-001..008 + UNIT-CORE regressions gate the change |
| DynamoDB `state` shape differs from SQLite, breaking nested resolution on Lambda | Medium | Both are `Record<string, unknown>` JSON; `getAtPath` is storage-agnostic; covered by reasoning in TASK-003 (no integration harness for Lambda exists) |
| Historical versions written before nested deltas have no `_direction` | Low (expected) | Spec-defined: missing companion → `null` (same as v1.1 first-version rule); asserted by TRAJ-010 |
| OpenAPI example/key rename breaks downstream doc consumers | Low | Keep schema shapes unchanged; only descriptions + example values change (TASK-004) |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`) — incl. TRAJ-001..012, UNIT-V12-01..03, regressions
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Lambda bundle builds (`npm run build`)
- [ ] OpenAPI validates and `/docs` reflects dot-path wording
- [ ] No remaining "Dot-path fields are not supported in v1.1" string for `fields`/`trajectory_fields` in src or OpenAPI
- [ ] Matches spec §v1.2 requirements + Deviations resolutions applied

## Implementation Order

```
TASK-001 → TASK-002 → TASK-005
        → TASK-003
        → TASK-004
        → TASK-006
        → TASK-007
```
