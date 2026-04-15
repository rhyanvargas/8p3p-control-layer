---
name: Springs Realistic Seed — Real LMS Envelopes + Field Mapping Registration
overview: |
  Upgrades the existing Springs demo seed script (`scripts/seed-springs-demo.mjs`) from
  pre-canonical flat payloads to real-world LMS payload shapes — Canvas Caliper GradeEvents,
  Blackboard Caliper AssignableEvents, i-Ready diagnostic JSON (CSV-to-webhook adapter shape),
  and Absorb LMS REST enrollment responses. The script registers field mappings via
  `PUT /v1/admin/mappings/:org/:source_system` before sending signals, demonstrating the
  full onboarding-to-intelligence pipeline end-to-end. Adds `iready-diagnostic` as a new
  source system in Springs routing. Produces narrative-aware output aligned with 5 learner
  personas and a demo walkthrough doc that tells the pilot story through all 4 Decision Panel
  panels. No new backend code — uses existing admin field mapping API, transform engine
  (single- and multi-source), and ingestion pipeline. Replaces the v1 seed plan
  (`.cursor/plans/springs-demo-seed.plan.md`).
todos:
  - id: TASK-001
    content: Add iready-diagnostic to Springs routing.json
    status: completed
  - id: TASK-002
    content: Design field mappings for all 4 source systems
    status: completed
  - id: TASK-003
    content: Design realistic signal payloads with narrative personas
    status: completed
  - id: TASK-004
    content: Rewrite scripts/seed-springs-demo.mjs — Phase 1 (mapping registration)
    status: completed
  - id: TASK-005
    content: Rewrite scripts/seed-springs-demo.mjs — Phase 2 (realistic LMS signals)
    status: completed
  - id: TASK-006
    content: Rewrite scripts/seed-springs-demo.mjs — Phase 3 (narrative verification output)
    status: completed
  - id: TASK-007
    content: Create docs/guides/springs-pilot-demo.md (narrative + demo talking points)
    status: completed
  - id: TASK-008
    content: Create docs/guides/onboarding-field-mappings.md (reusable onboarding guide)
    status: completed
  - id: TASK-009
    content: Verify end-to-end — seed → dashboard panels → all 4 panels populated
    status: completed
isProject: false
---

# Springs Realistic Seed — Real LMS Envelopes + Field Mapping Registration

**Predecessor plan**: `.cursor/plans/springs-demo-seed.plan.md` (completed — v1 flat payloads)
**Specs consumed** (no changes to these):
- `docs/specs/tenant-field-mappings.md` — field mapping pipeline, admin API, transform grammar
- `docs/specs/multi-source-transforms.md` — multi-source `sources` syntax for `earned / possible`
- `docs/specs/decision-engine.md` — policy routing, `signal_context` extraction
- `docs/specs/decision-panel-ui.md` — dashboard panel data requirements

## Prerequisites

- [x] PREREQ-001: Existing seed script (`scripts/seed-springs-demo.mjs`) complete and working (v1 plan done)
- [x] PREREQ-002: Springs policies deployed: `learner.json`, `staff.json`, `routing.json`
- [x] PREREQ-003: Admin field mappings API implemented (`PUT /v1/admin/mappings/:org_id/:source_system`)
- [x] PREREQ-004: Multi-source transforms implemented (`sources` + named variables in expressions)
- [x] PREREQ-005: Decision Panel UI built and serving at `/dashboard/`
- [ ] PREREQ-006: `ADMIN_API_KEY` set in `.env.local` (required for mapping registration calls)

## Personas

| Persona | `learner_reference` | Story | Systems | Decision Arc |
|---------|-------------------|-------|---------|-------------|
| **Maya Kim** | `stu-10042` | Strong in math, declining in reading. i-Ready MOY shows vocabulary drop. | Canvas (Math 301), i-Ready (Reading) | Canvas math → **advance**; i-Ready reading → **intervene** |
| **Alex Rivera** | `stu-20891` | Struggling across platforms — low scores, late submissions | Canvas (ELA 201), Blackboard (Science 101) | Canvas ELA → **intervene**; Blackboard science → **intervene** |
| **Jordan Mitchell** | `stu-30456` | Was struggling, got intervention, now improving. Level transition. | Canvas (Math 301), Blackboard (History 202) | t1: math → **reinforce**; t2: math → **reinforce** (improving delta); t3: math → **advance** (emerged) |
| **Sam Torres** | `stu-40123` | Borderline — needs reinforcement, not crisis | Canvas (ELA 201) | → **reinforce** (active in Panel 3: What To Do?) |
| **Ms. Davis** | `staff-0201` | Staff with overdue compliance training, declining | Absorb (Annual Compliance) | t1: → **reinforce**; t2: → **intervene** (Panel 1 + 2 declining) |

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

---

### TASK-001: Add iready-diagnostic to Springs routing.json

