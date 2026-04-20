---
name: Pilot Dry-Run Script (Springs Saturday 2026-04-18)
overview: |
  Produce the `internal-docs/pilot-operations/dry-run-script.md` playbook that the
  2026-04-16 pilot dry-run readiness brief keeps referencing as "Does not exist."
  The artifact stitches together the existing onboarding runbook, Springs demo
  walkthrough, and simulated-customer scenarios into one minute-by-minute rehearsal
  playbook for Saturday 2026-04-18 1:00–6:00 PM. It closes Findings #3 (no single
  dry-run script) and #4 (no documented abort/rollback criteria) from the
  readiness brief. Deliverable is a single Markdown doc plus a small update to the
  readiness brief so its "Current State" row reflects reality. No code changes.
  No new features. Plan is doc-only by design — per the readiness brief's
  explicit "NOT doing" guardrails.
todos:
  - id: TASK-001
    content: Scaffold dry-run-script.md skeleton (header, audience, roles, table of contents)
    status: completed
  - id: TASK-002
    content: Write Friday pre-work section (morning deploy, afternoon checklist, evening prep)
    status: completed
  - id: TASK-003
    content: Write Saturday 12:00–12:45 pre-flight section and quote the Friday-6PM smoke-test curl verbatim
    status: completed
  - id: TASK-004
    content: Write Blocks 1–7 (1:00–6:00 PM) minute-by-minute with owners and key observation per block
    status: completed
  - id: TASK-005
    content: Write Abort / Rollback Criteria section (closes Finding
    status: completed
  - id: TASK-006
    content: Write Observation Log template (finding / severity / window / owner) used in Block 4 and Block 7
    status: completed
  - id: TASK-007
    content: Write Go/No-Go Memo template (the one-page output the CEO receives by 6 PM Saturday)
    status: completed
  - id: TASK-008
    content: Write CEO Decisions Placeholder section (Decisions 1/2/3 — deployment path, role players, fidelity) with TBD slots
    status: completed
  - id: TASK-009
    content: Cross-link existing docs (onboarding runbook, readiness definition, deployment checklist, springs-pilot-demo, springs-demo-walkthrough, passphrase-gate spec)
    status: completed
  - id: TASK-010
    content: Update the readiness brief so its Current State row and Finding
    status: completed
  - id: TEST-DOC-001
    content: Tabletop read-through — CS lead reads script end-to-end and confirms zero handoff gaps between blocks
    status: completed
  - id: TEST-DOC-002
    content: Minute arithmetic — each block's duration sums to 300 minutes (1 PM–6 PM)
    status: completed
  - id: TEST-DOC-003
    content: Link integrity — every relative doc path in the script resolves from repo root
    status: completed
  - id: TEST-DOC-004
    content: Traceability — every Pre-Saturday / At-Saturday finding in the readiness brief is addressed by a block or pre-work item in the script
    status: completed
isProject: false
---

# Pilot Dry-Run Script (Springs Saturday 2026-04-18)

**Spec (de facto):** `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md`
**Deliverable:** `internal-docs/pilot-operations/dry-run-script.md`
**Note on spec shape:** This is an operations artifact, not a product feature. There is no `docs/specs/dry-run-script.md` and none is needed — the readiness brief is the normative source. The `/plan-impl` skill's spec-literal discipline is still applied: Saturday schedule, pre-flight, and smoke test are copied verbatim rather than paraphrased.

## Spec Literals

> Verbatim copies of normative blocks from the readiness brief. TASK details MUST quote from this section rather than paraphrase. Update this section only if the brief itself changes.

### From brief § Saturday 1:00–6:00 PM — Dry run

```
| Block | Time | Phase | Key observation |
|-------|------|-------|-----------------|
| 1 | 1:00–1:30 | Sales → Eng handoff | Does the handoff doc have what Eng needs? |
| 2 | 1:30–2:15 | Environment provisioning recap + welcome email sent to "Springs IT" | Is the email clear to a non-technical reader? |
| 3 | 2:15–3:30 | Simulated onboarding call (Zoom, CS leads, "IT" follows quick-start cold) | Where do they get stuck? |
| 4 | 3:30–4:00 | Mid-run triage, dump findings into log | Top 3 gaps |
| 5 | 4:00–4:45 | "Springs educator" opens dashboard fresh, uses all 4 panels | Can an educator narrate without our translation? |
| 6 | 4:45–5:15 | "Day 2" check — send 2 more signals, verify dashboard reflects them | Is polling UX acceptable? |
| 7 | 5:15–6:00 | Debrief + classify findings as blocker / should-fix / post-pilot | Go / no-go memo drafted |
```

### From brief § Saturday 12:00–12:45 PM — Pre-flight

```
- Re-run deployment checklist
- Re-seed (idempotent) or wipe-and-reseed for clean slate
- Confirm all participants have access to observation log
- Confirm "Springs IT" is on a different network
- **No code deploys after 12:30 PM**
```

### From brief § Single Go / No-Go Gate Before Saturday

```bash
curl -sS https://<pilot-host>/health && \
curl -sS -X POST "https://<pilot-host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <pilot_key>" \
  -d '{"signal_id":"dry-run-smoke","org_id":"springs","learner_reference":"stu-10042","source_system":"canvas-lms","event_type":"assessment_completed","occurred_at":"2026-04-18T13:00:00Z","data":{"masteryScore":0.75}}'
```

```
If this fails at 6:00 PM Friday and the cause is not a 10-minute fix, we pivot to
ngrok (Option B) or postpone the dry run to Sunday.
```

### From brief § Friday (7–8 hrs total)

```
- Morning: Dockerfile, deploy server to chosen host, verify /health over TLS,
  build dashboard with baked API key, set all env vars
- Afternoon: Point seed script at deployed URL, run it, verify 11 signals +
  expected decisions; execute full docs/guides/deployment-checklist.md;
  run passphrase-gate negative tests; cross-device test (separate laptop,
  phone, Chromebook if possible); pre-stage the "Springs IT welcome email"
  in drafts
- Evening: Finalize script; create observation-log template; define abort
  criteria; team walk-through of the plan
```

### From brief § What We Are Explicitly NOT Doing Before Saturday

```
1. Not fixing the VITE_API_KEY build-time bake-in.
2. Not attempting a full AWS CDK deploy.
3. Not adding new features or "polish."
4. Not skipping cross-device testing.
```

### From brief § What the CEO Gets Out of Saturday

```
1. Can we run a real pilot next week — yes, no, or yes-with-conditions?
2. If conditional, what are the 3–5 things we must fix first?
3. What is the real estimated time-to-onboard a customer, measured, not guessed?
4. Is the dashboard actually legible to a non-technical educator?
```

## Prerequisites

Before starting implementation:
- [x] PREREQ-001: Readiness brief exists at `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` (the spec source)
- [x] PREREQ-002: Onboarding runbook exists at `internal-docs/pilot-operations/onboarding-runbook.md` (Phases 0–5 referenced by the script)
- [x] PREREQ-003: Readiness definition exists at `internal-docs/pilot-operations/pilot-readiness-definition.md` (go/no-go gates referenced by pre-flight)
- [x] PREREQ-004: Deployment checklist exists at `docs/guides/deployment-checklist.md` (called by Saturday pre-flight and Friday PM)
- [x] PREREQ-005: Springs demo walkthroughs exist at `docs/guides/springs-pilot-demo.md` and `internal-docs/demos/springs-demo-walkthrough.md` (Block 5 content)
- [x] PREREQ-006: Passphrase-gate spec exists at `docs/specs/dashboard-passphrase-gate.md` (Block 5 passphrase flow)
- [ ] PREREQ-007: CEO Decisions 1/2/3 recorded (deployment path, role player names, simulation fidelity). **Not a blocker for producing the script** — script uses TBD placeholders that get filled Thursday evening.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

> **Existing-solutions check** (per `.cursor/rules/prefer-existing-solutions/RULE.md`): This is a doc-only plan. The script wraps and references existing runbooks/specs instead of duplicating their content. Any time the script is tempted to inline a procedure already documented elsewhere, it MUST link to the existing doc. No new scripts, env vars, or CLI entry points.

---

### TASK-001: Scaffold dry-run-script.md skeleton
- **Files**: `internal-docs/pilot-operations/dry-run-script.md` (new)
- **Action**: Create
- **Details**: Top matter modeled on `onboarding-runbook.md` and `pilot-readiness-definition.md`:
  - H1 title: `Pilot Dry-Run Script — Springs 2026-04-18`
  - `**Audience:**` — internal execution team (CS lead drives; CEO observes Blocks 3 and 7; engineering + observers in support)
  - `**Event:**` — Springs Charter Schools pilot dry run, Saturday 2026-04-18, 1:00–6:00 PM (5 hrs)
  - `**Baseline brief:**` — link to `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md`
  - `**Location warning:**` — Internal only; contains named customer and role assignments. Do not publish to public repo.
  - Table of contents with anchors for every major section produced by TASK-002 through TASK-008.
  - `## Roles` table — role, who, where they are (same / different network / different device), first block they appear in. Columns: `Role | Person (TBD until Thursday) | Device / network | First appearance`.
- **Depends on**: none
- **Verification**: File exists; `rg -n '^## ' internal-docs/pilot-operations/dry-run-script.md` lists every section TASK-002..TASK-008 will fill.

### TASK-002: Friday pre-work section
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Friday 2026-04-17 Pre-Work`)
- **Details**: Must quote the Friday block from **Spec Literals § From brief § Friday (7–8 hrs total)** verbatim in a blockquote, then expand each line into a subsection with:
  - Morning (Eng): deploy step-by-step calls out for Decision 1 Option A (Fly.io or Render) OR Option B (ngrok fallback) — no recommendation; just "follow whichever Decision 1 resolved to." Links to `docs/guides/deployment-checklist.md`.
  - Afternoon (Eng + CS): point seed at deployed URL via `npm run seed:springs-demo` (link to `docs/guides/springs-pilot-demo.md` § Setup); expected outcome is "11 signals across Canvas, Blackboard, i-Ready, Absorb; 5 named personas; decisions match guide." Passphrase-gate negative tests: list exact cases (no cookie → redirect to `/dashboard/login`; wrong code → error; correct code → panels render). Cross-device matrix: primary MacBook, secondary laptop, iOS/Android phone, Chromebook (if available). Pre-stage Springs IT welcome email as **draft**, not sent, with placeholder URL + access code + API key handoff channel per `pilot-readiness-definition.md` § What We Ship to the Customer.
  - Evening (CS + all): finalize this script; confirm observation-log template live (see TASK-006); confirm abort criteria (see TASK-005); 30-min team walk-through.
  - Close with the **Friday 6:00 PM single go/no-go gate** — quote the smoke-test bash block from **Spec Literals § From brief § Single Go / No-Go Gate** verbatim in a fenced code block. Follow with the decision logic: pass → proceed; fail and not a 10-min fix → pivot to ngrok (Decision 1 Option B) or postpone to Sunday.
- **Depends on**: TASK-001
- **Verification**: `rg -n 'curl -sS https://<pilot-host>/health' internal-docs/pilot-operations/dry-run-script.md` returns exactly one match; the Friday blockquote is byte-identical to the Spec Literals block.

### TASK-003: Saturday 12:00–12:45 PM pre-flight section
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Saturday 12:00–12:45 PM Pre-Flight`)
- **Details**: Quote **Spec Literals § From brief § Saturday 12:00–12:45 PM — Pre-flight** verbatim at the top of the section as the normative checklist. Then expand into executable steps:
  - Re-run `docs/guides/deployment-checklist.md` — single checkbox linked; CS lead checks box when green.
  - Seed reset decision tree: idempotent re-seed (`npm run seed:springs-demo`) is default; wipe-and-reseed only if prior Block-4 findings require clean state. Point to `.cursor/plans/springs-realistic-seed.plan.md` for seed internals.
  - Observation log access check — everyone has edit access to the log created in TASK-006.
  - "Springs IT" network check — role-player on hotspot OR residential wifi, not office LAN. CS lead verifies by asking for `curl ifconfig.me` output.
  - Hard cutoff: **No code deploys after 12:30 PM** — bold, verbatim from brief. Any code change after 12:30 is a go/no-go re-trigger.
