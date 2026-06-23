---
name: Dashboard UX/UI Improvements
overview: "Implement the findings from the 2026-06-22 dashboard UX/UI analysis (incl. the 2026-06-23 data-viz directives D1 & D3): real Overview refresh plus freshness, proxy observability with request-id, icon-first + decluttered + uniformly-clickable KPIs (D3), an educator-first recent-decisions table with the technical detail moved to the L1 Sheet (D1), removal of the dead org switcher, and a full-cycle signal upload wizard wired to the ingestion preflight and signals endpoints. Cross-filter sync (D2) is specified separately in docs/specs/overview-cross-filter-sync.md and planned on its own."
todos:
  - id: TASK-001
    content: Remove dead org switcher from SiteHeader and clean unused props
    status: pending
  - id: TASK-002
    content: StatCard — add optional leading icon and full-card clickability (D3)
    status: pending
  - id: TASK-003
    content: Icon-first, re-ranked, decluttered, uniformly-clickable Overview KPIs (D3)
    status: pending
  - id: TASK-004
    content: Add icon to IngestionOutcomeChip
    status: pending
  - id: TASK-005
    content: Add fetchedAt to OverviewData
    status: pending
  - id: TASK-006
    content: Make global refresh call router.refresh
    status: pending
  - id: TASK-007
    content: Build freshness chip on Overview header
    status: pending
  - id: TASK-008
    content: Proxy request-id generation, forwarding, and failure logging
    status: pending
  - id: TASK-009
    content: Surface copyable reference id in ErrorState
    status: pending
  - id: TASK-010
    content: Extend reason-code to friendly-message map
    status: pending
  - id: TASK-011
    content: Add upload dependencies and progress primitive
    status: pending
  - id: TASK-012
    content: File parsing for JSON CSV XLSX
    status: pending
  - id: TASK-013
    content: Field mapping and client-side signal validation
    status: pending
  - id: TASK-014
    content: Dedicated preflight proxy route with admin key
    status: pending
  - id: TASK-015
    content: Bounded-concurrency commit client to signals endpoint
    status: pending
  - id: TASK-016
    content: Upload wizard shell and dropzone step
    status: pending
  - id: TASK-017
    content: Field-mapping wizard step
    status: pending
  - id: TASK-018
    content: Validate dry-run wizard step with per-row states
    status: pending
  - id: TASK-019
    content: Review commit and confirmation wizard steps
    status: pending
  - id: TASK-020
    content: Upload entry point on signals page and nav
    status: pending
  - id: TASK-021
    content: Update design-requirements to bring upload in scope
    status: pending
  - id: TASK-022
    content: Add dashboard admin API key env var
    status: pending
  - id: TASK-023
    content: Unit tests for parse map validate
    status: pending
  - id: TASK-024
    content: Unit tests for proxy observability and freshness and refresh
    status: pending
  - id: TASK-025
    content: E2E tests for upload refresh and org switcher
    status: pending
  - id: TASK-026
    content: Educator-first recent-decisions table; move rule id + rationale to L1 Sheet (D1)
    status: pending
  - id: TASK-027
    content: Unit/e2e tests for D1 educator-first table and D3 KPI clickability
    status: pending
isProject: false
---

# Dashboard UX/UI Improvements

**Source report**: `docs/reports/2026-06-22-dashboard-uiux-analysis.md`
**Ground-truth spec**: `docs/specs/dashboard-design-requirements.md`

> This plan is report-driven (not a formal spec). The five findings + the report's Prioritized Roadmap are the requirements source, combined with the stakeholder's answers (2026-06-22): (1) hide the org switcher entirely while single-org-pinned; (2) build the full-cycle upload wizard following admin-workflow best-practices; (3) refresh + freshness — yes; (4) observability — yes; (5) icon-first KPIs + freshness — yes.
>
> **2026-06-23 update — data-viz directives folded in:** **D1** (educator-first recent-decisions table; rule id + rationale moved to the L1 Sheet) added as TASK-026; **D3** (declutter KPI cards to one value + make all four clickable) folded into TASK-002/003 (formerly icon-only). Tests in TASK-027. **D2** (cross-filter sync toggle) is **excluded here** — it has a dedicated spec at `docs/specs/overview-cross-filter-sync.md` and will be planned separately. Source: `docs/reports/2026-06-22-dashboard-uiux-analysis.md` (Data-Visualization UX Directives) + `docs/specs/dashboard-design-requirements.md` §2.1/§8.

## Source Literals

> Verbatim references. Task bodies quote these rather than paraphrasing wire contracts.

### From `src/contracts/schemas/signal-envelope.json` (ingest target shape)

```
required: ["org_id","signal_id","source_system","learner_reference","timestamp","schema_version","payload"]
signal_id: pattern ^[A-Za-z0-9._:-]+$   (1..256)
schema_version: pattern ^v[0-9]+$       (e.g. v1)
timestamp: RFC3339 with required timezone
payload: object (validated for forbidden keys only)
metadata.school_id: optional, propagated into decision_context
additionalProperties: false
```

> `org_id` is auto-injected server-side by the proxy (`injectOrgIdIntoSearchParams` / JSON-body backfill), so the wizard does not collect it.

### From `dashboard/app/api/control/[...path]/route.ts` (proxy catch — observability gap)

```
  } catch {
    return upstreamUnavailable();   // line 119-120: cause discarded, zero logging, no request-id
  } finally {
    clearTimeout(timeoutId);
  }
```

```
function upstreamUnavailable(): Response {
  return Response.json({ error: 'dashboard_upstream_unavailable' }, { status: 502 });
}
```

### From `src/ingestion/preflight-handler-core.ts` (dry-run contract)

```
PreflightResponse.verdict: 'clean' | 'pii_blocking' | 'semantic_blocking' | 'semantic_resolvable_by_mapping'
fields: forbidden_pii[], forbidden_semantic_raw[], forbidden_semantic_after_mapping[]|null,
        mapping_suggestions[], note?, mapping_error?
request: { org_id?, source_system?, payload }  (org_id and source_system both-or-neither)
route: POST /v1/admin/ingestion/preflight  (admin scope: x-admin-api-key; body limit 32768)
```

