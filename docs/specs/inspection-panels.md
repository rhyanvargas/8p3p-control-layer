# Inspection Panels Specification

> Four read-only control-plane inspection panels for enterprise pilots, integration debugging, auditability, and investor/enterprise demos.

## Overview

The inspection panels are a minimal, read-only frontend that proves the control-plane loop: **signals → state → decisions → receipts**. They are not product UI, workflow tools, or dashboards. They exist to serve three audiences:

1. **Enterprise integration teams** — debug signal ingestion and verify data flows
2. **Compliance/governance reviewers** — audit decision provenance and rule traceability
3. **Investors/demo observers** — see the system operating in real time

The panels consume the Inspection API (`docs/specs/inspection-api.md`) and existing control-layer endpoints. They are static, read-only views with no state management, mutations, or complex UI logic.

**Doctrine alignment:** These panels do not violate the "no UI ownership" principle. They are inspection surfaces over control-plane data, not user-facing product features. They do not manage workflows, enforce decisions, or own any learning domain UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Inspection Panels                    │
│   (Static SPA — HTML/CSS/JS, no framework required)  │
├──────────┬──────────┬──────────┬─────────────────────┤
│ Panel 1  │ Panel 2  │ Panel 3  │ Panel 4             │
│ Signal   │ State    │ Decision │ Decision Trace /    │
│ Intake   │ Viewer   │ Stream   │ Receipt             │
└────┬─────┴────┬─────┴────┬─────┴────┬────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌────────────────────────────────────────────────────┐
│              Control Layer REST API                 │
│  GET /v1/ingestion  GET /v1/state  GET /v1/decisions│
└────────────────────────────────────────────────────┘
```

### Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | None required — vanilla HTML/CSS/JS or lightweight library (e.g., Preact, htmx) | Panels are read-only with no complex state; a framework would be overhead. If a framework is used, keep it under 50KB gzipped. |
| Styling | Minimal, monospaced/terminal aesthetic | Signals trust and technical authority. These are inspection tools, not consumer UI. |
| Hosting | Served by the existing Fastify server as static files | No separate frontend build/deploy. Panels live at `/inspect` or similar. |
| Data refresh | Manual refresh button + optional auto-poll (5–30s interval) | No WebSocket required for Phase 1. Polling is sufficient for demos and debugging. |
| Routing | Hash-based or tab-based navigation between panels | No client-side router needed. Simple tab switching. |

---

## Panel 1: Signal Intake

### Purpose

Proves ingestion is real. Helps enterprise integration teams see what's arriving, what's passing validation, and what's failing.

### Data Source

`GET /v1/ingestion?org_id={org}&limit={n}`

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ SIGNAL INTAKE                                    [Refresh ↻] │
├──────────────────────────────────────────────────────────────┤
│ Filter: [All ▾] [org_id: ________]               Showing: 50│
├──────┬──────────┬──────────────┬──────────┬──────────────────┤
│ Time │ SignalID │ Source       │ Schema   │ Outcome          │
├──────┼──────────┼──────────────┼──────────┼──────────────────┤
│ 21:27│ qa2-001  │ external-lms │ v1       │ ✓ accepted       │
│ 21:26│ qa2-001  │ external-lms │ v1       │ ○ duplicate      │
│ 21:25│ bad-sig  │ unknown      │ v1       │ ✗ rejected       │
│      │          │              │          │ missing_required │
│      │          │              │          │   _field         │
└──────┴──────────┴──────────────┴──────────┴──────────────────┘
```

### Fields Displayed

| Column | Source Field | Notes |
|--------|-------------|-------|
| Time | `received_at` | Formatted as HH:MM:SS or relative ("3s ago") |
| Signal ID | `signal_id` | Truncated if long, full on hover |
| Source | `source_system` | |
| Schema | `schema_version` | |
| Outcome | `outcome` | Color-coded: green (accepted), amber (duplicate), red (rejected) |
| Rejection Detail | `rejection_reason.code` | Shown inline below rejected rows. Expandable to show `message` and `field_path`. |

### Interactions

- **Filter by outcome:** Dropdown to filter accepted/rejected/duplicate/all
- **Filter by org_id:** Text input (required)
- **Refresh:** Manual button, optional auto-poll toggle
- **Row expand:** Click rejected row to see full rejection reason
- **Pagination:** "Load more" button or infinite scroll (using `cursor`)

