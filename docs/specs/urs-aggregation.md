# URS Aggregation — Skill → Subject → Overall Mastery

> Computes a three-tier mastery hierarchy (skill, subject, overall) and educator-facing derived signals (learning gaps, gifted-interest flag) from accumulated learner state — closing the gap between per-skill signal storage and the 60-second student profile the CEO defined.

## Overview

Teachers need to open a student record and immediately see **what they do well and poorly in each subject**, plus an **overall picture** — without interpreting raw course codes, xAPI envelopes, or "last signal wins" top-level scores. Today the state engine stores per-skill metrics at `state.skills.{skillId}.{masteryScore,stabilityScore,...}` (see `docs/specs/skill-level-tracking.md`) but exposes educators only a **dominant-skill mirror** at top-level `masteryScore` via `promoteDominantSkillScores()` (`docs/specs/state-engine.md` § Top-level skill score promotion). That mirror reflects whichever skill arrived last, not cumulative or overall mastery.

This spec defines:

1. **Subject resolution** — how a skill id (e.g. `MATH-301`, `Reading`) maps to a human subject (e.g. `Math`, `English`).
2. **Aggregation** — deterministic formulas for subject-level and overall mastery/stability scores.
3. **Learning gaps** — per-skill deficits relative to the subject mean.
4. **Gifted-interest flag** — a conservative "person of interest" indicator (not a gifted determination) based on CEO criteria: consistently high scores across skills and advance-only decision history.
5. **Summary exposure** — a structured `mastery_breakdown` block on `GET /v1/learners/:learner_reference/summary` (`docs/specs/learner-summary-api.md`).

**CEO directive (2026-04-10, product-value huddle):**

- Teachers must understand a student within **60 seconds** — quick subject summaries, not exhaustive per-skill trajectory panels by default.
- Data **compounds year-over-year** (1st–7th grade); aggregation reads the latest per-skill snapshot in state (longitudinal history remains in state versions + trajectory APIs).
- Gifted identification is a **flag for consideration** ("person of interest"), not a label — threshold **≥ 0.95 on every tracked skill**, plus advance-only decision pattern.

**Design principle:** Boring, explainable math (equal-weighted arithmetic means). No ML, no opaque weighting in v1.1.

**Backward compatibility:** Top-level `masteryScore` / `stabilityScore` and `promoteDominantSkillScores()` are **unchanged** in v1.1 so existing Springs flat-field policies (`rule-advance`, etc.) keep working. Educators and dashboards MUST treat `mastery_breakdown.overall.masteryScore` as the canonical overall score, not top-level `current_state.fields.masteryScore`.

---

## Data Model

### Stored state extension: `state.aggregation`

After each state apply, the state engine writes a computed object at `state.aggregation` (sibling to `state.skills`, not inside it):

```json
{
  "skill": "MATH-301",
  "skills": {
    "MATH-301": { "masteryScore": 0.90, "stabilityScore": 0.81, "subject": "Math" },
    "HIST-202": { "masteryScore": 0.80, "stabilityScore": 0.68, "subject": "History" },
    "ELA-201": { "masteryScore": 0.55, "stabilityScore": 0.495, "subject": "English" }
  },
  "masteryScore": 0.90,
  "stabilityScore": 0.81,
  "aggregation": {
    "computed_at_version": 7,
    "overall": {
      "masteryScore": 0.75,
      "stabilityScore": 0.665,
      "subject_count": 3,
      "skill_count": 3
    },
    "subjects": {
      "Math": {
        "masteryScore": 0.90,
        "stabilityScore": 0.81,
        "skill_count": 1,
        "strongest_skill": "MATH-301",
        "weakest_skill": "MATH-301",
        "skills": ["MATH-301"]
      },
      "History": {
        "masteryScore": 0.80,
        "stabilityScore": 0.68,
        "skill_count": 1,
        "strongest_skill": "HIST-202",
        "weakest_skill": "HIST-202",
        "skills": ["HIST-202"]
      },
      "English": {
        "masteryScore": 0.55,
        "stabilityScore": 0.495,
        "skill_count": 1,
        "strongest_skill": "ELA-201",
        "weakest_skill": "ELA-201",
        "skills": ["ELA-201"]
      }
    },
    "skills": {
      "MATH-301": {
        "subject": "Math",
        "masteryScore": 0.90,
        "stabilityScore": 0.81,
        "masteryScore_direction": "improving",
        "evidenceCount": 5
      },
      "HIST-202": {
        "subject": "History",
        "masteryScore": 0.80,
        "stabilityScore": 0.68,
        "masteryScore_direction": null,
        "evidenceCount": 3
      },
      "ELA-201": {
        "subject": "English",
        "masteryScore": 0.55,
        "stabilityScore": 0.495,
        "masteryScore_direction": "improving",
        "evidenceCount": 2
      }
    }
  }
}
```

