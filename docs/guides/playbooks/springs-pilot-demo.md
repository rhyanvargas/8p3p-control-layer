# Springs Pilot Demo — Walkthrough Script

**Audience**: Superintendent, school principal, IT director, pilot stakeholders  
**Duration**: ~5–6 minutes with narration (pick 3–4 beats for a tight 4-minute cut)  
**Prerequisites**: Local API running, Springs seed **v6** loaded (multi-skill whole-child + sparse-evidence personas), and Next.js dashboard running — see **[Local Dev & Testing](../../foundation/setup.md)** (`npm run dev`, `npm run seed:springs-demo`, then `cd dashboard && npm run dev -- -p 3001`).

**Seed script**: [`examples/springs/seed-springs-demo.mjs`](../../../examples/springs/seed-springs-demo.mjs) (v6 — baseline ~90-day arcs + `--mode append` near-now micro-batch; builders in [`seed-builders.mjs`](../../../examples/springs/seed-builders.mjs)).

---

## What problem this demo solves (open with this)

> "Your district runs Canvas, Blackboard, i-Ready, and staff training in Absorb. No single platform shows whether a student is **actually learning** across all of them — or **where** they're falling behind relative to their own strengths in the same subject. This system ingests signals from every source, applies your policies, and surfaces **who needs attention**, **what skill is gaping**, and **whether support worked** — in under a minute per student."

**Superintendent lens**: district-wide visibility without another data warehouse project.  
**Principal lens**: actionable queue + skill-level gaps, not another grade export.  
**IT lens**: onboarding is field mappings once per LMS; after that, signals flow via API.

---

## Setup (30 seconds)

Fresh baseline (required after seed script changes or for a clean narrative):

```bash
rm -f data/*.db data/*.db-wal data/*.db-shm
npm run dev
npm run seed:springs-demo
```

Keep the demo instance fresh **without wiping** (near-now micro-batch — appends new signals with current event times):

```bash
npm run seed:springs-demo -- --mode append
# optional: --wave 20260711 --window-minutes 90 --as-of 2026-07-11T20:00:00Z
```

Event timestamps fall in the last `--window-minutes` (default 90) ending at now (or `--as-of`). Same `--wave` re-run is idempotent (duplicates); a new calendar day / wave adds another batch.

Point out Phase 1 (4 LMS field mappings registered) and Phase 2 (baseline arcs or append continuation across Canvas, Blackboard, i-Ready, and Absorb).

Open the dashboard at `http://localhost:3001/` (`CONTROL_LAYER_ORG_ID=springs` in `dashboard/.env.local`).

| Dashboard route | Legacy panel name | Demo purpose | Persona |
|-----------------|-------------------|--------------|---------|
| `/attention` | Panel 1 + 3 | Who needs help; approve/reject intervene | Educator + compliance |
| `/learners` → row → sheet | Panel 2 + 4 | Why stuck (learning gaps); trajectory proof | Educator + compliance (educator: Overview + Struggles tabs only) |
| `/` Overview | KPI drill-down | Program-level counts | Educator + compliance |
| `/decisions` | Audit trail | Receipts and rule rationale (L1 sheet) | **Compliance only** |
| `/signals` | Ingestion log + upload | Signal upload wizard | **Compliance only** |
| `/reports` | Program / research export | Export hooks when enabled | **Compliance only** |
| `/learners/[ref]` → State / Trajectory tabs | Panel 4 drill-down | JSON state, time-series proof | **Compliance only** |

---

## Two-path demo (normative for hosted pilot)

**Normative for** [`pilot-charter-onboarding.plan.md`](../../../.cursor/plans/pilot-charter-onboarding.plan.md) TASK-020 (demo video) and the [organic educator wave](../../../docs/guides/scenarios/organic-educator-wave.md). Use **separate logins** (educator code vs compliance code) when dual-passphrase is configured; until persona middleware ships, the host **must** enforce these paths manually.

### Educator path (~5 min)

1. **`/`** — Overview: **Needs your action** KPIs, **7d** period bar, **Classroom activity** cumulative insight (D4).
2. **`/attention`** — Queue; open Maya Kim or Alex Rivera; Approve or Reject one row from the review sheet.
3. **`/learners`** → row → **Open full view** — sticky **Action required** bar on learner L2 when pending (LPR roster path); then **Struggles & progress** tab — plain-language gap (“where”, not rule ids).
4. Optional: **Send feedback** from the app shell.

**Never on educator path:** `/decisions`, `/signals`, `/reports`, or Learner **State** / **Trajectory** tabs.

### Compliance path (separate login / second tab)