- **Depends on**: TASK-001
- **Verification**: The five pre-flight bullets appear verbatim; "No code deploys after 12:30 PM" is bold and matches the Spec Literal; section has a `- [ ]` checklist the CS lead can tick live.

### TASK-004: Blocks 1–7 minute-by-minute
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Saturday 1:00–6:00 PM Dry Run`)
- **Details**: Start with the 7-block table quoted verbatim from **Spec Literals § From brief § Saturday 1:00–6:00 PM — Dry run**. Then one H3 per block with:
  - **Duration** (minutes)
  - **Driver** (who runs the block)
  - **Observers** (named roles, which must match TASK-001 roles table)
  - **Preconditions** (what must be true entering the block)
  - **Steps** (numbered list, ≤ 2 min per step)
  - **Key observation** (copied verbatim from the Spec-Literals table row)
  - **Exit criteria** (what triggers moving to the next block vs. escalating to abort)
  - **Finding-capture prompt** (explicit prompt for observers to log into the observation template from TASK-006)

  Block-specific guidance to write:
  - Block 1 (30 min) — Sales → Eng handoff rehearsal using the real sales-handoff ticket format from `onboarding-runbook.md` § Phase 0. Driver: CS lead. Observer: Eng owner. Exit: onboarding ticket has every field from Phase 0 table filled.
  - Block 2 (45 min) — Environment provisioning recap (`onboarding-runbook.md` § Phase 1, sections 1.1–1.6). Driver: Eng. Parallel: CS sends the Springs-IT welcome email drafted Friday. Exit: IT role-player confirms receipt and has the link, access code, and API key.
  - Block 3 (75 min) — Simulated onboarding call. Zoom, CS leads the call, IT role-player follows `docs/guides/customer-onboarding-quickstart.md` cold. Do not coach. Log every stall ≥ 30 seconds. Exit: IT role-player has seen at least one decision via `GET /v1/decisions` AND opened the Decision Panel with their access code.
  - Block 4 (30 min) — Mid-run triage. CS lead + Eng triage findings so far, classify top 3 gaps, decide whether to continue to Block 5 or invoke abort (see TASK-005). Exit: written triage note in observation log.
  - Block 5 (45 min) — Educator role-player opens dashboard fresh (different device, different network). Uses all 4 panels in order: Who Needs Attention → Why Are They Stuck → What To Do → Did It Work. Script cross-refs `docs/guides/springs-pilot-demo.md` Panel 1–4 talking points as *expected* narration; capture deltas from what the educator actually says. Observer captures every "what does this mean?" moment. Exit: educator has narrated all 4 panels without 8P3P team translating.
  - Block 6 (30 min) — Day-2 check. Eng sends 2 more signals via `POST /v1/signals` (use the smoke curl shape from Spec Literals, different `signal_id` and `occurred_at`). Educator (or IT) refreshes dashboard; time to visibility measured. Exit: both new signals visible in the dashboard OR polling gap logged as finding.
  - Block 7 (45 min) — Debrief + memo draft. Walk the observation log end to end; classify each finding as blocker / should-fix / post-pilot per the severity taxonomy already used in the readiness brief § Findings. Produce the go/no-go memo from TASK-007. Exit: memo committed (or at least draft-shared) by 6:00 PM.
- **Depends on**: TASK-001
- **Verification**: 7 H3s exist, one per block; table quoted verbatim; block durations sum to 300 minutes (verified by TEST-DOC-002); every Key Observation column matches the Spec Literal row.

### TASK-005: Abort / Rollback Criteria section
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Abort / Rollback Criteria`)
- **Details**: Closes Finding #4. Must include:
  - **Who decides**: CS lead has the call; CEO override available.
  - **When to decide**: end of any block, or immediately if a Tier-1 trigger fires mid-block.
  - **Tier-1 triggers (abort immediately, pivot to table-top walkthrough)**: deployed env returns non-200 on `/health` for > 5 min with no fix path; API key leaks into a customer-visible error body; passphrase gate bypass observed; PII rendered for a learner not in the Springs seed.
  - **Tier-2 triggers (end current block early, skip to Block 7 debrief)**: IT role-player unable to log in to dashboard after 20 min of troubleshooting; educator role-player unable to render any panel; seed drift (decisions do not match `docs/guides/springs-pilot-demo.md` § Decision Distribution).
  - **Tier-3 triggers (log and continue)**: Chromebook/phone rendering glitches; copy issues in welcome email; educator asks questions we can answer in-channel.
  - **Rollback scope**: there is no data rollback — the dry run uses seeded `springs` data already isolated per `onboarding-runbook.md` § Phase 1. Rollback means "tear down the pilot host + rotate the pilot API key" per `docs/guides/deployment-checklist.md`.
  - **Post-abort action**: CS lead still produces the go/no-go memo (TASK-007); abort itself is a go/no-go answer of "no, with specific blockers."