### From `src/ingestion/routes.ts` (authoritative ingest)

```
POST /signals   (tenant x-api-key; bodyLimit SIGNAL_BODY_LIMIT default 1048576)
GET  /ingestion (ingestion outcome log: accepted | rejected | duplicate + rejection_reason{code, field_path})
```

### From report § Prioritized Roadmap

```
P0  router.refresh() so RSC Overview updates                 (lens 3)
P0  fetchedAt + "Updated {relative}" freshness chip          (lens 3,5)
P0  proxy: server log via after() + x-request-id, copyable   (lens 4)
P1  icon-first KPI cards + icon on IngestionOutcomeChip      (lens 5)
P1  org switcher: hide while single-org-pinned               (lens 1)  -> stakeholder chose (a)
P1  /signals/upload wizard: dropzone/validation/field-level  (lens 2)  -> stakeholder: REQUIRED
P2  re-rank KPIs: surface "Rejected signals today"           (lens 5)
P2  extend reason-code -> friendly-message map               (lens 4)
```

## Prerequisites

- [x] PREREQ-001: Product decision — upload is **in scope** (stakeholder approved 2026-06-22). Resolves the §15 out-of-scope conflict (see Deviations).
- [ ] PREREQ-002: Confirm a control-layer **admin API key** can be provisioned to the dashboard runtime (`CONTROL_LAYER_ADMIN_API_KEY`). Required for the preflight dry-run step (TASK-014). If unavailable, the wizard degrades gracefully to client-side validation + authoritative per-row `/v1/signals` outcomes.

## Tasks

> Status tracking lives only in the YAML frontmatter `todos`.

### TASK-001: Remove dead org switcher from SiteHeader
- **Files**: `dashboard/components/layout/site-header.tsx`, `dashboard/components/layout/dashboard-shell.tsx`, `dashboard/app/(dashboard)/layout.tsx`
- **Action**: Modify
- **Details**: The org `<Select>` has no `onValueChange` handler and multi-org per-user identity does not exist, so it is dead UI. Per stakeholder answer (a), remove the `<Select>` block (currently `{!isOrgPinned ? (<Select ...>) : null}`) from `site-header.tsx` entirely along with now-unused `Select*` imports. Org context remains visible in the sidebar footer (`nav-user.tsx`) and ingestion header. Drop the `orgId`/`isOrgPinned` props from `SiteHeaderProps` if they become unused after removal; thread the prop removal up through `dashboard-shell.tsx` and `layout.tsx` (keep `isOrgPinned`/`orgId` computation only if still consumed elsewhere — verify before deleting).
- **Depends on**: none
- **Verification**: No org `<Select>` renders on any route; `npm run typecheck`/`lint` clean (no unused vars/imports); `ORG-001` passes.

### TASK-002: StatCard — optional leading icon + full-card clickability (D3)
- **Files**: `dashboard/components/dashboard/stat-card.tsx`
- **Action**: Modify
- **Details**:
  - **Icon (icon-first):** add optional `icon?: LucideIcon`. Render a single leading icon (size-4/size-5) before/above the title, color via semantic token passed by caller (no card background fill — color stays semantic per design §2.1/§4.4). Direct Lucide imports only (no barrel — bundle-size rule).
  - **D3 declutter:** keep the typography hierarchy (`text-2xl tabular-nums` value) but make the card render **one value + delta/contextual line + status icon** with **no multi-clause prose**. Replace the free-form `description?: string` rendering with an optional `tooltip?: string` (render via shadcn `Tooltip` on an info affordance) so nuance is available on demand but not on the card face — per BI best-practices (data-ink ratio) and frontend-design (restraint).
  - **D3 uniform clickability:** make the **whole card** a navigable target when an `href` is provided (wrap the `Card` in a `Link` or add an overlay link with `focus-visible` ring + hover affordance), not just a footer link. Keep the card non-interactive (no hover/pointer) when `href` is absent so affordance is honest. Preserve a11y: a single accessible name per card, keyboard focusable, `aria` label from title+value.
- **Depends on**: none
- **Verification**: StatCard renders with/without `icon`; with `href` the entire card is clickable + keyboard-focusable with a visible ring; without `href` it shows no interactive affordance; prose `description` no longer rendered (moved to optional tooltip); `KPI-001` + `KPI-004` pass.

### TASK-003: Icon-first, re-ranked, decluttered, uniformly-clickable KPIs (D3)
- **Files**: `dashboard/components/dashboard/section-cards.tsx`
- **Action**: Modify
- **Details**:
  - **Re-rank** to the report's customer-value order: (1) Needs attention `AlertCircle` `--urgency-high`; (2) Rejected signals today `XCircle` destructive; (3) Pending decisions `Clock` `--status-pause`/pending; (4) Improving learners `TrendingUp` `--progress-improved`. Pass `icon` to each `StatCard`.
  - **D3 declutter:** drop the prose `description` strings ("Intervene and pause decisions awaiting review.", "Ingestion outcomes since midnight.", "Learners with at least one improving mastery signal."). Each card shows **one number** + its delta/contextual line + status icon. Replace the compound "Signals today: N accepted · N rejected" string value with the single "Rejected signals today" number (`kpis.signalsToday.rejected`); express the accepted count as an icon-chip (`CheckCircle2` N) or a `tooltip`, not a sentence. Move any retained nuance into the new `StatCard` `tooltip` prop.
  - **D3 uniform clickability:** give **all four** cards an `href` drill target with a consistent affordance — Needs attention → `/attention`, Rejected signals → `/signals`, Pending decisions → `/decisions?status=pending`, Improving learners → `/learners?trend=improving`. No card is a dead end. (When D2 cross-filter sync is later ON, the click instead applies a filter — that branch is owned by the D2 spec/plan, not here.)
