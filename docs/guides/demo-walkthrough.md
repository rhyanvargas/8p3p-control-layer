# Demo Walkthrough — Investor/Enterprise Audiences

**Audience:** Investors, enterprise buyers, demo observers  
**Goal:** Demonstrate the control-plane loop (signals → state → decisions → receipts) in ~60 seconds, anchored on **REINFORCE** and **INTERVENE**.  
**Reference:** `docs/reports/2026-02-23-ceo-scope-approval.md` (Edit #1: REINFORCE + INTERVENE anchors)

---

## Prerequisites

1. **Server running** at `http://localhost:3000` (or your host)
2. **API key set** in `.env.local` as `API_KEY=...`
3. **Demo data seeded:** `npm run seed:demo`

---

## Walkthrough Flow

**Total time target:** ~60 seconds for the walkthrough, ~2 minutes with narration.

### Step 1: Open Inspection Panels

Navigate to `http://localhost:3000/inspect/` (or `{host}/inspect/`).

**Talking point:** "This is the control-plane inspection surface. Four panels show the full loop: what came in, what state we computed, what decisions we made, and the trace for each decision."

---

### Step 2: Panel 1 — Signal Intake

1. Enter **org_id:** `org_demo` (or the org from your API key if `API_KEY_ORG_ID` is set)
2. Click **Refresh**

**Talking point:** "Panel 1 shows every signal that hit the API. Green = accepted, red = rejected, amber = duplicate. For `sam-t-reject` we see a rejection — missing required field. For the retry of `sam-t-001` we see duplicate. This proves ingestion integrity: we don't double-count, and we surface validation failures."

---

### Step 3: Panel 2 — State Viewer

1. Select learner **maya-k**
2. Show state version history (v1 → v2 as signals accumulated)
3. Highlight canonical fields: `stabilityScore`, `timeSinceReinforcement`
4. Select **alex-r** — lower stability, triggering intervene

**Talking point:** "Maya's stability is decaying — she hasn't had reinforcement in over 24 hours. Alex is in worse shape: stability is critically low. The state engine versioned both as signals arrived."

---

### Step 4: Panel 3 — Decision Stream

1. Show decisions for org `org_demo`
2. Point out **REINFORCE** for maya-k
3. Point out **INTERVENE** for alex-r
4. Mention **advance** for jordan-m if asked

**Talking point:** "REINFORCE = prevent decay before failure. INTERVENE = high-risk now, act immediately. These map to enterprise pain: waste and risk. The receipts make them defensible."

---

### Step 5: Panel 4 — Decision Trace

1. Click **maya-k**'s reinforce decision
2. Walk through: rationale, evaluated thresholds (`stabilityScore 0.62 < 0.7 ✓`, `timeSinceReinforcement 90000 > 86400 ✓`), frozen state snapshot, rule condition JSON
3. Click **alex-r**'s intervene decision for contrast

**Talking point:** "Every decision has a full trace: which rule fired, the exact thresholds, the frozen state. Auditors and compliance can verify why we recommended reinforce vs intervene."

---

## Talking Points Summary

| Panel | Key Message |
|-------|-------------|
| 1 | Ingestion integrity: accepted, rejected, duplicate — no double-counting |
| 2 | State versioning: canonical fields drive decisions; version history shows evolution |
| 3 | REINFORCE + INTERVENE anchor the narrative; advance available if asked |
| 4 | Full trace: rationale, thresholds, state snapshot — defensible and auditable |

---

## Re-running the Demo

- **Idempotent:** `npm run seed:demo` can be run multiple times. Re-sent signals produce `duplicate` (amber) — no data corruption.
- **Fresh start:** Clear databases in `./data/` and restart the server if you need a clean slate.
