---
name: Springs Charter Schools Demo Seed Script
overview: |
  A repeatable Node.js script (`scripts/seed-springs-demo.mjs`) that populates a running 8P3P
  server with Springs Charter Schools pilot data, demonstrating three key value propositions:
  (1) dual user-type routing — student signals via Canvas/Blackboard evaluate against the learner
  policy; staff signals via Absorb evaluate against the staff policy; (2) cross-system identity
  resolution — the same learner_reference appearing in Canvas, Blackboard, and/or Absorb
  accumulates into a single STATE record and canonical decision history; (3) org-wide
  decision history as a reliable foundation for smart IT apps. Covers 7 learner/staff
  scenarios across all 4 decision types (intervene, pause, reinforce, advance) plus one
  cross-system identity "showstopper" scenario. Requires updating springs/routing.json to
  register absorb-lms and blackboard-lms source systems.
todos:
  - id: TASK-001
    content: Update springs/routing.json to add absorb-lms + blackboard-lms source systems
    status: pending
  - id: TASK-002
    content: Design + validate all 7 signal scenarios against policy rules
    status: pending
  - id: TASK-003
    content: Create scripts/seed-springs-demo.mjs
    status: pending
  - id: TASK-004
    content: Create docs/guides/springs-demo-walkthrough.md
    status: pending
  - id: TASK-005
    content: Add seed:springs-demo npm script + verify end-to-end
    status: pending
isProject: false
---

# Springs Charter Schools Demo Seed Script

**Org**: `springs`  
**Related test**: `tests/integration/springs-pilot.test.ts`  
**Policies**: `src/decision/policies/springs/learner.json`, `staff.json`, `routing.json`

---

## Context: The Springs Use Case

Springs Charter Schools is a K-12 + workforce training organization that operates **two user populations** across **three LMS platforms**:


| User Type | Description                          | LMS(es)            | Policy            |
| --------- | ------------------------------------ | ------------------ | ----------------- |
| `learner` | Students (K-12)                      | Canvas, Blackboard | `springs:learner` |
| `staff`   | Workforce training (teachers, admin) | Absorb             | `springs:staff`   |


**The problem 8P3P solves**: A student (`stu-10042`) can have records in both Canvas (primary coursework) and Blackboard (supplemental learning). Without 8P3P, Canvas and Blackboard maintain separate, uncoordinated progress data. With 8P3P, all signals from all systems accumulate into a single `learner_reference`-keyed STATE record — giving IT one reliable decision history per person, regardless of which system sent the signal.

**The IT value prop**: Once decisions are reliable and queryable, IT can build smart apps on top — e.g., an early-warning dashboard that surfaces "intervene" decisions before a student fails, or a compliance tracker that surfaces "pause" decisions for staff with expired certifications.

---

## Prerequisites

- Server running at `http://localhost:3000` with `API_KEY` set in `.env.local`
- `springs/learner.json` and `springs/staff.json` policy files present
- `springs/routing.json` (currently maps `canvas-lms`, `internal-lms`, `hr-training`)
- TASK-001: `routing.json` updated with `absorb-lms` and `blackboard-lms`

---

## Design Decisions


| Decision                 | Choice                                       | Rationale                                                                                                                        |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| org_id                   | `springs`                                    | Matches existing integration test suite; uses real org policy files                                                              |
| Source systems           | `canvas-lms`, `blackboard-lms`, `absorb-lms` | Real names Spring IT would recognize in their systems                                                                            |
| Script format            | Standalone `.mjs` (ES module)                | Matches `seed-demo.mjs` pattern; runs with `node` directly                                                                       |
| Idempotent re-runs       | Fixed `signal_id` values per run             | Re-runs produce duplicates, not double data                                                                                      |
| Scenario count           | 7 scenarios (not all learners)               | Enough to hit all 4 decision types + cross-system demo without overwhelming panels                                               |
| Cross-system showstopper | `teacher-7890` in Canvas + Absorb            | Teacher as both course participant AND staff trainee — same canonical identity, 2 different policy evaluations per signal source |
| Fixed timestamps         | 2026-03-02T09:00:00Z through ...T09:12:00Z   | Predictable ordering in panels; clearly labeled as demo data                                                                     |


