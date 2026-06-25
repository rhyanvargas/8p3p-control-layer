# Springs Pilot Demo — Walkthrough Script

**Audience**: Superintendent, school principal, IT director, pilot stakeholders  
**Duration**: ~5–6 minutes with narration (pick 3–4 beats for a tight 4-minute cut)  
**Prerequisites**: Local API running, Springs seed v3 loaded, and Next.js dashboard running — see **[Local Dev & Testing](../foundation/setup.md)** (`npm run dev`, `npm run seed:springs-demo`, then `cd dashboard && npm run dev -- -p 3001`).

**Seed script**: [`examples/springs/seed-springs-demo.mjs`](../../examples/springs/seed-springs-demo.mjs) (v3 — 24 signals, 6 personas, learning gaps + trajectories + gifted-interest).

---

## What problem this demo solves (open with this)

> "Your district runs Canvas, Blackboard, i-Ready, and staff training in Absorb. No single platform shows whether a student is **actually learning** across all of them — or **where** they're falling behind relative to their own strengths in the same subject. This system ingests signals from every source, applies your policies, and surfaces **who needs attention**, **what skill is gaping**, and **whether support worked** — in under a minute per student."

**Superintendent lens**: district-wide visibility without another data warehouse project.  
**Principal lens**: actionable queue + skill-level gaps, not another grade export.  
**IT lens**: onboarding is field mappings once per LMS; after that, signals flow via API.

---

## Setup (30 seconds)

Fresh data (required after seed script changes):

```bash
rm -f data/*.db data/*.db-wal data/*.db-shm
npm run dev
npm run seed:springs-demo
```

Point out Phase 1 (4 LMS field mappings registered) and Phase 2 (**24 synthesized signals** across Canvas, Blackboard, i-Ready, and Absorb).

Open the dashboard at `http://localhost:3001/` (`CONTROL_LAYER_ORG_ID=springs` in `dashboard/.env.local`).

| Dashboard route | Legacy panel name | Demo purpose |
|-----------------|-------------------|--------------|
| `/attention` | Panel 1 + 3 | Who needs help; approve/reject intervene |
| `/learners` → row → sheet | Panel 2 + 4 | Why stuck (learning gaps); trajectory proof |
| `/` Overview | KPI drill-down | Program-level counts |
| `/decisions` | Audit trail | Receipts and rule rationale (L1 sheet) |

---

## Beat 1 — Overview (30 seconds) `/`

**Click**: Overview → note KPI cards (learners needing attention, decisions today). Click **Learners needing attention** if linked.

> "One landing page — not four LMS tabs. Counts come from the same policy engine your pilot will run in production."

Optional: hit **Refresh** and the freshness chip to show data is live from the control layer.

---

## Beat 2 — Who needs attention? (60 seconds) `/attention`

**What you see**: Intervene/pause queue sorted by urgency; **Problem area** column shows skill-level gap text.

### Maya Kim (`stu-10042`) — **learning gap (CEO priority)**

Cross-system: Canvas Math is fine; i-Ready Reading flagged. Problem area should cite **Reading** below English subject average (ELA writing at 88% vs Reading diagnostic at ~48%).

> "She's strong in ELA on Canvas and strong in Math — but i-Ready caught reading decay no math teacher would see. The gap is **within English**: writing vs reading, not just a low grade."

**Click**: Open row → review sheet → note problem areas and recent decisions.

### Alex Rivera (`stu-20891`) — **within-subject gap**

Canvas ELA-101 at 82%; ELA-201 at 28%; Blackboard Science also struggling.

> "Same student, same subject, two skills — one fine, one in crisis. That's the learning gap the CEO asked for: **where**, not just **how low**."

### Sam Torres (`stu-40123`) — **declining trajectory → intervene**

ELA slid 55% → 48% → 32%; latest decision is **intervene**.

> "This wasn't a sudden F — the system tracked decay across three signals before escalating."

### Ms. Davis (`staff-0201`) — staff on same rails

Absorb compliance 60% → 35%, 20 days overdue — **intervene**.

> "Students and staff, one queue — different policies, same transparency."

**Click** (Panel 3 beat): Approve or Reject one row from the review sheet; mention educator confirmation on high-stakes calls.

---

## Beat 3 — Why are they stuck? (60 seconds) `/learners`

**Click**: Learners → **Maya Kim** → detail sheet.

In **Summary** / problem areas, confirm `mastery_breakdown.learning_gaps` surfaces **Reading** (gap ~0.20 vs English subject mean).

> "In 60 seconds you see: Math subject strong, English subject mixed, **Reading is the gap skill** — not the overall GPA."

