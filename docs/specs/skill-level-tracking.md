# Skill-Level Tracking & Assessment Type Classification

> Enables skill-scoped policy evaluation, nested delta detection, and assessment-type filtering — so the system can answer "How has Johnny been doing in fractions this past year?" and tell teachers *which skill* needs intervention, not just *that* intervention is needed.

## Overview

The 8P3P pitch deck promises schools will see *"What they need help with"* and *"What should happen next."* Today the decision engine evaluates flat top-level state fields (`stabilityScore < 0.5 → intervene`). It cannot express *"fractions stability is declining → intervene on fractions"* because the policy evaluator uses `state[node.field]` — a direct key lookup that doesn't traverse nested objects.

This spec promotes **US-SKILL-001** from the v1.2 backlog to v1.1 and bundles it with three related capabilities that together deliver the full "what they need help with" story:

| Change | What It Enables |
|--------|----------------|
| **1. Dot-path policy evaluation** | Policy rules like `skills.fractions.stabilityScore lt 0.5` — tells the system *which skill* needs intervention |
| **2. Skill + assessment_type payload convention** | Structured signal payloads that carry skill identity and assessment classification |
| **3. Nested delta detection** | `skills.fractions.stabilityScore_direction: "declining"` — trend detection per skill |
| **4. Assessment-type + skill query filters** | Filter decisions/signals by `skill` or `assessment_type` — "show me all diagnostic results for fractions" |

Together: a teacher can see that Johnny's fractions stability has been declining since September, his last diagnostic assessment was in January, and the system recommended intervention specifically for fractions three times — all from the same infrastructure that handles flat-field signals today.

**Backward compatibility:** All changes are additive. Existing flat-field policies, signals, and queries continue to work unchanged.

---

## Change 1: Dot-Path Policy Evaluation

### Problem

```typescript
// src/decision/policy-loader.ts line 464
const raw = state[node.field];
```

A policy rule with `"field": "skills.fractions.stabilityScore"` looks up the literal key `"skills.fractions.stabilityScore"` in the top-level state object — returns `undefined` because the actual data lives at `state.skills.fractions.stabilityScore` (nested).

### Solution

Replace direct key lookup with the existing `getAtPath()` function from `src/config/tenant-field-mappings.ts`:

```typescript
const raw = getAtPath(state, node.field);
```

This function already exists, is tested, and handles dot-path traversal with null safety. It must be exported from a shared location (or copied into `policy-loader.ts` / `src/shared/`).

### Affected Functions

| Function | File | Change |
|----------|------|--------|
| `evaluateConditionCollecting()` | `src/decision/policy-loader.ts` | `state[node.field]` → `getAtPath(state, node.field)` |
| `extractCanonicalSnapshot()` | `src/decision/engine.ts` | `state[field]` → `getAtPath(state, field)` + nested `setAtPath` for snapshot |
| `collectPolicyFields()` | `src/decision/engine.ts` | No change — already collects field strings |

### Policy Rule Examples (Now Valid)

```json
{
  "rule_id": "fractions-intervene",
  "condition": {
    "all": [
      { "field": "skills.fractions.stabilityScore", "operator": "lt", "value": 0.5 },
      { "field": "skills.fractions.stabilityScore_direction", "operator": "eq", "value": "declining" }
    ]
  },
  "decision_type": "intervene"
}
```

Decision trace will include:

```json
{
  "evaluated_fields": [
    { "field": "skills.fractions.stabilityScore", "operator": "lt", "threshold": 0.5, "actual_value": 0.28 },
    { "field": "skills.fractions.stabilityScore_direction", "operator": "eq", "threshold": "declining", "actual_value": "declining" }
  ]
}
```

---

## Change 2: Skill + Assessment Type Payload Convention

### Recommended Signal Payload Structure

```json
{
  "org_id": "springs",
  "source_system": "iready",
  "learner_reference": "L-12345",
  "timestamp": "2026-04-10T10:00:00Z",
  "schema_version": "v1",
  "payload": {
    "skill": "fractions",
    "assessment_type": "diagnostic",
    "skills": {
      "fractions": {
        "stabilityScore": 0.28,
        "masteryScore": 0.65
      }
    }
  },
  "metadata": {
    "school_id": "springs-es-03"
  }
}
```

