---
name: Demo Seed Script
overview: |
  A repeatable Node.js script (`scripts/seed-demo.mjs`) that populates a running 8P3P server with pre-loaded learners demonstrating the two primary demo anchors: REINFORCE and INTERVENE. Also includes one rejected signal and one duplicate to prove ingestion integrity. The script calls POST /v1/signals against a live server, producing data visible across all four inspection panels. Completes Pilot Readiness Artifact #7.
todos:
  - id: TASK-001
    content: Design demo learner scenarios and signal payloads
    status: pending
  - id: TASK-002
    content: Create seed-demo.mjs script
    status: pending
  - id: TASK-003
    content: Create demo walkthrough documentation
    status: pending
  - id: TASK-004
    content: Add npm script entry and verify end-to-end
    status: pending
isProject: false
---

# Demo Seed Script

**Spec**: Pilot Readiness Artifact #7 (`docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md`)  
**CEO approval**: `docs/reports/2026-02-23-ceo-scope-approval.md` — demo anchored on REINFORCE + INTERVENE

## Prerequisites

Before starting implementation:

- {PREREQ-001} Server running at `http://localhost:3000` with `API_KEY` set — confirmed in `.env.local`
- {PREREQ-002} All 5 pipeline stages operational (ingestion → signal log → STATE → decision → output) — confirmed by 343+ tests
- {PREREQ-003} Inspection panels deployed at `/inspect` — confirmed (TASK-001 through TASK-011 complete)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Script format | Standalone `.mjs` (ES module, no compile) | Matches `generate-api-key.mjs` pattern; runs with `node` directly |
| Server interaction | HTTP `fetch()` against live server | Proves the real API path; no DB manipulation needed |
| API key handling | Read from `API_KEY` env var or accept `--api-key` CLI arg | Matches pilot integration guide; script is usable in any environment |
| Org ID | Default `org_demo` (overridable via `--org` CLI arg) | Demo-specific org; doesn't pollute pilot data |
| Idempotent re-runs | Fixed `signal_id` values so re-running produces `duplicate` (not double data) | Safe to run multiple times without corrupting demo state |
| Learner count | 4 learners (2 primary anchors + 2 supporting) | Enough to populate all panels without overwhelming the demo |

## Learner Scenarios

### Learner 1: `maya-k` — REINFORCE anchor

**Narrative:** Maya's knowledge is decaying. She hasn't received reinforcement in over 24 hours and her stability is slipping below threshold. The system detects this and proactively recommends reinforcement before failure occurs.

**Signal payloads (2 signals, showing state evolution):**

| Signal | stabilityScore | masteryScore | timeSinceReinforcement | confidenceInterval | riskSignal | Expected Decision |
|--------|---------------|-------------|----------------------|-------------------|-----------|-------------------|
| maya-k-001 | 0.62 | 0.75 | 90000 | 0.80 | 0.20 | `reinforce` (stability < 0.7, timeSince > 86400) |
| maya-k-002 | 0.55 | 0.72 | 100000 | 0.78 | 0.25 | `reinforce` (stability further decayed) |

### Learner 2: `alex-r` — INTERVENE anchor

**Narrative:** Alex is struggling now. Stability is critically low and confidence in the assessment is moderate — the system has enough data to act. Immediate intervention is needed.

**Signal payloads (2 signals):**

| Signal | stabilityScore | masteryScore | timeSinceReinforcement | confidenceInterval | riskSignal | Expected Decision |
|--------|---------------|-------------|----------------------|-------------------|-----------|-------------------|
| alex-r-001 | 0.35 | 0.40 | 50000 | 0.55 | 0.60 | `intervene` (stability < 0.4, confidence ≥ 0.3) |
| alex-r-002 | 0.28 | 0.35 | 60000 | 0.50 | 0.65 | `intervene` (stability even lower) |

### Learner 3: `jordan-m` — Supporting (ADVANCE, if asked)

**Narrative:** Jordan is excelling — high stability, high mastery, low risk, high confidence. The system recommends advancement.

**Signal payload (1 signal):**

| Signal | stabilityScore | masteryScore | timeSinceReinforcement | confidenceInterval | riskSignal | Expected Decision |
|--------|---------------|-------------|----------------------|-------------------|-----------|-------------------|
| jordan-m-001 | 0.88 | 0.90 | 40000 | 0.85 | 0.10 | `advance` (stability ≥ 0.8, mastery ≥ 0.8, risk < 0.3, confidence ≥ 0.7) |