---

## Panel 2: State Viewer

### Purpose

Proves persistent learning memory exists outside tools. Shows the accumulated learner state with version history and canonical fields.

### Data Sources

- `GET /v1/state/list?org_id={org}` — learner index
- `GET /v1/state?org_id={org}&learner_reference={ref}` — full state
- `GET /v1/state?org_id={org}&learner_reference={ref}&version={n}` — historical version

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ STATE VIEWER                                     [Refresh ↻] │
├────────────────────────┬─────────────────────────────────────┤
│ LEARNERS               │ STATE: maya-k (v4)                  │
│ [org_id: ________]     │                                     │
│                        │ state_id: org_8p3p:maya-k:v4        │
│ maya-k         v4  3m  │ state_version: 4                    │
│ aisha-5th      v1  8m  │ updated_at: 2026-02-18T21:27:36Z   │
│ vec-8a         v1 12m  │                                     │
│ vec-8b         v1 12m  │ ── Canonical Fields ──              │
│ vec-8c         v1 12m  │ stabilityScore:    0.28             │
│                        │ masteryScore:      0.45             │
│                        │ confidenceInterval: 0.65            │
│                        │ riskSignal:        0.15             │
│                        │ timeSinceReinforce: 90000           │
│                        │                                     │
│                        │ ── Provenance ──                    │
│                        │ last_signal: qa2-sig-001            │
│                        │ signal_time: 2026-02-18T21:27Z      │
│                        │                                     │
│                        │ ── Full State (JSON) ──             │
│                        │ { "stabilityScore": 0.28, ... }     │
│                        │                                     │
│                        │ [v1] [v2] [v3] [▸v4]    Version ◂▸ │
└────────────────────────┴─────────────────────────────────────┘
```

### Fields Displayed

**Left pane (Learner Index):**

| Column | Source Field | Notes |
|--------|-------------|-------|
| Learner | `learner_reference` | |
| Version | `state_version` | Current version |
| Updated | `updated_at` | Relative time ("3m ago") |

**Right pane (State Detail):**

| Section | Fields | Notes |
|---------|--------|-------|
| Header | `state_id`, `state_version`, `updated_at` | |
| Canonical Fields | Keys present in `state` object | Rendered from actual state keys so this section always matches Full State (JSON). Supports learner fields (e.g. `stabilityScore`, `masteryScore`) and staff/multi-policy fields (e.g. `complianceScore`, `trainingScore`, `daysOverdue`, `certificationValid`). Highlighted if value present, grayed if missing. Empty state shows "(no fields in state)". |
| Provenance | `provenance.last_signal_id`, `provenance.last_signal_timestamp` | |
| Full State | `state` (raw JSON) | Collapsible JSON viewer |
| Version Selector | Version buttons/slider | Navigate between historical versions |

### Interactions

- **Select learner:** Click learner in left pane to load their state
- **Version navigation:** Click version buttons to view historical state
- **Filter by org_id:** Text input (required, affects learner list)
- **Refresh:** Manual button
- **JSON toggle:** Expand/collapse full raw state JSON

---

## Panel 3: Decision Stream

### Purpose

Proves decision authority exists and operates continuously. Shows a live feed of receipts (decision_type, rule, policy) for the audit trail.

### Data Source

`GET /v1/receipts?org_id={org}&learner_reference={ref}&from_time={t}&to_time={t}`

Same query parameters and pagination as `GET /v1/decisions`. Receipts are the compliance/audit projection; the Pri column shows "—" because receipts omit `output_metadata`.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ DECISION STREAM                                  [Refresh ↻] │
├──────────────────────────────────────────────────────────────┤
│ [org_id: ________] [learner: ________]  [from ___] [to ___] │
├──────┬───────────┬───────────┬────┬──────┬───────────────────┤
│ Time │ Decision  │ Rule      │ Pri│ Pol. │ Learner           │
├──────┼───────────┼───────────┼────┼──────┼───────────────────┤
│ 21:28│ recommend │ rule-rec  │  7 │ 2.0.0│ vec-8g            │
│ 21:28│ advance   │ rule-adv  │  6 │ 2.0.0│ vec-8f            │
│ 21:28│ reinforce │ rule-rein │  5 │ 2.0.0│ vec-8e            │
│ 21:28│ intervene │ rule-intv │  4 │ 2.0.0│ vec-8d            │
│ 21:28│ reroute   │ rule-rrt  │  3 │ 2.0.0│ vec-8c            │
│ 21:28│ pause     │ rule-pause│  2 │ 2.0.0│ vec-8b            │
│ 21:27│ escalate  │ rule-esc  │  1 │ 2.0.0│ vec-8a            │
│ 21:27│ reinforce │ rule-rein │  5 │ 2.0.0│ maya-k            │
│ 21:27│ reinforce │ (default) │  — │ 2.0.0│ aisha-5th         │
└──────┴───────────┴───────────┴────┴──────┴───────────────────┘
```

