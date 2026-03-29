# State Delta Detection

> Automatic decay and improvement detection by computing numeric field deltas at state-application time — enabling policies to evaluate trend direction without a separate query.

## Overview

The STATE Engine currently stores the latest value of each canonical field per learner state version. There is no built-in mechanism to detect whether a field is improving, declining, or stable across signals. This spec adds automatic delta computation at state-application time: for every numeric field that changes between the prior and new state version, the engine writes companion fields `{field}_delta` (numeric difference) and `{field}_direction` (`"improving" | "declining" | "stable"`) into the state object alongside the canonical value.

These delta fields are **first-class state fields** — the decision engine evaluates them against policy rules (`stabilityScore_delta < -0.1 → intervene`), they appear in decision traces, and they are returned in `GET /v1/state`. No new endpoints are required. Decay detection becomes a policy concern, not an infrastructure concern.

**v1.1 scope:** Flat numeric fields only. Nested dot-path delta fields (e.g., `skills.fractions.stabilityScore_delta`) are deferred to v1.2 and depend on US-SKILL-001 (dot-path resolver).

---

## Ingestion Pipeline Placement

Delta computation occurs inside `computeNewState()` in `src/state/engine.ts`, after the deep merge and before the state is validated and saved:

```
applySignals()
  → computeNewState(currentState, signals)     ← existing deep merge
  → computeStateDeltas(currentState, newState) ← NEW: writes _delta / _direction fields
  → validateStateObject(newState)
  → saveStateWithAppliedSignals()
```

---

## Delta Field Conventions

For each top-level numeric field `F` in the new state where the prior state also had a value for `F`:

| Companion field | Type | Description |
|---|---|---|
| `{F}_delta` | `number` | `newValue - oldValue`. Positive = increase; negative = decrease. |
| `{F}_direction` | `string` | `"improving"` when delta > 0; `"declining"` when delta < 0; `"stable"` when delta === 0. |

**First signal (no prior state):** Delta fields are not written for fields with no prior value — they remain absent until a second signal is received for that field.

**Non-numeric fields:** Skipped — no delta computed. String, boolean, and object fields do not produce companions.

**Null removal signals:** If a field is explicitly nulled in the new signal (deep-merge null semantics: key deleted), any existing `{F}_delta` and `{F}_direction` fields for that field are also removed from state.

**Example:**

Prior state: `{ stabilityScore: 0.55, masteryScore: 0.70 }`
New state after signal: `{ stabilityScore: 0.28, masteryScore: 0.75 }`

Result state written to store:

```json
{
  "stabilityScore": 0.28,
  "stabilityScore_delta": -0.27,
  "stabilityScore_direction": "declining",
  "masteryScore": 0.75,
  "masteryScore_delta": 0.05,
  "masteryScore_direction": "improving"
}
```

---

## Policy Rule Examples

Delta fields are evaluated identically to any other canonical field:

```json
{
  "rule_id": "rule-decay-intervene",
  "condition": {
    "all": [
      { "field": "stabilityScore_delta", "operator": "lt", "value": -0.1 },
      { "field": "stabilityScore", "operator": "lt", "value": 0.6 }
    ]
  },
  "decision_type": "intervene"
}
```

Direction field evaluated as string equality:

```json
{
  "rule_id": "rule-declining-advance-block",
  "condition": {
    "all": [
      { "field": "masteryScore_direction", "operator": "eq", "value": "declining" },
      { "field": "masteryScore", "operator": "lt", "value": 0.5 }
    ]
  },
  "decision_type": "intervene"
}
```

---

## Requirements

### Functional

- [ ] `computeStateDeltas(prior, next)` computes `{field}_delta` and `{field}_direction` for all top-level numeric fields present in both `prior` and `next` state
- [ ] Delta fields are written into the new state object before `validateStateObject` and `saveStateWithAppliedSignals` are called
- [ ] Delta fields are **not** computed for fields absent in prior state (first-signal case)
- [ ] Delta fields are **not** computed for non-numeric fields (string, boolean, object, array)
- [ ] When a field is nulled in an incoming signal, its companion `_delta` and `_direction` fields are also removed from state (null-removal propagation)
- [ ] `{field}_direction` values are strictly `"improving"`, `"declining"`, or `"stable"` — no other values
- [ ] Delta fields appear in `GET /v1/state` responses (no filtering needed — they are canonical state)
- [ ] Delta fields appear in `Decision.trace.state_snapshot` when referenced by a policy rule (existing `extractCanonicalSnapshot` covers this automatically)
- [ ] Delta fields are preserved across state versions — once written, they update on every subsequent signal that changes the canonical field

### Acceptance Criteria

- Given learner has prior `stabilityScore: 0.55` and receives a signal with `stabilityScore: 0.28`, then state contains `stabilityScore_delta: -0.27` and `stabilityScore_direction: "declining"`
- Given learner's first signal ever contains `stabilityScore: 0.28`, then state does **not** contain `stabilityScore_delta` or `stabilityScore_direction`
- Given learner has prior `stabilityScore: 0.55` and receives a signal with `stabilityScore: 0.55`, then state contains `stabilityScore_delta: 0` and `stabilityScore_direction: "stable"`
- Given a policy rule `{ "field": "stabilityScore_delta", "operator": "lt", "value": -0.1 }`, when delta is -0.27, then the rule fires and the decision trace includes `stabilityScore_delta` with `actual_value: -0.27`
- Given a field `name: "Alice"` (string), no `name_delta` or `name_direction` field is written
- Given a signal nulls `stabilityScore`, then `stabilityScore_delta` and `stabilityScore_direction` are also removed from state

---

## Constraints