- **Depends on**: TASK-002
- **Verification**: Four KPI cards each show a leading icon and a single value (no prose); rejected-signals card present and ranked #2; **all four** cards navigate to their drill target and are keyboard-accessible; `KPI-002` + `KPI-004` pass.

### TASK-004: Add icon to IngestionOutcomeChip
- **Files**: `dashboard/components/shared/ingestion-outcome-chip.tsx`
- **Action**: Modify
- **Details**: Add a leading icon per outcome: `accepted` → `CheckCircle2`, `rejected` → `XCircle`, `duplicate` → `Copy`. Keep existing semantic token classes and `aria-label`; icon is `aria-hidden`. Color never the sole signal (icon + label + token).
- **Depends on**: none
- **Verification**: Chip renders icon+label for all three outcomes; `KPI-003` passes.

### TASK-005: Add fetchedAt to OverviewData
- **Files**: `dashboard/lib/api/fetch-overview-data.server.ts`, `dashboard/lib/overview-metrics.ts` (type only if needed)
- **Action**: Modify
- **Details**: Add `fetchedAt: string` (ISO) to `OverviewData`, set to `new Date().toISOString()` at the end of the `cache()`-wrapped `getOverviewData`. Because `getOverviewData` is `react.cache`-deduped per request, all sections + the freshness chip share one `fetchedAt`.
- **Depends on**: none
- **Verification**: `getOverviewData` returns `fetchedAt`; `FRSH-001` passes.

### TASK-006: Make global refresh call router.refresh
- **Files**: `dashboard/hooks/use-refresh-queries.ts`
- **Action**: Modify
- **Details**: The RSC Overview (`getOverviewData`) is not TanStack-backed, so `queryClient.invalidateQueries()` alone never re-renders it. Add `useRouter().refresh()` (from `next/navigation`) to the returned callback so RSC sections re-fetch, while keeping `invalidateQueries()` for TanStack surfaces. Per vercel-react-best-practices §3.7.
- **Depends on**: none
- **Verification**: Clicking header refresh re-runs RSC fetch (network shows `/v1/*` re-hit) and invalidates queries; `FRSH-003` passes.

### TASK-007: Build freshness chip on Overview header
- **Files**: `dashboard/components/shared/freshness-chip.tsx` (create), `dashboard/app/(dashboard)/_components/overview-freshness.tsx` (create), `dashboard/app/(dashboard)/page.tsx` (modify)
- **Action**: Create + Modify
- **Details**: `FreshnessChip` is a client component that renders "Updated {relative}" with a `RefreshCw`/`Clock` icon from an ISO prop, recomputing relative time on an interval. `overview-freshness.tsx` is a small server component that `await`s `getOverviewData(orgId)` (deduped by `cache`) and passes `fetchedAt` to `FreshnessChip`; wrap it in its own `<Suspense>` and place it in `PageHeader` children on the Overview page (strategic Suspense, §1.6). Never let a stale screen look healthy.
- **Depends on**: TASK-005
- **Verification**: Overview title shows "Updated {relative}" that advances and resets after refresh; `FRSH-002` passes.

### TASK-008: Proxy request-id generation, forwarding, and failure logging
- **Files**: `dashboard/app/api/control/[...path]/route.ts`
- **Action**: Modify
- **Details**: Generate `const requestId = crypto.randomUUID()` per request; forward as `x-request-id` upstream header (reuse an inbound `x-request-id` if already present). Add `x-request-id` to `SAFE_RESPONSE_HEADERS` and set it on every response (success + error). Replace the empty `catch {}` (Source Literal: proxy catch) with logging of `{ requestId, method, url: upstreamUrl, status: 'fetch_failed', message }` server-side via `after()` from `next/server` (non-blocking, never to client) and return `Response.json({ error: 'dashboard_upstream_unavailable', request_id: requestId }, { status: 502, headers: { 'x-request-id': requestId } })`. Also log (via `after()`) the JSON-parse `catch` at line 61 with the requestId. Never log `x-api-key`, the admin key, or full bodies.
- **Depends on**: none
- **Verification**: Forced upstream failure logs one server-side line with method/url/status/requestId and returns `request_id` in body + `x-request-id` header; no secrets logged; `OBS-001`/`OBS-002` pass.

### TASK-009: Surface copyable reference id in ErrorState
- **Files**: `dashboard/lib/api/errors.ts`, `dashboard/components/states/error-state.tsx`, `dashboard/lib/api/client.ts`
- **Action**: Modify
- **Details**: In `apiFetch`, capture `res.headers.get('x-request-id')` and pass it into `ApiError` (new optional `requestId` field) alongside body `request_id` fallback. Add `getErrorRequestId(error)` to `errors.ts`. In `ErrorState`, when a request id exists, render a copyable "Reference: {id}" line (use `navigator.clipboard` + `sonner` toast on copy). Must remain safe — no key/URL/stack leak (existing `getSafeErrorMessage` guards retained).
- **Depends on**: TASK-008
- **Verification**: A 502 error shows a copyable "Reference: {id}" matching the server log; `OBS-003` passes.

### TASK-010: Extend reason-code to friendly-message map
- **Files**: `dashboard/lib/api/errors.ts`
- **Action**: Modify
- **Details**: Generalize the `dashboard_upstream_unavailable` → "Service unavailable, retrying." mapping into a small `reasonCodeMessage` lookup so additional upstream `error` codes map to friendly copy (template per report § Observability "Contract"). Keep default fallback "Unable to load data." Unknown codes never leak raw codes to end users.
- **Depends on**: none
- **Verification**: Known code maps to friendly copy; unknown falls back; `OBS-004` passes.

### TASK-011: Add upload dependencies and progress primitive
- **Files**: `dashboard/package.json`, `dashboard/components/ui/progress.tsx` (via shadcn)
- **Action**: Modify + Create
- **Details**: Add `papaparse` (+ `@types/papaparse`) for CSV and `xlsx` (SheetJS) for Excel — see Dependencies/justification. Run `npx shadcn add progress` for commit/validation progress. Dropzone is composed manually (no shadcn dropzone primitive) from `input[type=file]` + drag events; field-level errors use the existing `Alert`. Tabs (installed) drive the stepper. Direct imports only (no barrels).
- **Depends on**: none
- **Verification**: Deps install; `Progress` renders; `npm run build` (dashboard) clean.