- **Depends on**: TASK-004
- **Verification**: Section has three tiers, named decision-maker, and explicit "abort = memo says no" mapping.

### TASK-006: Observation Log template
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Observation Log Template`)
- **Details**: A table template the team fills during the run:
  `| # | Block | Time | Severity (blocker/should-fix/post-pilot) | Finding | Owner | Evidence (link / screenshot) | Status |`
  Severity taxonomy must match the readiness brief § Findings table so Block-7 classification lands on the same scale. Also define storage location: live Google Doc OR a new markdown file `internal-docs/reports/2026-04-18-pilot-dry-run-findings.md` created at pre-flight and committed post-debrief (CS lead picks one Friday evening; script links both options).
- **Depends on**: TASK-001
- **Verification**: Template has the required columns; severity taxonomy matches the brief; storage decision rule is explicit.

### TASK-007: Go/No-Go Memo template
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Go/No-Go Memo Template`)
- **Details**: Produces the one-page output promised in the readiness brief § What the CEO Gets Out of Saturday. Quote the four questions verbatim from **Spec Literals § From brief § What the CEO Gets Out of Saturday** as the memo section headers. Memo must also include:
  - Baseline commit SHA (captured at pre-flight).
  - Participants list (names from TASK-001 roles table).
  - Counts of findings by severity from the observation log (TASK-006).
  - Top 3–5 "must-fix-before-real-pilot" items if answer to Q1 is "yes-with-conditions."
  - Measured time-to-first-value from Block 3 (minutes from "call starts" to "first decision visible to IT role-player").
  - Storage path: `internal-docs/reports/2026-04-18-pilot-dry-run-memo.md` committed same day.
- **Depends on**: TASK-004
- **Verification**: All four CEO questions appear verbatim; memo path is specified; time-to-first-value is an explicit measurement pulled from Block 3.

### TASK-008: CEO Decisions placeholder section
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## CEO Decisions (Fill Thursday Evening)`)
- **Details**: Three rows for Decisions 1/2/3 from the readiness brief, with fields the script depends on:
  - Decision 1 (deployment path): `Host = ___`, `Pilot host URL = https://___`, `Decision 1 Option = A | B`. These fill into TASK-002 Friday morning steps.
  - Decision 2 (role players): `Springs IT director = ___ (device / network: ___)`, `Springs educator = ___ (device / network: ___)`, `Observer(s) = ___`. These fill into TASK-001 Roles table.
  - Decision 3 (fidelity): `High | Low`; if High, `Real Springs contact name & title = ___`, `Welcome email tone sample = link`. These fill into TASK-002 Friday afternoon welcome-email pre-staging.
  - Section explicitly says "until these are filled, the script cannot execute; this is the Thursday blocker." Cross-links to the readiness brief § CEO Action Checklist.
