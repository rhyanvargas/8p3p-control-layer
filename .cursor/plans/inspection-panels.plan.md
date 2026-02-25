---
name: Inspection Panels
overview: |
  Four read-only, static HTML/CSS/JS inspection panels served at /inspect by the existing Fastify server. Panels consume the already-implemented Inspection API endpoints (GET /v1/ingestion, GET /v1/state, GET /v1/state/list, GET /v1/decisions) to prove the control-plane loop: signals → state → decisions → receipts. Terminal aesthetic, no framework, no build step. Vanilla JS with manual/auto-poll refresh.
todos:
  - id: TASK-001
    content: Install @fastify/static dependency
    status: completed
  - id: TASK-002
    content: Create terminal-aesthetic stylesheet (styles.css)
    status: completed
  - id: TASK-003
    content: Create main shell HTML with tab navigation (index.html)
    status: completed
  - id: TASK-004
    content: Create shared API client and tab orchestration (app.js)
    status: completed
  - id: TASK-005
    content: Create Panel 1 — Signal Intake (panel-signal-intake.js)
    status: completed
  - id: TASK-006
    content: Create Panel 2 — State Viewer (panel-state-viewer.js)
    status: completed
  - id: TASK-007
    content: Create Panel 3 — Decision Stream (panel-decision-stream.js)
    status: completed
  - id: TASK-008
    content: Create Panel 4 — Decision Trace / Receipt (panel-decision-trace.js)
    status: completed
  - id: TASK-009
    content: Modify server.ts to serve /inspect static files
    status: completed
  - id: TASK-010
    content: Create smoke / integration tests for panels
    status: completed
  - id: TASK-011
    content: End-to-end verification and lint pass
    status: completed
isProject: false
---

# Inspection Panels

**Spec**: `docs/specs/inspection-panels.md`  
**QA test plan**: `docs/testing/qa-test-inspection-panels.md`

## Prerequisites

Before starting implementation:

- {PREREQ-001} Inspection API endpoints implemented (`GET /v1/ingestion`, `GET /v1/state`, `GET /v1/state/list`, `GET /v1/decisions` with enriched trace) — confirmed present in codebase
- {PREREQ-002} Decision store includes `trace_state_snapshot`, `trace_matched_rule`, `trace_rationale`, `output_metadata` columns — confirmed in `inspection-api.test.ts`

## Design Decisions


| Decision          | Choice                                                                                                                                      | Rationale                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| API key in panels | Global header input field stored in sessionStorage                                                                                          | `/v1/`* routes require `x-api-key`; panels must forward it. sessionStorage clears on tab close (safe).                                 |
| No framework      | Vanilla JS with DOM manipulation                                                                                                            | Spec mandates < 50KB gzipped if framework used; vanilla keeps bundle at 0 dependencies.                                                |
| No build step     | `.js` files served as-is                                                                                                                    | Spec: "Panels should work as static files served by Fastify." No TypeScript, JSX, or bundler needed.                                   |
| Static serving    | `@fastify/static` at `/inspect` prefix                                                                                                      | Only mature, maintained Fastify plugin for static files.                                                                               |
| Auto-poll         | `setInterval` with toggle, default off                                                                                                      | Spec: "Auto-refresh is optional, defaulting to manual refresh."                                                                        |
| Panel ↔ Panel nav | Hash-based routing (`#signal`, `#state`, `#decisions`, `#trace`). Panel 4 only populated via Panel 3 row click (no refetch by decision_id). | Spec: "Hash-based or tab-based navigation." No GET-by-decision_id endpoint; direct `#trace` shows "Select a decision from the stream." |


## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Install @fastify/static dependency

- **Files**: `package.json`
- **Action**: Modify
- **Details**: `npm install @fastify/static`. This adds static file serving capability to Fastify. No types package needed since we're writing vanilla JS panels (TS types only needed for `server.ts`, and `@fastify/static` ships its own).
- **Depends on**: none
- **Verification**: `npm ls @fastify/static` shows installed version; `npm run typecheck` still passes.

### TASK-002: Create terminal-aesthetic stylesheet