### TASK-012: File parsing for JSON CSV XLSX
- **Files**: `dashboard/lib/upload/parse.ts` (create)
- **Action**: Create
- **Details**: `parseFile(file): Promise<ParsedTable>` where `ParsedTable = { columns: string[]; rows: Record<string, unknown>[]; sourceFormat: 'json'|'csv'|'xlsx' }`. JSON: native parse; accept array-of-objects or `{signals:[...]}`. CSV: `papaparse` with `header:true`, `skipEmptyLines:true`. XLSX: `xlsx` read first sheet → `sheet_to_json`. Cap row count (e.g. 5000) and total size; reject empty/malformed with typed errors. Pure/testable (no React).
- **Depends on**: TASK-011
- **Verification**: Parses all three formats into a uniform table; `UPL-PARSE-001..003` pass.

### TASK-013: Field mapping and client-side signal validation
- **Files**: `dashboard/lib/upload/mapping.ts` (create), `dashboard/lib/upload/validate.ts` (create), `dashboard/lib/upload/types.ts` (create)
- **Action**: Create
- **Details**: `mapping.ts`: model mapping from parsed columns → SignalEnvelope fields and `autoMap(columns)` by header heuristics (e.g. `signal_id`, `student`/`learner` → `learner_reference`, `source`/`system` → `source_system`, `time`/`date` → `timestamp`, everything unmapped → nested under `payload`). org_id is NOT collected (proxy injects). `validate.ts`: validate each mapped row against the Source Literal signal-envelope rules — required fields present; `signal_id` matches `^[A-Za-z0-9._:-]+$` (1..256); `schema_version` matches `^v[0-9]+$` (default `v1` if column absent and user opts in); `timestamp` is RFC3339 with timezone; `payload` is an object. Return per-row `{ valid, errors: [{field_path, code, message}] }` reusing canonical-style codes (`missing_required_field`, `invalid_format`, `invalid_timestamp`, `invalid_charset`).
- **Depends on**: TASK-012
- **Verification**: Valid rows pass; bad signal_id/timestamp/schema_version rejected with field_path; `UPL-MAP-001`, `UPL-VAL-001..004` pass.

### TASK-014: Dedicated preflight proxy route with admin key
- **Files**: `dashboard/app/api/preflight/route.ts` (create), `dashboard/lib/upload/preflight.ts` (create)
- **Action**: Create
- **Details**: Contained server route (NOT the generic `/api/control` proxy) that POSTs to upstream `POST /v1/admin/ingestion/preflight` with header `x-admin-api-key: CONTROL_LAYER_ADMIN_API_KEY` and body `{ org_id, source_system, payload }` (Source Literal: preflight contract; org_id+source_system both-or-neither). This narrowly exposes only preflight, not all admin endpoints. `preflight.ts` client samples representative payload(s) and returns `verdict` + forbidden-key hits + `mapping_suggestions`. If `CONTROL_LAYER_ADMIN_API_KEY` is unset, the route returns a `{ disabled: true }` marker and the wizard skips the dry-run (graceful degradation per PREREQ-002). Body limit 32768 mirrors upstream; never log the admin key.
- **Depends on**: TASK-022
- **Verification**: With admin key set, preflight returns a verdict for a sample with a forbidden key; without it, route reports disabled; `UPL-PRE-001`/`UPL-PRE-002` pass.

### TASK-015: Bounded-concurrency commit client to signals endpoint
- **Files**: `dashboard/lib/upload/commit.ts` (create)
- **Action**: Create
- **Details**: `commitSignals(rows, { concurrency = 5, onProgress })` POSTs each mapped row to `/v1/signals` via the existing same-origin `apiFetch` (proxy injects org_id + tenant key). Use a small manual concurrency limiter (no new dep — justified: trivial vs. adding `p-limit`). Per-row result captures the authoritative outcome (`accepted` | `duplicate` | `rejected` + `rejection_reason.code`/`field_path`), reusing the ingestion-log vocabulary. Idempotent/append-only: re-running with the same `signal_id` yields `duplicate`, so retries are safe. Aggregate counts + a rejections list for export.
- **Depends on**: TASK-013
- **Verification**: Mixed batch returns per-row outcomes + summary; duplicates detected on re-run; `UPL-COMMIT-001`/`UPL-COMMIT-002` pass.

### TASK-016: Upload wizard shell and dropzone step
- **Files**: `dashboard/app/(dashboard)/signals/upload/page.tsx` (create), `dashboard/app/(dashboard)/signals/upload/_components/upload-wizard.tsx` (create), `dashboard/app/(dashboard)/signals/upload/_components/step-upload.tsx` (create)
- **Action**: Create
- **Details**: `/signals/upload` page with `PageHeader`. `UploadWizard` is a `"use client"` stepper (Tabs or custom step state) with steps Upload → Map → Validate → Review → Done, a visible progress indicator, and Back/Next with guards. Step 1: accessible drag-drop dropzone (keyboard-focusable, `aria` labelled, click-to-browse fallback) accepting `.json,.csv,.xlsx`; on drop call `parseFile`; show idle/parsing/parsed states (compose `Alert`/`Progress`; idle uses an empty-state pattern). Best-practice: no auto-commit; explicit step progression.
- **Depends on**: TASK-012, TASK-011
- **Verification**: Dropping a file advances to Map with parsed preview; keyboard accessible; `UPL-E2E-001` (partial) green.