| Field | Location | Purpose |
|-------|----------|---------|
| `skill` | `payload.skill` | Flat top-level field identifying the primary skill for this signal. Survives in state as the *last skill assessed*. Queryable as a filter. |
| `assessment_type` | `payload.assessment_type` | Classification of the assessment (`diagnostic`, `formative`, `summative`, `benchmark`, `progress_monitoring`). Survives in state as the *last assessment type*. |
| `skills.{name}.{metric}` | `payload.skills.*` | Nested per-skill metrics that accumulate in state via `deepMerge`. Each new signal for the same skill updates that skill's metrics. Multiple skills can coexist. |

### How State Accumulates Over Time

**Signal 1** (September — diagnostic, fractions):
```json
{ "skill": "fractions", "assessment_type": "diagnostic", "skills": { "fractions": { "stabilityScore": 0.72, "masteryScore": 0.65 } } }
```

**Signal 2** (November — formative, fractions):
```json
{ "skill": "fractions", "assessment_type": "formative", "skills": { "fractions": { "stabilityScore": 0.55, "masteryScore": 0.70 } } }
```

**Signal 3** (January — diagnostic, reading):
```json
{ "skill": "reading", "assessment_type": "diagnostic", "skills": { "reading": { "stabilityScore": 0.80, "masteryScore": 0.85 } } }
```

**Resulting state after 3 signals:**
```json
{
  "skill": "reading",
  "assessment_type": "diagnostic",
  "skills": {
    "fractions": {
      "stabilityScore": 0.55,
      "stabilityScore_delta": -0.17,
      "stabilityScore_direction": "declining",
      "masteryScore": 0.70,
      "masteryScore_delta": 0.05,
      "masteryScore_direction": "improving"
    },
    "reading": {
      "stabilityScore": 0.80,
      "masteryScore": 0.85
    }
  }
}
```

The teacher can now see: fractions stability is declining, reading stability is healthy, and the last assessment was a diagnostic for reading. The decision engine can fire `skills.fractions.stabilityScore lt 0.5 → intervene` independently of reading.

### Convention, Not Enforcement

This is a **recommended convention**, not a schema enforcement. The `payload` remains opaque (`type: object` in OpenAPI). Schools that don't use skill-level tracking simply don't send `skills.*` — their flat-field policies continue to work. Document the convention in the pilot integration guide and in connector templates.

---

## Change 3: Nested Delta Detection

### Problem

`computeStateDeltas()` in `src/state/engine.ts` only processes top-level numeric fields:

```typescript
for (const key of Object.keys(next)) {
  if (typeof nextVal !== 'number') continue;  // skips nested objects
}
```

When state has `skills.fractions.stabilityScore`, the `skills` key is an object — skipped entirely. No `skills.fractions.stabilityScore_delta` is computed.

### Solution

Extend `computeStateDeltas()` with a recursive variant that walks nested objects and writes companion delta fields at the same nesting level:

```typescript
function computeNestedDeltas(
  prior: Record<string, unknown>,
  next: Record<string, unknown>,
  result: Record<string, unknown>
): void {
  for (const key of Object.keys(next)) {
    const nextVal = next[key];
    const priorVal = prior[key];

    if (typeof nextVal === 'number' && typeof priorVal === 'number') {
      const delta = nextVal - priorVal;
      result[`${key}_delta`] = delta;
      result[`${key}_direction`] = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable';
    } else if (isRecord(nextVal) && isRecord(priorVal)) {
      const nestedResult = result[key] as Record<string, unknown> ?? {};
      computeNestedDeltas(priorVal, nextVal, nestedResult);
      result[key] = nestedResult;
    }
  }
}
```

**Result:** `skills.fractions.stabilityScore` going from `0.72` to `0.55` produces `skills.fractions.stabilityScore_delta: -0.17` and `skills.fractions.stabilityScore_direction: "declining"` — at the same nesting level as the source field.

