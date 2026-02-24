# QA Test Execution — Inspection Panels

Manual test cases for the **Inspection Panels** UI at `/inspect`. Use for QA sign-off after implementation per `.cursor/plans/inspection-panels.plan.md`.

**Scope:** Static panels (Signal Intake, State Viewer, Decision Stream, Decision Trace), tab navigation, API key UX when `API_KEY` is set, and correct consumption of Inspection API endpoints.

**Spec:** `docs/specs/inspection-panels.md`  
**Inspection UI:** `http://localhost:3000/inspect/`

---

## Prerequisites

```bash
npm install
npm run build
npm run dev
```

- Server: `http://localhost:3000`
- Panels: `http://localhost:3000/inspect/` (trailing slash required for static assets)

### Authentication (panels)

- If **`API_KEY`** is set, all panel requests to `/v1/*` require the key. In the panels UI, enter the key in the **API Key** field in the header; it is stored in `sessionStorage` and sent as `x-api-key` on each request.
- If **`API_KEY`** is unset (typical local dev), leave the API Key field empty; requests succeed without a header.

**Generate a key:** `npm run generate:api-key` — add the printed line to `.env`. Do not commit `.env`.

---

## Test Cases

### QA-IN-001: Shell loads and tab navigation

**URL:** `http://localhost:3000/inspect/`

**Steps:**

1. Open the URL in a browser.
2. Confirm the page loads with terminal-style styling (monospace, dark background).
3. Confirm four tabs are visible: **Signal Intake**, **State**, **Decisions**, **Trace**.
4. Click each tab and confirm the corresponding panel content is shown (no console errors).

**Expected:** Page loads; all four tabs switch without full reload; hash updates to `#signal`, `#state`, `#decisions`, `#trace` as appropriate.

---

### QA-IN-002: Panel 1 — Signal Intake (with data)

**Prerequisite:** At least one signal ingested (e.g. run QA-RE-002 from `docs/testing/qa-test-post-repository-extraction.md` with same server, or use Swagger `POST /v1/signals`).

**Steps:**

1. Open **Signal Intake** tab.
2. Enter an **org_id** that has ingestion activity (e.g. `org_8p3p`).
3. Click **Refresh** (or rely on initial load if implemented to fetch on org_id).
4. Confirm a table appears with columns: Time, Signal ID, Source, Schema, Outcome.
5. Confirm outcomes are visually distinct (e.g. accepted / duplicate / rejected).
6. If any row is rejected, expand or view rejection detail and confirm reason/code is shown.

**Expected:** Table shows ingestion log rows; outcome column reflects accepted/duplicate/rejected; rejection detail visible for rejected rows.

---

### QA-IN-003: Panel 1 — Filter by outcome

**Depends on:** QA-IN-002 (data present).

**Steps:**

1. In Signal Intake, use the outcome filter dropdown (All / Accepted / Rejected / Duplicate) if present.
2. Select **Accepted** (or **Rejected**) and refresh.
3. Confirm only rows matching that outcome are shown.

**Expected:** Filter reduces visible rows to the selected outcome (or equivalent behavior per implementation).

---

### QA-IN-004: Panel 2 — State Viewer (learner list and detail)

**Prerequisite:** At least one learner with state (e.g. after QA-RE-002).

**Steps:**

1. Open **State** tab.
2. Enter **org_id** (e.g. `org_8p3p`).
3. Click **Refresh** (or wait for load).
4. Confirm left pane shows a list of learners with version and updated time.
5. Click a learner.
6. Confirm right pane shows state detail: state_id, state_version, canonical fields (e.g. stabilityScore, masteryScore), provenance, and full state JSON (or collapsible section).

**Expected:** Learner list loads; selecting a learner shows their state; canonical fields and provenance are visible.

---

### QA-IN-005: Panel 2 — Version navigation

**Depends on:** QA-IN-004; learner has more than one state version (ingest multiple signals for same learner).

**Steps:**

1. In State Viewer, select a learner with multiple versions.
2. Use version selector (e.g. v1, v2, v3…) to switch.
3. Confirm state detail updates (state_version, canonical fields, provenance) for the selected version.

**Expected:** Version selector changes the displayed state to the selected version.

---

