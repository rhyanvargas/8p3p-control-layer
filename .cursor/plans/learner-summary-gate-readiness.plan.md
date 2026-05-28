---
name: Learner Summary — Wave 2 Gate Readiness
overview: Make GET /v1/learners/:ref/summary demo-grade for the URS Wave 2 gate screenshot. Surface the existing Decision.trace.educator_summary, expose a top-level masteryScore on stored state so Springs rule-advance can fire, round float scalars at the projection boundary, add a fallback rule so borderline learners do not return decision_type "?", and re-seed end-to-end so Jordan ends in "advance" with the expected trajectory. No new endpoints, no new tables. URL/collection structure, ETag/cache, and current_state.fields projection are out of scope (see learner-summary-urs-projection and learner-summary-api-hygiene plans).
todos:
  - id: TASK-001
    content: Add educator_summary to RecentDecisionItem (interface, projection, OpenAPI, contract test)
    status: completed
  - id: TASK-002
    content: Decide and document "dominant skill" rule for top-level masteryScore promotion
    status: completed
  - id: TASK-003
    content: Promote dominant-skill masteryScore to top-level state in state engine
    status: completed
  - id: TASK-004
    content: Round numeric scalars at the summary projection boundary (4 decimals)
    status: completed
  - id: TASK-005
    content: Add Springs policy fallback rule so no signal returns decision_type "?"
    status: completed
  - id: TASK-006
    content: Re-seed Springs demo with ADMIN_API_KEY, verify Jordan ends in advance
    status: completed
  - id: TASK-007
    content: Record Wave 2 gate screenshot and update urs_product_readiness verification checklist
    status: completed
isProject: false
---

# Learner Summary — Wave 2 Gate Readiness

**Spec**: `docs/specs/learner-summary-api.md`
**Master plan**: `.cursor/plans/urs_product_readiness_55b0b52e.plan.md` (Wave 2 gate verification)
**Sibling plans**:
- `.cursor/plans/learner-summary-urs-projection.plan.md` (URS field allowlist, follow-up)
- `.cursor/plans/learner-summary-api-hygiene.plan.md` (SDK-readiness hardening)

## Why this plan exists

Recording the URS gate screenshot today against the live `GET /v1/learners/stu-30456/summary?org_id=springs` response would lock the deck demo to a misleading state:

1. All 5 `recent_decisions` show `decision_type: "reinforce"` with the engineer-facing rationale string `"Rule rule-reinforce fired: stabilityScore (0.58) lt 0.65 ..."`. The deck row "Risk / next step" needs the existing **`Decision.trace.educator_summary`** ("Ready to move on", "Needs more practice", etc., from `src/decision/educator-summaries.ts`) — which the summary projection currently drops.
2. The seed narrative for Jordan is "MATH-301 mastery 0.45 → 0.68 → 0.90 → advance". The response has **no top-level `masteryScore`** because Springs signals carry per-skill values (`skills.MATH-301.masteryScore`), but the policy and the trajectory defaulter both read top-level. Result: `rule-advance` (`stabilityScore >= 0.8 AND masteryScore >= 0.8`) can never match, and `field_trajectories` does not include mastery at all.
3. Floats deserialize as `0.21999999999999997` and `0.19800000000000006` — visible noise in the screenshot.
4. The seed reports `Signals: 11 sent | 6 matched expected outcomes`. Sam Torres' canvas-ela signal returns `?` because no Springs rule matches borderline cases, undermining the demo even when the rest is fixed.

This plan lands the smallest set of changes that makes the gate screenshot tell the truth: **mastery improves, decision becomes `advance`, educator-facing wording reads naturally, no `?` decisions in the demo set.**

## Scope rules (do not violate)

- **No changes to URL structure.** Stays at `/v1/learners/{learner_reference}/summary`.
- **No changes to `current_state.fields` projection rules.** Whatever the state engine stores is still passed through. (Fixed in the URS projection plan.)
- **No new endpoints, no new tables, no new write paths.** Only repo reads, projection logic, one stored field promotion, and one policy rule.
- **All changes must be reflected in OpenAPI and the spec.** Per workspace rule, the spec is the contract.

## Spec literals quoted by this plan

### From `docs/api/openapi.yaml` — `DecisionTrace`

```
required: [..., educator_summary]
educator_summary:
  type: string
  minLength: 1
```