**Max recursion depth:** Cap at 5 levels (sufficient for `skills.{name}.{metric}` = 3 levels). Beyond 5, skip and log a debug warning.

**Backward compatibility:** Top-level flat fields continue to produce top-level delta companions (identical to current behavior). The recursion only adds nested companion fields — never removes or changes existing ones.

---

## Change 4: Assessment-Type + Skill Query Filters

### New Optional Query Parameters

| Endpoint | New Params | Filter Mechanism |
|----------|-----------|-----------------|
| `GET /v1/signals` | `skill`, `assessment_type` | Filter signal log rows where `payload->>'skill' = :skill` and/or `payload->>'assessment_type' = :type` |
| `GET /v1/decisions` | `skill`, `assessment_type` | Filter decisions whose triggering signal had the matching payload field. Requires propagation (see below). |
| `GET /v1/ingestion` | `skill`, `assessment_type` | Filter ingestion outcomes by originating signal payload fields |
| `GET /v1/state/trajectory` | `skill` | When `skill` is provided, auto-prefix `fields` with `skills.{skill}.` — e.g., `skill=fractions&fields=stabilityScore` → internally queries `skills.fractions.stabilityScore` |

### Decision Context Propagation

When a signal produces a decision, propagate `skill` and `assessment_type` from `signal.payload` into `decision_context`:

```json
{
  "decision_context": {
    "skill": "fractions",
    "assessment_type": "diagnostic",
    "school_id": "springs-es-03"
  }
}
```

This enables: *"Show me all 'intervene' decisions for fractions diagnostics."*

**Implementation:** In `handler-core.ts`, after `evaluateState()` succeeds, merge `signal.payload.skill`, `signal.payload.assessment_type`, and `signal.metadata.school_id` (when present) into `decision_context` before `saveDecision()`.

---

## The "How has Johnny been doing in fractions?" Query

With all four changes, here's how the system answers this question:

**Step 1: Current state (fractions snapshot)**
```
GET /v1/state?org_id=springs&learner_reference=L-12345
```
Response includes `skills.fractions.stabilityScore`, `skills.fractions.stabilityScore_direction`, `skills.fractions.masteryScore`, etc.

**Step 2: Trend over time**
```
GET /v1/state/trajectory?org_id=springs&learner_reference=L-12345&skill=fractions&fields=stabilityScore,masteryScore
```
Returns version-by-version values of fractions metrics with direction per version.

**Step 3: Decision history for fractions**
```
GET /v1/decisions?org_id=springs&learner_reference=L-12345&skill=fractions&from_time=2025-09-01T00:00:00Z&to_time=2026-04-10T00:00:00Z
```
Returns all decisions triggered by fractions signals — each with `decision_type`, `rationale`, `matched_rule_id`.

**Step 4: Educator summary (future — learner-summary-api.md)**
```
GET /v1/learners/L-12345/summary?org_id=springs&trajectory_fields=skills.fractions.stabilityScore,skills.fractions.masteryScore
```
One-call aggregation with current state, decisions, trajectory, and policy.

---

## Requirements

### Functional

- [ ] **Change 1:** Policy engine resolves `node.field` via dot-path traversal, not direct key lookup
- [ ] **Change 1:** `extractCanonicalSnapshot()` resolves dot-path fields and preserves nested structure in snapshot
- [ ] **Change 1:** Decision trace `evaluated_fields` correctly reports `actual_value` for nested fields
- [ ] **Change 1:** Existing flat-field policies are unaffected (backward compatible)
- [ ] **Change 2:** Signals with `payload.skill` and `payload.assessment_type` are accepted and merged into state
- [ ] **Change 2:** Nested `payload.skills.{name}.{metric}` accumulates per skill via existing `deepMerge`
- [ ] **Change 2:** Payload convention is documented in pilot integration guide
- [ ] **Change 3:** `computeStateDeltas()` recursively computes delta companions for nested numeric fields
- [ ] **Change 3:** Max recursion depth of 5 levels; deeper nesting is skipped with debug log
- [ ] **Change 3:** Top-level delta behavior is unchanged (backward compatible)
- [ ] **Change 3:** Null-removal propagation extends to nested delta companions
- [ ] **Change 4:** `GET /v1/signals` accepts optional `skill` and `assessment_type` query filters
- [ ] **Change 4:** `GET /v1/decisions` accepts optional `skill` and `assessment_type` query filters
- [ ] **Change 4:** `skill` and `assessment_type` from `signal.payload` are propagated into `decision_context`
- [ ] **Change 4:** `GET /v1/state/trajectory` accepts optional `skill` parameter that auto-prefixes field paths

