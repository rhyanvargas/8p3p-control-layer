---
name: Literacy Pilot Foundation
overview: |
  Make the control layer pilot-deployable for any literacy-focused customer in <1 hour by shipping a literacy-optimized default policy, a registerable field-mapping template, a parameterized 4-scenario demo seed, and two small spec deltas (per-decision-type `window_days`, `wrong_decision_type` feedback reason). Engine, ingestion, STATE, and decision contracts are unchanged. Springs-specific artifacts move to `examples/` to enforce customer-agnosticism. Acceptance test: `seed-literacy-demo.mjs --org-id <new-org>` reproduces the four CEO scenarios (Jordan/Maya/Elijah/Sofia) from `internal-docs/9th Grade Literacy Pilot.pdf` against any onboarded org.
  
  **Lifecycle stage:** v1.1 Pilot Wave 2 / Pre-Month 0.
  
  **Source doc (CEO):** `internal-docs/9th Grade Literacy Pilot.pdf` (the pilot doc is the acceptance test; literal scenarios in §Spec Literals).
  
  **Sibling specs touched:** `docs/specs/decision-engine.md` (new default policy file only — schema unchanged), `docs/specs/tenant-field-mappings.md` (template artifact, not spec change), `docs/specs/decision-outcomes.md` (TASK-006: per-type `window_days`), `docs/specs/educator-feedback-api.md` (TASK-007: `wrong_decision_type` reason + optional `suggested_decision_type`).
  
  **Out of scope (per CEO decisions, team call 2026-05-14):**
  - `recommended_action` field on Decision or PolicyDefinition — dropped (GenAI use case; deterministic-first principle)
  - `educator_view` schema enrichment on Decision — separate PR (PR 1) after this lands
  - Panel renames — separate PR (PR 2) after this lands
  - "Adjust" educator action — deferred; data-capture only via `wrong_decision_type` (Q4)
todos:
  - id: "TASK-001"
    content: "Replace src/decision/policies/default.json with literacy ruleset (7 skill IDs, 4 decision types)"
    status: "completed"
  - id: "TASK-002"
    content: "Create docs/templates/literacy-field-mappings.json — canonical per-source-system literacy mappings"
    status: "completed"
  - id: "TASK-003"
    content: "Create scripts/apply-template.mjs — registers a template against any --org-id via admin API"
    status: "completed"
  - id: "TASK-004"
    content: "Create scripts/seed-literacy-demo.mjs — parameterized 4-scenario seed (Jordan/Maya/Elijah/Sofia)"
    status: "completed"
  - id: "TASK-005"
    content: "Move src/decision/policies/springs/* + scripts/seed-springs-demo.mjs to examples/springs/ with README"
    status: "completed"
  - id: "TASK-006"
    content: "Spec delta — per-decision-type window_days defaults in docs/specs/decision-outcomes.md (Q3)"
    status: "completed"
  - id: "TASK-007"
    content: "Spec delta — wrong_decision_type reason + optional suggested_decision_type in docs/specs/educator-feedback-api.md (Q4)"
    status: "completed"
  - id: "TASK-008"
    content: "Doc updates — roadmap row, architecture mention, docs/specs/README, package.json scripts"
    status: "completed"
  - id: "TASK-009"
    content: "Acceptance test — seed against fresh org reproduces 4 CEO scenario decision types"
    status: "completed"
  - id: "TASK-010"
    content: "Policy validation — loadPolicy() + DEC-008-style sweep covering literacy field paths"
    status: "completed"
isProject: false
---

# Literacy Pilot Foundation

**Source doc (CEO):** `internal-docs/9th Grade Literacy Pilot.pdf` (treated as the acceptance test for this plan).  
**Team call alignment:** 2026-05-14 — CEO confirmed customer-agnostic scope, dropped `recommended_action`, accepted Q3/Q4 recommendations from prior review.

This is **not** a `/plan-impl` over a single spec. It is a configuration + small spec-delta plan that pins the *literal* CEO scenarios to runnable artifacts so any pilot org can be onboarded with `apply-template literacy && seed-literacy-demo --org-id <id>` and produce the four scenario cards on `/dashboard`.

---

## Spec Literals

> Verbatim copies from `internal-docs/9th Grade Literacy Pilot.pdf` and the existing engine specs that govern this work. TASK details MUST quote these blocks rather than paraphrase.

### From pilot doc § Literacy Skills the System Must Track (lines 49–65)

| Literacy Skill | Plain Meaning |
|---|---|
| Reading Comprehension | Can the student understand what the text means? |
| Main Idea / Central Claim | Can the student identify the point of the passage? |
| Text Evidence | Can the student support answers with evidence from the text? |
| Written Response | Can the student explain their thinking clearly in writing? |
| Academic Vocabulary | Can the student understand school-specific and subject-specific words? |
| Reading Stamina | Can the student stay with longer or more complex text? |
| Cross-Subject Literacy | Can the student apply reading and writing skills in English, science, and history? |