> `state.aggregation` is **derived, recomputable data** — safe to omit from decision canonical snapshots (DEF-DEC-008-PII) and excluded from policy field collection unless a rule explicitly references `aggregation.*` (v1.2+).

### Summary response extension: `current_state.mastery_breakdown`

`GET /v1/learners/:learner_reference/summary` adds a sibling to `current_state.fields`:

```json
{
  "current_state": {
    "state_id": "springs:stu-30456:v7",
    "state_version": 7,
    "updated_at": "2026-04-10T18:00:00Z",
    "fields": {
      "masteryScore": 0.90,
      "stabilityScore": 0.81,
      "skill": "MATH-301"
    },
    "mastery_breakdown": {
      "overall": {
        "masteryScore": 0.75,
        "stabilityScore": 0.665,
        "subject_count": 3,
        "skill_count": 3
      },
      "subjects": {
        "Math": {
          "masteryScore": 0.90,
          "stabilityScore": 0.81,
          "skill_count": 1,
          "strongest_skill": "MATH-301",
          "weakest_skill": "MATH-301"
        },
        "English": {
          "masteryScore": 0.55,
          "stabilityScore": 0.495,
          "skill_count": 1,
          "strongest_skill": "ELA-201",
          "weakest_skill": "ELA-201"
        }
      },
      "skills": {
        "MATH-301": {
          "subject": "Math",
          "masteryScore": 0.90,
          "stabilityScore": 0.81,
          "masteryScore_direction": "improving",
          "evidenceCount": 5
        },
        "ELA-201": {
          "subject": "English",
          "masteryScore": 0.55,
          "stabilityScore": 0.495,
          "masteryScore_direction": "improving",
          "evidenceCount": 2
        }
      },
      "learning_gaps": [
        {
          "skill": "ELA-201",
          "subject": "English",
          "masteryScore": 0.55,
          "subject_masteryScore": 0.55,
          "gap": 0.0,
          "masteryScore_direction": "improving"
        }
      ],
      "gifted_interest": {
        "flagged": false,
        "label": null
      }
    }
  }
}
```

**Projection rules for `mastery_breakdown`:**

- Source: `state.aggregation` + decision history (gifted flag only).
- Numeric values rounded to **4 decimal places** (same as `projectLearnerState()` in `src/learners/state-projection.ts`).
- Omit `skills` entries whose `masteryScore` is not a finite number.
- `learning_gaps` and `gifted_interest` computed at summary assembly time (see § Learning gaps, § Gifted-interest flag).
- When `state.skills` is absent or empty, `mastery_breakdown` is `null` (200 response; not an error).

---

## Subject Resolution

Each skill id in `state.skills` resolves to exactly one subject string using this **priority order** (first match wins):

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `state.skills[skillId].subject` (string, non-blank) | Signal carried `"subject": "Math"` into nested skill entry |
| 2 | Org subject config `explicit_map[skillId]` | `"MATH-301" → "Math"` |
| 3 | Org subject config `prefix_rules[]` — first rule where `skillId.startsWith(rule.prefix)` | `"MATH-301"` matches prefix `"MATH"` → `"Math"` |
| 4 | Org subject config `default_subject` | `"General"` |

**Org subject config file:** `src/decision/policies/{orgId}/subjects.json` (filesystem pilot), loaded via `loadSubjectConfigForOrg(orgId)` — same cache/TTL pattern as `loadRoutingConfigForOrg()` (`docs/specs/decision-engine.md`). DynamoDB-backed subject config is **out of scope** for v1.1 (file-only).