### Fields Displayed

| Column | Source Field | Notes |
|--------|-------------|-------|
| Time | `decided_at` | Formatted as HH:MM:SS |
| Decision | `decision_type` | Color-coded by type (red=escalate, amber=pause, blue=reinforce, green=advance, etc.) |
| Rule | `trace.matched_rule_id` | Truncated. "(default)" when null. |
| Priority | — | Receipts omit `output_metadata`; column shows "—". Use `GET /v1/decisions` for priority. |
| Policy | `trace.policy_id` (name), `trace.policy_version` | "name (version)" (e.g. springs:staff (1.0.0)). |
| Learner | `learner_reference` | |

### Interactions

- **Filter by org_id and learner:** Text inputs (org required, learner required — `GET /v1/receipts` requires `learner_reference`; for org-wide receipts use the fan-out pattern via `GET /v1/state/list`, see `docs/guides/get-all-learner-decisions-from-org.md`)
- **Time range:** From/to date-time pickers
- **Click row:** Navigate to Panel 4 (Decision Trace) for the selected receipt
- **Color legend:** Hover on decision type for description
- **Refresh:** Manual button, optional auto-poll

---

## Panel 4: Decision Trace / Receipt

### Purpose

Proves explainability, governance, and auditability. This is the enterprise trust panel. Shows the complete audit record for a single decision: the exact state at decision time, the rule that fired, the thresholds compared, and the rationale.

### Data Source

`GET /v1/decisions?org_id={org}&learner_reference={ref}&from_time={t}&to_time={t}` (single decision/receipt, selected from Panel 3 or by decision_id)

