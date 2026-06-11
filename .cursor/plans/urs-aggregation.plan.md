---
name: URS Aggregation - Skill to Subject to Overall Mastery
overview: Implement three-tier mastery aggregation (skill, subject, overall) plus learning gaps and a gifted-interest flag, exposed via current_state.mastery_breakdown on the learner summary endpoint, without regressing existing flat-field policy evaluation.
todos:
  - id: TASK-001
    content: Add pinned aggregation constants module
    status: completed
  - id: TASK-002
    content: Add subject config loader and skill-to-subject resolver
    status: completed
  - id: TASK-003
    content: Add Springs subjects.json seed config
    status: completed
  - id: TASK-004
    content: Add LearnerAggregation types
    status: completed
  - id: TASK-005
    content: Implement computeLearnerAggregation and wire into computeNewState
    status: completed
  - id: TASK-006
    content: Add decision-type summary repo method for gifted flag
    status: completed
  - id: TASK-007
    content: Project mastery_breakdown in summary handler core and lambda parity
    status: completed
  - id: TASK-008
    content: Compute learning_gaps and gifted_interest at summary assembly
    status: completed
  - id: TASK-009
    content: Add OpenAPI mastery_breakdown schema
    status: completed
  - id: TASK-010
    content: Update learner-summary-api spec to reference mastery_breakdown
    status: completed
  - id: TASK-011
    content: Re-seed Springs demo with subject metadata
    status: completed
  - id: TASK-012
    content: Unit tests AGG-001 through AGG-013, AGG-017, AGG-018
    status: completed
  - id: TASK-013
    content: Integration and contract tests AGG-014 through AGG-016
    status: completed
isProject: false
---

# URS Aggregation - Skill to Subject to Overall Mastery

**Spec**: `docs/specs/urs-aggregation.md`
**Sibling spec (sequenced after this plan)**: `docs/specs/tenant-config.md` (makes the constants in TASK-001 per-org overridable; see `.cursor/plans/tenant-config.plan.md`)
**Pre-requisite**: dominant-skill promotion already in place (`src/state/engine.ts` `promoteDominantSkillScores`); URS projection already shipped (`src/learners/state-projection.ts`).

## Why this plan exists

The CEO product-value direction requires a 60-second student profile: per-subject quick-hitters, an overall score, learning gaps, and a person-of-interest (gifted) flag. The system stores per-skill metrics (`state.skills.{id}`) but exposes educators only a last-skill-wins top-level mirror. This plan adds the skill to subject to overall aggregation tier and surfaces it via `current_state.mastery_breakdown` on the existing summary endpoint, without changing decision behavior.

## Scope rules

- **No policy behavior change.** `promoteDominantSkillScores` stays untouched; top-level `masteryScore`/`stabilityScore` remain the dominant-skill mirror for flat-rule back-compat. AGG-016 is the regression gate.
- **No new routes.** `mastery_breakdown` is an additive field on `GET /v1/learners/:learner_reference/summary`.
- **`current_state.fields` stays scalars-only.** Aggregation lives in `mastery_breakdown`, never mixed into flat `fields`.
- **Constants are hardcoded code defaults in this plan.** Per-org overrides are deferred to `tenant-config.plan.md` (sequenced after).
- **File-based subject config only.** No DynamoDB/admin upload for subjects in this plan.

## Spec Literals

> Verbatim copies of normative blocks from `docs/specs/urs-aggregation.md`. TASK details MUST quote from this section rather than paraphrase.

### From spec § Concrete Values Checklist - Aggregation constants

```
LEARNING_GAP_THRESHOLD = 0.10
LEARNING_GAP_ABSOLUTE_THRESHOLD = 0.60
LEARNING_GAPS_MAX = 10
GIFTED_MASTERY_THRESHOLD = 0.95
MIN_SKILLS_FOR_GIFTED = 2
MIN_ADVANCE_DECISIONS = 1
GIFTED_INTEREST_LABEL = "Person of interest"
FLOAT_PRECISION = 4
DEFAULT_SUBJECT = "General"
```