**Signal payload convention (recommended, not enforced):** Signals MAY include `payload.subject` (applies to the signal's primary `payload.skill`) and/or `payload.skills.{skillId}.subject`. Tenant field mappings MAY copy LMS course metadata into these paths (see `docs/specs/tenant-field-mappings.md`).

---

## Aggregation Formulas

All formulas use **arithmetic mean** (equal weight). Implement in `computeLearnerAggregation()` (`src/state/aggregation.ts` — new module owned by this spec).

### Skill inventory

Let `S` = set of skill ids in `state.skills` where `typeof skills[id].masteryScore === 'number'` and `Number.isFinite(...)`.

Skills without numeric `masteryScore` are excluded from all aggregation tiers.

### Subject tier

For each subject `subj`, let `S_subj` = skills in `S` whose resolved subject equals `subj`.

| Field | Formula |
|-------|---------|
| `subjects[subj].masteryScore` | `mean({ skills[id].masteryScore | id ∈ S_subj })` |
| `subjects[subj].stabilityScore` | `mean({ skills[id].stabilityScore | id ∈ S_subj, stabilityScore is finite number })` — omit from object if no skill has stabilityScore |
| `subjects[subj].skill_count` | `\|S_subj\|` |
| `subjects[subj].strongest_skill` | skill id with max `masteryScore` in `S_subj` (ties: lexicographic ascending on skill id) |
| `subjects[subj].weakest_skill` | skill id with min `masteryScore` in `S_subj` (ties: lexicographic ascending) |
| `subjects[subj].skills` | `S_subj` sorted lexicographically ascending |

If `S_subj` is empty, subject is omitted.

### Overall tier

Let `J` = set of subjects with at least one skill in `S`.

| Field | Formula |
|-------|---------|
| `overall.masteryScore` | `mean({ subjects[subj].masteryScore | subj ∈ J })` — **equal weight per subject**, not per skill |
| `overall.stabilityScore` | `mean({ subjects[subj].stabilityScore | subj ∈ J, stabilityScore present })` |
| `overall.subject_count` | `\|J\|` |
| `overall.skill_count` | `\|S\|` |

### Edge cases

| Condition | Behavior |
|-----------|----------|
| `\|S\| = 0` | Do not write `state.aggregation`; summary `mastery_breakdown: null` |
| `\|S\| = 1`, `\|J\| = 1` | Overall equals the single subject equals the single skill |
| Subject has 1 skill | `strongest_skill === weakest_skill` |
| `stabilityScore` missing on some skills | Subject/overall stability uses only skills with finite stabilityScore; if none, field omitted |

### Computation timing

In `computeNewState()` pipeline (`docs/specs/state-engine.md`):

```
deepMerge(signal payloads)
  → incrementSkillEvidenceCounts()  // NEW — bumps skills.{id}.evidenceCount
  → promoteDominantSkillScores()    // unchanged — policy back-compat
  → computeLearnerAggregation()     // NEW — writes state.aggregation
  → return state
```

`computeStateDeltas()` runs on the persisted transition separately (existing flow); aggregation object itself does **not** receive `_delta` / `_direction` companions in v1.1.

### evidenceCount

`evidenceCount` is a per-skill integer counter stored at `state.skills.{id}.evidenceCount`. The state engine increments it by 1 for each applied signal whose `payload.skills.{id}.masteryScore` (or, for the dominant skill, top-level `masteryScore`) is a finite number. It is **not** a delta companion field and is excluded from `current_state.fields` (scalars projection is unchanged). It surfaces only in `mastery_breakdown.skills.{id}.evidenceCount` and gates gifted criterion **G6**. This is the minimal forward-port of roadmap P2 (evidence + confidence); full `confidenceScore` calibration is future scope and not implemented here.

---

## Learning Gaps

A skill is a **learning gap** when **both**:

1. `skill.masteryScore < subjects[subject].masteryScore - LEARNING_GAP_THRESHOLD`
2. `skill.masteryScore < LEARNING_GAP_ABSOLUTE_THRESHOLD`

Constants (pinned):

| Constant | Value | Rationale |
|----------|-------|-----------|
| `LEARNING_GAP_THRESHOLD` | `0.10` | Relative deficit vs subject mean — "didn't do so well *in that subject*" |
| `LEARNING_GAP_ABSOLUTE_THRESHOLD` | `0.60` | Absolute floor — avoids flagging small relative gaps when everyone is high-performing |
| `LEARNING_GAPS_MAX` | `10` | Cap summary payload size |

**Gap entry shape:**

```json
{
  "skill": "ELA-201",
  "subject": "English",
  "masteryScore": 0.28,
  "subject_masteryScore": 0.55,
  "gap": 0.27,
  "masteryScore_direction": "declining"
}
```

Where `gap = subject_masteryScore - masteryScore` (≥ `LEARNING_GAP_THRESHOLD` when included).

Sort: descending by `gap`. Truncate at `LEARNING_GAPS_MAX`.

Computed at **summary assembly** (requires `state.aggregation` + is not persisted in state).

---

## Gifted-Interest Flag

**Not a gifted determination.** Response label when flagged: `"Person of interest"` (pinned string). Dashboard copy MUST NOT use the word "gifted" as a definitive label.

### Criteria (ALL must pass)

> **CEO directive (2026-06-05):** the gifted-interest signal must carry high teacher trust — *"identify fewer students with high confidence than more students with lower confidence."* Therefore the flag requires **sustained evidence**, not just a few high scores. G6 enforces a minimum per-skill evidence count so a student must demonstrate mastery consistently before being surfaced.

| # | Criterion | Constant |
|---|-----------|----------|
| G1 | At least `MIN_SKILLS_FOR_GIFTED` skills in `S` | `MIN_SKILLS_FOR_GIFTED = 2` |
| G2 | Every skill in `S` has `masteryScore >= GIFTED_MASTERY_THRESHOLD` | `GIFTED_MASTERY_THRESHOLD = 0.95` |
| G3 | At least `MIN_ADVANCE_DECISIONS` decisions exist for this learner in this org | `MIN_ADVANCE_DECISIONS = 1` |
| G4 | Every stored decision has `decision_type === 'advance'` | No `reinforce`, `intervene`, or `pause` in history |
| G5 | At least one decision exists (combined with G3) | Prevents score-only false positives on cold-start learners |
| G6 | Every skill in `S` has `evidenceCount >= GIFTED_MIN_EVIDENCE_COUNT` | `GIFTED_MIN_EVIDENCE_COUNT = 3` |

**Decision scope for G3–G4:** All decisions for `(org_id, learner_reference)` in the decision store (not limited to `recent_decisions_limit`). Read via existing `DecisionRepository` list/count method (implementation may add `getDecisionTypeSummaryForLearner()` — owned by `docs/specs/decision-engine.md`).

**Evidence scope for G6:** `evidenceCount` is a per-skill counter on `state.skills.{id}.evidenceCount`, incremented by the state engine each time a signal carries a numeric `masteryScore` for that skill (see § Data Model — evidenceCount). It is the minimal slice of the diagnosis-engine "evidence + confidence" tier (roadmap P2) pulled forward solely to gate G6; full confidence calibration remains future scope. A skill missing `evidenceCount` is treated as `0` (fails G6).

**Response when flagged:**

```json
"gifted_interest": {
  "flagged": true,
  "label": "Person of interest"
}
```

**Response when not flagged:**

```json
"gifted_interest": {
  "flagged": false,
  "label": null
}
```

Criteria failure details are **not** exposed in the educator-facing response (debug logging only).

---

## Requirements

### Functional

- [x] `computeLearnerAggregation(state, subjectConfig, stateVersion)` writes `state.aggregation` per § Aggregation Formulas when `|S| >= 1`
- [x] `loadSubjectConfigForOrg(orgId)` loads `src/decision/policies/{orgId}/subjects.json` with in-memory cache (mirrors routing config loader)
- [x] Subject resolution follows priority order in § Subject Resolution
- [x] `promoteDominantSkillScores()` behavior is unchanged — no regression to Springs flat-field policies
- [x] `GET /v1/learners/:learner_reference/summary` includes `current_state.mastery_breakdown` per § Summary response extension
- [x] `current_state.fields` projection (`src/learners/urs-allowlist.ts`) remains scalars-only — aggregation lives in `mastery_breakdown`, not mixed into flat `fields`
- [x] `learning_gaps` computed at summary time per § Learning Gaps
- [x] `gifted_interest` computed at summary time per § Gifted-Interest Flag
- [x] Springs demo org ships `src/decision/policies/springs/subjects.json` with explicit map + prefix rules for seeded skills
- [x] When `state.skills` is empty, `mastery_breakdown` is JSON `null`

### Acceptance Criteria

- Given state with skills `MATH-301` (0.90, Math) and `ELA-201` (0.55, English), when aggregation runs, then `overall.masteryScore === 0.725` (mean of 0.90 and 0.55) and each subject tier matches its single skill
- Given `ELA-201` masteryScore 0.28 and English subject mean 0.55, when summary is assembled, then `ELA-201` appears in `learning_gaps` with `gap === 0.27`
- Given all skills ≥ 0.95, ≥ 2 skills, all decisions are `advance`, and every skill `evidenceCount >= 3`, when summary is assembled, then `gifted_interest.flagged === true` and `gifted_interest.label === "Person of interest"`
- Given one skill at 0.96 and one at 0.80, when summary is assembled, then `gifted_interest.flagged === false` (G2 fails)
- Given all skills ≥ 0.95 but one decision is `reinforce`, when summary is assembled, then `gifted_interest.flagged === false` (G4 fails)
- Given all skills ≥ 0.95 and advance-only history but one skill has `evidenceCount === 2`, when summary is assembled, then `gifted_interest.flagged === false` (G6 fails — insufficient sustained evidence)
- Given Jordan Mitchell Springs seed after re-seed (`learner_reference` `stu-30456`), when `GET /v1/learners/stu-30456/summary?org_id=springs`, then `mastery_breakdown.overall.masteryScore` reflects multi-subject mean (not 0.90 dominant-skill mirror alone)
- Given org with no `subjects.json`, when aggregation runs, then unmapped skills resolve to `"General"` via `default_subject`
- Given existing Springs policy evaluation on top-level `masteryScore`, when a new signal arrives, then decision outcomes are unchanged vs pre-aggregation behavior (regression gate)

---

## Constraints

- **Equal-weight means only in v1.1** — no evidence-weighting, recency decay, or Bayesian updating.
- **File-based subject config only** — DynamoDB admin upload deferred; pilot orgs ship `subjects.json` in repo.
- **No new tables or write paths** — aggregation is computed during state apply (existing write path) and projected at summary read time.
- **Educator-facing separation** — `current_state.fields.masteryScore` remains the dominant-skill mirror for policy/trajectory back-compat; **`mastery_breakdown.overall.masteryScore` is the canonical overall score for dashboards**.
- **PII exclusion** — `state.aggregation` must not introduce new PII fields; skill ids remain pseudonymous course/skill codes only.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Replacing `promoteDominantSkillScores` with aggregation-driven top-level scores | Policy migration + regression risk | v1.2 — migrate Springs rules to `aggregation.overall.*` or dot-path skill rules |
| Evidence-weighted / recency-weighted aggregation | CEO asked for boring, explainable math | Phase 2 analytics |
| DynamoDB-backed subject config + admin API | File config sufficient for pilot | Tenant admin platform |
| Controlled subject taxonomy / Common Core alignment | Schools define their own skill ids | Phase 3 platform connectivity |
| Cross-learner cohort subject aggregates ("class average in Math") | Separate analytics API | Admin dashboard spec |
| Trajectory of `aggregation.overall.masteryScore` over time | Depends on nested trajectory support | `learner-trajectory-api.md` nested fields (US-SKILL-001 follow-on) |
| Persisting `learning_gaps` or `gifted_interest` in state | Derived at read time from state + decisions | Never (unless performance requires caching) |
| AI skill-to-subject inference | Explicit mapping only | Phase 4 |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `state.skills.{id}.{metric}` storage + nested deltas | `docs/specs/skill-level-tracking.md` | **Implemented** |
| `computeNewState()` + `promoteDominantSkillScores()` | `docs/specs/state-engine.md` | **Implemented** |
| `getAtPath()` / dot-path utilities | `src/shared/dot-path.ts` (from skill-level-tracking) | **Implemented** |
| `loadRoutingConfigForOrg()` cache pattern | `docs/specs/decision-engine.md`, `src/decision/policy-loader.ts` | **Implemented** — mirror for subject config |
| `GET /v1/learners/:ref/summary` handler | `docs/specs/learner-summary-api.md` | **Complete** — `mastery_breakdown` extension shipped |
| `projectLearnerState()` rounding | `src/learners/state-projection.ts` | **Implemented** |
| Decision history read for gifted flag | `docs/specs/decision-engine.md`, `src/decision/store.ts` | **Complete** — `getDecisionTypeSummaryForLearner()` |
| `roundNumeric()` helper | `src/learners/state-projection.ts` | **Implemented** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `state.aggregation` persisted snapshot | Future dot-path policies (`aggregation.overall.masteryScore gte 0.8`) |
| `current_state.mastery_breakdown` | `docs/specs/decision-panel-ui.md` — 4-panel dashboard, 60-second student profile |
| `gifted_interest` flag | Decision Panel "Who Needs Attention?" inverse panel / person-of-interest badge |
| `learning_gaps[]` | Decision Panel "Why Are They Stuck?" subject drill-down |
| Subject summaries | `docs/specs/program-metrics.md` — MC-C outcome grouping by subject (future) |

### Existing Solutions Check

| Option | Finding |
|--------|---------|
| **Custom aggregation module** | **Selected.** No dependency adds value — aggregation is ~80 lines of arithmetic mean + grouping. `package.json` has no stats/math library; adding one for `mean()` is unjustified. |
| **AWS DynamoDB** | **N/A** — no new tables; subject config is filesystem JSON for v1.1. |
| **Tenant field mappings** | **Reuse for ingestion-time `subject` population** — mappings can write `skills.{id}.subject` from LMS course metadata without new platform code (`docs/specs/tenant-field-mappings.md`). |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `state_not_found` | Summary — learner has no state |
| `org_scope_required` | Summary — missing `org_id` |
| `api_key_required` / `api_key_invalid` | Auth middleware |

### New (add during implementation)

None. Missing/invalid `subjects.json` → fail open with `default_subject: "General"` and debug log (same posture as missing routing config falling through to `"learner"`).

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| AGG-001 | unit | Subject mean — two skills same subject | `MATH-301: 0.8`, `MATH-302: 0.6`, both Math | `subjects.Math.masteryScore === 0.7` |
| AGG-002 | unit | Overall mean — equal weight per subject | Math mean 0.9 (1 skill), English mean 0.5 (1 skill) | `overall.masteryScore === 0.7` |
| AGG-003 | unit | Overall mean — multi-skill subject still one subject vote | Math: 0.9, 0.7; History: 0.8 | `overall.masteryScore === 0.8` (mean of 0.8 and 0.8) |
| AGG-004 | unit | Subject resolution — explicit_map wins | `explicit_map: { "X": "Science" }`, skill `X` | subject `Science` |
| AGG-005 | unit | Subject resolution — prefix rule | `prefix_rules: [{ prefix: "MATH", subject: "Math" }]`, skill `MATH-301` | subject `Math` |
| AGG-006 | unit | Subject resolution — default_subject fallback | no map/rules, `default_subject: "General"`, skill `Unknown-999` | subject `General` |
| AGG-007 | unit | Empty skills — no aggregation written | `state.skills = {}` | `state.aggregation` absent |
| AGG-008 | unit | Strongest/weakest tie-break — lexicographic | `B: 0.5`, `A: 0.5` same subject | `weakest_skill === "A"` |
| AGG-009 | unit | Learning gap — relative + absolute thresholds | skill 0.28, subject mean 0.55 | included, `gap === 0.27` |
| AGG-010 | unit | Learning gap — excluded when above absolute floor | skill 0.65, subject mean 0.90 | not in gaps (0.65 ≥ 0.60) |
| AGG-011 | unit | Gifted flag — all criteria pass | 2 skills ≥ 0.95, 3 advance decisions, every skill `evidenceCount >= 3` | `flagged: true`, `label: "Person of interest"` |
| AGG-012 | unit | Gifted flag — fails on reinforce decision | all skills ≥ 0.95, one reinforce | `flagged: false` |
| AGG-013 | unit | Gifted flag — fails on single skill | 1 skill at 0.98 | `flagged: false` (G1) |
| AGG-014 | integration | State apply writes aggregation | ingest 2 skill signals for learner | persisted state has `aggregation.overall` |
| AGG-015 | contract | Summary includes mastery_breakdown | seeded multi-skill learner | 200, `current_state.mastery_breakdown.overall.masteryScore` present |
| AGG-016 | integration | Policy regression — flat rule-advance unchanged | Jordan seed, last signal MATH-301 | latest decision still `advance` (dominant-skill promotion untouched) |
| AGG-017 | unit | Gifted flag — fails on insufficient evidence | all skills ≥ 0.95, advance-only, one skill `evidenceCount === 2` | `flagged: false` (G6) |
| AGG-018 | unit | evidenceCount increments per masteryScore signal | 3 signals carrying `skills.MATH-301.masteryScore` | `skills.MATH-301.evidenceCount === 3` |

> **Test strategy:** AGG-001–013, 017–018 are unit tests on `computeLearnerAggregation()`, the gifted evaluator, and `incrementSkillEvidenceCounts()`. AGG-014–016 are integration/contract tests with Fastify inject + Springs seed data. AGG-016 is an explicit regression gate for policy back-compat.

---

## Concrete Values Checklist

> **Per-tenant overrides:** These constants are the **code defaults** (Plane 3). Each is overridable per-org under the `aggregation.*` namespace of the Tenant Configuration resolver (`docs/specs/tenant-config.md`). Implementation reads `resolveTenantConfig(orgId).aggregation.*` and falls back to the values below when unset. Do not duplicate these literals into `tenant-config.md` — that spec sources them from here to avoid drift.

### Aggregation constants

| Constant | Value | `tenant-config.md` override key | Description |
|----------|-------|----------------------------------|-------------|
| `LEARNING_GAP_THRESHOLD` | `0.10` | `aggregation.learning_gap_threshold` | Relative gap vs subject mean |
| `LEARNING_GAP_ABSOLUTE_THRESHOLD` | `0.60` | `aggregation.learning_gap_absolute_threshold` | Absolute mastery floor for gap inclusion |
| `LEARNING_GAPS_MAX` | `10` | `aggregation.learning_gaps_max` | Max gaps in summary response |
| `GIFTED_MASTERY_THRESHOLD` | `0.95` | `aggregation.gifted_mastery_threshold` | CEO-specified score floor per skill |
| `MIN_SKILLS_FOR_GIFTED` | `2` | `aggregation.min_skills_for_gifted` | Minimum skills before gifted flag eligible |
| `MIN_ADVANCE_DECISIONS` | `1` | `aggregation.min_advance_decisions` | Minimum advance decisions required |
| `GIFTED_MIN_EVIDENCE_COUNT` | `3` | `aggregation.gifted_min_evidence_count` | Minimum per-skill `evidenceCount` for gifted (G6) — sustained-evidence gate |
| `GIFTED_INTEREST_LABEL` | `"Person of interest"` | _(not overridable)_ | Educator-facing label when flagged |
| `FLOAT_PRECISION` | `4` | _(not overridable)_ | Decimal places — matches `state-projection.ts` |
| `DEFAULT_SUBJECT` | `"General"` | `subjects.default_subject` | Fallback when unmapped and no config default |

### Org subject config schema (`subjects.json`)

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `default_subject` | no | string | `"General"` | Fallback subject name |
| `explicit_map` | no | `Record<string, string>` | `{}` | Skill id → subject |
| `prefix_rules` | no | `{ prefix: string, subject: string }[]` | `[]` | First matching prefix wins |

**Springs seed file** (`src/decision/policies/springs/subjects.json`):

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

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| _(none new)_ | — | — | — | Subject config uses filesystem path relative to policy loader; no new env vars |

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Summary with mastery_breakdown | 200 | `application/json` | — (existing auth via `x-api-key`) |
| Learner with no skills | 200 | `application/json` | `mastery_breakdown: null` |
| Learner not found | 404 | `application/json` | — |

### Routes registered

| Method | Path | Auth exempt? | Change |
|--------|------|--------------|--------|
| GET | `/v1/learners/:learner_reference/summary` | no | **Extended response** — no new route |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — aggregation is pure computation on stored state; no IP-dependent logic.
- **CORS**: N/A — no new routes; existing summary CORS policy unchanged.
- **CSP / security headers**: N/A — API-only; no HTML rendered.
- **Cookie prefix vs Path scoping**: N/A — no cookies.
- **Content-type parsing**: N/A — read-only GET extension.
- **Body size limits**: N/A — no new POST/PUT bodies. Summary response grows by bounded `learning_gaps` (max 10) + skill map; monitor payload size for learners with 50+ skills (unlikely in v1.1 pilot).
- **Rate-limit storage scope**: N/A — no new endpoints.
- **Error-code surface**: No new codes; missing subject config fails open silently (educator sees `"General"` grouping, not an error).

---

## Implementation Notes

> Post-implementation parity (2026-06-05). Module locations and TypeScript idioms that differ from informal plan wording.

| Concern | Location | Notes |
|---------|----------|-------|
| Pinned constants | `src/state/aggregation-constants.ts` | Re-exports `FLOAT_PRECISION` and `roundNumeric` from `src/learners/state-projection.ts` (not redefined) |
| Subject config + resolver | `src/state/subject-config.ts` | `loadSubjectConfigForOrg`, `resolveSubjectForSkill`, `clearSubjectConfigCache` |
| Aggregation + evidence | `src/state/aggregation.ts` | `incrementSkillEvidenceCounts`, `computeLearnerAggregation` |
| State pipeline wiring | `src/state/engine.ts` | `computeNewState()` order: merge → evidence → promote → aggregate; `orgId` from `ComputeNewStateOptions.orgId` → `currentState.org_id` → `signals[0].org_id` |
| Delta companions | `src/state/engine.ts` `computeStateDeltas()` | Skips `state.aggregation` — derived snapshot never receives `_delta` / `_direction` companions |
| Summary projection | `src/learners/state-projection.ts` | `projectMasteryBreakdown`, `computeLearningGaps`, `evaluateGiftedInterest`, `completeMasteryBreakdown` |
| Handler parity | `src/learners/summary-handler-core.ts`, `src/lambda/inspect.ts` | Both call `completeMasteryBreakdown(state, decisionTypeSummary)` |
| Decision type summary | `src/decision/store.ts`, `src/decision/dynamodb-repository.ts` | `getDecisionTypeSummaryForLearner(orgId, learnerRef)` |
| Types | `src/shared/types.ts` | `LearnerAggregation`, `MasteryBreakdown`, `SubjectConfig`, etc. |
| OpenAPI | `docs/api/openapi.yaml` | `MasteryBreakdown` schema; `MasteryBreakdownSubjectEntry` omits per-subject `skills[]` (stored `AggregationSubjectEntry` retains it) |

Contract tests AGG-001–018 implemented in `tests/unit/state-aggregation.test.ts`, `tests/unit/learner-summary-handler-core.test.ts`, `tests/contracts/learner-summary-api.test.ts`, and `tests/integration/springs-pilot.test.ts`.

---

## Notes

- **Spec chain update:** Done — `docs/specs/learner-summary-api.md` § Out of Scope and § URS field allowlist reference `mastery_breakdown` as the canonical per-skill/subject exposure path.
- **Dashboard sequencing:** `docs/specs/decision-panel-ui.md` four-panel layout should read `mastery_breakdown` for subject quick-hitters and `gifted_interest` for person-of-interest badges — not raw `current_state.fields`.
- **CEO sign-off:** Received 2026-06-05 (plan PREREQ-001) — equal-weight subject→overall mean confirmed; gifted G6 evidence gate added.

---

*Spec created: 2026-04-10 | Implemented: 2026-06-05 | Phase: v1.1 (product-value MVP) | Plan: `.cursor/plans/urs-aggregation.plan.md`*