### Learner 4: `sam-t` — Supporting (edge case: rejected + duplicate)

**Narrative:** Sam's first signal is malformed (rejected). Second signal is valid (accepted). Third signal is a retry of the second (duplicate). This proves Panel 1's three ingestion outcomes.

| Signal | Payload | Expected Outcome |
|--------|---------|-----------------|
| sam-t-bad | `{ "bogus": true }` (no canonical fields, but valid envelope) | `accepted` (payload content is not validated, only envelope structure) |
| sam-t-reject | Missing `learner_reference` field entirely | `rejected` — `missing_required_field` |
| sam-t-001 | stabilityScore: 0.50, masteryScore: 0.60, timeSinceReinforcement: 90000, confidenceInterval: 0.80, riskSignal: 0.15 | `accepted` → `reinforce` |
| sam-t-001 (retry) | Same signal_id as above | `duplicate` |

## Tasks

### TASK-001: Design demo learner scenarios and signal payloads

- **Status**: pending
- **Files**: none (design task — scenarios documented above)
- **Action**: Verify
- **Details**: Verify the 4 learner scenarios against `default.json` policy rules. Confirm each signal's canonical field values trigger the expected decision type using first-match-wins priority ordering. Specifically:
  - `maya-k`: stabilityScore 0.62 < 0.7 AND timeSinceReinforcement 90000 > 86400 → `reinforce` (rule-reinforce)
  - `alex-r`: stabilityScore 0.35 < 0.4 AND confidenceInterval 0.55 ≥ 0.3 → `intervene` (rule-intervene). Does NOT match earlier rules: confidenceInterval 0.55 ≥ 0.3 excludes escalate/pause; riskSignal 0.60 ≤ 0.7 excludes reroute.
  - `jordan-m`: stabilityScore 0.88 ≥ 0.8, masteryScore 0.90 ≥ 0.8, riskSignal 0.10 < 0.3, confidenceInterval 0.85 ≥ 0.7 → `advance` (rule-advance). Does NOT match earlier rules.
  - `sam-t`: rejected (missing field), accepted (reinforce), duplicate
- **Depends on**: none
- **Verification**: Manual walkthrough of policy rule evaluation confirms expected decisions.

### TASK-002: Create seed-demo.mjs script

- **Status**: pending
- **Files**: `scripts/seed-demo.mjs`
- **Action**: Create
- **Details**:
  - Standalone ES module script using Node.js built-in `fetch()` (Node 18+)
  - CLI args: `--host` (default `http://localhost:3000`), `--api-key` (default from `API_KEY` env var), `--org` (default `org_demo`)
  - Defines the signal payloads from TASK-001 as a constant array
  - Sends each signal via `POST /v1/signals` with `x-api-key` and `content-type: application/json`
  - Logs each response: signal_id, status (accepted/rejected/duplicate), decision_type (if visible from subsequent GET)
  - Includes a short delay (100ms) between signals to ensure deterministic ordering in panels
  - On completion, prints a summary table and the inspection panel URL
  - Handles errors gracefully (connection refused, 401, etc.) with clear messages
  - Script is idempotent: re-running produces duplicates for already-sent signals (no data corruption)
  - Uses fixed timestamps (e.g. 2026-03-01T10:00:00Z through 2026-03-01T10:05:00Z) so demo data is predictable
- **Depends on**: TASK-001
- **Verification**: `node scripts/seed-demo.mjs` completes with 0 exit code; server logs show expected ingestion outcomes.

### TASK-003: Create demo walkthrough documentation