### From pilot doc § Minimum Literacy Skill IDs (lines 394–406)

| Skill ID | Meaning |
|---|---|
| `main_idea` | Student can identify the main idea or central claim |
| `text_evidence` | Student can support answers using evidence |
| `written_response` | Student can explain thinking clearly in writing |
| `academic_vocabulary` | Student understands school and subject-specific words |
| `reading_stamina` | Student can sustain comprehension through longer text |
| `basic_comprehension` | Student understands what the text says |
| `cross_subject_literacy` | Student applies literacy skills across subjects |

### From pilot doc § Decision Terms (lines 124–130)

| Decision | Meaning |
|---|---|
| Advance | The student is ready to move forward |
| Reinforce | The student needs more practice so the learning sticks |
| Intervene | The student needs stronger support now |
| Pause | Possible learning decay detected; watch closely before moving forward |

### From pilot doc § Scenarios (lines 133–373) — expected decision per scenario

| Scenario | Learner | Primary Skill(s) | Expected `decision_type` | Recheck cadence (doc literal) |
|---|---|---|---|---|
| 1 — Hidden literacy risk | Jordan | `text_evidence` + `written_response` | `reinforce` | "Recheck in 10 school days" (line 177) |
| 2 — Reading stamina decay | Maya | `reading_stamina` | `pause` | "Recheck after two weeks" (line 243) |
| 3 — Cross-subject vocabulary | Elijah | `academic_vocabulary` + `cross_subject_literacy` | `intervene` | "Progress monitor weekly" (line 313) |
| 4 — Ready to advance | Sofia | `text_evidence` + `written_response` (strong) | `advance` | n/a |

### From pilot doc § Example Data Flow for Jordan (lines 408–425)

```json
{
  "event_type": "assignment_score",
  "student_id": "S-10092",
  "course_id": "ENG1",
  "assignment_name": "Evidence-Based Response #2",
  "score": 56,
  "max_score": 100,
  "skill_id": "text_evidence",
  "secondary_skill_id": "written_response",
  "timestamp": "2026-10-03"
}
```

> **Note for TASK-002 / TASK-004:** the doc's "Raw Event" wire format is illustrative, not normative. The control layer's normative wire format is `SignalEnvelope` (see `docs/specs/signal-ingestion.md`). The literacy field-mapping template translates source-system payloads into this envelope.

### From `docs/specs/decision-engine.md` § 4.5 — Decision Types (Closed Set)

```
DECISION_TYPES = ['reinforce', 'advance', 'intervene', 'pause']
```

Locked per ISS-DGE-001. **No additions allowed by this plan.**

### From `docs/specs/decision-engine.md` § Policy Routing (lines 786–820)

Resolution order (first file found wins):

```
src/decision/policies/{orgId}/{policyKey}.json
src/decision/policies/{orgId}/default.json
src/decision/policies/default.json
```

> **Plan rationale:** TASK-001 places literacy at the **last fallback** so every onboarded org inherits it without per-org file creation. Org-specific overrides remain available but are not required for the pilot.

### From `docs/specs/decision-outcomes.md` § Endpoints (lines 50–55)

> Current spec: `window_days` query param, default `21`, max `180`.  
> **TASK-006 delta:** make the *default* a per-decision-type lookup; the query param continues to override.

### From `docs/specs/educator-feedback-api.md` § Data Model — `reason_category` closed set

> `reject` action allowed values: `not_at_risk`, `wrong_skill`, `wrong_timing`, `data_stale`, `other`.  
> **TASK-007 delta:** add `wrong_decision_type` to this set + new optional body field `suggested_decision_type` (closed-set enum, valid only when `reason_category == "wrong_decision_type"`).

---

## Prerequisites

- [ ] `PREREQ-001` Land or stash the 17 files currently uncommitted in `git status` (`.cursor/plans/{ci-cd-pipeline,decision-outcomes,educator-feedback-api,pilot-research-export}.plan.md`, `docs/specs/{aws-deployment,dashboard-passphrase-gate,decision-outcomes,educator-feedback-api,pilot-research-export,signal-ingestion}.md`, etc.). Otherwise this plan will collide on `roadmap.md`, `docs/specs/README.md`, and the SBIR Wave 3 plans.
- [ ] `PREREQ-002` Confirm with CEO/product the four scenarios in `internal-docs/9th Grade Literacy Pilot.pdf` are the canonical pilot acceptance test (no edits expected). If edits land, refresh the §Spec Literals tables above first.

---

## Tasks

### TASK-001: Literacy default policy

