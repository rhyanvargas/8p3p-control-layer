---
name: Learner Summary — URS Field Projection
overview: Replace the unbounded passthrough of LearnerState.state in current_state.fields with a closed URS field projection so the response stops leaking xAPI vocabulary (group, object, extensions, generated, bb_action_name, com_instructure_canvas) and source-system internals into educator-facing responses. Introduce LearnerStateProjection type, define the canonical URS field allowlist + delta companions, tighten OpenAPI additionalProperties, and update the spec to remove the v1.2-deferred "skill-level breakdown" out-of-scope note since the breakdown is no longer implicitly shipped. Pre-requisite: gate readiness plan landed (top-level masteryScore promotion already in place).
todos:
  - id: TASK-001
    content: Define canonical URS field allowlist + delta companion regex
    status: pending
  - id: TASK-002
    content: Add LearnerStateProjection type + projector module
    status: pending
  - id: TASK-003
    content: Apply projection in summary-handler-core current_state.fields
    status: pending
  - id: TASK-004
    content: Tighten OpenAPI LearnerSummaryResponse current_state schema
    status: pending
  - id: TASK-005
    content: Drop redundant recent_decisions_count from response and schema
    status: pending
  - id: TASK-006
    content: Update spec — remove v1.2 out-of-scope note for skills, document allowlist
    status: pending
  - id: TASK-007
    content: Add unit + contract tests for projection (no PII, no xAPI keys, allowlist exhaustive)
    status: pending
isProject: false
---

# Learner Summary — URS Field Projection

**Spec**: `docs/specs/learner-summary-api.md`
**Pre-requisite**: `.cursor/plans/learner-summary-gate-readiness.plan.md` (TASK-003 promotes top-level masteryScore — required before this plan ships)
**Sibling plan**: `.cursor/plans/learner-summary-api-hygiene.plan.md` (URL/cache/SDK readiness)

## Why this plan exists

The live `GET /v1/learners/{ref}/summary` response currently passes `LearnerState.state` through verbatim into `current_state.fields`. Because the state engine stores everything a signal carries (xAPI envelope: `group`, `object.extensions.com_instructure_canvas`, `extensions.bb_action_name`, `generated.scoreGiven_delta_delta_delta`, plus per-skill maps in `skills`), the response leaks **source-system vocabulary into the consumer-facing URS**.

Concrete evidence from a current Springs response:

```json
"current_state": {
  "fields": {
    "stabilityScore": 0.58, "timeSinceReinforcement": 100000,
    "generated": { "scoreGiven": 90, "scoreGiven_delta_delta_delta": 105, ... },
    "group": { "courseNumber": "MATH-301" },
    "object": { "extensions": { "com_instructure_canvas": { "submission_type": "online_quiz" } }, "assignable": {...} },
    "extensions": { "timeSinceLastActivity": 30000, "bb_action_name": "GradeSubmission", ... },
    "skill": "MATH-301",
    "skills": { "MATH-301": {...}, "HIST-202": {...} }
  }
}
```

This violates two project-level principles:

1. **API-first separation.** xAPI is *what came in*; URS is *what should go out*. Mixing them locks the consumer surface to source-system schema. Removing `bb_action_name` later becomes a breaking change once an SDK ships.
2. **Vercel React §3.6** ("Minimize Serialization at RSC Boundaries") — *"Only pass fields that the client actually uses."* The deck card uses 6 fields; the response sends 40+.

The OpenAPI schema `LearnerSummaryResponse.current_state.fields` declares `additionalProperties: true` (`docs/api/openapi.yaml:2196`), making this passthrough load-bearing. The spec § Out of Scope at `docs/specs/learner-summary-api.md:236` acknowledges "Skill-level breakdown in `current_state.fields`" is deferred to v1.2 (US-SKILL-001) — but the **production response is already shipping it implicitly**, so the v1.2 deferral is fictitious until projection is enforced.

## Scope rules

- **No URL or auth changes.** That belongs to the API hygiene plan.
- **Top-level `masteryScore` must already be present** (gate readiness TASK-003). This plan assumes the dominant-skill promotion is in place; without it, projection would strip skill data and the policy would have nothing to evaluate.
- **`field_trajectories` and `recent_decisions` shape are unchanged** by this plan (gate plan covers `educator_summary`).
- **`active_policy` and `signals_summary` are unchanged.**

## Spec literals quoted by this plan

### From spec § Out of Scope (will be updated by TASK-006)

```
| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Skill-level breakdown in `current_state.fields` | Nested skills require US-SKILL-001 | US-SKILL-001 implemented |
```

### From OpenAPI `LearnerSummaryResponse.current_state.fields`