Panel 3 loads receipts via `GET /v1/receipts`; the selected row passes receipt data (plus learner_reference) to Panel 4. Panel 4 renders the receipt trace (rationale, thresholds, state snapshot, rule condition). Priority shows "—" when viewing a receipt.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ DECISION TRACE                            decision_id: 5dac… │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ── Decision ──                                               │
│ type:       reinforce                                        │
│ decided_at: 2026-02-18T21:27:36.692Z                        │
│ learner:    maya-k                                           │
│ policy:     2.0.0                                            │
│ rule:       rule-reinforce                                   │
│ priority:   5                                                │
│                                                              │
│ ── Rationale ──                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Rule rule-reinforce fired:                               │ │
│ │   stabilityScore (0.28) < 0.7  ✓                        │ │
│ │   timeSinceReinforcement (90000) > 86400  ✓             │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ── Evaluated Thresholds ──                                   │
│ ┌────────────────────────┬────┬───────────┬────────┬───────┐ │
│ │ Field                  │ Op │ Threshold │ Actual │ Pass  │ │
│ ├────────────────────────┼────┼───────────┼────────┼───────┤ │
│ │ stabilityScore         │ <  │ 0.7       │ 0.28   │ ✓     │ │
│ │ timeSinceReinforcement │ >  │ 86400     │ 90000  │ ✓     │ │
│ └────────────────────────┴────┴───────────┴────────┴───────┘ │
│                                                              │
│ ── State Snapshot (at decision time) ──                      │
│ state_id:      org_8p3p:maya-k:v4                            │
│ state_version: 4                                             │
│ {                                                            │
│   "stabilityScore": 0.28,                                    │
│   "masteryScore": 0.45,                                      │
│   "timeSinceReinforcement": 90000,                           │
│   "confidenceInterval": 0.65,                                │
│   "riskSignal": 0.15,                                        │
│   "firstName": "Maya",                                       │
│   "gradeLevel": "K",                                         │
│   ...                                                        │
│ }                                                            │
│                                                              │
│ ── Rule Condition (from policy) ──                           │
│ {                                                            │
│   "all": [                                                   │
│     { "field": "stabilityScore", "operator": "lt",           │
│       "value": 0.7 },                                        │
│     { "field": "timeSinceReinforcement", "operator": "gt",   │
│       "value": 86400 }                                       │
│   ]                                                          │
│ }                                                            │
│                                                              │
│                                        [← Back to Stream]    │
└──────────────────────────────────────────────────────────────┘
```

### Fields Displayed

| Section | Source Fields | Notes |
|---------|-------------|-------|
| Decision Header | `decision_type`, `decided_at`, `learner_reference`, `trace.policy_id` (name), `trace.policy_version`, `trace.matched_rule_id`, `output_metadata.priority` | Top-level summary; policy shows name + version when present. |
| Rationale | `trace.rationale` | Rendered as monospaced text block. Each field comparison on its own line with pass/fail indicator. |
| Evaluated Thresholds | `trace.matched_rule.evaluated_fields[]` | Table showing field, operator, threshold, actual value, and pass/fail per comparison |
| State Snapshot | `trace.state_snapshot` | Collapsible JSON viewer with canonical fields highlighted at top |
| Rule Condition | `trace.matched_rule.condition` | Raw condition tree from the policy, collapsible JSON |

### Interactions

- **Expand/collapse JSON sections:** State snapshot and rule condition are collapsible
- **Copy to clipboard:** Button on each section to copy JSON for debugging
- **Back to stream:** Navigate back to Panel 3
- **Print/export:** Optional "Export as JSON" button that downloads the full decision record

---

## Requirements

### Functional

- [ ] All four panels render data from the control-layer API
- [ ] Panels are read-only — no mutations, no form submissions that alter data
- [ ] Panels are served as static files by the existing Fastify server
- [ ] All panels require `org_id` input and enforce it before fetching
- [ ] Panel 1 shows ingestion outcomes with color-coded pass/fail/duplicate
- [ ] Panel 2 shows learner index and detailed state with version navigation
- [ ] Panel 3 shows decision stream with type, rule, priority, and policy version
- [ ] Panel 4 shows full decision trace with rationale, thresholds, state snapshot, and rule condition
- [ ] Navigation between Panel 3 → Panel 4 works (clicking a decision row opens its trace)
- [ ] Historical decisions without enriched trace fields render gracefully ("N/A" for missing data)
- [ ] Auto-refresh is optional, defaulting to manual refresh

### Acceptance Criteria

- Given a running control-layer server with POC v2 data, when an enterprise user navigates to `/inspect`, then all four panels are accessible via tabs
- Given a rejected signal in the ingestion log, when Panel 1 is viewed, then the rejected entry is visible with red color coding and the rejection reason code
- Given a learner with state, when Panel 2 is viewed and the learner is selected, then the Canonical Fields section shows the same keys as Full State (JSON), with current values (supports multi-policy orgs e.g. staff fields)
- Given multiple decisions in the system, when Panel 3 is viewed, then decisions appear in reverse chronological order with correct color coding per type
- Given a decision with an enriched trace, when Panel 4 is viewed for that decision, then the rationale, threshold table, frozen state snapshot, and rule condition are all visible

---

## Constraints

- **Read-only:** Panels must not include any create/update/delete functionality
- **No framework requirement:** Vanilla JS is acceptable; if a framework is used, total bundle must be < 50KB gzipped
- **No build step required:** Panels should work as static files served by Fastify. If a build step is needed (e.g., for TypeScript or JSX), it must be a single `npm run build:panels` command.
- **Terminal aesthetic:** Monospaced fonts, dark background, high-contrast text. These are engineering tools, not consumer products.
- **API key required for /v1/*:** The control-layer API requires an `x-api-key` header for all `/v1/*` requests. Panels do not implement user login; they must provide an API key input and forward it with every request. Org_id remains required for scoping. (User-facing auth is deferred to Phase 2.)
- **Graceful degradation:** If the API returns an error or data is missing, panels show clear error messages — never blank screens or unhandled errors

---

## Out of Scope

- User authentication and authorization (Phase 2)
- Real-time WebSocket updates (polling is sufficient for Phase 1)
- Mobile responsiveness (desktop-only for demos and debugging)
- Custom themes or branding
- Data export to CSV/PDF (JSON export from Panel 4 is sufficient)
- Decision editing, policy editing, or any mutation capability
- Workflow management or learner management UI

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `GET /v1/ingestion` | `docs/specs/inspection-api.md` §1 | Implemented |
| `GET /v1/state` | `docs/specs/inspection-api.md` §2 | Implemented |
| `GET /v1/state/list` | `docs/specs/inspection-api.md` §2.2 | Implemented |
| `GET /v1/receipts` (Panel 3 stream) | `docs/specs/receipts-api.md` | Implemented |
| Enriched `trace` on Decision (Panel 4) | `docs/specs/inspection-api.md` §3 | Implemented |
| `output_metadata` on Decision | `docs/specs/inspection-api.md` §4 | Implemented |
| Existing `GET /v1/signals` | `docs/specs/signal-log.md` | Implemented |
| Existing `GET /v1/decisions` | `docs/specs/decision-engine.md` | Implemented |

### Provides to Other Specs

| Asset | Used By |
|-------|---------|
| Static panel files at `/inspect` | Enterprise demo, integration debugging |

---

## File Structure

```
src/
├── panels/
│   ├── index.html                    # Main shell with tab navigation
│   ├── styles.css                    # Terminal-aesthetic stylesheet
│   ├── app.js                        # Panel orchestration, tab routing, API client
│   ├── panel-signal-intake.js        # Panel 1 logic
│   ├── panel-state-viewer.js         # Panel 2 logic
│   ├── panel-decision-stream.js      # Panel 3 logic
│   └── panel-decision-trace.js       # Panel 4 logic
└── server.ts                         # Modified: serve /inspect as static files

tests/
└── integration/
    └── inspection-panels.test.ts     # Smoke tests: panels load, API calls succeed
```

---

## Success Criteria

Implementation is complete when:

- [ ] All four panels render correctly with live data from the control-layer API
- [ ] Panels are accessible at `/inspect` on the running Fastify server
- [ ] Panel 1 displays ingestion outcomes with correct color coding and filtering
- [ ] Panel 2 displays learner list and detailed state with version navigation
- [ ] Panel 3 displays decision stream with correct types, rules, and priority
- [ ] Panel 4 displays full decision trace with rationale, thresholds, state snapshot, and rule condition
- [ ] Panel 3 → Panel 4 navigation works
- [ ] All panels handle API errors gracefully (no blank screens)
- [ ] Historical decisions without enriched trace display "N/A" for missing fields
- [ ] Bundle size < 50KB gzipped (if a framework is used)
- [ ] No external CDN dependencies in production (all assets self-contained)

---

## Notes

- **Demo script:** For investor/enterprise demos, the recommended flow is: (1) send a signal via Swagger/curl while Panel 1 is visible, (2) switch to Panel 2 to show state updated, (3) switch to Panel 3 to show the decision appear, (4) click the decision to show the full trace in Panel 4. This proves the entire loop in ~30 seconds.
- **Why terminal aesthetic:** These panels signal technical depth. Enterprise CTOs and compliance officers trust tools that look like engineering instruments, not marketing dashboards. Monospaced fonts, JSON views, and dark backgrounds communicate "this is the truth layer."
- **Panel ordering matches the pipeline:** Signal Intake → State Viewer → Decision Stream → Decision Trace maps exactly to the lifecycle stages (Ingestion → STATE → Decision → Output). This is intentional and should be preserved in tab ordering.

---

## Next Steps

1. ~~Implement the Inspection API~~ — **Done.** Backend endpoints and panels are implemented.
2. Use the panels as the primary QA surface for ongoing development (`docs/testing/qa-test-inspection-panels.md`).
3. Optional: Implement `GET /v1/receipts` per `docs/specs/receipts-api.md` for a dedicated compliance/audit query surface.

---

*Spec created: 2026-02-19 | Depends on: inspection-api.md, decision-engine.md, state-engine.md, signal-log.md*
