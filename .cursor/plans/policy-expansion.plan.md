---
name: Policy Expansion — All 7 Decision Types (DEF-DEC-005)
overview: Promote the single-rule POC v1 policy to a full 7-rule policy covering all decision types in the closed set. The existing rule-reinforce is unchanged; 6 new rules are added in priority order using all 5 canonical state fields (stabilityScore, masteryScore, timeSinceReinforcement, confidenceInterval, riskSignal). DEC-008 test vectors expand from 3 to 9 parameterized cases proving traceability for every type. The escalate rule nests any inside all, exercising the compound condition evaluator with real production data.
todos:
  - id: TASK-001
    content: Expand default.json policy — rules for all 7 decision types (v2)
    status: completed
  - id: TASK-002
    content: Expand DEC-008 contract tests — 9 parameterized vectors for all 7 types
    status: completed
  - id: TASK-005
    content: Update integration/unit tests + QA doc for policy v2 (policy_version bump)
    status: completed
  - id: TASK-003
    content: Update decision-engine spec — expanded policy, DEC-008 vectors, DEF-DEC-005 resolved
    status: completed
  - id: TASK-004
    content: Regression check — all tests pass, build clean, lint clean
    status: completed
isProject: false
---

# Policy Expansion — All 7 Decision Types (DEF-DEC-005)

**Sources**: `docs/specs/decision-engine.md` §4.5 Decision Types, §4.7 Canonical State Fields, §Policy Model, §Contract Tests DEC-008

## Prerequisites

- E2E Cycle Completion plan executed (commit clean, graceful shutdown fixed, `npm run check` passing; currently 337 tests passing)
- The existing engine, store, handler, and validator already support all 7 types and arbitrary condition trees — no code changes needed, only policy and tests

## Clarification Notes

- **Policy expansion is additive**: The existing `rule-reinforce` keeps its `rule_id` and condition unchanged. 6 new rules are inserted above and below it in priority order.
- **Compound condition nesting**: The `escalate` rule uses a nested `any` inside `all`. This exercises the recursive evaluator with real production data (not just unit tests), proving ISS-DGE-002.
- **No `src/` code changes**: This plan changes policy + tests + docs/specs only. The engine is already correct for all 7 types.
- **Policy version bump has blast radius**: Changing `policy_version` from `"1.0.0"` → `"2.0.0"` requires updating any tests/docs that assert the default policy version (integration tests, unit tests, and manual QA docs), not just DEC-* contract tests.
- **Existing DEC-008 cases are replaced, not appended**: The 3-case POC v1 set (8a–8c) is replaced by a 9-case v2 set covering all 7 types + 2 default-path cases. The old case numbering is superseded.

## Tasks

### TASK-001: Expand default.json policy — rules for all 7 decision types

- **Status**: completed
- **Files**: `src/decision/policies/default.json`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Replace the single-rule POC v1 policy with a full 7-rule policy. Increment `policy_version` from `"1.0.0"` to `"2.0.0"`. Rules evaluated in priority order (first match wins). All rules use only the 5 canonical state fields from §4.7.