```yaml
fields:
  type: object
  additionalProperties: true
  description: Latest LearnerState.state including delta companion fields
```

### From spec § Constraints

```
PII exclusion is mandatory — `state_snapshot` from decision trace must not appear in the response.
Follows DEF-DEC-008-PII (PII forbidden keys + canonical snapshot).
```

---

## Tasks

### TASK-001 — Define the canonical URS field allowlist

**File (new)**: `src/learners/urs-allowlist.ts`
**Spec update**: `docs/specs/learner-summary-api.md` — new § "URS field allowlist" subsection under Response Shape Details

Define the closed set of allowed top-level URS keys:

```ts
// src/learners/urs-allowlist.ts
/**
 * Canonical URS field allowlist for current_state.fields projection.
 * Source: docs/specs/state-engine.md § Canonical fields and
 *         docs/specs/state-delta-detection.md § Companion fields.
 */
export const URS_ALLOWED_BASE_KEYS = [
  // Core URS scalars (state-engine.md canonical fields)
  'masteryScore',
  'stabilityScore',
  'timeSinceReinforcement',
  'riskSignal',
  // skill is allowed because it identifies the dominant skill (string, not nested)
  'skill',
] as const;

export type URSAllowedBaseKey = (typeof URS_ALLOWED_BASE_KEYS)[number];

/**
 * Companion-field suffixes generated by state-delta-detection.md.
 * A field name is allowed iff it equals one of URS_ALLOWED_BASE_KEYS or
 * starts with one of those keys followed by one of these suffixes.
 */
export const URS_COMPANION_SUFFIXES = [
  '_delta',
  '_direction',
  '_delta_delta',
  '_delta_direction',
  '_delta_delta_delta',
  '_delta_delta_direction',
  // higher-order deltas are intentionally omitted — they are diagnostic noise,
  // not URS-grade. Bound the surface at 3rd-order deltas.
] as const;

export function isAllowedURSKey(key: string): boolean {
  if ((URS_ALLOWED_BASE_KEYS as readonly string[]).includes(key)) return true;
  for (const base of URS_ALLOWED_BASE_KEYS) {
    for (const suffix of URS_COMPANION_SUFFIXES) {
      if (key === `${base}${suffix}`) return true;
    }
  }
  return false;
}
```

**Decision rules:**
- `skill` (string) is allowed. `skills` (nested object) is **not** — keeps the v1.2 deferral honest.
- Companion fields are generated suffixes only. Arbitrary `_delta_delta_delta_delta` chains are dropped.
- xAPI keys (`generated`, `group`, `object`, `extensions`) are not on the list and have no path to inclusion without an explicit allowlist entry.

**Acceptance:** unit tests in TASK-007 verify each forbidden key returns `false` and each allowed key (with all suffix combinations) returns `true`.

---

### TASK-002 — Add `LearnerStateProjection` type + projector

**File (new)**: `src/learners/state-projection.ts`
**File**: `src/learners/summary-handler-core.ts` — replace `currentState.state` passthrough

```ts
// src/learners/state-projection.ts
import type { LearnerState } from '../shared/types.js';
import { isAllowedURSKey } from './urs-allowlist.js';

export interface LearnerStateProjection {
  [key: string]: number | string | null;
}

const FLOAT_PRECISION = 4;
function roundNumeric(value: unknown): unknown {
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value)) return value;
  if (Number.isInteger(value)) return value;
  return Math.round(value * 10 ** FLOAT_PRECISION) / 10 ** FLOAT_PRECISION;
}

export function projectLearnerState(state: LearnerState['state']): LearnerStateProjection {
  const out: LearnerStateProjection = {};
  for (const [k, v] of Object.entries(state)) {
    if (!isAllowedURSKey(k)) continue;
    if (typeof v === 'number' || typeof v === 'string' || v === null) {
      out[k] = typeof v === 'number' ? (roundNumeric(v) as number) : v;
    }
    // Reject non-scalar values (objects, arrays) — allowlist is scalars-only
  }
  return out;
}
```

The projector is **scalar-only** by design: any allowed key whose value is non-scalar (which would only happen via state engine bugs) is dropped, not passed through. This makes the response shape statically predictable.

The float rounding from gate-readiness TASK-004 moves into this module; remove the duplicate helper from `summary-handler-core.ts` and call `projectLearnerState` instead.

**Acceptance:** projection tests assert input → output for representative state objects (Springs Jordan-shape, empty state, state with only canonical fields, state with PII-shaped extra keys).

---

### TASK-003 — Apply projection in summary-handler-core

**File**: `src/learners/summary-handler-core.ts:351-356`