- **Files**: `src/panels/styles.css`
- **Action**: Create
- **Details**: Terminal-aesthetic CSS following spec constraints:
  - Dark background (`#0a0a0a` or similar), high-contrast monospaced text (`#e0e0e0`)
  - Monospaced font stack: `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace`
  - Color palette for outcomes: green (`#49cc90`) accepted/advance, amber (`#f0ad4e`) duplicate/pause, red (`#f93e3e`) rejected/escalate, blue (`#61affe`) reinforce
  - Table styling: borders, zebra striping, compact rows
  - Tab navigation bar styling
  - Global controls bar (org_id input, API key input, refresh button, auto-poll toggle)
  - Responsive-enough for desktop (no mobile per spec out-of-scope)
  - Collapsible JSON section styling
  - Error/empty state styling
  - Loading indicator
- **Depends on**: none
- **Verification**: Visual inspection when loaded in browser.

### TASK-003: Create main shell HTML with tab navigation

- **Files**: `src/panels/index.html`
- **Action**: Create
- **Details**: Single HTML file that is the SPA shell:
  - `<head>`: charset, viewport, title "8P3P Inspection Panels", link to `styles.css`
  - Global controls bar: org_id text input (required), API key text input (password type), refresh button, auto-poll checkbox with interval selector (5/10/30s)
  - Tab bar with 4 tabs: "Signal Intake", "State Viewer", "Decision Stream", "Decision Trace"
  - 4 panel container divs (one per panel, toggled visible by tab)
  - Script tags: `app.js`, then each panel JS file
  - No external CDN references — fully self-contained
- **Depends on**: TASK-002
- **Verification**: HTML loads in browser with tab bar visible, no console errors.

### TASK-004: Create shared API client and tab orchestration

- **Files**: `src/panels/app.js`
- **Action**: Create
- **Details**: Orchestration module exposing:
  - `API.fetch(path, params)` — wraps `fetch()` with base URL detection (same origin), adds `x-api-key` header from input, returns JSON or throws structured error
  - `API.getOrgId()` — reads org_id input, validates non-empty
  - `API.getApiKey()` — reads API key input, persists to/from `sessionStorage`
  - `Tabs.init()` — binds tab click handlers, reads hash on load, manages active panel visibility
  - `Tabs.switchTo(panelId)` — shows panel, updates hash, calls panel's `refresh()` if defined
  - `UI.showError(container, message)` — renders error state in a panel
  - `UI.showLoading(container)` / `UI.hideLoading(container)` — loading indicator
  - `UI.formatTime(isoString)` — HH:MM:SS format
  - `UI.relativeTime(isoString)` — "3s ago", "5m ago" format
  - `UI.escapeHtml(str)` — XSS prevention for dynamic content
  - Auto-poll manager: `startPolling(fn, intervalMs)` / `stopPolling()`
  - Hash-based routing: listens `hashchange`, maps `#signal` → Panel 1, `#state` → Panel 2, `#decisions` → Panel 3, `#trace` → Panel 4. When Panel 4 is shown without an in-memory decision (e.g. user navigated directly to `#trace`), Panel 4 displays "Select a decision from the stream" and does not attempt to refetch (no GET-by-decision_id endpoint exists).
- **Depends on**: TASK-003
- **Verification**: Tab switching works, API.fetch sends correct headers, hash routing navigates panels; Panel 4 shows prompt when no decision context.

### TASK-005: Create Panel 1 — Signal Intake

- **Files**: `src/panels/panel-signal-intake.js`
- **Action**: Create
- **Details**: Implements Panel 1 per spec layout:
  - Calls `GET /v1/ingestion?org_id={org}&limit=50`
  - Renders table: Time | Signal ID | Source | Schema | Outcome
  - Outcome column color-coded: green (accepted), amber (duplicate), red (rejected)
  - Rejected rows show rejection reason inline; expandable on click for `message` and `field_path`
  - Filter dropdown: All / Accepted / Rejected / Duplicate (passes `outcome` query param)
  - "Load more" button using `next_cursor` for pagination
  - Refresh button triggers re-fetch
  - Graceful error display if API returns error
  - Empty state message if no entries