### TASK-017: Field-mapping wizard step
- **Files**: `dashboard/app/(dashboard)/signals/upload/_components/step-map.tsx` (create)
- **Action**: Create
- **Details**: Render detected columns with `Select` mappers to SignalEnvelope fields, pre-filled by `autoMap`. Allow `source_system` and `schema_version` defaults (e.g. `v1`) when a column is absent. Show which columns fall into `payload`. Block Next until all required fields are mapped (org_id excluded — proxy-injected, shown as an info note).
- **Depends on**: TASK-013, TASK-016
- **Verification**: Auto-map pre-fills sensible defaults; Next disabled until required mapped; covered by `UPL-MAP-001` + e2e.

### TASK-018: Validate dry-run wizard step with per-row states
- **Files**: `dashboard/app/(dashboard)/signals/upload/_components/step-validate.tsx` (create)
- **Action**: Create
- **Details**: Run client-side `validate.ts` over all mapped rows; if preflight is enabled (TASK-014), also run the dry-run on representative payloads and surface `verdict` (PII-blocking/semantic) + `mapping_suggestions` as warnings. Render a per-row table with `validating` (`Progress`/spinner) → projected `accepted`/`duplicate`/`rejected` using `IngestionOutcomeChip`, and inline field-level `Alert` (`aria-invalid`/`data-invalid`) showing `field_path` + reason for invalid rows. Provide a "download rejections" affordance. Block commit if any PII-blocking verdict (best-practice: never write known PII).
- **Depends on**: TASK-013, TASK-014, TASK-016
- **Verification**: Invalid rows show field-level errors; PII-blocking disables commit; `UPL-VAL-*` + e2e cover it.

### TASK-019: Review commit and confirmation wizard steps
- **Files**: `dashboard/app/(dashboard)/signals/upload/_components/step-review.tsx` (create), `dashboard/app/(dashboard)/signals/upload/_components/step-done.tsx` (create)
- **Action**: Create
- **Details**: Review step shows a pre-commit summary (N valid to send, N excluded) and an explicit Commit button (confirmation before mutate — admin best-practice). On commit, call `commitSignals` with a live `Progress` bar; disable navigation during write. Done step shows outcome counts (accepted/duplicate/rejected), a downloadable rejections CSV (`papaparse.unparse`), and a link to the ingestion log (`/signals`) to verify. Success toast via `sonner`.
- **Depends on**: TASK-015, TASK-018
- **Verification**: Commit writes rows, shows accurate counts, links to ingestion log; `UPL-COMMIT-*` + `UPL-E2E-001` green.

### TASK-020: Upload entry point on signals page and nav
- **Files**: `dashboard/app/(dashboard)/signals/page.tsx` (modify), `dashboard/lib/navigation.ts` (modify if breadcrumb/nav needs the route)
- **Action**: Modify
- **Details**: Add an "Upload signals" button (links to `/signals/upload`) on the signals page header. Add breadcrumb mapping for `/signals/upload`. Optionally add a nav entry; keep it discoverable but not cluttering (design restraint).
- **Depends on**: TASK-016
- **Verification**: Button navigates to the wizard; breadcrumb correct.

### TASK-021: Update design-requirements to bring upload in scope
- **Files**: `docs/specs/dashboard-design-requirements.md`
- **Action**: Modify
- **Details**: Amend §15 Out of Scope to carve out the signal upload surface as **in scope** (control-plane write limited to authenticated bulk signal ingest via `/signals` + preflight dry-run), and add the `/signals/upload` route to §13 file structure and a §14 checklist item. Resolves the deviation below. (Per the post-impl-doc-sync skill, keep docs in lockstep with the change.)
- **Depends on**: none
- **Verification**: §15 no longer lists signal upload as out-of-scope; route documented.

### TASK-022: Add dashboard admin API key env var
- **Files**: `dashboard/lib/env.ts`, `dashboard/.env.example`
- **Action**: Modify
- **Details**: Add optional `CONTROL_LAYER_ADMIN_API_KEY?: string` to `ServerEnv` via `optionalEnv` and document it in `.env.example` (used only by the preflight route TASK-014; absence disables dry-run). Never expose to client.
- **Depends on**: none
- **Verification**: Env typechecks; documented; preflight route reads it server-only.

### TASK-023: Unit tests for parse map validate
- **Files**: `dashboard/lib/upload/__tests__/parse.test.ts`, `dashboard/lib/upload/__tests__/mapping.test.ts`, `dashboard/lib/upload/__tests__/validate.test.ts` (create)
- **Action**: Create
- **Details**: Cover `UPL-PARSE-001..003`, `UPL-MAP-001`, `UPL-VAL-001..004` per Test Plan.
- **Depends on**: TASK-012, TASK-013
- **Verification**: `npm test` (dashboard) green.

### TASK-024: Unit tests for proxy observability and freshness and refresh
- **Files**: `dashboard/lib/api/__tests__/errors.test.ts`, `dashboard/app/api/control/__tests__/route.test.ts` (create), `dashboard/components/shared/__tests__/freshness-chip.test.tsx` (create)
- **Action**: Create
- **Details**: Cover `OBS-001..004`, `FRSH-001..003` per Test Plan (mock upstream `fetch`; assert request-id propagation, no-secret logging, friendly-message mapping, relative-time rendering, router.refresh invocation).
- **Depends on**: TASK-006, TASK-008, TASK-009, TASK-010, TASK-007
- **Verification**: `npm test` (dashboard) green.

### TASK-025: E2E tests for upload refresh and org switcher
- **Files**: `dashboard/e2e/signal-upload.spec.ts` (create), `dashboard/e2e/overview-refresh.spec.ts` (create), `dashboard/e2e/org-switcher-absent.spec.ts` (create)
- **Action**: Create
- **Details**: `UPL-E2E-001` upload a small JSON fixture end-to-end (upload→map→validate→commit→done, assert counts + ingestion-log link). `FRSH-003` refresh updates Overview freshness/data. `ORG-001` org switcher absent when single-org-pinned.
- **Depends on**: TASK-019, TASK-007, TASK-001
- **Verification**: Playwright green in CI.