- **No new API endpoints** — delta fields are state fields; all existing state query surfaces (`GET /v1/state`, decision trace, receipts) expose them automatically
- **Flat fields only in v1.1** — nested dot-path delta fields (e.g., `skills.fractions.stabilityScore_delta`) deferred to v1.2 pending US-SKILL-001
- **Naming collision guard** — if a client sends a signal with a field literally named `stabilityScore_delta` or `stabilityScore_direction`, the computed companion value overwrites it silently (computed value is authoritative). Document this constraint in signal ingestion notes.
- **Forbidden key guard** — `_delta` and `_direction` suffixes must NOT be listed as forbidden keys in signal ingestion (`src/ingestion/forbidden-keys.ts`). Verify before implementation.
- **Backward compatibility** — existing policies with no delta rules continue to work unchanged; delta fields are additive

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Nested dot-path delta fields (`skills.fractions.stabilityScore_delta`) | Requires US-SKILL-001 dot-path resolver in decision engine | US-SKILL-001 is implemented (v1.2) |
| Configurable delta field list (opt-in per tenant) | All numeric fields tracked automatically for pilot simplicity | Noise from unwanted delta fields reported by customers |
| Smoothing / rolling average | Simple first-to-last delta is sufficient for pilot | v1.2 trajectory API introduces pluggable direction algorithm |
| Delta history / trend API | Covered by `learner-trajectory-api.md` (v1.1) | Already spec'd separately |
| Real-time delta threshold alerting (push/event) | Out of scope for core API layer | EventBridge integration spec |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `computeNewState()` + `applySignals()` | `docs/specs/state-engine.md` | **Complete** |
| `LearnerState` type, `state: Record<string, unknown>` | `src/shared/types.ts` | **Complete** |
| `saveStateWithAppliedSignals()` | `docs/specs/state-engine.md` | **Complete** |
| `extractCanonicalSnapshot()` (auto-includes delta fields when policy references them) | `docs/specs/decision-engine.md` | **Complete** |
| Forbidden key list (must not include `_delta`/`_direction` suffixes) | `docs/specs/signal-ingestion.md` | Verify during implementation |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `{field}_delta` and `{field}_direction` in canonical state | Policy rules in `PolicyDefinition` (any org) |
| Direction data for flat fields without a version-range query | `docs/specs/learner-trajectory-api.md` (v1.1 — provides current-version trajectory direction) |
| Direction data for summary endpoint | `docs/specs/learner-summary-api.md` (v1.1) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `state_version_conflict` | State Engine — optimistic lock on save |

### New (add during implementation)

None. Delta computation is internal to `applySignals`; it does not produce new user-visible error codes. If delta computation encounters a non-numeric value for a field that was previously numeric (type change across signals), the field's delta is skipped silently for that signal (non-fatal; log at `debug` level).

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| DELTA-001 | Delta computed on second signal for declining field | Prior: `{ stabilityScore: 0.55 }` → new signal: `{ stabilityScore: 0.28 }` | State contains `stabilityScore_delta: -0.27`, `stabilityScore_direction: "declining"` |
| DELTA-002 | Delta computed on second signal for improving field | Prior: `{ masteryScore: 0.40 }` → new signal: `{ masteryScore: 0.65 }` | State contains `masteryScore_delta: 0.25`, `masteryScore_direction: "improving"` |
| DELTA-003 | No delta on first signal (no prior state) | First signal for learner: `{ stabilityScore: 0.40 }` | State contains `stabilityScore: 0.40`; no `stabilityScore_delta` or `stabilityScore_direction` |
| DELTA-004 | No delta for non-numeric field | Prior: `{ level: "beginner" }` → new signal: `{ level: "intermediate" }` | No `level_delta` or `level_direction` in state |
| DELTA-005 | Delta fields in decision trace when policy references them | Policy rule on `stabilityScore_delta lt -0.1`; delta is -0.27 | Rule fires; `trace.state_snapshot` contains `stabilityScore_delta: -0.27`; rationale references `stabilityScore_delta` |
| DELTA-006 | Stable delta | Prior: `{ stabilityScore: 0.55 }` → new signal: `{ stabilityScore: 0.55 }` | State contains `stabilityScore_delta: 0`, `stabilityScore_direction: "stable"` |
| DELTA-007 | Null-removal propagates to delta fields | Prior: `{ stabilityScore: 0.55, stabilityScore_delta: -0.1 }` → signal nulls `stabilityScore` | State does not contain `stabilityScore`, `stabilityScore_delta`, or `stabilityScore_direction` |

> **Test strategy:** DELTA-001 through DELTA-007 are unit tests for `computeStateDeltas()` and integration tests for the full `applySignals()` → `getState()` path using the existing Vitest + SQLite in-process pattern. DELTA-005 requires a matching policy fixture.

---

## Notes

- **Precision:** JavaScript floating-point arithmetic applies to delta computation. For pilot scale, this is acceptable. Document that very small floating-point errors (e.g., `0.1 + 0.2 = 0.30000000000000004`) may appear in `_delta` values. If precision matters, the policy threshold should account for a small epsilon or round values in the transform expression (already supported by `Math.round` in `tenant-field-mappings.md` transforms).
- **Naming authority:** The `_delta` and `_direction` suffixes are reserved by the 8P3P platform. Document in the signal ingestion spec notes that clients should not use these suffixes for their own payload fields.
- **Future:** v1.2 trajectory API (`learner-trajectory-api.md`) reads stored state versions to produce a per-version trend view. The delta fields stored per version are the input data for that API — no retroactive computation required.

---

*Spec created: 2026-03-28 | Phase: v1.1 | Depends on: state-engine.md, decision-engine.md*