### From spec § Subject Resolution (priority order, first match wins)

```
1. state.skills[skillId].subject (string, non-blank)
2. Org subject config explicit_map[skillId]
3. Org subject config prefix_rules[] - first rule where skillId.startsWith(rule.prefix)
4. Org subject config default_subject
```

### From spec § Aggregation Formulas

```
S = skills in state.skills where masteryScore is a finite number
subjects[subj].masteryScore  = mean({ skills[id].masteryScore | id in S_subj })
subjects[subj].stabilityScore = mean({ skills[id].stabilityScore | id in S_subj, finite }) (omit if none)
subjects[subj].strongest_skill = max masteryScore in S_subj (ties: lexicographic ascending)
subjects[subj].weakest_skill   = min masteryScore in S_subj (ties: lexicographic ascending)
overall.masteryScore  = mean({ subjects[subj].masteryScore | subj in J })   // equal weight per subject
overall.stabilityScore = mean({ subjects[subj].stabilityScore | subj in J, present })
overall.subject_count = |J|
overall.skill_count   = |S|
```

### From spec § Learning Gaps (both conditions required)

```
1. skill.masteryScore < subjects[subject].masteryScore - LEARNING_GAP_THRESHOLD
2. skill.masteryScore < LEARNING_GAP_ABSOLUTE_THRESHOLD
gap = subject_masteryScore - masteryScore
sort: descending by gap; truncate at LEARNING_GAPS_MAX
```

### From spec § Gifted-Interest Flag (ALL must pass)

```
G1: at least MIN_SKILLS_FOR_GIFTED skills in S            (2)
G2: every skill in S has masteryScore >= GIFTED_MASTERY_THRESHOLD  (0.95)
G3: at least MIN_ADVANCE_DECISIONS decisions exist         (1)
G4: every stored decision has decision_type === 'advance'
G5: at least one decision exists (with G3)
G6: every skill in S has evidenceCount >= GIFTED_MIN_EVIDENCE_COUNT  (3)
flagged response: { "flagged": true, "label": "Person of interest" }
not flagged:      { "flagged": false, "label": null }
```

> CEO sign-off 2026-06-05: gifted flag must require sustained evidence (G6), not just high scores. All thresholds configurable.

### From spec § Computation timing

```
deepMerge(signal payloads)
  -> incrementSkillEvidenceCounts()  // NEW - bumps skills.{id}.evidenceCount
  -> promoteDominantSkillScores()    // unchanged - policy back-compat
  -> computeLearnerAggregation()     // NEW - writes state.aggregation
  -> return state
```

### From spec § Springs seed file (src/decision/policies/springs/subjects.json)

```json
{
  "default_subject": "General",
  "explicit_map": {
    "MATH-301": "Math",
    "HIST-202": "History",
    "ELA-201": "English",
    "Reading": "English",
    "SCI-101": "Science",
    "Annual Compliance 2026": "Compliance"
  },
  "prefix_rules": [
    { "prefix": "MATH", "subject": "Math" },
    { "prefix": "ELA", "subject": "English" },
    { "prefix": "SCI", "subject": "Science" },
    { "prefix": "HIST", "subject": "History" }
  ]
}
```

## Prerequisites

- [x] PREREQ-001 CEO sign-off RECEIVED 2026-06-05 (Untitled-2 thread). Locked: overall = equal-weight mean of subject scores; gap = >0.10 below subject mean AND <0.60; gifted = every skill >=0.95 + advance-only history + sufficient evidence (new G6: evidenceCount >= 3). All thresholds configurable via tenant-config. No further gate before TASK-005.

## Tasks

> **Status tracking**: Task status lives only in the YAML frontmatter `todos` list.