- **Files:** `src/decision/policies/default.json` (replace), `src/decision/policies/default.legacy-1.0.0.json` (copy-aside backup of current generic 4-rule policy)
- **Action:** Modify (replace) + Create (backup)
- **Details:** Replace the generic policy at `src/decision/policies/default.json` with a literacy ruleset using **dot-path conditions** (per `skill-level-tracking.md` Change 1) over the 7 skill IDs from §Spec Literals. Rules are priority-ordered (first match wins) and tuned to fire one of the four CEO scenarios:

  ```json
  {
    "policy_id": "default",
    "policy_version": "2.0.0",
    "description": "Literacy-optimized default policy (replaces generic 1.0.0). Evaluates skill-tagged literacy signals against the 4 decision types from decision-engine.md §4.5. Priority-ordered; first match wins. No-match emits nothing per decision-engine.md §No-match emits nothing.",
    "rules": [
      {
        "rule_id": "rule-intervene-cross-subject",
        "condition": {
          "any": [
            { "all": [
              { "field": "skills.academic_vocabulary.stabilityScore", "operator": "lt", "value": 0.5 },
              { "field": "skills.cross_subject_literacy.stabilityScore", "operator": "lt", "value": 0.5 }
            ]},
            { "all": [
              { "field": "skills.academic_vocabulary.stabilityScore", "operator": "lt", "value": 0.5 },
              { "field": "skills.academic_vocabulary.stabilityScore_direction", "operator": "eq", "value": "declining" }
            ]}
          ]
        },
        "decision_type": "intervene"
      },
      {
        "rule_id": "rule-pause-reading-stamina",
        "condition": {
          "all": [
            { "field": "skills.reading_stamina.stabilityScore", "operator": "lt", "value": 0.7 },
            { "field": "skills.reading_stamina.stabilityScore_direction", "operator": "eq", "value": "declining" }
          ]
        },
        "decision_type": "pause"
      },
      {
        "rule_id": "rule-reinforce-text-evidence",
        "condition": {
          "any": [
            { "all": [
              { "field": "skills.text_evidence.stabilityScore", "operator": "lt", "value": 0.7 },
              { "field": "skills.text_evidence.stabilityScore_direction", "operator": "eq", "value": "declining" }
            ]},
            { "all": [
              { "field": "skills.written_response.stabilityScore", "operator": "lt", "value": 0.7 },
              { "field": "skills.written_response.stabilityScore_direction", "operator": "eq", "value": "declining" }
            ]}
          ]
        },
        "decision_type": "reinforce"
      },
      {
        "rule_id": "rule-advance-strong-literacy",
        "condition": {
          "all": [
            { "field": "skills.text_evidence.masteryScore", "operator": "gte", "value": 0.85 },
            { "field": "skills.written_response.masteryScore", "operator": "gte", "value": 0.80 },
            { "field": "skills.basic_comprehension.stabilityScore", "operator": "gte", "value": 0.75 }
          ]
        },
        "decision_type": "advance"
      }
    ]
  }
  ```

  Backup the current generic policy as `src/decision/policies/default.legacy-1.0.0.json` (git-tracked reference; orgs needing the old 4-rule generic policy can copy it to `policies/{orgId}/default.json`). The JSON block above is **illustrative** — compound conditions and thresholds MUST pass TASK-010 `LIT-001..006` against `evaluateState()` before merge (tune until Jordan/Maya/Elijah/Sofia vectors fire the correct `matched_rule_id`). Engine `PolicyDefinition` schema is **unchanged** — this is a content swap only.
- **Depends on:** `PREREQ-001`
- **Verification:**
  - `npm run validate:schemas` passes (Ajv against `src/contracts/schemas/policy.json` if present)
  - `loadPolicy()` succeeds at server startup with no `invalid_policy_version` or `policy_not_found`
  - All 4 rule IDs and 4 decision types are members of the closed set per `decision-engine.md` §4.5

### TASK-002: Literacy field-mappings template

- **Files:** `docs/templates/literacy-field-mappings.json` (new)
- **Action:** Create
- **Details:** Single JSON file containing per-source-system `TenantPayloadMapping` blocks (matching the shape consumed by `src/routes/admin-field-mappings.ts` PUT `/v1/admin/mappings/:org_id/:source_system`). Cover the source-system *types* the pilot doc names (line 73–86): gradebook (Canvas/Blackboard/Schoology examples), benchmark/diagnostic (i-Ready/MAP/STAR examples), teacher-observation (free-form CSV import via `direct-csv` source), attendance (Aeries/PowerSchool examples).

  Each block must produce nested `payload.skills.<literacy-skill-id>.{masteryScore, stabilityScore}` so the literacy policy in TASK-001 evaluates correctly. Use `multi-source-transforms.md` syntax (`score / max`) for normalization.

  File shape:
  ```json
  {
    "template_id": "literacy",
    "template_version": "1.0.0",
    "description": "Literacy field mappings keyed by source_system. Apply via scripts/apply-template.mjs --org-id <id> --template literacy.",
    "mappings": {
      "canvas-lms": { "aliases": {...}, "transforms": [...], "types": {...} },
      "blackboard-lms": { ... },
      "iready-diagnostic": { ... },
      "direct-csv": { ... }
    }
  }
  ```