1. **`/decisions`** — Open an **intervene** row → L1 trace sheet → **Export JSON**.
2. Optional: **`/signals`** — upload wizard + ingestion log (IT trust beat).
3. Optional: **`/reports`** — program/research export when enabled.

Full narrative beats below remain valid for **compliance** demos and local Springs seed walkthroughs. For live educator Zoom sessions, prefer the educator path only.

---

## Beat 1 — Overview (30 seconds) `/`

**Click**: Overview → note **Needs your action** KPIs (Needs attention, Pending decisions) and **Program health** row below. Point at the **7d** period bar and **Classroom activity** card — cumulative needs-review insight line above the chart.

> "One landing page — not four LMS tabs. Counts come from the same policy engine your pilot will run in production; the chart shows who accumulated review work this week."

Optional: toggle **Link chart and table** ON and click a legend series to filter the recent table (D2 sync). Hit **Refresh** and the freshness chip to show data is live from the control layer.

---

## Beat 2 — Who needs attention? (60 seconds) `/attention`

**What you see**: Intervene/pause queue sorted by urgency; **Problem area** column shows skill-level gap text.

### Maya Kim (`stu-10042`) — **whole-child multi-skill (CEO priority)**

Four skills, three subjects, distinct decisions: Canvas **Math advance**, Canvas **ELA reinforce**, i-Ready **Reading intervene**, Blackboard **Science intervene**.

> "She's not a math kid or a reading kid — she's both. Math is fine, writing holds up, but reading and science need attention. One learner, multiple skills, multiple decisions."

**Click**: Open row → review sheet → note problem areas span Reading and Science; recent decisions show advance + reinforce + intervene.

### Alex Rivera (`stu-20891`) — **within-subject gap + multi-subject**

Canvas Math advancing; ELA-101 at 82%; ELA-201 at 28%; Blackboard Science also struggling.

> "Same student, same subject, two skills — one fine, one in crisis. That's the learning gap the CEO asked for: **where**, not just **how low**. And Science is a third subject in intervene."

### Sam Torres (`stu-40123`) — **multi-skill decline → intervene**

Math needs reinforce; Science already intervene; ELA slid 55% → 48% → 32% to intervene.

> "This wasn't a sudden F in one class — decay across English while Math and Science also need support."

### Casey Nguyen (`stu-60001`) — **sparse evidence**

Only one or two Math reinforces — not enough for a rich multi-skill profile.

> "Brand-new signal stream. The system doesn't invent a story — it shows early reinforce until evidence accumulates."

### Ms. Davis (`staff-0201`) — staff on same rails

Absorb compliance 60% → 35%, 20 days overdue — **intervene**.

> "Students and staff, one queue — different policies, same transparency."

**Click** (Panel 3 beat): Approve or Reject one row from the review sheet; mention educator confirmation on high-stakes calls.

---

## Beat 3 — Why are they stuck? (60 seconds) `/learners`

**Click**: Learners → **Maya Kim** → detail sheet → **Open full view**.

If Maya has a pending urgent decision, the sticky **Action required** bar appears at the bottom (roster path — subcopy: *Approve or reject this recommendation for this learner.*). Optional: Approve from the bar; URL stays on `/learners/[ref]` (no redirect to Attention).

In **Summary** / problem areas, confirm `mastery_breakdown` shows **Math + English + Science**, with **Reading** and **SCI-101** as gap skills.

> "In 60 seconds you see: Math strong, English mixed (writing vs reading), Science struggling — not a single overall GPA."

**Click**: **Alex Rivera** — gap should show **ELA-201** vs stronger ELA-101 in English, plus Math and Science subjects.

**Optional superintendent line**:

> "This is confidence in **learning**, framed for educators — auditable rules underneath, not a black-box grade."

---

## Beat 4 — Did support work? (45 seconds) `/learners`

### Jordan Mitchell (`stu-30456`) — **improving trajectory**

**Click**: Jordan → **Trajectory** tab.

Three Canvas Math signals: 45% → 68% → 90%. History and Science on Blackboard at reinforce levels.

> "Intervention proof — not hope. Three time-stamped signals, same skill, measurable lift to advance — while History and Science stay visible in the same profile."

### Sam Torres (`stu-40123`) — **declining trajectory** (contrast)

**Click**: Sam → **Trajectory** tab.

> "Same chart type, opposite story — ELA decline visible before intervene, with Math and Science also in the multi-skill state."

---

## Beat 5 — Whole-child signal (30 seconds, optional) `/learners`

### Priya Patel (`stu-50199`) — **gifted-interest flag**

**Click**: Priya → Summary; note **Person of interest** (not a label — a consideration flag per policy).

Four skills (Math, Science, ELA, Reading), all mastery ≥ 95%, advance-only history.