### TASK-001: Add pinned aggregation constants module
- **Files**: `src/state/aggregation-constants.ts` (new)
- **Action**: Create
- **Details**: Export every constant from Spec Literals § Concrete Values verbatim: `LEARNING_GAP_THRESHOLD = 0.10`, `LEARNING_GAP_ABSOLUTE_THRESHOLD = 0.60`, `LEARNING_GAPS_MAX = 10`, `GIFTED_MASTERY_THRESHOLD = 0.95`, `MIN_SKILLS_FOR_GIFTED = 2`, `MIN_ADVANCE_DECISIONS = 1`, `GIFTED_MIN_EVIDENCE_COUNT = 3`, `GIFTED_INTEREST_LABEL = "Person of interest"`, `DEFAULT_SUBJECT = "General"`. Reuse `FLOAT_PRECISION`/`roundNumeric` from `src/learners/state-projection.ts` (do not redefine). These are the canonical defaults that `tenant-config.plan.md` will later wrap as `CODE_DEFAULTS.aggregation`.
- **Depends on**: none
- **Verification**: Constants importable; values match Spec Literals exactly.

### TASK-002: Add subject config loader and skill-to-subject resolver
- **Files**: `src/state/subject-config.ts` (new); reference type wiring in `src/shared/types.ts`
- **Action**: Create
- **Details**: Define `SubjectConfig` type (`default_subject?: string`, `explicit_map?: Record<string,string>`, `prefix_rules?: { prefix: string; subject: string }[]`). Implement `loadSubjectConfigForOrg(orgId)` mirroring `loadRoutingConfigForOrg` in `src/decision/policy-loader.ts` (per-org Map cache, filesystem read of `src/decision/policies/{orgId}/subjects.json`, silent fail-open to null on parse error). Implement `resolveSubjectForSkill(skillId, skillEntry, config)` following Spec Literals § Subject Resolution priority order exactly; final fallback `DEFAULT_SUBJECT` ("General"). Add `clearSubjectConfigCache()` test hook mirroring `clearRoutingConfigCache()`.
- **Depends on**: TASK-001
- **Verification**: Resolver returns expected subject for each priority tier; unmapped skill returns "General".

### TASK-003: Add Springs subjects.json seed config
- **Files**: `src/decision/policies/springs/subjects.json` (new)
- **Action**: Create
- **Details**: Write the file verbatim from Spec Literals § Springs seed file.
- **Depends on**: TASK-002
- **Verification**: `loadSubjectConfigForOrg("springs")` returns the parsed config; `MATH-301` resolves to "Math".

### TASK-004: Add LearnerAggregation types
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Add `LearnerAggregation` interface matching spec § Data Model: `overall` (`masteryScore`, `stabilityScore?`, `subject_count`, `skill_count`), `subjects` (record of `{ masteryScore, stabilityScore?, skill_count, strongest_skill, weakest_skill, skills: string[] }`), `skills` (record of `{ subject, masteryScore, stabilityScore?, masteryScore_direction: string|null, evidenceCount: number }`), and `computed_at_version`. Add `MasteryBreakdown` (response shape adding `learning_gaps[]` and `gifted_interest`). Surface `evidenceCount` in `mastery_breakdown.skills.{id}`.
- **Depends on**: none
- **Verification**: Types compile; `npm run typecheck` clean.

### TASK-005: Implement computeLearnerAggregation, evidenceCount, and wire into computeNewState
- **Files**: `src/state/aggregation.ts` (new); `src/state/engine.ts` (modify)
- **Action**: Create + Modify
- **Details**: Implement `computeLearnerAggregation(state, subjectConfig, stateVersion)` per Spec Literals § Aggregation Formulas (arithmetic mean, equal weight per subject for overall; lexicographic tie-break; exclude non-finite masteryScore; omit stability when no skill has it; omit subject when empty). Write result to `state.aggregation` only when `|S| >= 1`; otherwise leave absent. Also implement `incrementSkillEvidenceCounts(priorState, newState, signals)` that bumps `skills.{id}.evidenceCount` by 1 for each applied signal carrying a finite `masteryScore` for that skill (per spec § evidenceCount). Wire both into `computeNewState()` exactly per Spec Literals § Computation timing: `incrementSkillEvidenceCounts()` then `promoteDominantSkillScores()` (unchanged) then `computeLearnerAggregation()`, before return. `computeNewState` must resolve subject config via `loadSubjectConfigForOrg` using `orgId` available in the call path (thread orgId in if not already present). Round numerics with `roundNumeric` (FLOAT_PRECISION 4); evidenceCount is an integer (not rounded).
- **Depends on**: TASK-001, TASK-002, TASK-004
- **Verification**: AGG-001..003, 007, 008, 018 pass; AGG-016 regression (decision outcome unchanged).