---

## Signal Scenarios

### Learner Scenarios (Canvas + Blackboard → springs:learner policy)

#### Scenario L1: `stu-10042` — Cross-System ADVANCE (identity resolution showstopper)

**Narrative**: This student is excelling. Their progress data lives in both Canvas and Blackboard — two different systems Spring uses. 8P3P merges both signals under a single canonical `learner_reference` and produces a consistent `advance` decision regardless of source.


| Signal                 | Source System    | stabilityScore | masteryScore | timeSinceReinforcement | Expected Decision                                                   |
| ---------------------- | ---------------- | -------------- | ------------ | ---------------------- | ------------------------------------------------------------------- |
| `stu-10042-canvas-001` | `canvas-lms`     | 0.87           | 0.89         | 30000                  | `advance` (rule-advance: stability ≥ 0.8 ✓, mastery ≥ 0.8 ✓)        |
| `stu-10042-bb-001`     | `blackboard-lms` | 0.91           | 0.93         | 28000                  | `advance` (same rule — state merges, both signals under one record) |


**Demo point**: GET `/v1/decisions?org_id=springs&learner_reference=stu-10042` returns 2 decisions, both `advance`, one from each LMS. Same learner, one decision history.

---

#### Scenario L2: `stu-20891` — Canvas INTERVENE

**Narrative**: This student is at serious risk. Stability is critically low and they haven't had reinforcement in 48+ hours. Policy triggers immediate intervention.


| Signal                 | Source System | stabilityScore | timeSinceReinforcement | riskSignal | Expected Decision                                                     |
| ---------------------- | ------------- | -------------- | ---------------------- | ---------- | --------------------------------------------------------------------- |
| `stu-20891-canvas-001` | `canvas-lms`  | 0.22           | 200000                 | 0.45       | `intervene` (rule-intervene: stability < 0.3 ✓, timeSince > 172800 ✓) |


---

#### Scenario L3: `stu-30456` — Blackboard REINFORCE

**Narrative**: This student is showing early warning signs — moderate stability decay with overdue reinforcement. Not yet critical, but intervention is needed.


| Signal             | Source System    | stabilityScore | timeSinceReinforcement | Expected Decision                                                     |
| ------------------ | ---------------- | -------------- | ---------------------- | --------------------------------------------------------------------- |
| `stu-30456-bb-001` | `blackboard-lms` | 0.58           | 100000                 | `reinforce` (rule-reinforce: stability < 0.65 ✓, timeSince > 86400 ✓) |


---

### Staff Scenarios (Absorb → springs:staff policy)

#### Scenario S1: `staff-0201` — Absorb INTERVENE (non-compliant, overdue)

**Narrative**: This teacher's compliance is critically low and they are 20 days past their training deadline. Immediate intervention required — likely compliance risk for the school.


| Signal                  | Source System | complianceScore | daysOverdue | certificationValid | Expected Decision                                                    |
| ----------------------- | ------------- | --------------- | ----------- | ------------------ | -------------------------------------------------------------------- |
| `staff-0201-absorb-001` | `absorb-lms`  | 0.35            | 20          | true               | `intervene` (rule-intervene: compliance < 0.5 ✓, daysOverdue > 14 ✓) |


---

#### Scenario S2: `staff-0302` — Absorb PAUSE (expired certification)

**Narrative**: Certification expired. Per policy, the system pauses this staff member's training pathway until certification is renewed — regardless of compliance score. This maps to a real-world compliance gate.


| Signal                  | Source System | complianceScore | daysOverdue | certificationValid | Expected Decision                                   |
| ----------------------- | ------------- | --------------- | ----------- | ------------------ | --------------------------------------------------- |
| `staff-0302-absorb-001` | `absorb-lms`  | 0.70            | 0           | false              | `pause` (rule-pause: certificationValid == false ✓) |


---

#### Scenario S3: `staff-0403` — Absorb ADVANCE (fully compliant)

**Narrative**: Model staff member. High compliance, strong training scores, zero days overdue. 8P3P recognizes completion and recommends advancement to next training level.