> "The system also flags students consistently excelling across skills — for enrichment conversations, not automatic tracking."

---

## Beat 6 — Audit / IT trust (30 seconds) `/decisions` *(compliance path only)*

**Click**: Decisions → open any **intervene** row → L1 sheet shows rule id + rationale (educator summary at L0 in list). **Export JSON** for audit receipt.

> "Every decision is receipt-backed — which rule fired, which thresholds, frozen state snapshot. Defensible for parents, board, and auditors."

> **Educator Zoom sessions:** skip this beat; use Beat 2–3 only (Attention + Struggles & progress). See [§ Two-path demo](#two-path-demo-normative-for-hosted-pilot).

---

## The integration story (30 seconds)

> "Everything you saw came from four LMS shapes — Canvas, Blackboard, i-Ready, Absorb. Phase 1 registered field mappings; Phase 2 data flowed. No custom ETL per vendor, no manual spreadsheet merge."

---

## Persona quick reference (v6 seed)

| Persona | Reference | Demo beat | Skills | Key story | Append continuation |
|---------|-----------|-----------|--------|-----------|----------------------|
| **Maya Kim** | `stu-10042` | Attention + Learners | Math, ELA, Reading, Science | **Whole-child** — advance / reinforce / intervene / intervene | Reading improves slowly; Science stays intervene |
| **Alex Rivera** | `stu-20891` | Attention + Learners | Math, ELA-101, ELA-201, Science | **ELA-201 gap** + Math advance + Science intervene | ELA-201 slight lift; Science flat |
| **Jordan Mitchell** | `stu-30456` | Learners → Trajectory | Math, History, Science | Math **improving** 45→68→90%; multi-subject | Math stays advance; Science edges up |
| **Sam Torres** | `stu-40123` | Attention + Trajectory | Math, Science, ELA | Multi-skill; ELA **declining** 55→48→32 | ELA keeps decaying; Math slips |
| **Priya Patel** | `stu-50199` | Learners (optional) | Math, Science, ELA, Reading | **Gifted-interest** across four skills | Keep advance / gifted evidence |
| **Casey Nguyen** | `stu-60001` | Learners (sparse) | Math | **Sparse evidence** — early reinforce only | One more Math reinforce |
| **Ms. Davis** | `staff-0201` | Attention review | Compliance | Staff compliance decay; intervene | Stay overdue / intervene |

### Decision distribution (verified signals after full baseline; ambient/historical skipped)

| Type | Count | Personas |
|------|-------|----------|
| **advance** | 15 | Maya (math), Alex (math), Jordan (math t3), Priya (advance-only set) |
| **intervene** | 7 | Maya (reading + science), Alex (ELA-201 + science), Sam (science + ELA), Ms. Davis |
| **reinforce** | 12 | Maya (ELA), Alex (ELA-101), Jordan (math t1–2, history, science), Sam (math + ELA t1–2), Casey (Math), Ms. Davis |

### Source system distribution (verified baseline signals; ambient excluded)

| Source | Signals | Notes |
|--------|---------|-------|
| `canvas-lms` | 23 | Grades → mastery/stability; multi-signal trajectories |
| `blackboard-lms` | 5 | Science / History arcs across personas |
| `iready-diagnostic` | 4 | Maya reading + Priya gifted reading evidence |
| `absorb-lms` | 2 | Ms. Davis compliance (direct scores; no forbidden `score` key) |

---

## Pick your audience (cheat sheet for demo lead)

| If they're… | Lead with… | Skip if short on time |
|-------------|------------|------------------------|
| **Superintendent** | Maya learning gap + Jordan proof + integration story | Priya gifted |
| **Principal** | Educator path: Attention + Struggles & progress (Maya/Alex/Sam) | Decisions audit |
| **IT director** | Compliance path: Phase 1 mappings + `/signals` + Decisions trace + Export JSON | Priya gifted |
| **Teacher coach** | Alex within-subject gap + Sam trajectory tab | Overview KPIs |

---

## Reset between demos

**Clean narrative** (wipe + baseline):

```bash
rm -f data/*.db data/*.db-wal data/*.db-shm
npm run dev
npm run seed:springs-demo
```

**Fresh trends without wipe** (hosted / live demo instance — simulates a recent LMS sync):

```bash
npm run seed:springs-demo -- --mode append
```

Re-seeding baseline **without** wipe skips duplicates and leaves stale endings — wipe for a clean narrative. Use **append** to add a near-now micro-batch (`*-append-YYYYMMDD-*` ids; event times within the last ~90 minutes).

---

*Updated: 2026-07-11 (seed v6 — baseline + near-now append micro-batch; Casey sparse-evidence) | Organic wave: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-006*