### TASK-006: Add decision-type summary repo method for gifted flag
- **Files**: `src/decision/store.ts`; `src/decision/dynamodb-repository.ts`
- **Action**: Modify
- **Details**: Add read-only `getDecisionTypeSummaryForLearner(orgId, learnerRef)` returning `{ total: number; types: Record<DecisionType, number> }` over ALL decisions for the learner (not limited by `recent_decisions_limit`), per spec § Gifted-Interest Flag decision scope. Owned by `decision-engine.md`. Implement in both SQLite store and DynamoDB repository for parity.
- **Depends on**: none
- **Verification**: Returns correct counts; covered by AGG-011, AGG-012.

### TASK-007: Project mastery_breakdown in summary handler core and lambda parity
- **Files**: `src/learners/summary-handler-core.ts`; `src/lambda/inspect.ts`
- **Action**: Modify
- **Details**: Add `current_state.mastery_breakdown` built from `state.aggregation`. Apply projection rules from spec § Summary response extension: round to 4 dp, omit skill entries with non-finite masteryScore, `mastery_breakdown: null` when `state.skills` absent/empty. Keep `current_state.fields` scalars-only (unchanged `projectLearnerState`). Apply identical logic in `src/lambda/inspect.ts` to maintain Fastify/Lambda parity (same pattern as prior educator_summary parity fix).
- **Depends on**: TASK-004, TASK-005
- **Verification**: AGG-015 passes on both Fastify and Lambda handlers.

### TASK-008: Compute learning_gaps and gifted_interest at summary assembly
- **Files**: `src/learners/summary-handler-core.ts`; `src/lambda/inspect.ts`
- **Action**: Modify
- **Details**: Compute `learning_gaps` per Spec Literals § Learning Gaps (both thresholds; `gap` value; sort desc; cap LEARNING_GAPS_MAX). Compute `gifted_interest` per Spec Literals § Gifted-Interest Flag using `getDecisionTypeSummaryForLearner` (G3-G5) plus per-skill `masteryScore` (G1-G2) and per-skill `evidenceCount` (G6, `GIFTED_MIN_EVIDENCE_COUNT = 3`; missing evidenceCount treated as 0). Emit flagged/not-flagged shapes exactly. Criteria-failure detail is debug-log only, never in response.
- **Depends on**: TASK-006, TASK-007
- **Verification**: AGG-009..013, 017 pass.

### TASK-009: Add OpenAPI mastery_breakdown schema
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add `MasteryBreakdown` schema (overall, subjects, skills incl. integer `evidenceCount`, learning_gaps, gifted_interest) and reference it as nullable under `LearnerSummaryResponse.current_state.mastery_breakdown`. Constrain `gifted_interest.label` to `["Person of interest", null]`. Update the getLearnerSummary example to include a `mastery_breakdown` block.
- **Depends on**: TASK-007, TASK-008
- **Verification**: `npm run validate:api` passes.

### TASK-010: Update learner-summary-api spec to reference mastery_breakdown
- **Files**: `docs/specs/learner-summary-api.md`
- **Action**: Modify
- **Details**: Update § URS field allowlist note ("Per-skill breakdown ... stripped") and § Out of Scope ("Nested dot-path trajectory fields") to point at `urs-aggregation.md` `mastery_breakdown` as the canonical per-skill/subject exposure path (per spec § Notes - spec chain update).
- **Depends on**: TASK-009
- **Verification**: `/post-impl-doc-sync` clean for learner-summary-api.md.