Replace:
```ts
current_state: {
  state_id: currentState.state_id,
  state_version: currentState.state_version,
  updated_at: currentState.updated_at,
  fields: currentState.state,    // unbounded passthrough
},
```

With:
```ts
import { projectLearnerState } from './state-projection.js';
// ...
current_state: {
  state_id: currentState.state_id,
  state_version: currentState.state_version,
  updated_at: currentState.updated_at,
  fields: projectLearnerState(currentState.state),
},
```

Also revisit `resolveTrajectoryFields` (`summary-handler-core.ts:243-254`) — it currently iterates `currentState.state` to find numeric fields. After projection, that's still correct (it operates on the same source data) but ensure the `fields.endsWith('_delta')` filter still works for the new allowlist (`stabilityScore_delta` etc. — confirmed yes, suffix unchanged).

**Acceptance:** the Springs Jordan response no longer contains `generated`, `group`, `object`, `extensions`, `skills`, or any vendor-specific keys. It does contain `masteryScore`, `stabilityScore`, `timeSinceReinforcement`, `skill`, plus their `_delta` and `_direction` companions.

---

### TASK-004 — Tighten OpenAPI schema

**File**: `docs/api/openapi.yaml:2183-2197` (`LearnerSummaryResponse.current_state`)

Replace the unbounded passthrough:
```yaml
fields:
  type: object
  additionalProperties: true
  description: Latest LearnerState.state including delta companion fields
```

With an explicit projection schema:
```yaml
fields:
  $ref: '#/components/schemas/LearnerStateProjection'
```

Add the new schema (place near `LearnerSummaryResponse`):
```yaml
LearnerStateProjection:
  type: object
  additionalProperties: false
  description: |
    Closed set of canonical URS fields and their delta/direction companions.
    Source-system vocabulary (xAPI group/object/extensions, vendor extensions)
    and skill-level breakdown are stripped — see docs/specs/learner-summary-api.md
    § URS field allowlist.
  properties:
    masteryScore:    { type: ['number', 'null'] }
    stabilityScore:  { type: ['number', 'null'] }
    timeSinceReinforcement: { type: ['number', 'null'] }
    riskSignal:      { type: ['number', 'null'] }
    skill:           { type: ['string', 'null'] }
    # Delta and direction companions for each numeric base key.
    # _direction values are constrained to a closed enum.
    masteryScore_delta:                { type: ['number', 'null'] }
    masteryScore_direction:            { type: ['string', 'null'], enum: [improving, stable, declining, null] }
    masteryScore_delta_delta:          { type: ['number', 'null'] }
    masteryScore_delta_direction:      { type: ['string', 'null'], enum: [improving, stable, declining, null] }
    masteryScore_delta_delta_delta:    { type: ['number', 'null'] }
    masteryScore_delta_delta_direction:{ type: ['string', 'null'], enum: [improving, stable, declining, null] }
    # Repeat for stabilityScore, timeSinceReinforcement, riskSignal
    # (see TASK-001 allowlist; this block is mechanical)
```

Generate the full property list mechanically from the allowlist × suffixes (12 numeric base entries + 3 string base entries, ~30 properties total). Keep it readable but exhaustive.

Run `npm run validate:api`. The schema becomes a hard contract.

**Acceptance:** Redocly lint passes. Any future field added to URS goes through both the allowlist AND the OpenAPI schema — drift is impossible.

---

### TASK-005 — Drop `recent_decisions_count`

**File**: `src/learners/summary-handler-core.ts:47-62, 357-358`
**File**: `docs/api/openapi.yaml` (`LearnerSummaryResponse.required` + `properties`)
**File**: `docs/specs/learner-summary-api.md` § Response (200) example
**Tests**: any contract test asserting `recent_decisions_count`