- **Depends on:** `TASK-001` (must agree on skill ID strings)
- **Verification:**
  - `validateTransformExpression()` (from `src/config/transform-expression.ts`) succeeds for every transform
  - Manual: signal envelope produced by each mapping renders nested `payload.skills.text_evidence.*` etc. — readable by `getAtPath()` in `policy-loader.ts`

### TASK-003: Generic template applier script

- **Files:** `scripts/apply-template.mjs` (new)
- **Action:** Create
- **Details:** Node script that:
  1. Parses CLI args: `--org-id <id>` (required), `--template <name>` (required, e.g. `literacy`), `--host <url>` (default `http://localhost:3000`), `--admin-key <key>` (or `ADMIN_API_KEY` env)
  2. Reads `docs/templates/{template}-field-mappings.json`
  3. For each `mappings.{source_system}` entry, issues `PUT /v1/admin/mappings/:org_id/:source_system` with the block as body and `x-admin-api-key` header
  4. Reports per-source-system success/failure with HTTP status
  5. Exits non-zero on any non-2xx response

  Pattern matches existing `seed-springs-demo.mjs` Phase 1 (lines 31–156 of that file) — extract that block into a reusable function. **Do not duplicate** the inline FIELD_MAPPINGS object.
- **Depends on:** `TASK-002`
- **Verification:**
  - `node scripts/apply-template.mjs --org-id test-acme --template literacy` against a running local server returns 0 with N green lines
  - `GET /v1/admin/mappings/test-acme` (existing route) returns the template's mappings

### TASK-004: Parameterized literacy demo seed

- **Files:** `scripts/seed-literacy-demo.mjs` (new)
- **Action:** Create
- **Details:** Parameterized seed reproducing the **four CEO scenarios verbatim**. CLI:
  ```
  node scripts/seed-literacy-demo.mjs \
    --org-id <id> \
    [--host URL] [--api-key KEY]
  ```

  Workflow:
  1. (No template apply — that's TASK-003's job; this script *assumes* the literacy template is already registered)
  2. Send 6–8 signals encoding the four scenarios:
     - **Jordan** (`stu-jordan-001`): two `text_evidence` signals showing 0.74 → 0.58 decline + one `written_response` signal at ~0.55 → expect `reinforce`
     - **Maya** (`stu-maya-001`): one `reading_stamina` signal short-passage (mastery 0.86) then one long-passage (mastery 0.64) → declining direction triggers `pause`
     - **Elijah** (`stu-elijah-001`): one `academic_vocabulary` signal from `course_id: ENG1` at 0.45 + one from `course_id: BIO1` at 0.40, plus a `cross_subject_literacy` synthetic at 0.42 → expect `intervene`
     - **Sofia** (`stu-sofia-001`): three signals — `text_evidence` at 0.91, `written_response` at 0.85, `basic_comprehension` at 0.80 → expect `advance`
  3. After each persona, GET `/v1/decisions?learner_reference=...` and assert `decision_type` matches expectation; emit clear pass/fail per persona
  4. Print final narrative summary mirroring the pilot doc's scenario titles