- **Depends on**: TASK-001
- **Verification**: All three decisions have placeholder slots that downstream sections consume; cross-link is correct.

### TASK-009: Cross-link existing docs
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Modify (append `## Related Documents`)
- **Details**: Final section mirroring the pattern in `onboarding-runbook.md` § Related Documents. Required rows, all relative paths from repo root:
  - `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` — baseline brief this script implements
  - `internal-docs/pilot-operations/pilot-readiness-definition.md` — go/no-go gates the pre-flight validates
  - `internal-docs/pilot-operations/onboarding-runbook.md` — Phase 0–5 procedures Blocks 1–3 rehearse
  - `internal-docs/pilot-operations/configure-lms-source-system.md` — LMS mapping reference for Block 2
  - `internal-docs/demos/springs-demo-walkthrough.md` — internal demo narrative, Block 5 reference
  - `docs/guides/springs-pilot-demo.md` — customer-facing demo script, Block 5 reference
  - `docs/guides/deployment-checklist.md` — Friday PM + Saturday pre-flight gate
  - `docs/guides/customer-onboarding-quickstart.md` — Block 3 cold-follow document
  - `docs/specs/dashboard-passphrase-gate.md` — passphrase gate behavior Block 5 validates
  - `.cursor/plans/springs-realistic-seed.plan.md` — seed internals for Block 6 Day-2 signals