The field duplicates `recent_decisions.length` and adds payload bytes for no signal. Remove from:
1. `LearnerSummaryResponse` interface
2. Response assembly
3. OpenAPI `required` array and properties
4. Spec example block
5. Spec § Functional requirement bullet (if it appears — it doesn't, only the example references it)
6. Contract tests (SUM-002 may assert array length; keep that, just don't assert `recent_decisions_count`)

**Acceptance:** response payload is smaller and matches updated schema.

---

### TASK-006 — Update spec

**File**: `docs/specs/learner-summary-api.md`

1. Remove the row from § Out of Scope:
   ```
   | Skill-level breakdown in `current_state.fields` | Nested skills require US-SKILL-001 | US-SKILL-001 implemented |
   ```
   (It's no longer "out of scope" — it's *actively excluded by projection*. The spec already says US-SKILL-001 will introduce dot-path policy evaluation; that's a separate concern.)
2. Add new subsection under § Response Shape Details:
   ```markdown
   ### URS field allowlist (current_state.fields)

   `current_state.fields` is a **projection** of `LearnerState.state`, not a passthrough. Only the canonical URS keys and their delta/direction companions appear:

   - **Base keys (scalars):** `masteryScore`, `stabilityScore`, `timeSinceReinforcement`, `riskSignal`, `skill`
   - **Companion suffixes:** `_delta`, `_direction`, `_delta_delta`, `_delta_direction`, `_delta_delta_delta`, `_delta_delta_direction` (applied to numeric base keys only)

   Source-system vocabulary (xAPI envelope keys `group`, `object`, `extensions`, `generated`; vendor extensions like `bb_action_name`, `com_instructure_canvas`) is **stripped** even when present in stored state. Per-skill breakdown (`skills.{skill}.{score}`) is also stripped — skill-level fields are exposed via the dominant-skill promotion (state-engine.md) and via US-SKILL-001 dot-path access in v1.2.

   Numeric scalars are rounded to 4 decimal places at the projection boundary.

   Source list of allowed keys: `src/learners/urs-allowlist.ts`. OpenAPI schema: `LearnerStateProjection`.
   ```
3. Update § Endpoint — Response (200) example to remove fields the projector strips (no `generated`, `group`, etc.).
4. Update § Constraints to explicitly mention scalars-only projection.

**Acceptance:** spec ↔ implementation ↔ OpenAPI all describe the same projection.

---

### TASK-007 — Tests

**Files (new)**:
- `tests/unit/learners/urs-allowlist.test.ts`
- `tests/unit/learners/state-projection.test.ts`

**Files (impacted)**:
- `tests/contracts/learner-summary-api.test.ts` (SUM-005 — PII test should now also assert no xAPI keys)

Test cases:

1. **Allowlist exhaustiveness:** every base key with each suffix returns `true`; common forbidden keys return `false` (`generated`, `group`, `object`, `extensions`, `skills`, `bb_action_name`, `com_instructure_canvas`, `email`, `student_name`, `address`).
2. **Projection scalars only:** input with `skills: { ... }` → output omits `skills`. Input with `extensions: { bb_action_name: "X" }` → output omits `extensions`.
3. **Projection rounding:** input `masteryScore: 0.21999999999999997` → output `masteryScore: 0.22`. Input `timeSinceReinforcement: 100000` → output `100000` (integer unchanged).
4. **Projection preserves nulls:** input `masteryScore_direction: null` → output `masteryScore_direction: null` (null is allowed for direction fields with single-version state).
5. **SUM-005 expansion:** existing PII-forbidden-keys assertion remains; ADD assertions that none of `["generated", "group", "object", "extensions", "skills", "bb_action_name", "com_instructure_canvas"]` appear as top-level keys in `current_state.fields`.
6. **SUM-001:** assert `current_state.fields` keys are a subset of the URS allowlist (use `isAllowedURSKey` from the module).

**Acceptance:** all new tests pass; SUM-001/005 still pass with tightened assertions.

---

## Verification checklist

- [ ] `npm run validate:api` passes (Redocly lint clean)
- [ ] `npm run validate:contracts` passes
- [ ] `npm test` passes (unit + contract + integration)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Live curl response for Jordan contains only allowlist keys in `current_state.fields`
- [ ] OpenAPI `LearnerStateProjection` schema matches `urs-allowlist.ts`
- [ ] Spec § URS field allowlist subsection added; § Out of Scope row for skill-level breakdown removed
- [ ] `recent_decisions_count` removed from interface, schema, spec example, and tests
- [ ] All numeric scalars in the response are rounded to ≤ 4 decimal places

## Notes

- **Backwards compatibility:** Removing `recent_decisions_count` and stripping `current_state.fields` keys is a *narrowing* of the response. No external SDK consumes this yet, so it's safe pre-1.0. After SDK ships, this would be a breaking change requiring a deprecation cycle.
- **Why the allowlist lives in code, not config:** keeping it as a TS constant means OpenAPI schema generation can derive from the same source via codegen later. A JSON config file would diverge.
- **`riskSignal` is in the allowlist but not yet stored** by Springs signals — leaving it allowed-but-typically-absent is fine; OpenAPI schema marks it nullable.
- **v1.2 (US-SKILL-001) follow-up:** when nested skill access lands, this plan's projection extends to permit dotted paths (`skills.MATH-301.masteryScore`) under an explicit `?include=skills` query parameter. Until then, the dominant-skill promotion in state-engine is the only path to skill-specific scores.