- **Depends on:** `TASK-001`, `TASK-002`, `TASK-003`
- **Verification:**
  - `node scripts/seed-literacy-demo.mjs --org-id test-acme` prints 4 pass lines (Jordan/Maya/Elijah/Sofia)
  - Open `/dashboard` (Springs API key replaced with `test-acme`'s) — all four learner cards present in Panels 1–4

### TASK-005: Move Springs-specific artifacts to examples/

- **Files:**
  - `src/decision/policies/springs/` → `examples/springs/policies/` (3 files: `routing.json`, `learner.json`, `staff.json`)
  - `scripts/seed-springs-demo.mjs` → `examples/springs/seed-springs-demo.mjs`
  - `examples/springs/README.md` (new — one paragraph + pointer to `seed-literacy-demo.mjs`)
  - `package.json` (modify: drop `seed:springs-demo` script or repoint to `examples/`)
- **Action:** Move + Create + Modify
- **Details:** Springs is now **a reference customer config**, not a default. Per the `internal-docs/foundation/api-naming-conventions.md` durability rule applied to artifacts: customer-named directories don't belong in `src/`. Update any cross-references in `docs/guides/springs-pilot-demo.md` to point at `examples/springs/`.
  - **Important:** the policy resolver in `policy-loader.ts` reads from `src/decision/policies/{orgId}/`. Moving Springs files breaks the springs org's resolution **only if Springs is still a live tenant**. If Springs is still active, leave `src/decision/policies/springs/` in place AND add the README/seed under `examples/springs/` pointing at it; if not, do the full move.
- **Depends on:** `TASK-004` (so the parameterized seed is the recommended replacement before Springs files are moved)
- **Verification:**
  - `rg -l "src/decision/policies/springs" src docs internal-docs` finds zero references after the move (or only documentation-style references that explain why it exists)
  - `npm run seed:springs-demo` either no-ops with a "moved to examples/" message or runs successfully from the new location

### TASK-006: Per-decision-type `window_days` defaults (Q3 spec delta)

- **Files:** `docs/specs/decision-outcomes.md` (modify)
- **Action:** Modify
- **Details:** Add a new subsection §"Recheck cadence" under §Endpoints. Define the per-type lookup table (literal values from §Spec Literals above):

  ```
  DEFAULT_WINDOW_DAYS_BY_TYPE = {
    intervene: 10,
    pause:     14,
    reinforce: 14,
    advance:   21
  }
  ```

  Update §Endpoints prose: `GET /v1/decisions/:decision_id/outcome` `window_days` query param now defaults to `DEFAULT_WINDOW_DAYS_BY_TYPE[decision.decision_type]` instead of a hardcoded `21`. Explicit `?window_days=N` continues to override (max 180). For `GET /v1/outcomes`, the per-row default applies per row.

  Add a `recheck_due_at` derived field to the outcome response: `decided_at + window_days(decision_type)`. Add `recheck_overdue: boolean` (`true` when `now > recheck_due_at && outcome == "pending"`).

  **Update the corresponding `.cursor/plans/decision-outcomes.plan.md`** TASK-003 (computeOutcome) to consume the new defaults, and TASK-009 (OpenAPI) to add the two new response fields. Both are uncommitted today — fold these edits in before that plan's PR lands.
- **Depends on:** `PREREQ-001` (because `decision-outcomes.plan.md` is uncommitted)
- **Verification:**
  - `/review --spec docs/specs/decision-outcomes.md` flags zero literal drift between spec and plan
  - `docs/api/openapi.yaml` (when `decision-outcomes` plan implements TASK-009) includes `recheck_due_at` and `recheck_overdue`

### TASK-007: `wrong_decision_type` reason + `suggested_decision_type` field (Q4 spec delta)

- **Files:** `docs/specs/educator-feedback-api.md` (modify), `.cursor/plans/educator-feedback-api.plan.md` (modify — uncommitted today)
- **Action:** Modify
- **Details:** In the spec's §Data Model §`reason_category` closed set table, add `wrong_decision_type` to the `reject` row's allowed values. Add a new request body field to `POST /v1/decisions/:decision_id/feedback`:
  - `suggested_decision_type` — optional, enum of the 4 types from `decision-engine.md` §4.5. **Validation:** required when `reason_category == "wrong_decision_type"`, must be omitted otherwise (Ajv `if/then`).
  
  Add a §Spec Literal to `educator-feedback-api.plan.md` quoting the new closed-set row + the validation rule. Update plan TASK-002 (types) and TASK-007 (handler-core validation) to honor the new field. Update FEEDBACK-* contract test list to add `FEEDBACK-013: wrong_decision_type requires suggested_decision_type` and `FEEDBACK-014: suggested_decision_type forbidden for other reasons`.

  **Defer** the program-metrics MC-B09 ("decision-type drift") metric to the program-metrics plan when it implements; do not add it here.
- **Depends on:** `PREREQ-001`
- **Verification:**
  - Spec ↔ plan parity check (per `document-traceability/RULE.md` §Spec ↔ implementation parity): `wrong_decision_type` and `suggested_decision_type` literals appear identically in spec, plan §Spec Literals, and plan task bodies
  - Ajv schema for feedback request body compiles and rejects `{action: "approve", reason_category: "wrong_decision_type"}` (wrong action) and `{action: "reject", reason_category: "not_at_risk", suggested_decision_type: "advance"}` (suggested without matching reason)

### TASK-008: Cross-doc updates

- **Files:**
  - `internal-docs/foundation/roadmap.md` (modify)
  - `docs/foundation/architecture.md` (modify)
  - `docs/specs/README.md` (modify)
  - `package.json` (modify)
- **Action:** Modify
- **Details:**
  - **Roadmap:** add new row to "Active Execution Plans" table for `literacy-pilot.plan.md` linked to this file. Add a one-line note in §"v1.1 execution order" Wave 2 section: *"Literacy default + template (PR 3 of 3 in CEO 2026-05-14 alignment): policy + template + parameterized seed."*
  - **Architecture:** add one paragraph under §"Lifecycle Stages" or a new §"Default Policy" block noting that `policies/default.json` ships as a literacy ruleset, and that org-specific override files at `policies/{orgId}/...` continue to take precedence per existing resolution order.
  - **specs/README:** no spec additions, but if a §"Templates" or §"Configuration artifacts" section doesn't exist, add a one-line link to `docs/templates/literacy-field-mappings.json`.
  - **package.json scripts:** add `"seed:literacy-demo": "node scripts/seed-literacy-demo.mjs"` and `"apply-template": "node scripts/apply-template.mjs"`. Either repoint or remove `seed:springs-demo` per TASK-005's resolution.
- **Depends on:** `TASK-001`..`TASK-005`
- **Verification:** `rg "literacy-pilot.plan.md" internal-docs/foundation/roadmap.md` finds the new row; `npm run` lists the two new scripts.

### TASK-009: Acceptance test against fresh org

- **Files:** `tests/integration/literacy-demo.test.ts` (new)
- **Action:** Create
- **Details:** Vitest integration test. Boots the server with a fresh in-memory or temp-file DB, applies the literacy template against `org_id: "test-literacy-pilot"`, runs the seed via direct function imports (not via subprocess to keep it fast), then asserts:
  - Jordan's most recent decision is `reinforce` with `trace.matched_rule_id == "rule-reinforce-text-evidence"`
  - Maya's most recent decision is `pause` with `trace.matched_rule_id == "rule-pause-reading-stamina"`
  - Elijah's most recent decision is `intervene` with `trace.matched_rule_id == "rule-intervene-cross-subject"`
  - Sofia's most recent decision is `advance` with `trace.matched_rule_id == "rule-advance-strong-literacy"`

  Test ID prefix: `LITPILOT-001..004` (one `it(...)` per persona per `document-traceability/RULE.md` §Test Coverage Policy).
- **Depends on:** `TASK-001`..`TASK-004`
- **Verification:** `npm run test:integration -- literacy-demo` reports 4/4 pass.

### TASK-010: Policy validation sweep

- **Files:** `tests/contracts/literacy-policy.test.ts` (new)
- **Action:** Create
- **Details:** Mirrors `decision-engine.md` §DEC-008 parameterized vector pattern. Constructs synthetic STATE objects with literacy-skill nested fields and asserts each fires the expected rule:

  | Case | Skills state (subset) | Expected `decision_type` | Expected `matched_rule_id` |
  |---|---|---|---|
  | LIT-001 | `skills.text_evidence: {stabilityScore: 0.58, stabilityScore_direction: "declining"}` | `reinforce` | `rule-reinforce-text-evidence` |
  | LIT-002 | `skills.reading_stamina: {stabilityScore: 0.55, stabilityScore_direction: "declining"}` | `pause` | `rule-pause-reading-stamina` |
  | LIT-003 | `skills.academic_vocabulary: {stabilityScore: 0.45, stabilityScore_direction: "declining"}` | `intervene` | `rule-intervene-cross-subject` |
  | LIT-004 | `skills: {text_evidence: {masteryScore: 0.91}, written_response: {masteryScore: 0.85}, basic_comprehension: {stabilityScore: 0.80}}` | `advance` | `rule-advance-strong-literacy` |
  | LIT-005 | All literacy skills at mastery 0.95, stability 0.95 | `advance` | `rule-advance-strong-literacy` |
  | LIT-006 | No literacy skills present (empty state) | *(no decision)* | `evaluateState → { ok: true, matched: false }` |

- **Depends on:** `TASK-001`
- **Verification:** `npx vitest run tests/contracts/literacy-policy.test.ts` reports 6/6 pass; no test asserts a 5th decision type (closed-set hygiene).

---

## Files Summary

### To Create

| File | Task | Purpose |
|---|---|---|
| `docs/templates/literacy-field-mappings.json` | TASK-002 | Canonical literacy mappings per source_system |
| `scripts/apply-template.mjs` | TASK-003 | Generic template applier (admin API) |
| `scripts/seed-literacy-demo.mjs` | TASK-004 | Parameterized 4-scenario seed |
| `examples/springs/README.md` | TASK-005 | Pointer doc for moved Springs artifacts |
| `tests/integration/literacy-demo.test.ts` | TASK-009 | Acceptance test against fresh org |
| `tests/contracts/literacy-policy.test.ts` | TASK-010 | Per-rule policy verification (LIT-001..006) |

### To Modify

| File | Task | Changes |
|---|---|---|
| `src/decision/policies/default.json` | TASK-001 | Replace generic 4-rule with literacy ruleset |
| `docs/specs/decision-outcomes.md` | TASK-006 | Add §Recheck cadence, per-type window_days defaults |
| `.cursor/plans/decision-outcomes.plan.md` | TASK-006 | Add Spec Literal + update TASK-003/009 task bodies |
| `docs/specs/educator-feedback-api.md` | TASK-007 | Add `wrong_decision_type` + `suggested_decision_type` |
| `.cursor/plans/educator-feedback-api.plan.md` | TASK-007 | Update Spec Literals + TASK-002/007 + add FEEDBACK-013/014 |
| `internal-docs/foundation/roadmap.md` | TASK-008 | New row + Wave 2 note |
| `docs/foundation/architecture.md` | TASK-008 | §Default Policy paragraph |
| `docs/specs/README.md` | TASK-008 | Templates link |
| `package.json` | TASK-008 | New `seed:literacy-demo` + `apply-template` scripts |

### To Move

| From | To | Task |
|---|---|---|
| `src/decision/policies/springs/*.json` | `examples/springs/policies/` | TASK-005 (only if Springs is no longer a live tenant) |
| `scripts/seed-springs-demo.mjs` | `examples/springs/` | TASK-005 |

### To Backup

| File | Task | Rationale |
|---|---|---|
| `src/decision/policies/default.json` (current generic 1.0.0) | TASK-001 | Saved as `src/decision/policies/default.legacy-1.0.0.json` |

---

## Requirements Traceability

| Requirement (source) | Source | Task |
|---|---|---|
| 7 literacy skill IDs configurable | Pilot doc §Minimum Literacy Skill IDs | TASK-001, TASK-002 |
| 4 decision types only | `decision-engine.md` §4.5; pilot doc §Decision Terms | TASK-001 (rules use closed set), TASK-010 (regression test) |
| Jordan scenario produces `reinforce` | Pilot doc §Scenario 1 (lines 133–196) | TASK-009 LITPILOT-001 |
| Maya scenario produces `pause` | Pilot doc §Scenario 2 (lines 197–263) | TASK-009 LITPILOT-002 |
| Elijah scenario produces `intervene` | Pilot doc §Scenario 3 (lines 267–334) | TASK-009 LITPILOT-003 |
| Sofia scenario produces `advance` | Pilot doc §Scenario 4 (lines 335–373) | TASK-009 LITPILOT-004 |
| Cross-subject literacy aggregation (Elijah English+Biology) | Pilot doc §Scenario 3 | TASK-001 (rule), TASK-004 (seed payload) |
| Pilot-customer-agnostic onboarding | Team call 2026-05-14 Q1 | TASK-001 (default fallback), TASK-002 (template), TASK-003 (applier), TASK-005 (move Springs) |
| `recommended_action` not added | Team call 2026-05-14 Q2 | All tasks — explicitly absent |
| Per-decision-type recheck cadence | Team call 2026-05-14 Q3 | TASK-006 |
| `wrong_decision_type` reason capture | Team call 2026-05-14 Q4 | TASK-007 |
| Acceptance against fresh org | Team call 2026-05-14 Q1 ("ready for any pilot customer") | TASK-009 |

---

## Test Plan

| Test ID | Type | Description | Task |
|---|---|---|---|
| LIT-001..006 | contract | Per-rule policy firing for literacy skill paths + no-match | TASK-010 |
| LITPILOT-001 | integration | Jordan signals → `reinforce` decision | TASK-009 |
| LITPILOT-002 | integration | Maya signals → `pause` decision | TASK-009 |
| LITPILOT-003 | integration | Elijah signals → `intervene` decision | TASK-009 |
| LITPILOT-004 | integration | Sofia signals → `advance` decision | TASK-009 |
| FEEDBACK-013 | contract | `wrong_decision_type` reason requires `suggested_decision_type` | TASK-007 (test in feedback plan) |
| FEEDBACK-014 | contract | `suggested_decision_type` forbidden when reason is not `wrong_decision_type` | TASK-007 (test in feedback plan) |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|---|---|---|---|
| `decision-outcomes.md` §Endpoints | `window_days` default `21` | Per-decision-type defaults (10/14/14/21) | **Update spec in same PR** (TASK-006) |
| `educator-feedback-api.md` §Data Model `reason_category` for `reject` | `not_at_risk\|wrong_skill\|wrong_timing\|data_stale\|other` | Adds `wrong_decision_type` | **Update spec in same PR** (TASK-007) |
| `educator-feedback-api.md` §Endpoints request body | `{action, reason_category, reason_text}` | Adds optional `suggested_decision_type` | **Update spec in same PR** (TASK-007) |
| `decision-engine.md` §Default policy example | Generic 4-rule policy with canonical fields | Literacy ruleset using `skills.<id>.*` dot-paths | **Implementation detail — spec silent** (the spec is content-agnostic; only the schema is normative; default.json is example content) |
| Pilot doc §Example Data Flow Raw Event | `{event_type, student_id, course_id, score, max_score, skill_id, ...}` | TASK-004 emits canonical `SignalEnvelope` shape from `signal-ingestion.md` | **Reverted — plan now matches spec.** Pilot doc raw event is illustrative only; the field-mapping template (TASK-002) translates to the canonical envelope. |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Replacing `policies/default.json` breaks any tenant currently relying on the generic 4-rule policy | High | TASK-001 keeps `default.legacy-1.0.0.json` as a backup; orgs that need the old policy copy it to `src/decision/policies/{orgId}/default.json` (resolution order wins per `policy-loader.ts`). Audit existing tenants in PREREQ before merge. |
| Springs is still a live tenant; moving `policies/springs/` breaks resolution | High | TASK-005 explicitly conditional: "only if Springs is no longer a live tenant." Default behavior is **leave `src/decision/policies/springs/` in place** and add `examples/springs/README.md` as a pointer. Confirm Springs tenant status with CS lead before the move. |
| Literacy ruleset thresholds (`< 0.7`, `< 0.5`) won't match real signal distributions from the first pilot customer's LMS | Medium | Thresholds are tuned to fire the four CEO scenarios deterministically; week-1 pilot calibration is the explicit follow-up. Document in TASK-001 task body that thresholds are starter values. |
| Cross-subject literacy (`skills.cross_subject_literacy.*`) requires a derived signal that no LMS emits natively | Medium | TASK-002 includes a `multi-source-transforms.md` recipe to compute it from `skills.academic_vocabulary` evidence across two or more `course_id` values, OR TASK-004 emits it directly as a synthetic seed signal. Document the path chosen in TASK-002 task body. |
| Pilot doc literal text (e.g., panel titles "Who Needs Help Now") differs from current dashboard literals | Low (handled by separate PR 2) | Out of scope here — flagged as PR 2 in the team call recommendation. This plan does not touch the dashboard. |
| Q4 plan changes pre-empt `educator-feedback-api.plan.md` (uncommitted) | Medium | TASK-007 explicitly edits the uncommitted plan. PREREQ-001 must be honored or merge conflicts are guaranteed. |

---

## Verification Checklist

- [ ] All 10 tasks completed
- [ ] LIT-001..006 contract tests pass (`npx vitest run tests/contracts/literacy-policy.test.ts`)
- [ ] LITPILOT-001..004 integration tests pass (`npx vitest run tests/integration/literacy-demo.test.ts`)
- [ ] FEEDBACK-013/014 land in `educator-feedback-api.plan.md` test plan
- [ ] `npm run validate:contracts` passes (no contract drift)
- [ ] `npm run validate:api` passes (post TASK-006 OpenAPI updates)
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] `/review --spec docs/specs/decision-outcomes.md` and `/review --spec docs/specs/educator-feedback-api.md` show no literal drift
- [ ] Manual: `node scripts/apply-template.mjs --org-id demo-acme --template literacy && node scripts/seed-literacy-demo.mjs --org-id demo-acme` succeeds against a fresh local server with a fresh org
- [ ] Manual: `/dashboard` renders four cards (one per persona) for `org_id=demo-acme`