- **Depends on**: TASK-001
- **Verification**: TEST-DOC-003 passes; every path resolves from repo root.

### TASK-010: Update readiness brief to reflect script existence
- **Files**: `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md`
- **Action**: Modify
- **Details**: Two in-place edits only — no restructuring:
  - In the `## Current State` table, change the `Dry-run script` row from `**Does not exist**` / `No rehearsal playbook stitches runbook + demo + customer simulation together` to `**Drafted**` / link text `internal-docs/pilot-operations/dry-run-script.md` — written 2026-04-16 evening, awaiting Thursday CEO Decisions 1/2/3 to finalize`.
  - In the `## Findings from the Review` table, Finding #3 `Action window` column stays **Pre-Saturday**; append `(script drafted 2026-04-16; finalized once Decisions 1/2/3 land)` to the Finding column. Finding #4 (abort/rollback) same treatment — append `(captured in dry-run-script § Abort / Rollback Criteria)` to the Finding column.
- **Depends on**: TASK-001 through TASK-009
- **Verification**: `rg -n 'Does not exist' internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` returns no match for the dry-run-script row; Findings #3 and #4 reference the new doc.

---

### TEST-DOC-001: Tabletop read-through
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Verify
- **Details**: CS lead (or a stand-in not involved in authoring) reads the script end to end and confirms:
  - Every block's preconditions are satisfied by the prior block's exit criteria (zero handoff gaps).
  - Every role mentioned inside a block appears in TASK-001 Roles table.
  - Every "link to X" resolves (handled by TEST-DOC-003 but verified holistically here).