**Click**: **Alex Rivera** — gap should show **ELA-201** vs stronger ELA-101 in English.

**Optional superintendent line**:

> "This is confidence in **learning**, framed for educators — auditable rules underneath, not a black-box grade."

---

## Beat 4 — Did support work? (45 seconds) `/learners`

### Jordan Mitchell (`stu-30456`) — **improving trajectory**

**Click**: Jordan → **Trajectory** tab.

Three Canvas Math signals: 45% → 68% → 90%. History on Blackboard stable at ~80%.

> "Intervention proof — not hope. Three time-stamped signals, same skill, measurable lift to advance."

### Sam Torres (`stu-40123`) — **declining trajectory** (contrast)

**Click**: Sam → **Trajectory** tab.

> "Same chart type, opposite story — decline visible before intervene. Early identification, not end-of-term surprise."

---

## Beat 5 — Whole-child signal (30 seconds, optional) `/learners`

### Priya Patel (`stu-50199`) — **gifted-interest flag**

**Click**: Priya → Summary; note **Person of interest** (not a label — a consideration flag per policy).

Three subjects, all mastery ≥ 95%, advance-only history across 9 signals.

> "The system also flags students consistently excelling across skills — for enrichment conversations, not automatic tracking."

---

## Beat 6 — Audit / IT trust (30 seconds) `/decisions`

**Click**: Decisions → open any **intervene** row → L1 sheet shows rule id + rationale (educator summary at L0 in list).

> "Every decision is receipt-backed — which rule fired, which thresholds, frozen state snapshot. Defensible for parents, board, and auditors."

---

## The integration story (30 seconds)

> "Everything you saw came from four LMS shapes — Canvas, Blackboard, i-Ready, Absorb. Phase 1 registered field mappings; Phase 2 data flowed. No custom ETL per vendor, no manual spreadsheet merge."

---

## Persona quick reference (v3 seed)

| Persona | Reference | Demo beat | Signals | Key story |
|---------|-----------|-----------|---------|-----------|
| **Maya Kim** | `stu-10042` | Attention + Learners | 3 | Cross-system; **Reading learning gap** vs strong ELA/Math |
| **Alex Rivera** | `stu-20891` | Attention + Learners | 3 | **ELA-201 gap** vs ELA-101; Science intervene |
| **Jordan Mitchell** | `stu-30456` | Learners → Trajectory | 4 | Math **improving** 45→68→90%; advance |
| **Sam Torres** | `stu-40123` | Attention + Trajectory | 3 | ELA **declining** 55→48→32; intervene |
| **Priya Patel** | `stu-50199` | Learners (optional) | 9 | **Gifted-interest** flag; advance-only |
| **Ms. Davis** | `staff-0201` | Attention review | 2 | Staff compliance decay; intervene |

### Decision distribution (approximate after full seed)

| Type | Count | Personas |
|------|-------|----------|
| **advance** | 11+ | Maya (math), Jordan (math t3), Priya (×9) |
| **intervene** | 5+ | Maya (reading), Alex (ELA + science), Sam (ELA t3), Ms. Davis (compliance t2) |
| **reinforce** | 8+ | Maya (ELA), Alex (ELA-101), Jordan (math t1–2, history), Sam (ELA t1–2), Ms. Davis (compliance t1) |

### Source system distribution

| Source | Signals | Notes |
|--------|---------|-------|
| `canvas-lms` | 19 | Grades → mastery/stability; multi-signal trajectories |
| `blackboard-lms` | 2 | Alex science, Jordan history |
| `iready-diagnostic` | 1 | Maya reading decay + riskSignal |
| `absorb-lms` | 2 | Ms. Davis compliance (direct scores; no forbidden `score` key) |

---

## Pick your audience (cheat sheet for demo lead)

| If they're… | Lead with… | Skip if short on time |
|-------------|------------|------------------------|
| **Superintendent** | Maya learning gap + Jordan proof + integration story | Priya gifted |
| **Principal** | Attention queue + Maya/Alex problem areas + Sam decline | Decisions audit |
| **IT director** | Setup Phase 1 mappings + `/signals` ingestion log + Decisions trace | Priya gifted |
| **Teacher coach** | Alex within-subject gap + Sam trajectory tab | Overview KPIs |

---

## Reset between demos

```bash
rm -f data/*.db data/*.db-wal data/*.db-shm
npm run dev
npm run seed:springs-demo
```

Re-seeding **without** wipe skips duplicates and leaves stale state — always wipe for a clean narrative.

---

*Updated: 2026-06-24 (seed v3 — learning gaps, trajectories, gifted-interest) | Plan: `.cursor/plans/springs-realistic-seed.plan.md`*