| Signal                  | Source System | complianceScore | trainingScore | daysOverdue | certificationValid | Expected Decision                                                                   |
| ----------------------- | ------------- | --------------- | ------------- | ----------- | ------------------ | ----------------------------------------------------------------------------------- |
| `staff-0403-absorb-001` | `absorb-lms`  | 0.92            | 0.88          | 0           | true               | `advance` (rule-advance: compliance ≥ 0.9 ✓, training ≥ 0.85 ✓, daysOverdue == 0 ✓) |


---

### Cross-System Identity Scenario (The Showstopper)

#### Scenario X1: `teacher-7890` — Canvas (learner) + Absorb (staff)

**Narrative**: This teacher participates in a Canvas professional development course (evaluated as a learner) AND is enrolled in mandatory compliance training on Absorb (evaluated as staff). They are the same person — `teacher-7890` — but interacting with two different systems. 8P3P uses the same `learner_reference` in both cases and applies the correct policy per signal source.

**This demonstrates the core IT value proposition**: IT doesn't need to build a cross-system identity resolution layer. 8P3P does it automatically via the `learner_reference` canonical key.


| Signal                    | Source System | Payload                                                                              | Policy            | Expected Decision                                                     |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------- |
| `teacher-7890-canvas-001` | `canvas-lms`  | stabilityScore: 0.48, timeSinceReinforcement: 95000                                  | `springs:learner` | `reinforce` (rule-reinforce: stability < 0.65 ✓, timeSince > 86400 ✓) |
| `teacher-7890-absorb-001` | `absorb-lms`  | complianceScore: 0.72, trainingScore: 0.60, daysOverdue: 3, certificationValid: true | `springs:staff`   | `reinforce` (rule-reinforce: trainingScore < 0.7 ✓)                   |


**Demo point**:

- GET `/v1/decisions?org_id=springs&learner_reference=teacher-7890` returns **2 decisions**
- `teacher-7890-canvas-001` decision: `trace.policy_version` from `springs:learner`, `state_snapshot` has `stabilityScore`
- `teacher-7890-absorb-001` decision: `trace.policy_version` from `springs:staff`, `state_snapshot` has `complianceScore`
- Both are canonical decisions for `teacher-7890` — one person, one decision history, two policy evaluations

---

## Policy Rule Verification

All payload values verified against policy files before being committed to the script.

### Learner policy (`springs:learner`) — rule priority order


| Rule           | Condition                                                                              | Threshold                             |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| rule-intervene | stabilityScore < 0.3 **AND** timeSinceReinforcement > 172800                           | 48h threshold                         |
| rule-pause     | stabilityScore < 0.3 **AND** timeSinceReinforcement ≤ 172800 **AND** riskSignal > 0.75 | Only when stable enough but high-risk |
| rule-advance   | stabilityScore ≥ 0.8 **AND** masteryScore ≥ 0.8                                        | High performers                       |
| rule-reinforce | stabilityScore < 0.65 **AND** timeSinceReinforcement > 86400                           | Early warning, 24h threshold          |


### Staff policy (`springs:staff`) — rule priority order


| Rule           | Condition                                                                   | Threshold             |
| -------------- | --------------------------------------------------------------------------- | --------------------- |
| rule-intervene | complianceScore < 0.5 **AND** daysOverdue > 14                              | 2+ weeks overdue      |
| rule-pause     | certificationValid == false                                                 | Cert gate — hard stop |
| rule-advance   | complianceScore ≥ 0.9 **AND** trainingScore ≥ 0.85 **AND** daysOverdue == 0 | Model compliance      |
| rule-reinforce | (complianceScore < 0.8 **AND** daysOverdue > 0) OR trainingScore < 0.7      | Gap indicators        |


---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift.

---

### TASK-001: Update springs/routing.json

- **Files**: `src/decision/policies/springs/routing.json` *(modify)*
- **Action**: Modify
- **Details**:
Add `absorb-lms` (→ `staff`) and `blackboard-lms` (→ `learner`) to the `source_system_map`:

```json
  {
    "source_system_map": {
      "canvas-lms": "learner",
      "blackboard-lms": "learner",
      "internal-lms": "learner",
      "absorb-lms": "staff",
      "hr-training": "staff"
    },
    "default_policy_key": "learner"
  }
  

```