### QA-IN-006: Panel 3 — Decision Stream

**Prerequisite:** At least one decision for an org/learner (e.g. after QA-RE-002 and QA-RE-003).

**Steps:**

1. Open **Decisions** tab.
2. Enter **org_id** and **learner_reference** that have decisions.
3. Set time range to include the decision(s) (e.g. from 2020-01-01 to 2030-12-31).
4. Click **Refresh** (or wait for load).
5. Confirm table shows columns: Time, Decision, Rule, Priority, Policy, Learner.
6. Confirm at least one decision row is visible with correct type (e.g. reinforce, intervene).

**Expected:** Decision stream table populated; columns match spec; decision types and rules visible.

---

### QA-IN-007: Panel 3 → Panel 4 (Trace)

**Depends on:** QA-IN-006 (at least one decision in stream).

**Steps:**

1. In Decision Stream, click a decision row.
2. Confirm navigation to **Trace** tab (Panel 4).
3. Confirm trace view shows: decision type, decided_at, learner, policy, rule, priority.
4. Confirm **Rationale** and **State Snapshot** (or equivalent) sections are present.
5. Click **Back to Stream** (or equivalent); confirm return to Panel 3.

**Expected:** Row click opens Decision Trace for that decision; trace shows decision summary, rationale, and state snapshot; back returns to stream.

---

### QA-IN-008: Panel 4 — Direct load (no selection)

**Steps:**

1. Navigate directly to `http://localhost:3000/inspect/#trace` (or open Trace tab without selecting a decision from Panel 3).
2. Confirm the panel shows a clear message (e.g. "Select a decision from the stream") and does not error.

**Expected:** Trace panel shows placeholder/instruction when no decision is selected.

---

### QA-IN-009: API key required (when API_KEY set)

**Prerequisite:** Server started with `API_KEY` set in environment.

**Steps:**

1. Open `http://localhost:3000/inspect/` in a fresh browser session (or clear sessionStorage for localhost).
2. Leave API Key header field **empty**.
3. Open Signal Intake, enter org_id, click Refresh.
4. Confirm panels show an auth error or empty/error state (e.g. 401).
5. Enter the correct API key in the header field and refresh.
6. Confirm data loads.

**Expected:** Without key, panel requests fail (401 or error message); with correct key, data loads.

---

### QA-IN-010: Static assets and no console errors

**Steps:**

1. Open `/inspect/` and open browser DevTools → Console.
2. Switch through all four tabs and trigger refresh on each panel that has a refresh control.
3. Confirm no uncaught JavaScript errors in console.
4. Confirm styles load (terminal aesthetic: monospace font, dark theme).

**Expected:** No red errors in console; CSS applied; panels are read-only (no mutation endpoints called).

---

## Summary Table

| ID         | Area           | Action                          | Expected                          |
|------------|----------------|----------------------------------|-----------------------------------|
| QA-IN-001  | Shell          | Load /inspect/, switch tabs      | All tabs render, hash routing     |
| QA-IN-002  | Signal Intake  | org_id + Refresh                 | Ingestion table with outcomes      |
| QA-IN-003  | Signal Intake  | Filter by outcome                | Filtered rows                      |
| QA-IN-004  | State Viewer   | org_id, select learner           | List + state detail               |
| QA-IN-005  | State Viewer   | Version selector                 | State updates by version           |
| QA-IN-006  | Decision Stream| org_id, learner, time, Refresh   | Decision table populated           |
| QA-IN-007  | Trace          | Click row → Trace → Back         | Trace for decision, back to stream |
| QA-IN-008  | Trace          | Open #trace with no selection    | Placeholder message                |
| QA-IN-009  | Auth           | Without/with API key (API_KEY set)| 401 then success with key        |
| QA-IN-010  | General        | All tabs + refresh, DevTools     | No console errors, styles applied |

---

## Sign-Off

- [ ] All QA-IN-001 through QA-IN-010 executed.
- [ ] Failures documented with environment (with/without API_KEY), steps, and screenshot or console/network detail.
- [ ] Automated tests passing: `npm test` (includes `tests/integration/inspection-panels.test.ts`).

**Plan:** `.cursor/plans/inspection-panels.plan.md`  
**Spec:** `docs/specs/inspection-panels.md`