### TASK-011: Re-seed Springs demo with subject metadata
- **Files**: `examples/springs/seed-springs-demo.mjs`
- **Action**: Modify
- **Details**: Optionally add `subject` into nested skill entries (or rely on TASK-003 file resolution). Ensure a multi-subject learner (e.g. Jordan with MATH-301 + HIST-202) demonstrates `mastery_breakdown.overall` as a multi-subject mean and that the demo log narrates overall vs dominant-skill. No change to decision outcomes.
- **Depends on**: TASK-003, TASK-007
- **Verification**: Re-seed then `GET .../jordan-mitchell/summary` shows `mastery_breakdown.overall.masteryScore` reflecting multi-subject mean (spec AC).

### TASK-012: Unit tests AGG-001 through AGG-013, AGG-017, AGG-018
- **Files**: `tests/unit/state-aggregation.test.ts` (new); `tests/unit/learner-summary-handler-core.test.ts` (modify)
- **Action**: Create + Modify
- **Details**: Cover AGG-001..010 (aggregation formulas, subject resolution, gaps), AGG-011..013 + AGG-017 (gifted evaluator incl. G6 evidence gate), and AGG-018 (`incrementSkillEvidenceCounts`) per spec § Contract Tests.
- **Depends on**: TASK-005, TASK-008
- **Verification**: All AGG-001..013, 017, 018 green.

### TASK-013: Integration and contract tests AGG-014 through AGG-016
- **Files**: `tests/integration/springs-pilot.test.ts` (modify); `tests/contracts/learner-summary-api.test.ts` (modify)
- **Action**: Modify
- **Details**: AGG-014 state apply writes aggregation; AGG-015 summary includes mastery_breakdown (Fastify inject); AGG-016 explicit policy regression gate (Jordan last signal MATH-301 still yields advance).
- **Depends on**: TASK-005, TASK-007, TASK-008
- **Verification**: AGG-014..016 green; full `npm test` clean.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/state/aggregation-constants.ts` | TASK-001 | Pinned aggregation/gifted constants |
| `src/state/subject-config.ts` | TASK-002 | Subject config loader + resolver |
| `src/decision/policies/springs/subjects.json` | TASK-003 | Springs subject map |
| `src/state/aggregation.ts` | TASK-005 | computeLearnerAggregation |
| `tests/unit/state-aggregation.test.ts` | TASK-012 | Unit tests AGG-001..013 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/shared/types.ts` | TASK-004 | LearnerAggregation + MasteryBreakdown types |
| `src/state/engine.ts` | TASK-005 | Wire computeLearnerAggregation into computeNewState |
| `src/decision/store.ts` | TASK-006 | getDecisionTypeSummaryForLearner (SQLite) |
| `src/decision/dynamodb-repository.ts` | TASK-006 | getDecisionTypeSummaryForLearner (Dynamo) |
| `src/learners/summary-handler-core.ts` | TASK-007, TASK-008 | mastery_breakdown + gaps + gifted |
| `src/lambda/inspect.ts` | TASK-007, TASK-008 | Lambda parity for mastery_breakdown |
| `docs/api/openapi.yaml` | TASK-009 | MasteryBreakdown schema + example |
| `docs/specs/learner-summary-api.md` | TASK-010 | Reference mastery_breakdown |
| `examples/springs/seed-springs-demo.mjs` | TASK-011 | Subject metadata demo |
| `tests/integration/springs-pilot.test.ts` | TASK-013 | AGG-014, AGG-016 |
| `tests/contracts/learner-summary-api.test.ts` | TASK-013 | AGG-015 |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| computeLearnerAggregation writes state.aggregation when skills present | § Functional | TASK-005 |
| loadSubjectConfigForOrg loads subjects.json with cache | § Functional | TASK-002 |
| Subject resolution follows priority order | § Functional | TASK-002 |
| promoteDominantSkillScores unchanged (no regression) | § Functional | TASK-005, TASK-013 |
| summary includes current_state.mastery_breakdown | § Functional | TASK-007 |
| current_state.fields remains scalars-only | § Functional | TASK-007 |
| learning_gaps computed at summary time | § Functional | TASK-008 |
| gifted_interest computed at summary time | § Functional | TASK-008 |
| Springs ships subjects.json | § Functional | TASK-003 |
| empty skills -> mastery_breakdown null | § Functional | TASK-007 |
| AC overall mean of 0.90 and 0.55 = 0.725 | § Acceptance | TASK-005, TASK-012 |
| AC ELA-201 appears in learning_gaps gap 0.27 | § Acceptance | TASK-008, TASK-012 |
| AC all skills >=0.95 + advance-only + evidence>=3 -> flagged Person of interest | § Acceptance | TASK-008, TASK-012 |
| AC one skill 0.80 -> not flagged (G2) | § Acceptance | TASK-012 |
| AC one reinforce decision -> not flagged (G4) | § Acceptance | TASK-012 |
| AC one skill evidenceCount 2 -> not flagged (G6) | § Acceptance | TASK-008, TASK-012 |
| AC Jordan summary overall reflects multi-subject mean | § Acceptance | TASK-011, TASK-013 |
| AC no subjects.json -> General fallback | § Acceptance | TASK-002, TASK-012 |
| AC policy outcomes unchanged (regression gate) | § Acceptance | TASK-013 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| AGG-001 | unit | Subject mean two skills same subject | TASK-012 |
| AGG-002 | unit | Overall mean equal weight per subject | TASK-012 |
| AGG-003 | unit | Multi-skill subject still one subject vote | TASK-012 |
| AGG-004 | unit | Subject resolution explicit_map wins | TASK-012 |
| AGG-005 | unit | Subject resolution prefix rule | TASK-012 |
| AGG-006 | unit | Subject resolution default_subject fallback | TASK-012 |
| AGG-007 | unit | Empty skills no aggregation written | TASK-012 |
| AGG-008 | unit | Strongest/weakest lexicographic tie-break | TASK-012 |
| AGG-009 | unit | Learning gap relative + absolute thresholds | TASK-012 |
| AGG-010 | unit | Learning gap excluded above absolute floor | TASK-012 |
| AGG-011 | unit | Gifted flag all criteria pass | TASK-012 |
| AGG-012 | unit | Gifted flag fails on reinforce decision | TASK-012 |
| AGG-013 | unit | Gifted flag fails on single skill | TASK-012 |
| AGG-014 | integration | State apply writes aggregation | TASK-013 |
| AGG-015 | contract | Summary includes mastery_breakdown | TASK-013 |
| AGG-016 | integration | Policy regression flat rule-advance unchanged | TASK-013 |
| AGG-017 | unit | Gifted flag fails on insufficient evidence (G6) | TASK-012 |
| AGG-018 | unit | evidenceCount increments per masteryScore signal | TASK-012 |