- `blackboard-lms` → `learner`: Blackboard is used for student coursework at Springs
- `absorb-lms` → `staff`: Absorb is the workforce/compliance training platform for Springs staff
- `hr-training` retained for backward compatibility with existing integration tests
- **Depends on**: none
- **Verification**: `npm test` (springs-pilot.test.ts) still passes; no regressions to existing `canvas-lms`/`hr-training` routing

---

### TASK-002: Design + Validate Signal Payloads

- **Files**: none (design task — scenarios documented above)
- **Action**: Verify
- **Details**:
Walk through each scenario against policy rule priority order and confirm no inadvertent earlier-rule matches:
  - **stu-10042 (Canvas)**: stability 0.87 — skips rule-intervene (0.87 ≥ 0.3), skips rule-pause (0.87 ≥ 0.3), matches rule-advance (0.87 ≥ 0.8 AND mastery 0.89 ≥ 0.8) ✓
  - **stu-10042 (Blackboard)**: stability 0.91 — same path → advance ✓
  - **stu-20891**: stability 0.22 < 0.3 AND timeSince 200000 > 172800 → rule-intervene ✓
  - **stu-30456**: stability 0.58 — skips intervene (0.58 ≥ 0.3), skips pause (0.58 ≥ 0.3), skips advance (0.58 < 0.8), matches reinforce (0.58 < 0.65 AND timeSince 100000 > 86400) ✓
  - **staff-0201**: compliance 0.35 < 0.5 AND daysOverdue 20 > 14 → rule-intervene ✓
  - **staff-0302**: certificationValid false → rule-pause ✓ (note: rule-intervene not triggered — compliance 0.70 ≥ 0.5; but rule-pause fires before rule-advance)
  - **staff-0403**: no intervene (compliance 0.92 ≥ 0.5), no pause (cert valid), matches advance (0.92 ≥ 0.9 AND training 0.88 ≥ 0.85 AND daysOverdue == 0) ✓
  - **teacher-7890 (Canvas)**: stability 0.48 — skips intervene/pause, skips advance (mastery not set → undefined, < 0.8), matches reinforce (0.48 < 0.65 AND timeSince 95000 > 86400) ✓
  - **teacher-7890 (Absorb)**: no intervene (compliance 0.72 ≥ 0.5), no pause (cert valid), no advance (training 0.60 < 0.85), matches reinforce (trainingScore 0.60 < 0.7) ✓
- **Depends on**: TASK-001
- **Verification**: All 9 expected decisions match policy rules on paper

---

### TASK-003: Create scripts/seed-springs-demo.mjs

- **Files**: `scripts/seed-springs-demo.mjs` *(create)*
- **Action**: Create
- **Details**:
Same structure as `scripts/seed-demo.mjs` — ES module, CLI args, fetch-based, idempotent:
  - CLI: `--host` (default `http://localhost:3000`), `--api-key` (default `API_KEY` env), `--org` (default `springs`)
  - Fixed timestamps (2026-03-02T09:00:00Z through T09:12:00Z, 2min apart)
  - Signal array: 9 signals in order (L1a, L1b, L2, L3, S1, S2, S3, X1a, X1b)
  - Output: per-signal result line (`✓`/`✗`/`○`) + expected vs actual
  - Summary block with:
    - Counts by decision type (advance, intervene, pause, reinforce)
    - Cross-system identity note: "teacher-7890 appears in Canvas + Absorb → 2 decisions, 1 learner"
    - Panel URL: `${base}/inspect/`
  - Error handling: ECONNREFUSED, 401, malformed response
  - Idempotency: all `signal_id` values are fixed strings — re-runs produce `duplicate` outcomes
  Signal ID scheme:

```
  stu-10042-canvas-001     stu-10042-bb-001
  stu-20891-canvas-001     stu-30456-bb-001
  staff-0201-absorb-001    staff-0302-absorb-001    staff-0403-absorb-001
  teacher-7890-canvas-001  teacher-7890-absorb-001
  

```