---

## Implementation Order

```
PREREQ-001 → PREREQ-002
   ↓
TASK-001 (literacy default policy) ──┬→ TASK-010 (policy contract sweep)
   ↓                                  │
TASK-002 (field-mappings template)    │
   ↓                                  │
TASK-003 (apply-template script)      │
   ↓                                  │
TASK-004 (seed-literacy-demo) ────────┴→ TASK-009 (integration acceptance)
   ↓
TASK-005 (move Springs to examples/, conditional)
   ↓
TASK-006 (decision-outcomes window_days delta)   ─┐
TASK-007 (educator-feedback wrong_decision_type) ─┤
   ↓                                              │
TASK-008 (roadmap + arch + README + scripts) ←────┘
```

`TASK-006` and `TASK-007` are independent of `TASK-001..005`; they can land in parallel branches.

---

## Next Steps

After this plan is reviewed:

1. Run `/implement-spec .cursor/plans/literacy-pilot.plan.md` to execute task-by-task with the `prefer-existing-solutions/RULE.md` and `document-traceability/RULE.md` enforcement passes.
2. Open PR 2 (panel renames per `docs/specs/decision-panel-ui.md` literals) once this lands — it touches `dashboard/` only and won't conflict.
3. Open PR 1 (Decision `educator_view` schema enrichment) after PR 2 — it makes the demo cards visually richer but is not a pilot blocker.