> Comment at `openapi.yaml:2243-2244` (Decision schema): *"teacher-facing wording is `trace.educator_summary`."*

### From `src/decision/educator-summaries.ts`

```ts
export const DECISION_TYPE_TO_EDUCATOR_SUMMARY: Record<DecisionType, string> = {
  advance: 'Ready to move on',
  reinforce: 'Needs more practice',
  intervene: 'Needs stronger support now',
  pause: 'Possible learning decay detected; watch closely',
};
```

### From `src/decision/policies/springs/learner.json`

```json
{
  "rule_id": "rule-advance",
  "condition": { "all": [
    { "field": "stabilityScore", "operator": "gte", "value": 0.8 },
    { "field": "masteryScore",   "operator": "gte", "value": 0.8 }
  ]},
  "decision_type": "advance"
}
```

### From `examples/springs/seed-springs-demo.mjs:610-611`

```
'  📊 Trajectory: intervention worked — MATH-301 masteryScore 0.45 → 0.68 → 0.90 over 3 signals.'
```

This is the deck narration the gate screenshot must visually support.

---

## Tasks

### TASK-001 — Surface `educator_summary` in `recent_decisions`

**File**: `src/learners/summary-handler-core.ts:38-46, 317-325`
**File**: `docs/api/openapi.yaml:2096-2122` (`RecentDecisionItem`)
**File**: `docs/specs/learner-summary-api.md:131-138` (recent_decisions field-source table)
**Tests**: `tests/contracts/learner-summary-api.test.ts` (SUM-001)

1. Extend `RecentDecisionItem` interface:
   ```ts
   export interface RecentDecisionItem {
     decision_id: string;
     decision_type: string;
     decided_at: string;
     matched_rule_id: string | null;
     educator_summary: string;   // NEW
     rationale: string;
     policy_version: string;
   }
   ```
2. Update the projection in `handleLearnerSummaryCore`:
   ```ts
   const projectedDecisions: RecentDecisionItem[] = decisions.map((d) => ({
     decision_id: d.decision_id,
     decision_type: d.decision_type,
     decided_at: d.decided_at,
     matched_rule_id: d.trace.matched_rule_id,
     educator_summary: d.trace.educator_summary,
     rationale: d.trace.rationale,
     policy_version: d.trace.policy_version,
   }));
   ```
3. Add `educator_summary: type: string, minLength: 1` to the OpenAPI `RecentDecisionItem` schema and to the `required` array. Keep ordering: `decision_id, decision_type, decided_at, matched_rule_id, educator_summary, rationale, policy_version`.
4. Update the spec § Response Shape Details `recent_decisions` field-source table to include the new row sourced from `Decision.trace.educator_summary`.
5. SUM-001 assertion: every item in `recent_decisions` has a non-empty `educator_summary` matching `DECISION_TYPE_TO_EDUCATOR_SUMMARY[decision_type]`.
6. Run `npm run validate:api` and `npm run validate:contracts`.

**Acceptance:** every `recent_decisions[i]` in the response includes `"educator_summary": "Ready to move on" | "Needs more practice" | ...` and OpenAPI lints clean.

---

### TASK-002 — Define and document the "dominant skill" rule

**File (new)**: `docs/specs/state-engine.md` — add subsection "Top-level skill score promotion (v1.1)"
**File**: `.cursor/plans/learner-summary-gate-readiness.plan.md` (this file) — record decision

The state engine already stores per-skill scores at `state.skills.{skill}.{masteryScore,stabilityScore}` when signals carry them. This task defines **which skill's scores are mirrored to the top level** so existing flat-shape policies work. **Decision rule for v1.1:**