```json
  {
    "policy_id": "default",
    "policy_version": "2.0.0",
    "description": "POC v2 policy: 7 rules covering all decision types. Uses canonical state fields (stabilityScore, masteryScore, timeSinceReinforcement, confidenceInterval, riskSignal). Priority-ordered; first match wins.",
    "rules": [
      {
        "rule_id": "rule-escalate",
        "condition": {
          "all": [
            { "field": "confidenceInterval", "operator": "lt", "value": 0.3 },
            { "any": [
              { "field": "stabilityScore", "operator": "lt", "value": 0.3 },
              { "field": "riskSignal", "operator": "gt", "value": 0.8 }
            ]}
          ]
        },
        "decision_type": "escalate"
      },
      {
        "rule_id": "rule-pause",
        "condition": {
          "all": [
            { "field": "confidenceInterval", "operator": "lt", "value": 0.3 },
            { "field": "stabilityScore", "operator": "lt", "value": 0.5 }
          ]
        },
        "decision_type": "pause"
      },
      {
        "rule_id": "rule-reroute",
        "condition": {
          "all": [
            { "field": "riskSignal", "operator": "gt", "value": 0.7 },
            { "field": "stabilityScore", "operator": "lt", "value": 0.5 },
            { "field": "confidenceInterval", "operator": "gte", "value": 0.3 }
          ]
        },
        "decision_type": "reroute"
      },
      {
        "rule_id": "rule-intervene",
        "condition": {
          "all": [
            { "field": "stabilityScore", "operator": "lt", "value": 0.4 },
            { "field": "confidenceInterval", "operator": "gte", "value": 0.3 }
          ]
        },
        "decision_type": "intervene"
      },
      {
        "rule_id": "rule-reinforce",
        "condition": {
          "all": [
            { "field": "stabilityScore", "operator": "lt", "value": 0.7 },
            { "field": "timeSinceReinforcement", "operator": "gt", "value": 86400 }
          ]
        },
        "decision_type": "reinforce"
      },
      {
        "rule_id": "rule-advance",
        "condition": {
          "all": [
            { "field": "stabilityScore", "operator": "gte", "value": 0.8 },
            { "field": "masteryScore", "operator": "gte", "value": 0.8 },
            { "field": "riskSignal", "operator": "lt", "value": 0.3 },
            { "field": "confidenceInterval", "operator": "gte", "value": 0.7 }
          ]
        },
        "decision_type": "advance"
      },
      {
        "rule_id": "rule-recommend",
        "condition": {
          "all": [
            { "field": "riskSignal", "operator": "gte", "value": 0.5 },
            { "field": "stabilityScore", "operator": "gte", "value": 0.7 }
          ]
        },
        "decision_type": "recommend"
      }
    ],
    "default_decision_type": "reinforce"
  }
  

```

  **Rule priority rationale** (highest → lowest danger):

1. **escalate** — low confidence + extreme risk (stabilityScore < 0.3 or riskSignal > 0.8). Needs human review.
2. **pause** — low confidence + unstable. System can't reliably act.
3. **reroute** — high risk + low stability but sufficient confidence. Current path is wrong.
4. **intervene** — unstable with sufficient confidence. Learner needs help.
5. **reinforce** — moderate stability, hasn't been reinforced recently. Continue support.
6. **advance** — high stability + mastery + confidence, low risk. All-clear to progress.
7. **recommend** — stable but regression risk. Suggest targeted content.
8. **default** — `reinforce` as safe fallback.

- **Verification**: `npm run build` succeeds. `loadPolicy()` loads the new policy without errors.

### TASK-002: Expand DEC-008 contract tests — all 7 types