- **Depends on**: TASK-001, TASK-002
- **Verification**: `node scripts/seed-springs-demo.mjs` completes with 0 exit code; all 9 outcomes match expected; no unexpected rejections

---

### TASK-004: Create docs/guides/springs-demo-walkthrough.md

- **Files**: `docs/guides/springs-demo-walkthrough.md` *(create)*
- **Action**: Create
- **Details**:
Structured as a 3-minute demo script targeting a Springs IT director or CTO audience.
**Narrative arc** — "One school, two populations, three LMS systems, one decision record per person":
  1. **Setup** (30s): Run `npm run seed:springs-demo`. Show clean output — 9 signals, all outcomes match.
  2. **Panel 1 — Signal Intake** (30s): Enter org_id `springs`. Show signals from `canvas-lms`, `blackboard-lms`, `absorb-lms` — all accepted. Point out: "Signals arrive from your three LMS platforms. 8P3P sees all of them."
  3. **Panel 2 — State Viewer** (30s): Select `stu-10042`. Show state record — both Canvas and Blackboard signals contributed. State has fields from both signals merged. "One state record for this student, regardless of which LMS sent the data. This is the single source of truth."
  4. **Panel 3 — Decision Stream** (45s): Filter by `springs`. Show advance decisions for `stu-10042` (from both LMS sources). Show intervene for `stu-20891`. Show pause for `staff-0302`. "Every decision is logged with which rule fired and why. IT can query this programmatically."
  5. **Panel 4 — Decision Trace — The showstopper** (45s): Click `teacher-7890`'s Canvas decision (reinforce). Show `state_snapshot` has `stabilityScore`. Then click their Absorb decision (also reinforce). Show `state_snapshot` has `complianceScore`. "Same person, one decision history, two different policies applied correctly per source system. No custom integration needed."
  **Talking points per panel** (2-3 sentences each, IT-director-level):
  - Panel 1: "Your LMS systems send signals — we ingest all of them. No polling, no ETL, no duplicate detection logic on your side."
  - Panel 2: "State accumulates across all signals for a given learner reference. You define the canonical identifier — we keep it consistent."
  - Panel 3: "Every decision is a queryable record. Build your early-warning dashboard on top of this API — you'll never have to re-derive who needs help."
  - Panel 4: "Policy is tenant-specific and per user type. Students and staff get evaluated on the fields that matter for them — but the decision history lives in one place."
  Total demo time target: 3 minutes with narration, 90 seconds fast-paced.
- **Depends on**: TASK-002
- **Verification**: Can be followed end-to-end against seeded data; reaches `teacher-7890` dual-decision demo point without dead ends

---

### TASK-005: Add npm Script + Verify End-to-End

- **Files**: `package.json` *(modify)*
- **Action**: Modify
- **Details**:
Add `"seed:springs-demo": "node scripts/seed-springs-demo.mjs"` to `scripts` in `package.json`.
End-to-end verification checklist:
  - `npm run dev` running (background)
  - `npm run seed:springs-demo` exits 0, all 9 expected outcomes match
  - Panel 1: 9+ rows showing signals from `canvas-lms`, `blackboard-lms`, `absorb-lms`
  - Panel 2: `stu-10042` state record shows merged data from 2 LMS sources
  - Panel 2: `teacher-7890` state record shows both `stabilityScore` (from Canvas) and `complianceScore` (from Absorb)
  - Panel 3: Decisions include `advance` (stu-10042, staff-0403), `intervene` (stu-20891, staff-0201), `pause` (staff-0302), `reinforce` (stu-30456, teacher-7890 x2)
  - Panel 4: `teacher-7890` shows 2 decisions with different `policy_id` values in trace — `springs:learner` and `springs:staff`
  - Re-run produces 9 duplicates (idempotent)
- **Depends on**: TASK-003, TASK-004
- **Verification**: All checklist items pass; walkthrough can be completed in < 3 minutes

---

## Files Summary

### To Create


| File                                      | Task     | Purpose                                                               |
| ----------------------------------------- | -------- | --------------------------------------------------------------------- |
| `scripts/seed-springs-demo.mjs`           | TASK-003 | Springs-specific seed script (9 signals, 3 LMS sources, 2 user types) |
| `docs/guides/springs-demo-walkthrough.md` | TASK-004 | IT-director demo script (~3 min)                                      |


