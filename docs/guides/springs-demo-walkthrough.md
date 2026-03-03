# Springs Charter Schools Demo Walkthrough

**Audience:** Springs IT director, CTO, or pilot stakeholders  
**Goal:** Demonstrate one school, two populations (learners + staff), three LMS systems (Canvas, Blackboard, Absorb), and one decision record per person in ~3 minutes.  
**Reference:** `.cursor/plans/springs-demo-seed.plan.md`

---

## Prerequisites

1. **Server running** at `http://localhost:3000` (or your host)
2. **API key set** in `.env.local` as `API_KEY=...`
3. **Springs demo data seeded:** `npm run seed:springs-demo`

---

## Narrative Arc

**One school, two populations, three LMS systems, one decision record per person.**

---

## Step 1: Setup (30s)

Run:

```bash
npm run seed:springs-demo
```

**Talking point:** Show clean output — 14 signals, all outcomes match (✓). No rejections, no unexpected decision types.

---

## Step 2: Panel 1 — Signal Intake (30s)

1. Open **Inspection panels:** `http://localhost:3000/inspect/`
2. Enter **org_id:** `springs`
3. Click **Refresh**

**Talking point:** "Signals arrive from your three LMS platforms — Canvas, Blackboard, Absorb. 8P3P sees all of them. No polling, no ETL, no duplicate detection logic on your side."

---

## Step 3: Panel 2 — State Viewer (30s)

1. Select learner **stu-10042**
2. Show the state record — both Canvas and Blackboard signals contributed (merged fields)

**Talking point:** "One state record for this student, regardless of which LMS sent the data. State accumulates across all signals for a given learner reference. You define the canonical identifier — we keep it consistent."

Then select **teacher-7890**.

**Talking point:** "Same person: state shows both `stabilityScore` (from Canvas) and `complianceScore` (from Absorb). One identity, two systems."

**Optional — longer trace:** Select **staff-0201** or **staff-0403**. Show multiple state versions (v1 → v2 → v3) from repeated Absorb signals. "Each signal advances state; you see the full version history and which signal drove each update."

---

## Step 4: Panel 3 — Decision Stream (45s)

1. Filter by org **springs**
2. Point out:
   - **advance** for stu-10042 (from both Canvas and Blackboard)
   - **intervene** for stu-20891 and staff-0201 (staff-0201 has 3 decisions: reinforce → intervene → intervene)
   - **pause** for staff-0302
   - **reinforce** for stu-30456 and teacher-7890 (teacher-7890 has 3: 2 Absorb + 1 Canvas)
   - **advance** for staff-0403 (3 decisions: reinforce → reinforce → advance — good “improvement over time” story)

**Talking point:** "Every decision is logged with which rule fired and why. IT can query this programmatically. Build your early-warning dashboard on top of this API — you'll never have to re-derive who needs help."

---

## Step 5: Panel 4 — Decision Trace — The Showstopper (45s)

1. Click **teacher-7890**'s Canvas decision (reinforce)
   - Show `state_snapshot`: has `stabilityScore` — learner policy fields
2. Click **teacher-7890**'s Absorb decision (reinforce)
   - Show `state_snapshot`: has `complianceScore` — staff policy fields

**Talking point:** "Same person, one decision history, two different policies applied correctly per source system. Policy is tenant-specific and per user type. Students and staff get evaluated on the fields that matter for them — but the decision history lives in one place. No custom integration needed."

**Optional — longer receipt history:** Click **staff-0201** or **staff-0403** and step through their multiple decisions (Panel 3 row → Panel 4 trace). "You see the full receipt history: how compliance or training scores changed over time and which rule fired at each step."

---

## Talking Points Summary

| Panel | Key Message |
|-------|-------------|
| 1 | Your LMS systems send signals — we ingest all of them. No polling, no ETL, no duplicate detection on your side. |
| 2 | State accumulates across all signals for a given learner reference. You define the canonical identifier — we keep it consistent. |
| 3 | Every decision is a queryable record. Build early-warning dashboards on this API. |
| 4 | Policy is per user type; students and staff evaluated on the right fields; one decision history per person. |

---

## Timing

- **With narration:** ~3 minutes
- **Fast-paced:** ~90 seconds

---

## Re-running the Demo

- **Idempotent:** `npm run seed:springs-demo` can be run multiple times. Re-sent signals produce `duplicate` (○) — no double data.
- **Fresh start:** Clear databases in `./data/` and restart the server if you need a clean slate.