> The "dominant skill" is the value of `state.skill` (the most-recent signal's `skill` field). When `state.skill` is set and `state.skills[state.skill]` exists, mirror its `masteryScore` and `stabilityScore` to top-level `state.masteryScore` / `state.stabilityScore`. Pre-existing top-level values are overwritten on every state update. When `state.skill` is unset, leave top-level scores as whatever the signal carries (status quo).

**Why this rule:** It's deterministic, requires no per-org config, requires no policy DSL changes, and matches the seed's narration (the policy fires on the most-recently active skill). v1.2 (US-SKILL-001) will replace this with first-class dot-path policy evaluation.

**Acceptance:** Decision recorded in spec; no code changes in this task.

---

### TASK-003 — Promote dominant-skill scores to top-level in the state engine

**File**: `src/state/engine.ts` (apply step that builds the new state object)
**Tests (new)**: `tests/unit/state/skill-promotion.test.ts`
**Tests (impacted)**: any state engine test that asserts on top-level `masteryScore`/`stabilityScore`

1. After the existing canonical merge in the apply step, before `_delta`/`_direction` companion-field computation:
   ```ts
   const dominantSkill = typeof newState.skill === 'string' ? newState.skill : null;
   if (dominantSkill && newState.skills?.[dominantSkill]) {
     const skillScores = newState.skills[dominantSkill];
     if (typeof skillScores.masteryScore === 'number') {
       newState.masteryScore = skillScores.masteryScore;
     }
     if (typeof skillScores.stabilityScore === 'number') {
       newState.stabilityScore = skillScores.stabilityScore;
     }
   }
   ```
   Do this **before** delta/direction computation so the deltas are computed against the promoted top-level values.
2. New unit tests:
   - Given a signal with `skill: "MATH-301"` and `skills: { "MATH-301": { masteryScore: 0.9 } }`, top-level `state.masteryScore === 0.9`.
   - Given two consecutive signals with the same skill and improving mastery, `state.masteryScore_direction === "improving"` and `_delta` is computed correctly.
   - Given a signal with no `skill` field, top-level scores follow the prior path (no promotion).
   - Given a signal with `skill: "X"` but no `skills.X` entry, no promotion occurs.
3. Run full `npm test` (state engine tests, springs-pilot integration test, learner summary contract tests).

**Acceptance:** After re-seeding Jordan (TASK-006), `current_state.fields.masteryScore === 0.9` at the top level, `field_trajectories.masteryScore` exists with `first_value: 0.45`, `latest_value: 0.9`, `overall_direction: "improving"`, and `recent_decisions[0].decision_type === "advance"`.

---

### TASK-004 — Round numeric scalars at the projection boundary

**File**: `src/learners/summary-handler-core.ts` — new helper, applied to `current_state.fields` and `field_trajectories.{field}.{first_value,latest_value}`

1. Add helper:
   ```ts
   const FLOAT_PRECISION = 4;
   function roundNumeric(value: unknown): unknown {
     if (typeof value !== 'number') return value;
     if (!Number.isFinite(value)) return value;
     if (Number.isInteger(value)) return value;
     return Math.round(value * 10 ** FLOAT_PRECISION) / 10 ** FLOAT_PRECISION;
   }
   function roundFieldsShallow(fields: Record<string, unknown>): Record<string, unknown> {
     const out: Record<string, unknown> = {};
     for (const [k, v] of Object.entries(fields)) out[k] = roundNumeric(v);
     return out;
   }
   ```
   **Scope**: shallow — only top-level numeric scalars. Do **not** recurse into `skills`, `generated`, `extensions` etc. (those are removed entirely by the URS projection plan; rounding nested xAPI noise is wasted work.)
2. Apply at response assembly:
   ```ts
   current_state: {
     state_id: currentState.state_id,
     state_version: currentState.state_version,
     updated_at: currentState.updated_at,
     fields: roundFieldsShallow(currentState.state),
   },
   field_trajectories: Object.fromEntries(
     Object.entries(fieldTrajectories).map(([k, v]) => [k, {
       ...v,
       first_value: roundNumeric(v.first_value) as number,
       latest_value: roundNumeric(v.latest_value) as number,
     }])
   ),
   ```
3. Unit test: input `0.21999999999999997` → output `0.22`; integer `100000` → `100000` (unchanged); non-finite → unchanged.

**Acceptance:** No `0.21999999999999997`-style noise in the response. Integers and non-numeric values are passed through untouched.

---

### TASK-005 — Add Springs policy fallback rule

**File**: `src/decision/policies/springs/learner.json`
**Tests**: `tests/integration/springs-pilot.test.ts` (Sam Torres scenario), `tests/decision-engine.test.ts`

The seed expects `sam-canvas-ela-001` to return `reinforce`, but the existing four rules don't match a borderline mid-stability signal. Append a low-priority catch-all `reinforce` rule **after** all other rules (priority-ordered, first-match wins):

```json
{
  "rule_id": "rule-reinforce-fallback",
  "condition": {
    "all": [
      { "field": "stabilityScore", "operator": "gte", "value": 0 }
    ]
  },
  "decision_type": "reinforce"
}
```

**Why this is safe:** v1.1 Springs policy already documents `priority-ordered; first match wins`. The existing four specific rules continue to fire for their cases; only signals that match none of them now resolve to `reinforce` instead of producing an empty decision. The `educator_summary` for `reinforce` is `"Needs more practice"`, which is the runbook-correct teacher-facing wording for this fallback.

**Update OpenAPI** if the `description` of `springs:learner` policy is referenced anywhere (it isn't a generated schema, just used in the response — leave the policy file's `description` text untouched or bump to "5 decision types" if changed; the wording matters in `active_policy.description`).

**Acceptance:** Re-seeding produces decisions for **every** signal that isn't rejected by the PII guard. `Signals: 11 sent | N matched expected outcomes` — N improves from 6/11. No `?` decisions in the demo output.

---

### TASK-006 — Re-seed and verify

1. Ensure `.env.local` has both `API_KEY` and `ADMIN_API_KEY` set.
2. Restart `npm run dev`.
3. `npm run seed:springs-demo`.
4. Verify Phase 1 prints `Phase 1: Registered N field mappings` (not the "Skipping" line).
5. `curl -s "http://localhost:3000/v1/learners/stu-30456/summary?org_id=springs" -H "x-api-key: $API_KEY" | jq .` and check:
   - `current_state.fields.masteryScore` is `0.9` (or 0.92 — TASK-003 acceptance).
   - `current_state.fields.stabilityScore` is `0.81`.
   - `field_trajectories.masteryScore` exists with `first_value: 0.45`, `latest_value: 0.9`, `overall_direction: "improving"`, `version_count: 3`.
   - `recent_decisions[0].decision_type` is `"advance"`.
   - `recent_decisions[0].educator_summary` is `"Ready to move on"`.
   - All numeric scalars are at most 4 decimal places.
6. Sanity-check Maya (`stu-10042`) and Alex (`stu-20891`) responses too — they should still produce sensible decisions for the demo.

**Acceptance:** the screenshot-able JSON exists.

---

### TASK-007 — Record gate screenshot

1. Compose terminal (curl + jq output of TASK-006 verification) next to the deck slide "Unified Student Learning Record".
2. Save to `internal-docs/reports/2026-MM-DD-wave2-gate-urs-summary-screenshot.png`.
3. Check off the verification item in `.cursor/plans/urs_product_readiness_55b0b52e.plan.md` § "Deck demo recorded".
4. Commit the screenshot + any plan-status updates.

**Acceptance:** Master URS plan verification checklist row is checked; screenshot artifact is committed.

---

## Verification checklist

- [ ] `npm run validate:api` passes (OpenAPI lint clean after `educator_summary` addition)
- [ ] `npm run validate:contracts` passes
- [ ] `npm test` passes (state engine, springs-pilot, learner summary contract + unit, decision engine)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Curl verification (TASK-006) shows `decision_type: "advance"`, `educator_summary: "Ready to move on"`, top-level `masteryScore: 0.9`, no float noise
- [ ] No signal in `npm run seed:springs-demo` output produces `?` decision
- [ ] Wave 2 gate screenshot committed and master plan row checked
- [ ] Spec § Response Shape Details updated to include `educator_summary` field-source row
- [ ] Spec / state-engine doc records the dominant-skill promotion rule

## Notes

- **Backwards compatibility:** Adding a required field (`educator_summary`) to a response is technically a tightening of the contract. Existing test fixtures in `tests/contracts/learner-summary-api.test.ts` will need to assert presence; no external consumer is currently shipped (the SDK does not yet exist), so this is safe.
- **Seed expected-outcomes drift:** if TASK-005's fallback changes the count of "matched expected outcomes" from 6/11 to (say) 8/11, update the seed annotations in `examples/springs/seed-springs-demo.mjs` for any persona whose narration no longer matches. The narration is what gets read in the deck, so accuracy matters.
- **Policy DSL evolution:** the dominant-skill promotion is an **interim** measure. v1.2 (US-SKILL-001) should replace it with policy-DSL dot-path evaluation (`{ "field": "skills.{currentSkill}.masteryScore" }`). Track that in the URS projection plan, not here.