- **Depends on**: TASK-001 through TASK-010
- **Verification**: Reader can answer "what do I do at 3:47 PM?" by pointing at a single line of the script.

### TEST-DOC-002: Minute arithmetic
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Verify
- **Details**: Block durations (30 + 45 + 75 + 30 + 45 + 30 + 45) = 300 minutes = 1:00–6:00 PM. Confirm by reading the block headers in TASK-004.
- **Depends on**: TASK-004
- **Verification**: Sum = 300.

### TEST-DOC-003: Link integrity
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`
- **Action**: Verify
- **Details**: For every Markdown link target in the script, run `ls <path>` (or equivalent) to confirm the file exists. The prerequisites list is the authoritative set; every link target in the script should be a subset.
- **Depends on**: TASK-009
- **Verification**: `rg -o '\]\(([^)]+\.md[^)]*)\)' -r '$1' internal-docs/pilot-operations/dry-run-script.md | sort -u` list — every entry resolves.

### TEST-DOC-004: Traceability to readiness brief
- **Files**: `internal-docs/pilot-operations/dry-run-script.md`, `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md`
- **Action**: Verify
- **Details**: Every finding marked **Pre-Saturday** or **At-Saturday** in the brief's Findings table maps to a named section or block in the script. Fill the Requirements Traceability table below with exact task IDs; failure = incomplete script.
- **Depends on**: TASK-004, TASK-005, TASK-006, TASK-009
- **Verification**: Requirements Traceability table below has an entry per Pre-Saturday / At-Saturday finding; each entry points at ≥ 1 TASK.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `internal-docs/pilot-operations/dry-run-script.md` | TASK-001..TASK-009 | The missing playbook artifact |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` | TASK-010 | Update Current State row + Findings #3/#4 to reflect that the script now exists |

## Requirements Traceability

> Spec source is the readiness brief, not a `docs/specs/*.md` file. Every Pre-Saturday / At-Saturday finding AND every normative schedule element from the brief must map to ≥ 1 TASK.