- **Files**: `src/decision/policies/springs/routing.json`
- **Action**: Modify
- **Details**:
  Add `"iready-diagnostic": "learner"` to the `source_system_map`. This registers i-Ready as a learner-policy source system alongside Canvas and Blackboard. The existing `canvas-lms`, `blackboard-lms`, `absorb-lms` entries remain unchanged.

  Updated file:
  ```json
  {
    "source_system_map": {
      "canvas-lms": "learner",
      "blackboard-lms": "learner",
      "iready-diagnostic": "learner",
      "internal-lms": "learner",
      "absorb-lms": "staff",
      "hr-training": "staff"
    },
    "default_policy_key": "learner"
  }
  ```
- **Depends on**: none
- **Verification**: `npm test` passes (springs-pilot.test.ts, signal-ingestion tests — no regressions); `resolveUserTypeFromSourceSystem('springs', 'iready-diagnostic')` returns `'learner'`

---

### TASK-002: Design field mappings for all 4 source systems

- **Files**: none (design task — mappings documented here, implemented in TASK-004)
- **Action**: Design
- **Details**:

  Each mapping is a `TenantPayloadMapping` object registered via `PUT /v1/admin/mappings/springs/:source_system`. All use the existing transform engine (single-source `value` or multi-source `sources`).

  #### Canvas LMS (`canvas-lms`)

  Source shape: Caliper 1.1 `GradeEvent` envelope. The script sends the `data[0]` event object as the signal payload (not the full Caliper envelope — the envelope is transport-level; the signal payload is the event body).

  ```json
  {
    "aliases": {
      "skill": ["group.courseNumber"],
      "assessment_type": ["object.extensions.com_instructure_canvas.submission_type"]
    },
    "transforms": [
      {
        "target": "masteryScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
        "expression": "Math.min(earned / possible, 1)"
      },
      {
        "target": "stabilityScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
        "expression": "Math.min(earned / possible, 1) * 0.9"
      },
      {
        "target": "timeSinceReinforcement",
        "source": "extensions.timeSinceLastActivity",
        "expression": "value"
      }
    ],
    "types": {
      "masteryScore": "number",
      "stabilityScore": "number",
      "skill": "string"
    }
  }
  ```

  **Design notes:**
  - `stabilityScore` is derived as `(earned/possible) * 0.9` — a simplification for demo purposes. In production, stability would be computed from longitudinal data. The `* 0.9` ensures a single high grade doesn't immediately trigger `advance` (stability threshold is 0.8); it takes consistently high scores.
  - `timeSinceReinforcement` is passed through from an extension field `extensions.timeSinceLastActivity` that the webhook adapter would compute (seconds since last positive interaction). For the seed script, this is set directly in the payload.
  - `skill` is aliased from `group.courseNumber` (e.g. "MATH-301") → appears in `decision_context.skill` on the dashboard.
  - `assessment_type` is aliased from the Canvas submission type extension. Dot paths with literal dots in key names use underscore substitution (`com_instructure_canvas` for `com.instructure.canvas`) because `setAtPath` interprets dots as nesting. **Alternative**: the seed payload flattens the Canvas extensions under a non-dotted key so dot-path resolution works cleanly.

  #### Blackboard LMS (`blackboard-lms`)

  Source shape: Caliper 1.1 `GradeEvent` / `AssignableEvent`.

  ```json
  {
    "aliases": {
      "skill": ["group.courseNumber"],
      "assessment_type": ["extensions.bb_action_name"]
    },
    "transforms": [
      {
        "target": "masteryScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "object.assignable.maxScore" },
        "expression": "Math.min(earned / possible, 1)"
      },
      {
        "target": "stabilityScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "object.assignable.maxScore" },
        "expression": "Math.min(earned / possible, 1) * 0.85"
      },
      {
        "target": "timeSinceReinforcement",
        "source": "extensions.timeSinceLastActivity",
        "expression": "value"
      }
    ],
    "types": {
      "masteryScore": "number",
      "stabilityScore": "number",
      "skill": "string"
    }
  }
  ```

  **Design notes:**
  - Blackboard `maxScore` is on `object.assignable.maxScore` (differs from Canvas `generated.maxScore`).
  - Stability multiplier is `0.85` for Blackboard — a school might weight Blackboard assessments slightly differently. Demonstrates that per-source-system mappings can encode institutional knowledge.

  #### i-Ready Diagnostic (`iready-diagnostic`)

  Source shape: JSON-ified CSV row (what a CSV-to-webhook adapter would emit). i-Ready has no native JSON API — this models what a lightweight adapter script would produce from the CSV export.

  ```json
  {
    "aliases": {
      "skill": ["subject"],
      "assessment_type": ["normingWindow"]
    },
    "transforms": [
      {
        "target": "masteryScore",
        "sources": { "score": "overallScaleScore", "maxScore": "maxScaleScore" },
        "expression": "Math.min(score / maxScore, 1)"
      },
      {
        "target": "stabilityScore",
        "source": "percentile",
        "expression": "value / 100"
      },
      {
        "target": "riskSignal",
        "source": "diagnosticGain",
        "expression": "Math.max(1 - (value + 50) / 100, 0)"
      }
    ],
    "types": {
      "masteryScore": "number",
      "stabilityScore": "number",
      "riskSignal": "number",
      "skill": "string"
    }
  }
  ```

  **Design notes:**
  - `overallScaleScore / maxScaleScore` → `masteryScore` (0–1 range). `maxScaleScore` is set per-grade (e.g. 800 for grade 5 reading).
  - `percentile / 100` → `stabilityScore` — a student at the 22nd percentile gets `0.22` stability, triggering intervene if below 0.3.
  - `diagnosticGain` → `riskSignal` — negative gain (regression) produces high risk. Formula: `max(1 - (gain + 50) / 100, 0)`. A gain of -30 → riskSignal 0.8 (high). A gain of +20 → riskSignal 0.3 (low).
  - `subject` (e.g. "Reading", "Math") → `skill` for decision context.
  - `normingWindow` ("BOY"/"MOY"/"EOY") → `assessment_type` for decision context.

  #### Absorb LMS (`absorb-lms`)

  Source shape: Absorb REST API v2 enrollment response.

  ```json
  {
    "aliases": {
      "skill": ["name"],
      "assessment_type": ["enrollmentType"]
    },
    "transforms": [
      {
        "target": "complianceScore",
        "source": "progress",
        "expression": "value"
      },
      {
        "target": "trainingScore",
        "sources": { "score": "score", "maxScore": "maxScore" },
        "expression": "Math.min(score / maxScore, 1)"
      },
      {
        "target": "daysOverdue",
        "source": "daysOverdue",
        "expression": "value"
      },
      {
        "target": "certificationValid",
        "source": "certificationValid",
        "expression": "value"
      }
    ],
    "types": {
      "complianceScore": "number",
      "trainingScore": "number",
      "daysOverdue": "number",
      "certificationValid": "boolean"
    }
  }
  ```

  **Design notes:**
  - Absorb `progress` (0.0–1.0) maps directly to `complianceScore`.
  - `score / maxScore` → `trainingScore`. Absorb returns `score` as a percentage in some contexts; for safety, we normalize via `maxScore`.
  - `daysOverdue` and `certificationValid` are pass-through — Absorb doesn't natively provide these, so the webhook adapter computes them from `dateCompleted` and cert expiry. The seed payload includes them directly.
  - `name` (course name) → `skill` for decision context (e.g. "Annual Compliance Training 2026").

  #### Cross-cutting design decision: Flat fields for policy + nested skills for dashboard

  The learner policy evaluates **flat top-level fields** (`stabilityScore`, `masteryScore`, `timeSinceReinforcement`). The dashboard's Panel 2 ("Why Are They Stuck?") and Panel 4 ("Did It Work?") read **nested `skills.{skillName}.{metric}`** state with `_direction` deltas.

  Both are needed. The transforms produce flat fields for policy evaluation. The signal payloads also include a pre-structured `skills.{skillName}` nested object that the state engine's `deepMerge` carries into state alongside the flat fields. This mirrors production: a webhook adapter structures skill-level data explicitly while the transform engine handles the canonical score derivation.

  Example Canvas signal payload (hybrid):
  ```json
  {
    "generated": { "scoreGiven": 92, "maxScore": 100 },
    "group": { "courseNumber": "MATH-301" },
    "extensions": { "timeSinceLastActivity": 30000 },
    "skill": "MATH-301",
    "skills": {
      "MATH-301": { "masteryScore": 0.92, "stabilityScore": 0.828 }
    }
  }
  ```

  After transform + merge, state contains:
  - `masteryScore: 0.92` (flat, for policy)
  - `stabilityScore: 0.828` (flat, for policy)
  - `skills.MATH-301.masteryScore: 0.92` (nested, for dashboard Panel 2/4)
  - `skills.MATH-301.stabilityScore: 0.828` (nested, for dashboard Panel 2/4)
  - `skills.MATH-301.masteryScore_direction: 'improving'` (computed by delta engine on 2nd+ signal)

  The `skills` nested values in the payload are pre-computed from the same raw fields. In production, the webhook adapter would compute these. For the seed script, they're included directly.

  **State overwrite note:** Flat fields get overwritten by each subsequent signal (deep merge replaces scalars). This is intentional — the LATEST signal drives the policy decision. The decision HISTORY preserves all prior decisions with their `state_snapshot`. And the nested `skills` structure preserves per-skill data because `deepMerge` merges objects recursively (MATH-301 data persists even when a Reading signal arrives).