- **Status**: pending
- **Files**: `docs/guides/demo-walkthrough.md`
- **Action**: Create
- **Details**:
  - Step-by-step demo script for investor/enterprise audiences
  - Prerequisites: server running, API key set, `npm run seed:demo` executed
  - Walkthrough flow (matches inspection-panels.md spec note):
    1. Open `/inspect/` — show terminal aesthetic
    2. **Panel 1 (Signal Intake)**: Enter org_id `org_demo`, click Refresh. Point out 3 outcome types: accepted (green), rejected (red for sam-t-reject), duplicate (amber for sam-t retry).
    3. **Panel 2 (State Viewer)**: Select `maya-k`. Show state version history (v1 → v2 as signals accumulated). Highlight canonical fields. Then select `alex-r` — lower stability, triggering intervene.
    4. **Panel 3 (Decision Stream)**: Show decisions for org. Point out REINFORCE decisions for maya-k and INTERVENE decisions for alex-r. Mention advance for jordan-m if asked.
    5. **Panel 4 (Decision Trace)**: Click maya-k's reinforce decision. Walk through: rationale, evaluated thresholds (stabilityScore 0.62 < 0.7 ✓, timeSinceReinforcement 90000 > 86400 ✓), frozen state snapshot, rule condition JSON. Then click alex-r's intervene decision for contrast.
  - Talking points per panel (2-3 sentences each, aligned with CEO demo anchors)
  - Total demo time target: ~60 seconds for the walkthrough, ~2 minutes with narration
  - Reference: `docs/reports/2026-02-23-ceo-scope-approval.md` (Edit #1: REINFORCE + INTERVENE anchors)
- **Depends on**: TASK-001
- **Verification**: Demo walkthrough can be followed from start to finish against seeded data.

### TASK-004: Add npm script entry and verify end-to-end

- **Status**: pending
- **Files**: `package.json`
- **Action**: Modify
- **Details**:
  - Add `"seed:demo": "node scripts/seed-demo.mjs"` to `scripts` section in `package.json`
  - Run end-to-end: `npm run dev` (background), `npm run seed:demo`, then open `/inspect/` and verify all 4 panels show expected data
  - Verify:
    - Panel 1: 8+ rows (4 accepted, 1 rejected, 1 duplicate, plus earlier signals if any)
    - Panel 2: 4 learners in list (maya-k, alex-r, jordan-m, sam-t)
    - Panel 3: Decisions include reinforce (maya-k), intervene (alex-r), advance (jordan-m), reinforce (sam-t)
    - Panel 4: Clicking any decision row shows full trace with rationale, thresholds, state snapshot
- **Depends on**: TASK-002, TASK-003
- **Verification**: `npm run seed:demo` exits 0; all 4 panels render seeded data correctly.

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `scripts/seed-demo.mjs` | TASK-002 | Standalone seed script: sends demo signals via POST /v1/signals |
| `docs/guides/demo-walkthrough.md` | TASK-003 | Step-by-step demo script for investor/enterprise audiences |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `package.json` | TASK-004 | Add `seed:demo` npm script |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TEST-SEED-001 | manual | Script runs without error against live server | TASK-002 |
| TEST-SEED-002 | manual | Re-running script produces duplicates (idempotent) | TASK-002 |
| TEST-SEED-003 | manual | Panel 1 shows accepted/rejected/duplicate rows for seeded data | TASK-004 |
| TEST-SEED-004 | manual | Panel 2 shows 4 learners with correct state and version history | TASK-004 |
| TEST-SEED-005 | manual | Panel 3 shows reinforce + intervene + advance decisions | TASK-004 |
| TEST-SEED-006 | manual | Panel 4 shows full trace with rationale and thresholds for any clicked decision | TASK-004 |
| TEST-SEED-007 | manual | Demo walkthrough can be completed in < 2 minutes | TASK-003 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| API_KEY_ORG_ID overrides `org_demo` to the key's org | Low — seeded data still works, just under different org_id | Script documents this; panels use whatever org_id the server returns |
| Policy changes make demo payloads trigger wrong decisions | Medium — demo narrative breaks | Payloads are designed with margin (e.g. maya-k stability 0.62, well below 0.7 threshold); document which policy fields matter |
| Server not running when script executes | Low — script fails immediately | Clear error message: "Connection refused — is the server running?" |

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm run seed:demo` exits 0
- [ ] Re-run produces only duplicates (idempotent)
- [ ] All 4 inspection panels render seeded data
- [ ] Demo walkthrough follows CEO-approved narrative (REINFORCE + INTERVENE)
- [ ] Walkthrough completes in < 2 minutes

## Implementation Order

```
TASK-001 → TASK-002 → TASK-004
         ↘ TASK-003 ↗
```

TASK-002 (script) and TASK-003 (walkthrough doc) can run in parallel after TASK-001 (design). TASK-004 (npm script + e2e verify) depends on both.