- **Depends on**: TASK-004
- **Verification**: Panel renders ingestion data, filters work, rejected rows expand, pagination loads more.

### TASK-006: Create Panel 2 — State Viewer

- **Files**: `src/panels/panel-state-viewer.js`
- **Action**: Create
- **Details**: Implements Panel 2 per spec (master-detail layout):
  - Left pane: calls `GET /v1/state/list?org_id={org}` → renders learner list (learner_reference, version, relative updated_at)
  - Right pane: on learner click, calls `GET /v1/state?org_id={org}&learner_reference={ref}` → renders:
    - Header: state_id, state_version, updated_at
    - Canonical fields section: stabilityScore, masteryScore, confidenceInterval, riskSignal, timeSinceReinforcement — highlighted if present, grayed if missing
    - Provenance section: last_signal_id, last_signal_timestamp
    - Full state JSON (collapsible)
    - Version selector: buttons for each version 1..N, clicking loads `GET /v1/state?...&version=N`
  - "Load more" on learner list using `next_cursor`
  - Empty state for no learners / no state selected
- **Depends on**: TASK-004
- **Verification**: Learner list loads, selecting learner shows state detail, version navigation works, canonical fields displayed.

### TASK-007: Create Panel 3 — Decision Stream

- **Files**: `src/panels/panel-decision-stream.js`
- **Action**: Create
- **Details**: Implements Panel 3 per spec:
  - Calls `GET /v1/decisions?org_id={org}` (optional: `learner_reference`, `from_time`, `to_time`)
  - Renders table: Time | Decision | Rule | Priority | Policy | Learner
  - Decision type color-coded: red (escalate), amber (pause), blue (reinforce), green (advance), etc.
  - Rule shows `trace.matched_rule_id`, "(default)" when null
  - Priority shows `output_metadata.priority`, "—" when null/default
  - Policy shows `trace.policy_version`
  - Filter inputs: learner_reference (optional), from/to datetime-local pickers
  - **Row click**: navigates to Panel 4 via `Tabs.switchTo('trace')` passing the decision data (stored in memory, avoiding extra API call since full decision object is available)
  - Pagination via `page_token` / "Load more"
  - Handles missing `output_metadata` gracefully for historical decisions
- **Depends on**: TASK-004
- **Verification**: Decision table renders, color coding correct, clicking row opens Panel 4, filters work.

### TASK-008: Create Panel 4 — Decision Trace / Receipt

- **Files**: `src/panels/panel-decision-trace.js`
- **Action**: Create
- **Details**: Implements Panel 4 per spec:
  - Receives decision object from Panel 3 row click (in-memory only). If user opens Panel 4 directly (e.g. `#trace` with no prior row click), show "Select a decision from the stream" — do not refetch (API has no GET-by-decision_id).
  - Renders sections:
    - **Decision header**: decision_type, decided_at, learner_reference, policy_version, matched_rule_id, priority
    - **Rationale**: `trace.rationale` in monospaced block, with pass/fail indicators per field comparison
    - **Evaluated Thresholds table**: Field | Op | Threshold | Actual | Pass — from `trace.matched_rule.evaluated_fields[]`
    - **State Snapshot**: collapsible JSON viewer showing `trace.state_snapshot` with canonical fields highlighted
    - **Rule Condition**: collapsible JSON viewer showing `trace.matched_rule.condition`
  - Copy-to-clipboard button on each JSON section
  - "Export as JSON" button downloads full decision record
  - "Back to Stream" button navigates to Panel 3
  - Graceful N/A rendering for historical decisions missing `state_snapshot`, `matched_rule`, `rationale`
- **Depends on**: TASK-004, TASK-007 (Panel 3 provides navigation)
- **Verification**: Full trace renders, thresholds table correct, JSON collapsible, copy/export work, back navigation works, historical decisions show N/A.

### TASK-009: Modify server.ts to serve /inspect static files

- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  - Import `fastifyStatic` from `@fastify/static` and `resolve` from `path`
  - Register static file serving with a **process.cwd()-based root** so panels work in both dev (`tsx watch`) and production (`node dist/server.js`): `server.register(fastifyStatic, { root: resolve(process.cwd(), 'src/panels'), prefix: '/inspect/' })`
  - Add redirect: `GET /inspect` → `/inspect/` (or configure `redirect: true`)
  - Add `/inspect` to the root endpoint's `endpoints` array
  - Ensure static files are served **without** API key middleware (they're outside the `/v1` prefix, so this is automatic)
- **Depends on**: TASK-001, TASK-003
- **Verification**: `curl http://localhost:3000/inspect/` returns `index.html` in both dev and production; all panel assets load. (No asset copy to `dist/` required.)

### TASK-010: Create smoke / integration tests for panels

- **Files**: `tests/integration/inspection-panels.test.ts`
- **Action**: Create
- **Details**: Vitest integration tests that:
  - Boot a Fastify server instance with `@fastify/static` registered (same root as TASK-009) and full v1 routes + API key middleware, so inspection endpoints are callable
  - Static assets:
  - **TEST-PANEL-001**: `GET /inspect/` returns 200 with HTML content-type
  - **TEST-PANEL-002**: `GET /inspect/styles.css` returns 200 with CSS content-type
  - **TEST-PANEL-003**: `GET /inspect/app.js` returns 200 with JS content-type
  - **TEST-PANEL-004**: `GET /inspect/panel-signal-intake.js` returns 200
  - **TEST-PANEL-005**: `GET /inspect/panel-state-viewer.js` returns 200
  - **TEST-PANEL-006**: `GET /inspect/panel-decision-stream.js` returns 200
  - **TEST-PANEL-007**: `GET /inspect/panel-decision-trace.js` returns 200
  - **TEST-PANEL-008**: `GET /inspect/` HTML contains all four panel container divs
  - **TEST-PANEL-009**: `GET /inspect/` HTML includes script references to all JS files
  - **TEST-PANEL-010**: `/inspect` (no trailing slash) redirects to `/inspect/`
  - API callability (panels load, API calls succeed):
  - **TEST-PANEL-011**: `GET /v1/ingestion?org_id=test-org&limit=10` with valid `x-api-key` returns 200 and body has `org_id` and `entries` array (response shape panels expect)
  - **TEST-PANEL-012**: `GET /v1/ingestion` without `x-api-key` (or invalid key) returns 401 — confirms panels must send API key
  - Follow the existing test pattern in `tests/integration/e2e-signal-to-decision.test.ts` for server setup/teardown (init stores, register routes, use env API key or test key)
- **Depends on**: TASK-003 through TASK-009
- **Verification**: `npm run test:integration` passes with all TEST-PANEL tests green.

### TASK-011: End-to-end verification and lint pass

- **Files**: none (verification only)
- **Action**: Verify
- **Details**:
  - Run `npm run typecheck` — no new TS errors
  - Run `npm run lint` — no new lint errors
  - Run `npm test` — all existing tests + new panel tests pass
  - Start dev server, navigate to `/inspect`, verify all four panels render
  - Test demo flow: Panel 1 → Panel 2 → Panel 3 → click decision → Panel 4
- **Depends on**: TASK-010
- **Verification**: All checks pass, manual walkthrough of all 4 panels succeeds.

## Files Summary

### To Create


| File                                          | Task     | Purpose                                                                                               |
| --------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `src/panels/styles.css`                       | TASK-002 | Terminal-aesthetic stylesheet (dark theme, monospaced, color-coded outcomes)                          |
| `src/panels/index.html`                       | TASK-003 | SPA shell: tab navigation, global controls (org_id, API key, refresh), panel containers               |
| `src/panels/app.js`                           | TASK-004 | Shared API client, tab orchestration, hash routing, utility functions                                 |
| `src/panels/panel-signal-intake.js`           | TASK-005 | Panel 1: ingestion outcome table with filters and row expansion                                       |
| `src/panels/panel-state-viewer.js`            | TASK-006 | Panel 2: master-detail learner list + state detail with version navigation                            |
| `src/panels/panel-decision-stream.js`         | TASK-007 | Panel 3: decision stream table with color coding and row click → Panel 4                              |
| `src/panels/panel-decision-trace.js`          | TASK-008 | Panel 4: full decision audit record with rationale, thresholds, snapshots                             |
| `tests/integration/inspection-panels.test.ts` | TASK-010 | Smoke tests: static files served, HTML structure, API callability (ingestion shape + 401 without key) |


### To Modify


| File            | Task     | Changes                                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------------------- |
| `package.json`  | TASK-001 | Add `@fastify/static` dependency                                                              |
| `src/server.ts` | TASK-009 | Register `@fastify/static` with `resolve(process.cwd(), 'src/panels')`, add to endpoints list |


## Test Plan


| Test ID        | Type        | Description                                           | Task     |
| -------------- | ----------- | ----------------------------------------------------- | -------- |
| TEST-PANEL-001 | integration | GET /inspect/ returns 200 HTML                        | TASK-010 |
| TEST-PANEL-002 | integration | GET /inspect/styles.css returns 200 CSS               | TASK-010 |
| TEST-PANEL-003 | integration | GET /inspect/app.js returns 200 JS                    | TASK-010 |
| TEST-PANEL-004 | integration | GET /inspect/panel-signal-intake.js returns 200       | TASK-010 |
| TEST-PANEL-005 | integration | GET /inspect/panel-state-viewer.js returns 200        | TASK-010 |
| TEST-PANEL-006 | integration | GET /inspect/panel-decision-stream.js returns 200     | TASK-010 |
| TEST-PANEL-007 | integration | GET /inspect/panel-decision-trace.js returns 200      | TASK-010 |
| TEST-PANEL-008 | integration | HTML contains all four panel container divs           | TASK-010 |
| TEST-PANEL-009 | integration | HTML includes script refs to all panel JS files       | TASK-010 |
| TEST-PANEL-010 | integration | /inspect redirects to /inspect/                       | TASK-010 |
| TEST-PANEL-011 | integration | GET /v1/ingestion with API key returns expected shape | TASK-010 |
| TEST-PANEL-012 | integration | GET /v1/ingestion without API key returns 401         | TASK-010 |


## Risks


| Risk                                                  | Impact                                      | Mitigation                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API key required for `/v1/`* calls from panels        | High — panels won't load data without a key | Add API key input field in the global controls bar; store in `sessionStorage`; clear error UX if key is missing/invalid |
| `@fastify/static` conflicts with Swagger UI plugin    | Medium — both register static file handlers | Swagger UI is under `/docs` prefix, panels under `/inspect` prefix — no overlap. Use `decorateReply: false` if needed.  |
| Inspection API response shape changes                 | Medium — panel JS expects specific fields   | Panels render defensively: check for field existence, show "N/A" for missing data, log missing fields                   |
| Historical decisions lack enriched trace fields       | Low — expected per spec                     | Panel 4 renders "N/A" for missing `state_snapshot`, `matched_rule`, `rationale`                                         |
| Large state objects slow Panel 2/4 rendering          | Low — POC data is small                     | JSON sections are collapsible (hidden by default); only expanded on click                                               |
| Cross-origin fetch if panels served on different port | Low — panels served by same Fastify server  | Same-origin by design; `API.fetch` uses relative URLs                                                                   |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Matches spec requirements
- All four panels render data from live API
- Panel 3 → Panel 4 navigation works
- Historical decisions render gracefully (N/A for missing enriched fields)
- No external CDN dependencies
- Org_id is required before any fetch
- API key is forwarded on all /v1 requests

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005
                                          ↘ TASK-006
                                          ↘ TASK-007 → TASK-008
                                    TASK-009 ↗
                                          ↘ TASK-010 → TASK-011
```

Note: TASK-002 and TASK-001 can run in parallel. TASK-005, TASK-006, TASK-007 can run in parallel after TASK-004. TASK-008 depends on TASK-007 (for Panel 3 → 4 navigation data contract). TASK-009 depends on TASK-001 and TASK-003. TASK-010 depends on all file creation tasks.