- **Depends on**: TASK-001
- **Verification**: Each mapping object passes admin API expression validation (`PUT` returns 200); all transform expressions are valid per the restricted grammar

---

### TASK-003: Design realistic signal payloads with narrative personas

- **Files**: none (design task — payloads documented here, implemented in TASK-005)
- **Action**: Design
- **Details**:

  12 signals across 5 personas, designed to populate all 4 Decision Panel panels. Signals use realistic LMS payload shapes that the field mappings from TASK-002 will transform.

  #### Signal timeline

  | # | Signal ID | Persona | Source | Timestamp | Key Raw Fields | Post-Transform (flat) | Expected Decision |
  |---|-----------|---------|--------|-----------|----------------|----------------------|-------------------|
  | 1 | `maya-canvas-math-001` | Maya Kim | `canvas-lms` | T+0m | `scoreGiven: 92, maxScore: 100, courseNumber: "MATH-301"` | `masteryScore: 0.92, stabilityScore: 0.828` | **advance** (stability 0.828 ≥ 0.8 ✓, mastery 0.92 ≥ 0.8 ✓) |
  | 2 | `maya-iready-read-001` | Maya Kim | `iready-diagnostic` | T+2m | `overallScaleScore: 380, maxScaleScore: 800, percentile: 22, diagnosticGain: -15, subject: "Reading", normingWindow: "MOY", timeSinceReinforcement: 200000` | `masteryScore: 0.475, stabilityScore: 0.22, riskSignal: 0.65, timeSinceReinforcement: 200000` | **intervene** (stability 0.22 < 0.3 ✓, timeSince 200000 > 172800 ✓) |
  | 3 | `alex-canvas-ela-001` | Alex Rivera | `canvas-lms` | T+4m | `scoreGiven: 28, maxScore: 100, courseNumber: "ELA-201", timeSinceLastActivity: 190000` | `masteryScore: 0.28, stabilityScore: 0.252, timeSinceReinforcement: 190000` | **intervene** (stability 0.252 < 0.3 ✓, timeSince 190000 > 172800 ✓) |
  | 4 | `alex-bb-sci-001` | Alex Rivera | `blackboard-lms` | T+6m | `scoreGiven: 15, maxScore: 60, courseNumber: "SCI-101", timeSinceLastActivity: 180000` | `masteryScore: 0.25, stabilityScore: 0.2125, timeSinceReinforcement: 180000` | **intervene** (stability 0.2125 < 0.3 ✓, timeSince 180000 > 172800 ✓) |
  | 5 | `jordan-canvas-math-001` | Jordan Mitchell | `canvas-lms` | T+8m | `scoreGiven: 45, maxScore: 100, courseNumber: "MATH-301", timeSinceLastActivity: 95000` | `masteryScore: 0.45, stabilityScore: 0.405, timeSinceReinforcement: 95000` | **reinforce** (stability 0.405 < 0.65 ✓, timeSince 95000 > 86400 ✓) |
  | 6 | `jordan-canvas-math-002` | Jordan Mitchell | `canvas-lms` | T+10m | `scoreGiven: 68, maxScore: 100, courseNumber: "MATH-301", timeSinceLastActivity: 90000` | `masteryScore: 0.68, stabilityScore: 0.612, timeSinceReinforcement: 90000` | **reinforce** (stability 0.612 < 0.65 ✓, timeSince 90000 > 86400 ✓). Delta: masteryScore improving (+0.23) → Panel 4 |
  | 7 | `jordan-bb-hist-001` | Jordan Mitchell | `blackboard-lms` | T+12m | `scoreGiven: 48, maxScore: 60, courseNumber: "HIST-202", timeSinceLastActivity: 40000` | `masteryScore: 0.80, stabilityScore: 0.68` | **reinforce** (default — stability 0.68 misses all rule thresholds; mastery 0.80 but stability < 0.8 misses advance) |
  | 8 | `jordan-canvas-math-003` | Jordan Mitchell | `canvas-lms` | T+14m | `scoreGiven: 90, maxScore: 100, courseNumber: "MATH-301", timeSinceLastActivity: 30000` | `masteryScore: 0.90, stabilityScore: 0.81` | **advance** (stability 0.81 ≥ 0.8 ✓, mastery 0.90 ≥ 0.8 ✓). Panel 4: level transition proficient → mastery. Sent last for Jordan so `masteryScore_direction: 'improving'` persists in state. |
  | 9 | `sam-canvas-ela-001` | Sam Torres | `canvas-lms` | T+16m | `scoreGiven: 55, maxScore: 100, courseNumber: "ELA-201", timeSinceLastActivity: 90000` | `masteryScore: 0.55, stabilityScore: 0.495, timeSinceReinforcement: 90000` | **reinforce** (stability 0.495 < 0.65 ✓, timeSince 90000 > 86400 ✓) — borderline, visible in inspection panels |
  | 10 | `davis-absorb-001` | Ms. Davis | `absorb-lms` | T+18m | `progress: 0.60, score: 70, maxScore: 100, daysOverdue: 5, certificationValid: true, name: "Annual Compliance 2026"` | `complianceScore: 0.60, trainingScore: 0.70, daysOverdue: 5` | **reinforce** (compliance 0.60 < 0.8 AND daysOverdue 5 > 0 ✓) |
  | 11 | `davis-absorb-002` | Ms. Davis | `absorb-lms` | T+20m | `progress: 0.35, score: 40, maxScore: 100, daysOverdue: 20, certificationValid: true, name: "Annual Compliance 2026"` | `complianceScore: 0.35, trainingScore: 0.40, daysOverdue: 20` | **intervene** (compliance 0.35 < 0.5 ✓, daysOverdue 20 > 14 ✓). Delta: complianceScore declining → Panel 2 |

  **Total: 11 signals** across 5 personas, 4 source systems. Each payload includes vendor-native raw fields (for transforms) PLUS a nested `skills.{skillName}` object (for Panel 2/4 dashboard display — see TASK-002 design note). The `timeSinceReinforcement` field is included as a passthrough in payloads where intervene/reinforce rules need it (the i-Ready mapping doesn't derive it from raw fields; the webhook adapter would compute it from `completionDate` deltas).

  #### Panel coverage

  | Panel | What lights up | Source |
  |-------|---------------|--------|
  | **Who Needs Attention?** | Maya (i-Ready reading intervene), Alex (Canvas ELA + BB Science intervene), Ms. Davis (Absorb intervene) | Signals 2, 3, 4, 11 |
  | **Why Are They Stuck?** | Maya: Reading stability 0.22 declining. Alex: ELA + Science both < 0.3. Ms. Davis: compliance declining from 0.60 → 0.35 | State deltas from `skills.Reading`, `skills.ELA-201`, `skills.SCI-101` nested objects |
  | **What To Do?** | Ms. Davis intervene decision — most recent unreviewed intervene/pause, with Approve/Reject. Panel 3 only surfaces intervene/pause (high-stakes decisions requiring educator confirmation). | Signal 11 |
  | **Did It Work?** | Jordan Mitchell: masteryScore improving 0.45 → 0.68 → 0.90 across signals 5, 6, 8. Level transition proficient → mastery. BB history (signal 7) sent before math-003 (signal 8) so `masteryScore_direction: 'improving'` persists. | `skills.MATH-301` nested deltas |

- **Depends on**: TASK-002
- **Verification**: Each signal's post-transform values verified against Springs learner/staff policy rules on paper; all 4 panels have at least one active entry; nested `skills` objects produce `_direction` deltas after 2nd+ signal per learner

---

### TASK-004: Rewrite seed script — Phase 1 (mapping registration)

- **Files**: `scripts/seed-springs-demo.mjs`
- **Action**: Modify
- **Details**:
  Add a Phase 1 section at the start of `main()` that registers field mappings for all 4 source systems using the admin API. This section runs before any signals are sent.

  For each source system:
  ```js
  const res = await fetch(`${base}/v1/admin/mappings/${org}/${sourceSystem}`, {
    method: 'PUT',
    headers: { 'x-admin-api-key': adminKey, 'content-type': 'application/json' },
    body: JSON.stringify(mappingObject),
  });
  ```

  Add `--admin-key` CLI arg (defaults to `ADMIN_API_KEY` env var). If not provided and mappings are needed, warn and skip Phase 1 (signals will fail if no pre-existing mappings exist).

  The 4 mapping objects are from TASK-002 design. Store them as const objects in the script.

  Phase 1 output:
  ```
  Phase 1: Registering field mappings (onboarding)...
    ✓ canvas-lms     — 3 transforms, 2 aliases
    ✓ blackboard-lms — 3 transforms, 2 aliases
    ✓ iready-diagnostic — 3 transforms, 2 aliases
    ✓ absorb-lms     — 4 transforms, 2 aliases
  ```

  If a mapping already exists (PUT is idempotent), still show ✓.
  If admin key is missing, show:
  ```
  Phase 1: Skipping mapping registration (no --admin-key or ADMIN_API_KEY)
  ```

- **Depends on**: TASK-002
- **Verification**: `PUT` returns 200 for all 4 source systems; `GET /v1/admin/mappings/springs` returns 4 items

---

### TASK-005: Rewrite seed script — Phase 2 (realistic LMS signals)

- **Files**: `scripts/seed-springs-demo.mjs`
- **Action**: Modify
- **Details**:
  Replace the existing 14 flat-payload signals with the 11 realistic LMS-shaped signals from TASK-003. Each signal payload uses the vendor-native field names (e.g. `scoreGiven`, `maxScore`, `group.courseNumber` for Canvas) — the field mappings registered in Phase 1 transform them into canonical fields during ingestion. Each payload also includes a nested `skills.{skillName}` object for dashboard Panel 2/4 display (see TASK-002 design note).

  Signal envelope structure is unchanged:
  ```js
  {
    org_id: org,
    signal_id: signalId,
    source_system: sourceSystem,
    learner_reference: learnerRef,
    timestamp: timestamp,
    schema_version: 'v1',
    payload: { /* vendor-native fields */ }
  }
  ```

  The `skill` and `assessment_type` fields in the payload come through as aliases (not hardcoded in the envelope). After field mapping applies, `signal_context.skill` and `signal_context.assessment_type` are extracted by the ingestion handler from the normalized payload.

  Fixed timestamps: `2026-03-15T09:00:00Z` through `T09:20:00Z` (2-minute intervals, 11 signals).

  Each signal entry includes expected decision type and a `persona` label for Phase 3 output.

  Idempotency: all `signal_id` values are deterministic strings — re-runs produce duplicates.

- **Depends on**: TASK-003, TASK-004
- **Verification**: All 11 signals accepted on first run (or duplicate on re-run); `GET /v1/decisions?org_id=springs` returns decisions with all 4 types represented

---

### TASK-006: Rewrite seed script — Phase 3 (narrative verification output)

- **Files**: `scripts/seed-springs-demo.mjs`
- **Action**: Modify
- **Details**:
  After all signals are sent, output a narrative-aware summary grouped by persona instead of a flat signal list. Query the decisions API to verify actual outcomes.

  Phase 3 output format:
  ```
  Phase 3: Verification

  Maya Kim (stu-10042) — Canvas Math + i-Ready Reading
    ✓ maya-canvas-math-001: canvas-lms → advance (MATH-301)
    ✓ maya-iready-read-001: iready-diagnostic → intervene (Reading)
    📊 Cross-system: 2 sources, 2 decisions. Math advancing; Reading needs intervention.

  Alex Rivera (stu-20891) — Canvas ELA + Blackboard Science
    ✓ alex-canvas-ela-001: canvas-lms → intervene (ELA-201)
    ✓ alex-bb-sci-001: blackboard-lms → intervene (SCI-101)
    📊 Multi-platform struggle: both systems show < 0.3 stability.

  Jordan Mitchell (stu-30456) — Canvas Math trajectory + Blackboard History
    ✓ jordan-canvas-math-001: canvas-lms → reinforce (MATH-301)
    ✓ jordan-canvas-math-002: canvas-lms → reinforce (MATH-301) [improving +0.23 mastery]
    ✓ jordan-bb-hist-001: blackboard-lms → reinforce (HIST-202)
    ✓ jordan-canvas-math-003: canvas-lms → advance (MATH-301) [level: proficient → mastery]
    📊 Trajectory: intervention worked — MATH-301 masteryScore 0.45 → 0.68 → 0.90 over 3 signals.

  Sam Torres (stu-40123) — Canvas ELA
    ✓ sam-canvas-ela-001: canvas-lms → reinforce (ELA-201)
    📊 Borderline reinforcement — not crisis, but needs support. Visible in inspection panels.

  Ms. Davis (staff-0201) — Absorb Compliance
    ✓ davis-absorb-001: absorb-lms → reinforce (Annual Compliance 2026)
    ✓ davis-absorb-002: absorb-lms → intervene (Annual Compliance 2026) [declining]
    📊 Staff alert: compliance dropped 0.60 → 0.35, 20 days overdue. Panel 3 action pending.

  --- Summary ---
    Signals: 11 sent | 11 matched expected outcomes
    Decisions: advance 2, intervene 4, reinforce 5
    Sources: canvas-lms (6), blackboard-lms (2), iready-diagnostic (1), absorb-lms (2)
    Field mappings: 4 registered (Phase 1)

    Dashboard: http://localhost:3000/dashboard/
    Inspect:   http://localhost:3000/inspect/
  ```

  Mismatch output includes expected vs actual decision type and the raw post-transform state for debugging.

- **Depends on**: TASK-005
- **Verification**: Script exits 0 with all 11 outcomes matching; narrative grouping renders correctly

---

### TASK-007: Create docs/guides/springs-pilot-demo.md

- **Files**: `docs/guides/springs-pilot-demo.md`
- **Action**: Create
- **Details**:
  A structured demo script targeting a school principal / IT director audience. Incorporates the 5 personas, tells the story through the 4 Decision Panel panels, and includes talking points.

  **Structure:**

  1. **Setup** (30s): Run `npm run seed:springs-demo`. Show Phase 1 (onboarding — mappings registered) and Phase 2 (data flowing from 4 LMS sources).

  2. **Panel 1 — Who Needs Attention?** (45s):
     - Maya Kim: i-Ready reading diagnostic flagged her. "Her Canvas math is fine — it's the i-Ready diagnostic that caught the vocabulary decline. No single system sees both."
     - Alex Rivera: struggling on both Canvas ELA and Blackboard Science. "Two platforms, same conclusion — this student needs help now."
     - Ms. Davis: staff compliance declining. "Staff and students in the same system, different policies, both surfaced."

  3. **Panel 2 — Why Are They Stuck?** (45s):
     - Maya: "Reading stability at 22%. The i-Ready MOY diagnostic showed vocabulary regression — that's the specific skill."
     - Alex: "ELA and Science both below 30% stability. Multiple declining skills across platforms."
     - Ms. Davis: "Compliance dropped from 60% to 35%, 20 days overdue. The direction arrow shows declining."

  4. **Panel 3 — What To Do?** (30s):
     - Ms. Davis: intervene decision with Approve/Reject buttons. Panel 3 surfaces only intervene/pause decisions — high-stakes actions that require educator confirmation before the system acts. "This is the educator handoff. The system recommends intervention for Ms. Davis's overdue compliance — the administrator approves or rejects. One click."

  5. **Panel 4 — Did It Work?** (45s):
     - Jordan Mitchell: "Three math signals over time: 45% → 68% → 90% mastery. The intervention worked. Level transition: proficient → mastery. This is the proof."

  6. **The Integration Story** (30s):
     - "Everything you just saw came from 4 real LMS platforms — Canvas, Blackboard, i-Ready, Absorb. The system registered field mappings for each one in Phase 1. That's the onboarding step. After that, data just flows."

  **Talking points per panel** (IT-director level, 2-3 sentences each).
  **Total demo time**: ~4 minutes with narration.

  Include a "Persona Reference" table at the bottom with all 5 personas and their signal details for quick reference during the demo.

- **Depends on**: TASK-003
- **Verification**: Document can be followed end-to-end against seeded data; all 4 panels have content matching the narrative; no dead-end references

---

### TASK-008: Create docs/guides/onboarding-field-mappings.md

- **Files**: `docs/guides/onboarding-field-mappings.md`
- **Action**: Create
- **Details**:
  A reusable onboarding guide for configuring field mappings for new customer LMS integrations. Uses the 4 Springs mappings from TASK-002 as reference examples but is written generically.

  **Structure:**

  1. **When you need a field mapping** — when LMS sends raw fields, not canonical 0-1 scores.
  2. **Mapping anatomy** — `aliases`, `transforms` (single-source + multi-source), `types`, `required`. Reference `docs/specs/tenant-field-mappings.md` for full spec.
  3. **Step-by-step: Canvas LMS** — full worked example with the TASK-002 Canvas mapping. Shows raw payload → transform → canonical field → decision.
  4. **Step-by-step: i-Ready Diagnostic** — CSV-to-JSON adapter pattern. Shows how to build a thin adapter that converts CSV exports to webhook calls, and the corresponding field mapping.
  5. **Step-by-step: Blackboard LMS** — Caliper event mapping with `bb:` extension field paths.
  6. **Step-by-step: Absorb LMS** — REST enrollment response mapping with status enum handling.
  7. **Registering via admin API** — `PUT /v1/admin/mappings/:org/:source_system` curl examples.
  8. **Verifying the mapping** — send a test signal, check `/v1/state` for canonical fields, check `/v1/decisions` for expected decision type.
  9. **Common gotchas** — dot-path key name conflicts (keys with literal dots), `maxScore: 0` (Blackboard edge case), missing source fields (strict vs lenient transforms).

  Cross-references:
  - `docs/specs/tenant-field-mappings.md` (full spec)
  - `docs/specs/multi-source-transforms.md` (multi-source syntax)
  - `docs/guides/pilot-integration-guide.md` §5 and §13 (existing field mapping guidance)

- **Depends on**: TASK-002
- **Verification**: All curl examples are syntactically correct; mapping JSON matches TASK-002 designs; guide references correct spec sections

---

### TASK-009: Verify end-to-end

- **Files**: none (verification only)
- **Action**: Run
- **Details**:
  Run all checks in order:

  ```bash
  # 1. Backend tests (routing.json change must not regress)
  npm test

  # 2. Backend lint + typecheck
  npm run lint
  npm run typecheck

  # 3. Start dev server
  npm run dev &

  # 4. Run seed script (full pipeline: mappings → signals → decisions)
  npm run seed:springs-demo

  # 5. Verify dashboard panels
  # Open http://localhost:3000/dashboard/ with VITE_ORG_ID=springs
  # Panel 1: Maya, Alex, Ms. Davis visible with intervene badges
  # Panel 2: Declining skills for Maya (Reading), Alex (ELA, SCI), Ms. Davis (compliance)
  # Panel 3: Sam Torres reinforce decision with Approve/Reject
  # Panel 4: Jordan Mitchell improving trajectory

  # 6. Re-run seed (idempotency check)
  npm run seed:springs-demo
  # Should show all 11 as duplicate, exit 0

  # 7. Verify field mappings persisted
  curl -sS http://localhost:3000/v1/admin/mappings/springs \
    -H "x-admin-api-key: $ADMIN_API_KEY"
  # Should return 4 mapping items
  ```

  **Bundle check**: `npm run build:dashboard` still produces < 200KB gzipped JS (no dashboard changes, but confirm).

- **Depends on**: TASK-004, TASK-005, TASK-006, TASK-007, TASK-008
- **Verification**: All commands exit 0; all 4 dashboard panels populated; re-run idempotent (11 duplicates); demo walkthrough completable in < 4 minutes

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `docs/guides/springs-pilot-demo.md` | TASK-007 | Persona narrative + demo talking points for pilot close |
| `docs/guides/onboarding-field-mappings.md` | TASK-008 | Reusable onboarding guide with 4 LMS reference mappings |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/decision/policies/springs/routing.json` | TASK-001 | Add `iready-diagnostic → learner` |
| `scripts/seed-springs-demo.mjs` | TASK-004, 005, 006 | Phase 1 mapping registration, Phase 2 real LMS payloads, Phase 3 narrative output |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| SEED-V2-001 | automated | `npm test` passes after routing.json change (no regression) | TASK-001 |
| SEED-V2-002 | manual | Phase 1: all 4 field mappings registered via admin API (200 response) | TASK-004 |
| SEED-V2-003 | manual | Phase 2: all 11 signals accepted (transform engine produces canonical fields) | TASK-005 |
| SEED-V2-004 | manual | Phase 3: all 11 decisions match expected types (advance 2, intervene 4, reinforce 5) | TASK-006 |
| SEED-V2-005 | manual | Re-run produces 11 duplicates (idempotent) | TASK-005 |
| SEED-V2-006 | manual | Dashboard Panel 1: Maya, Alex, Ms. Davis visible with intervene/urgency badges | TASK-009 |
| SEED-V2-007 | manual | Dashboard Panel 2: declining skills shown for Maya (Reading), Alex (ELA, SCI) | TASK-009 |
| SEED-V2-008 | manual | Dashboard Panel 3: Sam Torres reinforce decision with Approve/Reject | TASK-009 |
| SEED-V2-009 | manual | Dashboard Panel 4: Jordan Mitchell improving trajectory, level transition | TASK-009 |
| SEED-V2-010 | manual | Demo walkthrough completable in < 4 minutes following springs-pilot-demo.md | TASK-007 |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dot-path key names with literal dots (e.g. `com.instructure.canvas`) break `getAtPath`/`setAtPath` | High — transforms silently fail, canonical fields missing | Flatten dotted extension keys in the signal payload using underscore substitution (e.g. `com_instructure_canvas`); document this in the onboarding guide as a known pattern |
| `maxScore: 0` from Blackboard GradeEvent causes division by zero in `earned / possible` | High — transform produces `Infinity` or `NaN` | `evaluateTransform` already guards against NaN/Infinity (returns undefined, skips the transform). Blackboard signals in seed use non-zero `maxScore`. Document as a gotcha in onboarding guide. |
| `ADMIN_API_KEY` not set — Phase 1 skipped, transforms not registered, all signals produce default decisions | Medium — demo shows wrong results | Script warns loudly if admin key missing; Phase 2 checks for expected canonical fields in decision output |
| i-Ready `diagnosticGain` can be negative — expression `1 - (value + 50) / 100` must handle this | Low — `Math.max(..., 0)` clamps to 0 | Expression uses `Math.max` which is in the allowed function list |
| Transform cache TTL (300s) means mapping updates may not take effect immediately for subsequent signals | Low — seed script sends signals immediately after PUT | 300s cache with invalidation on PUT success (existing behavior). Phase 1 PUTs clear cache for those keys. |

---

## Verification Checklist

- [ ] TASK-001: routing.json updated, `npm test` passes
- [ ] TASK-002: all 4 mapping designs verified against transform grammar
- [ ] TASK-003: all 12 signal post-transform values verified against policy rules
- [ ] TASK-004: Phase 1 registers 4 mappings (admin API 200s)
- [ ] TASK-005: Phase 2 sends 11 signals (all accepted)
- [ ] TASK-006: Phase 3 narrative output matches expected decisions
- [ ] TASK-007: Demo walkthrough doc complete, follows end-to-end
- [ ] TASK-008: Onboarding guide complete with 4 LMS reference mappings
- [ ] TASK-009: All 4 dashboard panels populated with seeded data
- [ ] Re-run idempotent (11 duplicates)
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all pass
- [ ] Demo completable in < 4 minutes

---

## Implementation Order

```
TASK-001 (routing.json)
    │
TASK-002 (design mappings)
    │
    ├──→ TASK-003 (design payloads)
    │         │
    │    TASK-004 (Phase 1: mapping registration)
    │         │
    │    TASK-005 (Phase 2: realistic signals)
    │         │
    │    TASK-006 (Phase 3: narrative output)
    │         │
    ├──→ TASK-007 (demo walkthrough doc)
    │
    └──→ TASK-008 (onboarding guide doc)
              │
              ▼
         TASK-009 (e2e verify)
```

TASK-007 and TASK-008 can run in parallel with TASK-004–006 after TASK-003 completes.

---

*Plan created: 2026-04-14 | Predecessor: springs-demo-seed.plan.md (v1) | Org: springs | Sources: canvas-lms, blackboard-lms, iready-diagnostic, absorb-lms | Personas: 5 (3 learners, 1 borderline, 1 staff) | Signals: 11 | Decision types: advance 2, intervene 4, reinforce 5*