### To Modify


| File                                         | Task     | Changes                                                 |
| -------------------------------------------- | -------- | ------------------------------------------------------- |
| `src/decision/policies/springs/routing.json` | TASK-001 | Add `absorb-lms → staff` and `blackboard-lms → learner` |
| `package.json`                               | TASK-005 | Add `seed:springs-demo` npm script                      |


---

## Test Plan


| Test ID          | Type   | Description                                                                                    | Task     |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------- | -------- |
| SPRINGS-SEED-001 | manual | Script runs without error; 9/9 outcomes match expected                                         | TASK-003 |
| SPRINGS-SEED-002 | manual | Re-run produces 9 duplicates (idempotent)                                                      | TASK-003 |
| SPRINGS-SEED-003 | manual | Panel 2 shows `stu-10042` state with merged Canvas + Blackboard data                           | TASK-005 |
| SPRINGS-SEED-004 | manual | Panel 3 shows both `springs:learner` and `springs:staff` policy decisions                      | TASK-005 |
| SPRINGS-SEED-005 | manual | Panel 4: `teacher-7890` has 2 decisions — `springs:learner` trace and `springs:staff` trace    | TASK-005 |
| SPRINGS-SEED-006 | manual | `npm test` still passes (routing.json change doesn't break existing springs integration tests) | TASK-001 |
| SPRINGS-SEED-007 | manual | Demo walkthrough completes in < 3 minutes from Panel 1 → Panel 4                               | TASK-004 |


---

## Risks


| Risk                                                                                                                                                                                                                                                   | Impact                                                       | Mitigation                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `teacher-7890` Canvas signal: `masteryScore` not set — learner policy `rule-advance` requires `masteryScore ≥ 0.8`. If state accumulates mastery from a previous signal (e.g. stu-10042's data leaks across learners), advance could fire unexpectedly | Low — state is org+learner scoped; no cross-learner bleed    | Payloads are deterministic and scoped; verify state isolation in TASK-002                          |
| `routing.json` change adds new source systems — existing springs-pilot.test.ts uses `canvas-lms`, `internal-lms`, `hr-training`                                                                                                                        | Low — additions only, no removals                            | Run `npm test` after TASK-001; no existing routes removed                                          |
| Policy default (`reinforce`) fires for teacher-7890 Canvas signal if `timeSinceReinforcement` is not in payload                                                                                                                                        | Medium — default would fire instead of rule-reinforce        | Payload explicitly includes `timeSinceReinforcement: 95000 > 86400`; confirmed in TASK-002         |
| `staff-0302` pause check: rule-pause fires on `certificationValid == false`, but JSON `false` must match policy `eq` operator                                                                                                                          | Medium — depends on policy engine handling boolean equality  | Existing test `SPRINGS-002` already verifies this case with `certificationValid: false` → pause    |
| API_KEY_ORG_ID might override `org_id: "springs"` to the key's bound org                                                                                                                                                                               | Low — only relevant if `.env.local` has `API_KEY_ORG_ID` set | If `API_KEY_ORG_ID` is set, it overrides the payload org; the script documents this with a warning |


---

## Verification Checklist

- All tasks completed
- `npm run seed:springs-demo` exits 0
- Re-run produces only duplicates (idempotent)
- `npm test` passes (no regression to springs-pilot.test.ts)
- All 4 panels render Springs data correctly
- `teacher-7890` shows 2 decisions — one per source system — with different `policy_id` in trace
- Demo walkthrough completes in < 3 minutes

---

## Implementation Order

```
TASK-001 (update routing.json)
    │
TASK-002 (validate payloads against rules)
    │
    ├──→ TASK-003 (seed-springs-demo.mjs)
    │         │
    └──→ TASK-004 (walkthrough doc)
              │
              ▼
         TASK-005 (npm script + e2e verify)
```

TASK-003 (script) and TASK-004 (walkthrough) can run in parallel after TASK-002.

---

*Plan created: 2026-03-01 | Org: springs | LMS sources: canvas-lms, blackboard-lms, absorb-lms | User types: learner, staff*