### Acceptance Criteria

- Given a policy rule `{ "field": "skills.fractions.stabilityScore", "operator": "lt", "value": 0.5 }` and state `{ skills: { fractions: { stabilityScore: 0.28 } } }`, then the rule matches and decision_type is produced
- Given the same state, when `extractCanonicalSnapshot` runs, then `state_snapshot` includes `skills.fractions.stabilityScore: 0.28`
- Given a flat-field policy rule `{ "field": "stabilityScore", "operator": "lt", "value": 0.5 }` and state `{ stabilityScore: 0.28 }`, then behavior is identical to pre-change (no regression)
- Given signals updating `skills.fractions.stabilityScore` from 0.72 to 0.55, then state includes `skills.fractions.stabilityScore_delta: -0.17` and `skills.fractions.stabilityScore_direction: "declining"`
- Given `GET /v1/decisions?skill=fractions`, then only decisions with `decision_context.skill === "fractions"` are returned
- Given `GET /v1/state/trajectory?skill=fractions&fields=stabilityScore`, then trajectory returns values for `skills.fractions.stabilityScore` across versions
- Given a signal with `payload.skill: "fractions"` that produces a decision, then `decision.decision_context.skill === "fractions"`

---

## Constraints

- **Convention, not enforcement** — `skill` and `assessment_type` are recommended payload fields, not required. Signals without them are valid.
- **Dot-path policy evaluation is generic** — it works for any nested path, not just `skills.*`. This enables future use cases (e.g., `modules.safety.completionRate` for compliance training).
- **Delta recursion capped at 5 levels** — prevents stack overflow on deeply nested payloads.
- **Assessment type is not an enum** — the system accepts any string. Recommended values (`diagnostic`, `formative`, `summative`, `benchmark`, `progress_monitoring`) are documented in the integration guide but not enforced.
- **`skill` filter on trajectory is syntactic sugar** — internally translates to `skills.{skill}.{field}` dot-paths. The trajectory API itself doesn't change its core logic.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Skill taxonomy / ontology (controlled vocabulary) | Schools define their own skills; 8P3P doesn't prescribe | Phase 2 — connector templates can suggest standard skill names per LMS |
| Per-skill LIU metering (break down LIUs by skill) | Monthly org-level LIU count is sufficient for pilot | Phase 1 per-connector metrics |
| Skill-to-standard alignment (Common Core, NGSS) | Standards mapping is a curriculum concern, not infrastructure | Phase 3 platform connectivity |
| Cross-learner skill aggregation ("how are all students doing in fractions?") | Separate analytics API | Phase 2 admin dashboard |
| AI-powered skill inference from signals | Signals must explicitly carry skill identity | Phase 4 (US-POLICY-BUILDER-001) |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `getAtPath()` utility | `src/config/tenant-field-mappings.ts` | **Implemented** — move to `src/shared/` or re-export |
| `computeStateDeltas()` | `docs/specs/state-delta-detection.md` | **Implemented** — extend with recursion |
| `evaluateConditionCollecting()` | `src/decision/policy-loader.ts` | **Implemented** — change lookup method |
| `extractCanonicalSnapshot()` | `src/decision/engine.ts` | **Implemented** — change lookup method |
| `decision_context` propagation pattern | `docs/specs/multi-school-architecture.md` | **Spec'd** — same pattern for `school_id` |
| `GET /v1/state/trajectory` | `docs/specs/learner-trajectory-api.md` | **Spec'd** — add `skill` sugar param |
| Signal log payload field filtering | `docs/specs/signal-log.md` | **Implemented** — add JSON field filter |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Dot-path policy evaluation | All future nested-field use cases |
| Nested delta detection | `learner-trajectory-api.md` nested field support |
| Skill-scoped query filters | `learner-summary-api.md` skill breakdown |
| Assessment-type in `decision_context` | Future analytics, admin dashboard |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `missing_required_field` | Validation |
| `invalid_format` | Validation — bad `skill` or `assessment_type` format |