- **Status**: completed
- **Files**: `tests/contracts/decision-engine.test.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
Replace the existing DEC-008 test cases (3 cases for POC v1) with 9 parameterized cases covering all 7 decision types plus 2 default-path cases. Each case: apply signal with specific canonical fields → evaluateState → assert `decision_type` and `trace.matched_rule_id`.
**DEC-008 test vectors (v2 policy):**

  | Case | State Fields                                                                       | Expected `decision_type` | Expected `matched_rule_id` |
  | ---- | ---------------------------------------------------------------------------------- | ------------------------ | -------------------------- |
  | 8a   | `stabilityScore: 0.2, confidenceInterval: 0.2, riskSignal: 0.9`                    | `escalate`               | `rule-escalate`            |
  | 8b   | `stabilityScore: 0.4, confidenceInterval: 0.2`                                     | `pause`                  | `rule-pause`               |
  | 8c   | `stabilityScore: 0.4, confidenceInterval: 0.5, riskSignal: 0.8`                    | `reroute`                | `rule-reroute`             |
  | 8d   | `stabilityScore: 0.3, confidenceInterval: 0.5`                                     | `intervene`              | `rule-intervene`           |
  | 8e   | `stabilityScore: 0.5, timeSinceReinforcement: 100000`                              | `reinforce`              | `rule-reinforce`           |
  | 8f   | `stabilityScore: 0.9, masteryScore: 0.9, riskSignal: 0.1, confidenceInterval: 0.8` | `advance`                | `rule-advance`             |
  | 8g   | `stabilityScore: 0.8, riskSignal: 0.6`                                             | `recommend`              | `rule-recommend`           |
  | 8h   | `stabilityScore: 0.9, timeSinceReinforcement: 1000`                                | `reinforce`              | `null` (default)           |
  | 8i   | `stabilityScore: 0.6, timeSinceReinforcement: 1000, confidenceInterval: 0.8`       | `reinforce`              | `null` (default)           |

  Also update DEC-001 and DEC-006 setup signals to include all 5 canonical fields so the happy path triggers a real rule under v2.0.0 policy. Update `policy_version` assertions from `"1.0.0"` to `"2.0.0"` throughout.
- **Verification**: `npm run test:contracts -- decision-engine` passes all cases.

### TASK-005: Update integration/unit tests + QA doc for policy v2 (policy_version bump)

- **Status**: completed
- **Files**:
  - `tests/integration/e2e-signal-to-decision.test.ts`
  - `tests/unit/decision-engine.test.ts`
  - `tests/unit/decision-store.test.ts`
  - `tests/unit/policy-loader.test.ts`
  - `tests/contracts/output-api.test.ts` — Update policy_version in fixture helper (line 42)
  - `docs/testing/qa-test-pocv1.md` (or add a new v2 QA doc and clearly mark this as v1-only)
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
  - Update any assertions that the **default policy version** is `"1.0.0"` to `"2.0.0"`.
  - **Integration test note**: The existing E2E learner payloads only include `stabilityScore` and `timeSinceReinforcement`. Under the v2 policy proposed in TASK-001, those payloads should still result in `reinforce` decisions (rule-reinforce or default) because the other rules depend on fields that will be absent and therefore evaluate to false. The only required E2E expectation changes should be `trace.policy_version`.
  - Update the manual QA doc expectations for `trace.policy_version` to match the running policy version (or fork the doc into v1 vs v2 explicitly).
- **Verification**: `npm test` passes without test expectations pinned to v1.

### TASK-003: Update decision-engine spec

- **Status**: completed
- **Files**: `docs/specs/decision-engine.md`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
Update the spec to reflect policy expansion:
  1. **§Policy Model → Default policy**: Replace the v1 single-rule JSON with the v2 7-rule JSON. Update description paragraph and rule rationale.
  2. **§Contract Tests → DEC-008 test vectors table**: Replace the 3-case POC v1 table with the 9-case v2 table. Update rationale paragraph.
  3. **§Deferred Items**: Update DEF-DEC-005 status to `**Resolved`**.
- **Verification**: Spec is internally consistent. All described artifacts exist in codebase.

### TASK-004: Regression check

- **Status**: completed
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-003
- **Details**:
Full verification suite:
  - `npm test` — all tests pass (320+ with expanded DEC-008)
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
  - Verify all 9 DEC-008 cases pass
  - Verify all OUT-API-001–003 still pass
  - Verify all existing signal/state tests still pass
- **Verification**: All commands exit 0. Test count increased (from 320 to ~326 with 6 new DEC-008 cases).

## Files Summary

### To Modify


| File                                               | Task     | Changes                                                                |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `src/decision/policies/default.json`               | TASK-001 | Expand from 1-rule v1 to 7-rule v2 policy                              |
| `tests/contracts/decision-engine.test.ts`          | TASK-002 | Expand DEC-008 from 3 to 9 parameterized test vectors                  |
| `tests/integration/e2e-signal-to-decision.test.ts` | TASK-005 | Update policy_version expectation (and any other v1-pinned assertions) |
| `tests/unit/policy-loader.test.ts`                 | TASK-005 | Update any v1-pinned policy_version expectations                       |
| `tests/unit/decision-engine.test.ts`               | TASK-005 | Update any v1-pinned policy_version expectations                       |
| `tests/unit/decision-store.test.ts`                | TASK-005 | Update any v1-pinned policy_version expectations                       |
| `tests/contracts/output-api.test.ts`               | TASK-005 | Update policy_version in fixture helper (line 42)                      |
| `docs/testing/qa-test-pocv1.md`                    | TASK-005 | Update policy_version expectation (or fork/mark as v1-only)            |
| `docs/specs/decision-engine.md`                    | TASK-003 | Update policy section, DEC-008 vectors, DEF-DEC-005 status             |


## Test Plan


| Test ID    | Type     | Description                                                | Task     |
| ---------- | -------- | ---------------------------------------------------------- | -------- |
| DEC-008-8a | contract | escalate: low confidence + extreme risk                    | TASK-002 |
| DEC-008-8b | contract | pause: low confidence + unstable                           | TASK-002 |
| DEC-008-8c | contract | reroute: high risk + low stability + sufficient confidence | TASK-002 |
| DEC-008-8d | contract | intervene: unstable + sufficient confidence                | TASK-002 |
| DEC-008-8e | contract | reinforce: moderate stability + not recently reinforced    | TASK-002 |
| DEC-008-8f | contract | advance: high stability + mastery + confidence, low risk   | TASK-002 |
| DEC-008-8g | contract | recommend: stable but regression risk                      | TASK-002 |
| DEC-008-8h | contract | default path: high stability, recently reinforced          | TASK-002 |
| DEC-008-8i | contract | default path: moderate stability, recently reinforced      | TASK-002 |


## Risks


| Risk                                                         | Impact | Mitigation                                                                                                     |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| Policy expansion changes DEC-001/DEC-006 behavior            | Medium | Update signal payloads in those tests to include all 5 canonical fields so they trigger a known rule           |
| `escalate` nested `any` inside `all` edge cases              | Low    | Already covered by policy-loader unit tests; contract test 8a exercises it end-to-end                          |
| `policy_version` change from "1.0.0" to "2.0.0" breaks tests | Medium | Systematically update all `policy_version` assertions in TASK-002 and TASK-005 (including output-api fixtures) |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- All 9 DEC-008 contract tests pass
- All OUT-API-001–OUT-API-003 still pass
- Existing signal/state tests still pass (no regression)
- `default.json` policy version is `"2.0.0"` with 7 rules
- Spec updated to match implementation

## Implementation Order

```
TASK-001 (policy) → TASK-002 (contract tests) → TASK-005 (integration/unit tests + QA doc) → TASK-003 (spec) → TASK-004 (regression)
```

Linear sequence — each task depends on the previous.

## Future: Operator Registry (Deferred)

**Trigger**: When a policy requires an operator not in the current closed set (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`).

**Context**: The v2 policy uses only the existing 6 operators. However, future policies may need `between` (range checks), `in` (set membership), or `contains` (substring/array). Currently, adding an operator requires changes to 2 files (`policy-loader.ts` switch statement + `types.ts` union type).

**Industry best practice — Operator Registry pattern**:
Replace the hardcoded `switch` in `evaluateCondition` with a pluggable operator map:

```typescript
// Current (hardcoded):
switch (operator) {
  case 'eq': return raw === value;
  case 'gt': return numState > numValue;
  // adding "between" requires code change
}

// Registry pattern (future):
const operators: Record<string, (state: unknown, value: unknown) => boolean> = {
  eq:  (s, v) => s === v,
  neq: (s, v) => s !== v,
  gt:  (s, v) => Number(s) > Number(v),
  // adding "between" = adding to registry, no evaluator change
};
```

**When to actionize**: Create a dedicated plan when the first policy requires an operator beyond the current 6. Until then, the current implementation is correct and sufficient — don't over-engineer ahead of a real requirement.

**Tracked in**: `docs/specs/decision-engine.md` (see “Out of Scope” and “Deferred Items”)