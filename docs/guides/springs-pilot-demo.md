# Springs Pilot Demo — Walkthrough Script

**Audience**: School principal, IT director, pilot stakeholders
**Duration**: ~4 minutes with narration
**Prerequisites**: Server running (`npm run dev`), seed data loaded (`npm run seed:springs-demo`)

---

## Setup (30 seconds)

Run the seed script:

```bash
npm run seed:springs-demo
```

Point out Phase 1 (onboarding — 4 LMS field mappings registered) and Phase 2 (11 signals flowing from Canvas, Blackboard, i-Ready, and Absorb).

> **Talking point**: "This is the onboarding step — we told the system how to read data from each of your LMS platforms. After that, data just flows. No custom code per vendor."

Open the dashboard at `http://localhost:3000/dashboard/` (org: `springs`).

---

## Panel 1 — Who Needs Attention? (45 seconds)

**What you see**: Learners and staff flagged for intervention, sorted by urgency.

### Maya Kim (`stu-10042`)

i-Ready reading diagnostic flagged her. Canvas math is fine — advance decision.

> "Her Canvas math is fine — it's the i-Ready diagnostic that caught the vocabulary decline. No single system sees both. That's the value of cross-system intelligence."

### Alex Rivera (`stu-20891`)

Struggling on both Canvas ELA and Blackboard Science — two intervene decisions.

> "Two platforms, same conclusion — this student needs help now. Without cross-system visibility, a teacher in one class wouldn't know about the other."

### Ms. Davis (`staff-0201`)

Staff compliance declining in Absorb — intervene decision.

> "Staff and students in the same system, different policies, both surfaced. Compliance dropped from 60% to 35%, 20 days overdue."

---

## Panel 2 — Why Are They Stuck? (45 seconds)

**What you see**: Skill-level breakdowns with direction arrows (improving/declining/stable).

### Maya Kim

Reading stability at 22%. The i-Ready MOY diagnostic showed vocabulary regression.

> "Reading stability at 22%. The i-Ready MOY diagnostic showed vocabulary regression — that's the specific skill. Math is fine at 92%. The system surfaces the exact gap."

### Alex Rivera

ELA and Science both below 30% stability. Multiple declining skills across platforms.

> "ELA and Science both below 30% stability. Multiple declining skills across platforms. The direction arrows show declining in both."

### Ms. Davis

Compliance dropped from 60% to 35%, 20 days overdue. Direction arrow shows declining.

> "Compliance dropped from 60% to 35%. The system tracks the trajectory — not just the current score, but where it's heading."

---

## Panel 3 — What To Do? (30 seconds)

**What you see**: The most recent intervene or pause decision awaiting educator review, with Approve/Reject buttons. Panel 3 only surfaces high-stakes decisions — intervene and pause — because these are the actions that should have a human in the loop before the system acts.

### Ms. Davis (`staff-0201`)

Intervene decision for Annual Compliance 2026 — pending administrator review with Approve/Reject.

> "This is the educator handoff. The system flagged Ms. Davis for intervention — compliance at 35%, 20 days overdue. The administrator approves or rejects. One click. The system decides, but humans confirm the high-stakes calls."

---

## Panel 4 — Did It Work? (45 seconds)

**What you see**: Trajectory tracking with mastery improvement over time.

### Jordan Mitchell (`stu-30456`)

Three math signals over time: 45% → 68% → 90% mastery. Level transition: proficient → mastery.

> "Three math signals over time: 45%, 68%, 90%. The intervention worked. Level transition: proficient to mastery. This is the proof — not a guess, not a hope. Measurable improvement tracked automatically."

Also: Blackboard History at 80% mastery, reinforcing — a balanced picture across platforms.

---

## The Integration Story (30 seconds)

> "Everything you just saw came from 4 real LMS platforms — Canvas, Blackboard, i-Ready, Absorb. The system registered field mappings for each one in Phase 1. That's the onboarding step. After that, data just flows."
>
> "No custom code per vendor. No manual data entry. No spreadsheet reconciliation. One system, one view, one set of decisions — across every platform your district uses."

---

## Persona Reference

| Persona | Reference | Sources | Signals | Key Decisions |
|---------|-----------|---------|---------|---------------|
| **Maya Kim** | `stu-10042` | Canvas (Math 301), i-Ready (Reading) | 2 | Math → advance; Reading → intervene |
| **Alex Rivera** | `stu-20891` | Canvas (ELA 201), Blackboard (Science 101) | 2 | ELA → intervene; Science → intervene |
| **Jordan Mitchell** | `stu-30456` | Canvas (Math 301 ×3), Blackboard (History 202) | 4 | Math trajectory: reinforce → reinforce → advance; History → reinforce |
| **Sam Torres** | `stu-40123` | Canvas (ELA 201) | 1 | ELA → reinforce (borderline — visible in inspection) |
| **Ms. Davis** | `staff-0201` | Absorb (Annual Compliance 2026 ×2) | 2 | Compliance: reinforce → intervene (declining) |

### Decision Distribution

| Type | Count | Personas |
|------|-------|----------|
| **advance** | 2 | Maya (math), Jordan (math t3) |
| **intervene** | 4 | Maya (reading), Alex (ELA + science), Ms. Davis (compliance t2) |
| **reinforce** | 5 | Jordan (math t1 + t2, history), Sam (ELA), Ms. Davis (compliance t1) |

### Source System Distribution

| Source | Signals | Field Mapping Highlights |
|--------|---------|--------------------------|
| `canvas-lms` | 6 | Caliper GradeEvent → `masteryScore`, `stabilityScore` via `scoreGiven/maxScore` |
| `blackboard-lms` | 2 | Caliper AssignableEvent → same targets, different `maxScore` path |
| `iready-diagnostic` | 1 | CSV-to-JSON adapter → `overallScaleScore/maxScaleScore`, percentile, diagnostic gain |
| `absorb-lms` | 2 | REST enrollment → `complianceScore`, `trainingScore`, `daysOverdue` |

---

*Created: 2026-04-14 | Plan: .cursor/plans/springs-realistic-seed.plan.md*