### New

None. All error paths map to existing codes.

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| SKL-001 | unit | Dot-path policy evaluation — nested field matches | Rule `skills.fractions.stabilityScore lt 0.5` matches state with `0.28` |
| SKL-002 | unit | Dot-path policy evaluation — nested field does not match | Rule `skills.fractions.stabilityScore lt 0.5` does not match state with `0.72` |
| SKL-003 | unit | Flat-field backward compatibility | Rule `stabilityScore lt 0.5` still works on flat state |
| SKL-004 | unit | `extractCanonicalSnapshot` includes nested field | Snapshot includes `skills.fractions.stabilityScore` when policy references it |
| SKL-005 | unit | Decision trace `evaluated_fields` has correct actual_value for nested field | `actual_value: 0.28` for `skills.fractions.stabilityScore` |
| SKL-006 | unit | Nested delta detection — `skills.fractions.stabilityScore_delta` computed | Prior `0.72`, next `0.55` → delta `-0.17`, direction `"declining"` |
| SKL-007 | unit | Nested delta detection — first signal, no prior → no delta | `skills.fractions.stabilityScore_delta` absent in first version |
| SKL-008 | unit | Nested delta detection — top-level flat deltas unchanged | Existing flat-field delta behavior identical |
| SKL-009 | unit | Max recursion depth — 6-level nesting produces no delta | Debug log emitted, no crash |
| SKL-010 | integration | Signal with `skill` + `assessment_type` → decision context propagation | `decision_context.skill === "fractions"`, `decision_context.assessment_type === "diagnostic"` |
| SKL-011 | contract | `GET /v1/decisions?skill=fractions` returns only fractions decisions | 2 decisions seeded (1 fractions, 1 reading); filter returns 1 |
| SKL-012 | contract | `GET /v1/decisions` without skill filter returns all | Both decisions returned |
| SKL-013 | contract | `GET /v1/signals?assessment_type=diagnostic` filters correctly | Only diagnostic signals returned |
| SKL-014 | integration | End-to-end: skill signal → nested state → dot-path policy → skill-scoped decision | Full pipeline produces decision with `decision_context.skill`, trace has nested `evaluated_fields` |

> **Test strategy:** SKL-001 through SKL-009 are unit tests. SKL-003 and SKL-008 are explicit regression tests. SKL-010 through SKL-014 are integration/contract tests with Fastify inject + seeded data.

---

## Implementation Notes

- **`getAtPath` should move to `src/shared/dot-path.ts`** — it's currently a private function in `tenant-field-mappings.ts`. Both the transform engine and the policy evaluator need it. Export from a shared module to avoid duplication.
- **`extractCanonicalSnapshot` with nested fields:** When a policy references `skills.fractions.stabilityScore`, the snapshot should include the nested structure `{ skills: { fractions: { stabilityScore: 0.28 } } }` — not a flat key `"skills.fractions.stabilityScore": 0.28`. Use `setAtPath` to build the nested snapshot.
- **Decision context propagation** is the same pattern proposed in `multi-school-architecture.md` for `school_id`. All three fields (`skill`, `assessment_type`, `school_id`) should be propagated in the same code block in `handler-core.ts`.

---

*Spec created: 2026-04-10 | Phase: v1.1 (promoted from v1.2 US-SKILL-001) | Depends on: state-delta-detection.md (complete), decision-engine.md (complete), multi-school-architecture.md (school_id propagation pattern). Recommended next: `/plan-impl docs/specs/skill-level-tracking.md`*