## Deviations from Spec

None - plan is literal-compatible with spec.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Threading orgId into computeNewState requires call-site changes | Medium | Audit callers of computeNewState; pass orgId or resolve subject config one layer up if signature change is invasive |
| Redefining overall as subject-mean confuses consumers vs top-level masteryScore | Medium | Spec documents mastery_breakdown.overall as canonical; TASK-010 updates summary spec; keep top-level mirror for policy back-compat |
| Gifted flag full-history decision scan cost for high-volume learners | Low | getDecisionTypeSummaryForLearner is a count query; pilot volumes small; add index if needed later |
| CEO has not signed off equal-weight overall vs per-skill mean | Medium | PREREQ-001 gate before TASK-005 |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] OpenAPI valid (`npm run validate:api`)
- [ ] Matches spec requirements
- [ ] AGG-016 confirms no policy regression

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003
TASK-001 → TASK-004 → TASK-005 → TASK-007 → TASK-008 → TASK-009 → TASK-010
TASK-006 ↗                        ↘ TASK-011
TASK-005 → TASK-012
TASK-007,008 → TASK-013
```

## Next Steps

- Resolve PREREQ-001 (CEO sign-off) before TASK-005.
- Run `/implement-spec .cursor/plans/urs-aggregation.plan.md`.
- **Then** sequence `tenant-config`: see `.cursor/plans/tenant-config.plan.md` (depends on TASK-001 constants landing here).