### TASK-026: Educator-first recent-decisions table; technical detail → L1 Sheet (D1)
- **Files**: `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx`
- **Action**: Modify
- **Details**: Today the L0 table leads with a technical `matched_rule_id` mono column and the plain-language `educator_summary` lives only in the Sheet `(recent-decisions-table.tsx:45-53, :113-127)` — the inverse of directive D1.
  - **L0 columns → educator-first:** change default columns to `Time · Type · Learner · Summary`, where **Summary** renders `row.original.trace.educator_summary` (plain-language, truncated, e.g. ≤ ~64 chars with ellipsis; fall back to a humanized `decision_type` label when `educator_summary` is empty). **Remove** the technical `rule` (`matched_rule_id`) column from L0 (resolves the §2.1 "no raw policy paths at L0" conflict). Keep the existing `learner_reference` filter input.
  - **L1 Sheet → technical tier:** in the `DetailSheet`, keep `educator_summary` in the header/summary for continuity, then present a **Technical detail** `SheetSection` carrying `matched_rule_id` (mono, full/`truncateRule(…, 48)`) + the existing rationale excerpt (`font-mono`). The Sheet remains the technical/audit tier that the educator-first L0 defers to (per `dashboard-design-requirements.md` §2.1 / §8 decision L1 Sheet payload).
  - **Forward-compat note:** Summary uses the always-present `educator_summary` now; when `docs/specs/ai-educator-explanations.md` ships `trace.educator_explanation`, prefer it for the richer narrative with `educator_summary` as fallback (do not block on it).
- **Depends on**: none
- **Verification**: L0 shows a Summary (`educator_summary`) column and **no** rule mono column; row → Sheet shows the rule id + rationale under a Technical detail section; `DEC-TBL-001` passes.

### TASK-027: Tests for D1 educator-first table and D3 KPI clickability
- **Files**: `dashboard/components/dashboard/__tests__/stat-card.test.tsx` (create), `dashboard/app/(dashboard)/_components/__tests__/recent-decisions-table.test.tsx` (create), `dashboard/e2e/overview-kpi-drilldown.spec.ts` (create)
- **Action**: Create
- **Details**: Cover `KPI-004` (StatCard/SectionCards: all four cards clickable to their drill target, keyboard-focusable, no prose description rendered) and `DEC-TBL-001` (recent table renders the `educator_summary` Summary column and not the `matched_rule_id` column at L0; Sheet exposes the rule id + rationale). Include an e2e asserting each KPI card navigates to its route.
- **Depends on**: TASK-003, TASK-026
- **Verification**: `npm test` (dashboard) + Playwright green.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `dashboard/components/shared/freshness-chip.tsx` | TASK-007 | Relative "Updated {t}" chip |
| `dashboard/app/(dashboard)/_components/overview-freshness.tsx` | TASK-007 | Suspense server fetch of fetchedAt |
| `dashboard/components/ui/progress.tsx` | TASK-011 | shadcn Progress primitive |
| `dashboard/lib/upload/parse.ts` | TASK-012 | JSON/CSV/XLSX parser |
| `dashboard/lib/upload/mapping.ts` | TASK-013 | Column to envelope mapping + autoMap |
| `dashboard/lib/upload/validate.ts` | TASK-013 | Per-row envelope validation |
| `dashboard/lib/upload/types.ts` | TASK-013 | Shared upload types |
| `dashboard/app/api/preflight/route.ts` | TASK-014 | Admin-key preflight proxy (scoped) |
| `dashboard/lib/upload/preflight.ts` | TASK-014 | Preflight client + degrade |
| `dashboard/lib/upload/commit.ts` | TASK-015 | Bounded-concurrency ingest |
| `dashboard/app/(dashboard)/signals/upload/page.tsx` | TASK-016 | Upload route |
| `dashboard/app/(dashboard)/signals/upload/_components/upload-wizard.tsx` | TASK-016 | Stepper shell |
| `dashboard/app/(dashboard)/signals/upload/_components/step-upload.tsx` | TASK-016 | Dropzone step |
| `dashboard/app/(dashboard)/signals/upload/_components/step-map.tsx` | TASK-017 | Mapping step |
| `dashboard/app/(dashboard)/signals/upload/_components/step-validate.tsx` | TASK-018 | Dry-run + per-row states |
| `dashboard/app/(dashboard)/signals/upload/_components/step-review.tsx` | TASK-019 | Review + commit |
| `dashboard/app/(dashboard)/signals/upload/_components/step-done.tsx` | TASK-019 | Confirmation |
| `dashboard/lib/upload/__tests__/*.test.ts` | TASK-023 | Parse/map/validate unit tests |
| `dashboard/lib/api/__tests__/errors.test.ts` | TASK-024 | Error mapping + request-id |
| `dashboard/app/api/control/__tests__/route.test.ts` | TASK-024 | Proxy observability |
| `dashboard/components/shared/__tests__/freshness-chip.test.tsx` | TASK-024 | Freshness rendering |
| `dashboard/e2e/signal-upload.spec.ts` | TASK-025 | Upload e2e |
| `dashboard/e2e/overview-refresh.spec.ts` | TASK-025 | Refresh e2e |
| `dashboard/e2e/org-switcher-absent.spec.ts` | TASK-025 | Org switcher e2e |
| `dashboard/components/dashboard/__tests__/stat-card.test.tsx` | TASK-027 | KPI clickability/declutter (D3) |
| `dashboard/app/(dashboard)/_components/__tests__/recent-decisions-table.test.tsx` | TASK-027 | Educator-first columns (D1) |
| `dashboard/e2e/overview-kpi-drilldown.spec.ts` | TASK-027 | KPI cards navigate to drill targets (D3) |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `dashboard/components/layout/site-header.tsx` | TASK-001 | Remove dead org Select + imports |
| `dashboard/components/layout/dashboard-shell.tsx` | TASK-001 | Drop unused switcher props |
| `dashboard/app/(dashboard)/layout.tsx` | TASK-001 | Drop unused switcher props |
| `dashboard/components/dashboard/stat-card.tsx` | TASK-002 | Leading icon + full-card clickability + tooltip (drop prose) (D3) |
| `dashboard/components/dashboard/section-cards.tsx` | TASK-003 | Icon-first + re-rank + declutter + all-clickable (D3) |
| `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx` | TASK-026 | Educator-first L0 columns; rule id + rationale → L1 Sheet (D1) |
| `dashboard/components/shared/ingestion-outcome-chip.tsx` | TASK-004 | Outcome icon |
| `dashboard/lib/api/fetch-overview-data.server.ts` | TASK-005 | Add fetchedAt |
| `dashboard/hooks/use-refresh-queries.ts` | TASK-006 | router.refresh() |
| `dashboard/app/(dashboard)/page.tsx` | TASK-007 | Freshness chip in header |
| `dashboard/app/api/control/[...path]/route.ts` | TASK-008 | request-id + logging |
| `dashboard/lib/api/errors.ts` | TASK-009, TASK-010 | requestId + reason-code map |
| `dashboard/components/states/error-state.tsx` | TASK-009 | Copyable reference id |
| `dashboard/lib/api/client.ts` | TASK-009 | Capture x-request-id |
| `dashboard/package.json` | TASK-011 | papaparse, xlsx deps |
| `dashboard/app/(dashboard)/signals/page.tsx` | TASK-020 | Upload entry button |
| `dashboard/lib/navigation.ts` | TASK-020 | Breadcrumb for upload |
| `docs/specs/dashboard-design-requirements.md` | TASK-021 | §15/§13/§14 upload in-scope |
| `dashboard/lib/env.ts` | TASK-022 | CONTROL_LAYER_ADMIN_API_KEY |
| `dashboard/.env.example` | TASK-022 | Document admin key |