| Requirement (brief anchor) | Source | Task |
|---------------------------|--------|------|
| Finding #3 — No single dry-run script stitching runbook + demo + simulated customer | brief § Findings | TASK-001, TASK-002, TASK-003, TASK-004, TASK-009 |
| Finding #4 — No documented abort/rollback criteria | brief § Findings | TASK-005 |
| Finding #6 — Passphrase-gate UX not validated with non-team human (Block 5) | brief § Findings | TASK-004 (Block 5) |
| Finding #7 — Cross-device verification Friday PM + Saturday confirm | brief § Findings | TASK-002 (Friday afternoon) |
| Saturday 1–6 PM seven-block schedule | brief § Saturday Dry Run table | TASK-004 |
| Saturday 12:00–12:45 PM pre-flight checklist | brief § Pre-flight | TASK-003 |
| Friday 6:00 PM single go/no-go smoke test | brief § Single Go / No-Go Gate | TASK-002 (Friday evening) |
| Friday morning/afternoon/evening pre-work | brief § Pre-Saturday Schedule | TASK-002 |
| CEO receives one-page go/no-go memo by 6 PM Sat (4 questions) | brief § What the CEO Gets | TASK-007 |
| CEO Action Checklist Decisions 1/2/3 flow into script | brief § CEO Action Checklist | TASK-008 |
| "Current State" row "Dry-run script does not exist" resolved | brief § Current State | TASK-010 |
| "NOT doing" scope guardrails respected (no CDK, no VITE_API_KEY fix, no new features, no skipping cross-device) | brief § What We Are Explicitly NOT Doing | Plan-level constraint — every TASK is doc-only by design; no task adds code, infra, or features |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TEST-DOC-001 | review | Tabletop read-through — no handoff gaps; role consistency | TEST-DOC-001 |
| TEST-DOC-002 | property | Block durations sum to 300 minutes | TEST-DOC-002 |
| TEST-DOC-003 | property | All relative Markdown links resolve from repo root | TEST-DOC-003 |
| TEST-DOC-004 | traceability | Every Pre/At-Saturday finding mapped to a block or section | TEST-DOC-004 |

## Deviations from Spec

> None — plan is literal-compatible with brief. All normative blocks (Saturday schedule, pre-flight, smoke-test curl, Friday schedule, "NOT doing" guardrails, CEO memo questions) are reproduced verbatim in Spec Literals and quoted without paraphrase in the tasks that consume them.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| (none) | — | — | — |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CEO Decisions 1/2/3 still unresolved by Thursday evening — script has TBD slots but cannot execute Saturday | High | TASK-008 explicitly codifies the dependency; plan is executable today without the decisions because the template is decision-agnostic |
| Script content drifts from existing runbook / demo guide when one is updated | Medium | TASK-009 cross-links instead of duplicating content; any procedure already in a runbook stays in the runbook |
| Block 5 overruns and eats Block 6 | Medium | TASK-004 Block-5 exit criterion is "educator narrated all 4 panels without translation" — hard-stop at 4:45 regardless; Block 6 is the compression target if slippage occurs |
| Observation log format diverges between authoring time and Saturday execution | Medium | TASK-006 defines both columns and storage location; CS lead locks the choice Friday evening |
| Plan tempts scope creep (e.g., "while we're in here, fix VITE_API_KEY") | Medium | "NOT doing" guardrails from brief are reproduced in Spec Literals and restated as a plan-level constraint in the Requirements Traceability table |

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm test` — passes unchanged (no code touched; baseline 639 pass / 8 skip must still hold)
- [ ] `npm run lint` — passes unchanged
- [ ] `npm run typecheck` — passes unchanged
- [ ] TEST-DOC-001 through TEST-DOC-004 pass
- [ ] `rg -n 'Does not exist' internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` returns no match on the dry-run-script row
- [ ] New doc placed at `internal-docs/pilot-operations/dry-run-script.md` and indexed by `internal-docs/pilot-operations/` siblings' Related Documents where applicable (optional follow-up, not blocking)

## Implementation Order

```
TASK-001 ─┬─ TASK-002 ─┐
          ├─ TASK-003 ─┤
          ├─ TASK-008 ─┤
          └─ TASK-004 ─┼─ TASK-005 ─┐
                       ├─ TASK-006 ─┤
                       └─ TASK-007 ─┼─ TASK-009 ─ TASK-010 ─ TEST-DOC-001..004
```