## Requirements Traceability

| Requirement (report anchor) | Source | Task |
|-----------------------------|--------|------|
| Finding 1: hide org switcher while single-org-pinned (answer a) | report §1 / Roadmap P1 | TASK-001 |
| Finding 2: full-cycle upload wizard (REQUIRED) | report §2 / Roadmap P1 | TASK-011..TASK-020, TASK-022 |
| Finding 2: dropzone idle + validating + per-row accepted/duplicate/rejected + field-level rejection | report §2 | TASK-016, TASK-018, TASK-015 |
| Finding 2: JSON/Excel/CSV parse | report §2 | TASK-012 |
| Finding 3: global Refresh re-renders RSC Overview | report §3 / Roadmap P0 | TASK-006 |
| Finding 3/5: fetchedAt + "Updated {relative}" freshness | report §3,§5 / Roadmap P0 | TASK-005, TASK-007 |
| Finding 4: stop swallowing proxy errors; server log via after() | report §4 / Roadmap P0 | TASK-008 |
| Finding 4: x-request-id propagation + copyable reference | report §4 / Roadmap P0 | TASK-008, TASK-009 |
| Finding 4: extend reason-code to friendly-message map | report §4 / Roadmap P2 | TASK-010 |
| Finding 5: icon-first KPI cards | report §5 / Roadmap P1 | TASK-002, TASK-003 |
| Finding 5: icon on IngestionOutcomeChip | report §5 / Roadmap P1 | TASK-004 |
| Finding 5/P2: re-rank to surface Rejected signals today | report §5 / Roadmap P2 | TASK-003 |
| **D1**: educator-first recent table; rule id + rationale → L1 Sheet | report §5 / Roadmap P0; design §2.1/§8 | TASK-026, TASK-027 |
| **D3**: declutter KPI cards (one value, no prose) | report §5 / Roadmap P1; design §8 | TASK-002, TASK-003, TASK-027 |
| **D3**: all four KPI cards clickable to a drill target | report §5 / Roadmap P1; design §8 | TASK-002, TASK-003, TASK-027 |
| **D2**: cross-filter sync toggle | report §5 / Roadmap P1; design §2.1/§8 | **out of this plan** → `docs/specs/overview-cross-filter-sync.md` (separate plan) |
| Best-practice admin workflow: validate (dry-run) before mutate | stakeholder answer 2 | TASK-014, TASK-018 |
| Best-practice: confirmation before commit + per-row outcomes + rejections export | stakeholder answer 2 | TASK-019, TASK-015 |
| Doc sync: upload no longer out-of-scope | §15 conflict | TASK-021 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| ORG-001 | e2e | Org switcher absent when single-org-pinned | TASK-025 |
| KPI-001 | unit | StatCard renders optional leading icon | TASK-002 (assert in TASK-024 set) |
| KPI-002 | unit/visual | Four KPIs icon-first; rejected ranked #2 | TASK-003 |
| KPI-003 | unit | IngestionOutcomeChip renders icon+label per outcome | TASK-004 |
| KPI-004 | unit/e2e | All four KPI cards clickable to drill target + no prose description (D3) | TASK-027 |
| DEC-TBL-001 | unit | Recent table shows `educator_summary` Summary column, no rule mono column at L0; Sheet exposes rule id + rationale (D1) | TASK-027 |
| FRSH-001 | unit | getOverviewData returns fetchedAt | TASK-024 |
| FRSH-002 | unit | FreshnessChip renders relative time from ISO | TASK-024 |
| FRSH-003 | e2e | Refresh re-renders RSC Overview + freshness resets | TASK-025 |
| OBS-001 | unit | Proxy generates+forwards x-request-id, sets response header | TASK-024 |
| OBS-002 | unit | Upstream failure logged server-side w/o secrets; body has request_id | TASK-024 |
| OBS-003 | unit | ErrorState shows copyable Reference id | TASK-024 |
| OBS-004 | unit | reason-code to friendly-message map (+ unknown fallback) | TASK-024 |
| UPL-PARSE-001 | unit | Parse JSON array-of-objects | TASK-023 |
| UPL-PARSE-002 | unit | Parse CSV with headers | TASK-023 |
| UPL-PARSE-003 | unit | Parse XLSX first sheet | TASK-023 |
| UPL-MAP-001 | unit | autoMap fills required fields by header heuristics | TASK-023 |
| UPL-VAL-001 | unit | Valid row passes envelope validation | TASK-023 |
| UPL-VAL-002 | unit | Bad signal_id (charset) rejected with field_path | TASK-023 |
| UPL-VAL-003 | unit | Non-RFC3339 timestamp rejected | TASK-023 |
| UPL-VAL-004 | unit | schema_version not matching ^v[0-9]+$ rejected | TASK-023 |
| UPL-PRE-001 | unit | Preflight returns verdict for forbidden-key sample | TASK-014 (assert in TASK-024 set) |
| UPL-PRE-002 | unit | Preflight disabled gracefully without admin key | TASK-014 |
| UPL-COMMIT-001 | unit | Commit returns per-row accepted/duplicate/rejected | TASK-023 |
| UPL-COMMIT-002 | unit | Re-commit same signal_id yields duplicate (idempotent) | TASK-023 |
| UPL-E2E-001 | e2e | Full wizard upload→map→validate→commit→done (JSON) | TASK-025 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| dashboard-design-requirements.md §15 | Control-plane mutations beyond Approve/Reject are out of scope (inspection read-only) | Adds an authenticated bulk **signal upload** write surface (`/signals/upload` → `/signals` + preflight) | Update spec in same PR (TASK-021) — stakeholder approved upload as required |
| dashboard `ServerEnv` | No admin key in dashboard env | Adds optional `CONTROL_LAYER_ADMIN_API_KEY` for the scoped preflight route | Update spec/docs in same PR (TASK-022); key is optional + server-only |
| dashboard deps | No CSV/Excel libs | Adds `papaparse` + `xlsx` (SheetJS) | Implementation detail — spec silent; justified in Dependencies |
| report §1 recommendation | Option (a) hide while single-org-pinned | Removes the dead `<Select>` entirely (it has no handler in any mode) | Implementation detail — fulfills intent of (a); honest removal of dead UI |

## Dependencies (prefer-existing-solutions check)

| Need | Choice | Justification |
|------|--------|---------------|
| CSV parse | `papaparse` (+ `@types/papaparse`) | De-facto standard; correct quoting/escaping/streaming — hand-rolling CSV is error-prone (less complex to use the library) |
| Excel parse | `xlsx` (SheetJS) | Standard XLSX/XLS reader; `sheet_to_json` gives uniform rows. Pin to latest (heed known advisories); only used client-side for parsing |
| Concurrency limit (commit) | manual limiter (no dep) | Trivial bounded loop; cheaper than adding `p-limit` |
| Progress UI | shadcn `progress` | Compose, do not reinvent (shadcn rule) |
| Toasts | `sonner` (already installed) | Reuse |
| Preflight verdict / forbidden-key detection | upstream `POST /v1/admin/ingestion/preflight` | Reuse server-side dry-run; do not re-implement PII/semantic detection in the browser |
| Per-row ingest outcome | upstream `POST /signals` | Authoritative accepted/duplicate/rejected + rejection_reason; no client-side guess |

> MCP note: This work is all dashboard/Next.js + existing control-layer endpoints; no new AWS service integration, so no AWS-docs MCP query was required. The relevant "official pattern" checks are shadcn (compose primitives) and vercel-react-best-practices (router.refresh, Suspense, after()), already cited inline.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Admin API key exposure via dashboard | High | Use a **dedicated** preflight route (TASK-014), not the generic proxy; never log the key; degrade gracefully if unset |
| `xlsx` (SheetJS) security advisories | Medium | Pin to latest; parsing only (no formula eval); validate row/size caps in `parse.ts` |
| Large files block the UI thread on parse | Medium | Row/size caps; show parsing `Progress`; consider chunked CSV parse via papaparse step callback |
| Bulk commit floods upstream | Medium | Bounded concurrency (default 5) + progress; idempotent duplicates make retries safe |
| RSC `router.refresh()` + TanStack double-fetch | Low | Acceptable; both paths needed since Overview is RSC and other surfaces are TanStack |
| Upload writes PII signals | High | Preflight PII-blocking verdict disables commit (TASK-018); forbidden-key detection server-side |
| §15 scope drift | Low | TASK-021 updates the design spec in the same PR |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`cd dashboard && npm test`)
- [ ] Linter passes (`cd dashboard && npm run lint`)
- [ ] Type check passes (`cd dashboard && npm run typecheck` / `tsc --noEmit`)
- [ ] Playwright e2e green (`dashboard/e2e`)
- [ ] No `x-api-key` / admin key ever reaches the browser or logs
- [ ] design-requirements §15 updated to reflect upload in-scope

## Implementation Order

```
P0/P1 quick wins (parallel):
TASK-001 (org switcher)
TASK-002 → TASK-003 ; TASK-004           (icon-first + decluttered + clickable KPIs — D3)
TASK-026                                  (educator-first recent table + L1 technical Sheet — D1)
TASK-005 → TASK-007 ; TASK-006           (refresh + freshness)
TASK-008 → TASK-009 ; TASK-010           (observability)

Upload wizard (sequential-ish):
TASK-022 → TASK-014
TASK-011 → TASK-012 → TASK-013 → TASK-015
TASK-013 → TASK-017 ; TASK-014/013 → TASK-018 ; TASK-015/018 → TASK-019
TASK-016 → TASK-017 → TASK-018 → TASK-019 → TASK-020
TASK-021 (docs, anytime)

Tests last per area:
TASK-023 ; TASK-024 ; TASK-025 ; TASK-027
```

## Next Steps

- Confirm PREREQ-002 (admin key availability) — gates the preflight dry-run path.
- Run `/implement-spec .cursor/plans/dashboard-uiux-improvements.plan.md`.
- **D2 (cross-filter sync)** is intentionally **not** in this plan — it has its own spec (`docs/specs/overview-cross-filter-sync.md`); run `/plan-impl docs/specs/overview-cross-filter-sync.md` to plan it, and sequence it **after** D1/D3 land (it wraps the same KPI/chart/table surfaces).
