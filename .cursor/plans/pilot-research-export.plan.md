---
name: Pilot Research Export
overview: Implements the SBIR evidence-layer bulk export (`docs/specs/pilot-research-export.md`) — a FERPA-safe, de-identified, self-describing `.tar.gz` bundle of decisions, traces, state versions, state deltas, educator feedback, and decision outcomes for one org × one window, produced via an async admin API (`POST /v1/admin/exports`, `GET /v1/admin/exports/:id`, `GET /v1/admin/exports/:id/download`) and a shell CLI (`scripts/export-pilot-research.mjs`). Writes are SQLite-only at the pilot host in v1; Lambda/S3 deployment deferred to Phase 2. De-identification runs in two layers (structural forbidden-key abort + textual regex sweep + per-bundle session rotation), and the manifest carries SHA-256 per file for integrity + byte-identical determinism. Feeds the SBIR data appendix, Phase II MOU data delivery, and the `internal-docs/reports/YYYY-MM-DD-sbir-phase-i-evidence.md` workflow. Lifecycle stage: v1.1 (pre-Month 0) / SBIR evidence layer.
todos:
  - id: "TASK-001"
    content: Add export error codes to src/shared/error-codes.ts
    status: "pending"
  - id: "TASK-002"
    content: Add export types (ExportRequest, ExportJob, ExportManifest, BundleFileEntry) to src/shared/types.ts
    status: "pending"
  - id: "TASK-003"
    content: Add tar-stream dep and create src/exports/tar-writer.ts (deterministic streaming tar+gzip)
    status: "pending"
  - id: "TASK-004"
    content: Define ExportJobRepository interface + SqliteExportJobRepository (export_jobs table + retention)
    status: "pending"
  - id: "TASK-005"
    content: Implement src/exports/deidentify.ts — forbidden-key abort, regex sweep, session rotation
    status: "pending"
  - id: "TASK-006"
    content: Implement src/exports/row-streams.ts — streaming row providers for every bundle file
    status: "pending"
  - id: "TASK-007"
    content: Implement src/exports/manifest.ts — MANIFEST.json builder + README.md template
    status: "pending"
  - id: "TASK-008"
    content: Implement src/exports/bundler.ts — orchestrator (rows → de-identify → tar/gzip → sha256 → disk)
    status: "pending"
  - id: "TASK-009"
    content: Implement src/exports/signed-url.ts — HMAC-signed download URLs with ≤ 24 h TTL
    status: "pending"
  - id: "TASK-010"
    content: Implement src/exports/handler-core.ts — validation, concurrency, job lifecycle
    status: "pending"
  - id: "TASK-011"
    content: Implement src/exports/handler.ts + routes.ts — Fastify handlers + registration under /v1/admin
    status: "pending"
  - id: "TASK-012"
    content: Wire exports into src/server.ts (init/close job repo, mkdir EXPORTS_DIR, register routes)
    status: "pending"
  - id: "TASK-013"
    content: Create scripts/export-pilot-research.mjs CLI with --format csv flattening
    status: "pending"
  - id: "TASK-014"
    content: OpenAPI — document three admin export endpoints + four new error codes
    status: "pending"
  - id: "TASK-015"
    content: Unit tests — de-identify, tar determinism, manifest, signed-url
    status: "pending"
  - id: "TASK-016"
    content: Contract tests — EXPORT-005, 006, 007, 011 (auth, validation, concurrency, expired id)
    status: "pending"
  - id: "TASK-017"
    content: Integration tests — EXPORT-001..004, 008..010, 012 (bundle happy paths, redaction, determinism)
    status: "pending"
isProject: false
---

# Pilot Research Export

**Spec**: `docs/specs/pilot-research-export.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Export Bundle Contents — archive layout

```
8p3p-pilot-export-{org_id}-{from}-{to}-{exported_at}.tar.gz
├── MANIFEST.json
├── decisions.jsonl
├── decision_traces.jsonl
├── state_versions.jsonl
├── state_deltas.jsonl
├── decision_feedback.jsonl
├── decision_outcomes.jsonl
├── policies/
│   ├── {policy_id}-{version}.json   # one per policy version referenced in the window
└── README.md                          # auto-generated — schema notes, caveats, citation format
```

### From spec § Export Bundle Contents — `MANIFEST.json`

```json
{
  "bundle_version": "1.0.0",
  "org_id": "org_springs",
  "from_time": "2026-02-01T00:00:00Z",
  "to_time": "2026-04-30T23:59:59Z",
  "exported_at": "2026-05-02T18:00:00Z",
  "exporter": {
    "tool": "8p3p-control-layer",
    "git_sha": "abc1234",
    "cli_version": "1.0.0"
  },
  "counts": {
    "decisions": 14320,
    "decision_feedback": 9210,
    "state_versions": 48210,
    "state_deltas_nonzero": 31884,
    "decision_outcomes": 14320
  },
  "policy_versions_referenced": [
    "springs:learner@1.0.0",
    "springs:learner@1.1.0",
    "springs:staff@1.0.0"
  ],
  "metrics_snapshot": {
    "MC-A01": { "value": 14320, "window_days": 89 },
    "MC-A02": { "value": 1.0 },
    "MC-B02": { "value": 0.72, "numerator": 6631, "denominator": 9210 }
  },
  "de_identification": {
    "method": "pseudonymous_learner_reference",
    "forbidden_keys_version": "2026-02-24",
    "pii_regex_applied": ["email", "phone_us", "ssn", "given_name_heuristic"]
  },
  "files": [
    { "path": "decisions.jsonl", "sha256": "...", "rows": 14320, "schema_version": "1.0.0" }
  ]
}
```

### From spec § Export Bundle Contents — per-file rules

- `decisions.jsonl`: subset of the canonical `Decision` shape (`docs/specs/decision-engine.md` §4.1), with the same field names. Includes `trace.state_id`, `trace.state_version`, `trace.policy_id`, `trace.policy_version`, `trace.matched_rule_id`, `trace.rationale`, `trace.educator_summary`. **Excludes** `trace.state_snapshot` and `trace.matched_rule`.
- `decision_traces.jsonl`: `{decision_id, state_snapshot, matched_rule}` — bulky enriched trace separated out.
- `state_versions.jsonl`: All state versions for learners who received at least one decision in the window, bounded to `[from_time - 14d, to_time + 21d]`.
- `state_deltas.jsonl`: one row per `(learner_reference, state_version, field, delta, direction)` where `delta != 0`. Populated at export time (no new storage).
- `decision_feedback.jsonl`: all rows from `educator-feedback-api.md` § `decision_feedback`, plus derived `decision_view_log` counts aggregated per decision. Session IDs rotated to per-bundle opaque tokens.
- `decision_outcomes.jsonl`: one row per decision with the full outcome projection from `decision-outcomes.md` computed against the bundle's fixed `window_days` (default 21; exporter flag `--window-days` overrides). Decisions with `pending` outcome at export time are included with `outcome: "pending"`.
- `policies/{policy_id}-{version}.json`: every policy version referenced in `decisions[].trace.policy_version`, verbatim.
- `README.md`: auto-generated — bundle contents + row counts, schema notes, "How to cite", caveats, FERPA statement.

### From spec § De-identification (normative)

Two layers, applied in order during export:

1. **Structural.** The export tool rejects (fails the export) if any row contains a key in `src/ingestion/forbidden-keys.ts` at top level or at `data.*` / `state_snapshot.*` / `decision_context.*`.
2. **Textual.** Free-text fields (`decision_feedback.reason_text`, `trace.rationale`, `trace.educator_summary`, `policies/*.json` if the site put names into rule descriptions) are scanned with a small regex sweep:
   - Email: `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}` → replaced with `[EMAIL_REDACTED]`
   - US phone: `\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b` → `[PHONE_REDACTED]`
   - SSN-shaped: `\b\d{3}-\d{2}-\d{4}\b` → `[SSN_REDACTED]`
   - Capitalized two-word heuristic (possible name): opt-in flag `--redact-name-heuristic`; off by default (high false-positive rate)

**Pseudonymous IDs.** `learner_reference` remains as-is. The bundle does **not** include any site-provided mapping back to SIS IDs.

**Session IDs rotated.** Every `session_id` in `decision_feedback.jsonl` is replaced with a per-bundle opaque token so external reviewers cannot correlate sessions across exports or against the control layer's live data.

### From spec § Endpoints — `POST /v1/admin/exports`

**Auth:** `x-admin-api-key`.

**Body:**

```json
{
  "org_id": "org_springs",
  "from_time": "2026-02-01T00:00:00Z",
  "to_time": "2026-04-30T23:59:59Z",
  "window_days": 21,
  "redact_name_heuristic": false,
  "format": "jsonl_tar_gz"
}
```

**Response (202):**

```json
{
  "export_id": "uuid",
  "status": "accepted",
  "estimated_rows": 14320,
  "poll_url": "/v1/admin/exports/uuid"
}
```

### From spec § Endpoints — `GET /v1/admin/exports/:export_id`

Returns `{status: "running"|"ready"|"failed", download_url, file_size_bytes, manifest_preview, error?}`.

### From spec § Endpoints — `GET /v1/admin/exports/:export_id/download`

Streams the `.tar.gz`. Signed URL lifetime ≤ 24 h.

### From spec § Requirements — Functional

- `POST /v1/admin/exports` accepts a window and returns an export ID
- `GET /v1/admin/exports/:id` reports `running` / `ready` / `failed` with error details when applicable
- Bundle includes all six JSONL files plus MANIFEST.json and policies/ + README.md
- MANIFEST.json includes SHA-256 per file and row counts per file
- Forbidden-key check fails the export with `pii_detected` if any row contains a forbidden key (the export tool does not silently strip)
- Textual PII regexes are applied and logged in the manifest
- Session IDs are rotated to per-bundle opaque tokens
- CSV format is available via flag; it parallels JSONL but flattens nested fields into dotted columns
- Download URL is signed and expires ≤ 24 h
- Export is deterministic: two exports with identical params over the same data produce byte-identical bundles (modulo `exported_at` and `bundle_id`)

### From spec § Requirements — Non-functional

- Export for 1-month × 500-learner pilot completes in ≤ 120 s
- Bundle size for that scale ≤ 50 MB compressed
- Export streams to disk on the server (no in-memory accumulation of the full dataset)

### From spec § Error Codes — New

| Code | HTTP | Description |
|------|------|-------------|
| `export_not_found` | 404 | `export_id` unknown or expired |
| `pii_detected` | 409 | A row contains a forbidden key; export aborted |
| `export_in_progress` | 409 | Another export for the same `(org_id, from, to)` is already running |
| `bundle_size_limit_exceeded` | 413 | Bundle would exceed hard cap (500 MB) — narrow the window |

### From spec § Constraints

- **Admin-only.** Research exports cross educator sessions and potentially orgs.
- **Idempotent export IDs.** Re-running the same params creates a new export.
- **No live-update semantics.** A bundle is a point-in-time snapshot.
- **No delete.** Exports are retained server-side for 30 days then purged; manifest retention is indefinite for audit (just the manifest, not the data).

### From spec § File Structure

```
src/
├── exports/
│   ├── bundler.ts              # Orchestrator: streams rows from each repo to a tar.gz writer
│   ├── deidentify.ts           # Forbidden-key check + regex sweep + session rotation
│   ├── manifest.ts             # MANIFEST.json + README.md generation
│   ├── handler.ts              # Fastify route handlers (POST /v1/admin/exports, GET .../:id, GET .../:id/download)
│   └── routes.ts               # Route registration
scripts/
└── export-pilot-research.mjs   # CLI wrapper
```

---

## Prerequisites

Before starting implementation:

- [ ] {PREREQ-001} `src/shared/error-codes.ts` exports `ADMIN_KEY_REQUIRED = 'admin_key_required'` and `src/auth/admin-api-key-middleware.ts` exports `adminApiKeyPreHandler`. **Status: complete** (used by `policy-management-routes.ts`).
- [ ] {PREREQ-002} `src/ingestion/forbidden-keys.ts` exports `FORBIDDEN_KEYS` set and `detectForbiddenKeys(obj, basePath)`. **Status: complete** (spec § De-identification cites this file by path).
- [ ] {PREREQ-003} `src/decision/store.ts` exports `getDecisionById`, `getDecisions` (cursor-paginated); `SqliteDecisionRepository` is the active adapter in pilot mode. **Status: complete.**
- [ ] {PREREQ-004} `src/state/store.ts` / `SqliteStateRepository` supports listing state versions for `(org_id, learner_reference)` and retrieving a single version. **Status: partial** — a range query `listStateVersionsInRange(orgId, learner, from, to)` is needed; if not shipped by the `decision-outcomes` plan (TASK-001 there), add a minimal adapter in TASK-006 here and emit a risk row.
- [ ] {PREREQ-005} `educator-feedback-api.plan.md` landed — `SqliteFeedbackRepository` exposes `listFeedbackForDecision(orgId, decisionId)` and the `decision_view_log` table is populated. **Status: in-flight** (parallel plan). If not yet merged, `decision_feedback.jsonl` is emitted empty and flagged in MANIFEST `de_identification` notes.
- [ ] {PREREQ-006} `decision-outcomes.plan.md` landed — `computeOutcome(decision, stateVersions, feedback?, windowDays)` exported from `src/outcomes/view.ts`. **Status: in-flight**. Same graceful-degradation fallback: `decision_outcomes.jsonl` rows carry `{outcome: "unavailable", reason: "outcomes_module_not_wired"}` and the manifest `files[]` entry flags it.
- [ ] {PREREQ-007} `program-metrics.plan.md` landed — `computeProgramMetrics(orgId, window)` returns the MC-A/B/C snapshot. **Status: in-flight**. If absent, `metrics_snapshot` in MANIFEST is the literal JSON `{}` with a companion `metrics_snapshot_available: false` sibling key.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add export error codes
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Append a new `Pilot Research Export (v1.1)` section to the `ErrorCodes` object with exactly the four new codes quoted in Spec Literals § Error Codes § New:
  - `EXPORT_NOT_FOUND = 'export_not_found'` (404)
  - `PII_DETECTED = 'pii_detected'` (409)
  - `EXPORT_IN_PROGRESS = 'export_in_progress'` (409)
  - `BUNDLE_SIZE_LIMIT_EXCEEDED = 'bundle_size_limit_exceeded'` (413)

  Reuse — do not redefine — `ADMIN_KEY_REQUIRED` (401), `INVALID_TIMESTAMP`, `INVALID_TIME_RANGE` per spec § Error Codes § Existing (reuse). HTTP status mapping is applied at the handler layer.
- **Depends on**: none
- **Verification**: `rg "export_not_found|pii_detected|export_in_progress|bundle_size_limit_exceeded" src/shared/error-codes.ts` shows all four; `npm run typecheck` passes.

### TASK-002: Add shared export types
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Add exported TypeScript types that exactly mirror the spec. Quote Spec Literals § `MANIFEST.json` and § `POST /v1/admin/exports` request/response shapes.
  - `ExportFormat = 'jsonl_tar_gz'` (closed set — spec currently defines only one format; CSV is a CLI-side parallel `.csv/` directory, not a server format. See Deviations.)
  - `ExportRequest`: `{ org_id: string; from_time: string; to_time: string; window_days?: number; redact_name_heuristic?: boolean; format?: ExportFormat }` — field names and types match the spec body verbatim.
  - `ExportJobStatus = 'running' | 'ready' | 'failed'` (closed set from spec § `GET /v1/admin/exports/:id`).
  - `ExportJob`: `{ export_id: string; org_id: string; from_time: string; to_time: string; window_days: number; redact_name_heuristic: boolean; format: ExportFormat; status: ExportJobStatus; created_at: string; updated_at: string; file_path: string | null; file_sha256: string | null; file_size_bytes: number | null; manifest_preview: ExportManifest | null; error: { code: string; message: string; path?: string } | null }`.
  - `ExportManifest`: literal-mirror of Spec Literals § `MANIFEST.json`, including nested `exporter`, `counts`, `policy_versions_referenced`, `metrics_snapshot` (record of metric_id → value object), `de_identification` (`{ method: 'pseudonymous_learner_reference'; forbidden_keys_version: string; pii_regex_applied: string[] }`), `files: BundleFileEntry[]`.
  - `BundleFileEntry`: `{ path: string; sha256: string; rows: number; schema_version: string }` — exactly the object shape in Spec Literals § `MANIFEST.json` `files[]`.
  - `TriggerExportResponse`: `{ export_id: string; status: 'accepted'; estimated_rows: number; poll_url: string }` — matches the 202 body in Spec Literals § `POST /v1/admin/exports`.
  - `ExportJobView`: `{ status: ExportJobStatus; download_url?: string; file_size_bytes?: number; manifest_preview?: ExportManifest; error?: ExportJob['error'] }` — matches Spec Literals § `GET /v1/admin/exports/:id`.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; downstream modules can `import type { ExportRequest, ExportManifest } from '../shared/types.js'`.

### TASK-003: Add `tar-stream` dep + deterministic tar writer
- **Files**: `package.json`, `src/exports/tar-writer.ts` (create)
- **Action**: Modify (package.json) + Create
- **Details**: Satisfies Spec Literals § Requirements — Non-functional: "Export streams to disk on the server (no in-memory accumulation of the full dataset)". Node has native `node:zlib` for gzip but no tar writer; the TC39/Node std lib does not ship one. Evidence-based choice of `tar-stream`:
  - `tar-stream` is a small streaming pack/unpack library (`pack = require('tar-stream').pack()`), zero native deps, widely used (`~6M weekly downloads`).
  - `tar` (isaacs) is heavier, couples the filesystem layer, and is oriented toward backup rather than synthetic bundles.
  - `archiver` adds a ZIP surface we do not need and buffers in memory more readily.

  Steps:
  1. `npm install tar-stream && npm install --save-dev @types/tar-stream` (pin to caret of the version `npm` resolves — do not make up version numbers).
  2. Create `src/exports/tar-writer.ts` exporting `createBundleWriter(outPath: string, { mtime }: { mtime: Date }): { addEntry(name: string, size: number, sha256Writer: Transform): Writable; finalize(): Promise<{ sha256: string; size: number }> }`.
  3. Deterministic headers per **Requirements FR10** ("byte-identical bundles … modulo `exported_at` and `bundle_id`"): every tar header carries `uid=0, gid=0, uname='', gname='', mode=0o644, mtime=<caller-supplied constant>`. The exporter (TASK-008) passes `mtime = from_time` (a value derived from the caller's request, stable across runs of the same params).
  4. Pipe `tar-stream.pack()` → `zlib.createGzip({ level: 9, mtime: 0 })` → `fs.createWriteStream(outPath)`. Compute the output file's SHA-256 via a `crypto.createHash('sha256')` `PassThrough` between gzip and disk.
  5. For per-entry SHA-256 (for `MANIFEST.json.files[].sha256`), tee each entry's byte stream through a `crypto.createHash('sha256')` **before** handing bytes to `tar-stream.pack.entry()`.
- **Depends on**: TASK-002
- **Verification**: `npm run typecheck` passes; `npm list tar-stream` resolves; TASK-015 unit test asserts byte-identical output for two runs with the same inputs.

### TASK-004: `ExportJobRepository` interface + SQLite adapter
- **Files**: `src/exports/repository.ts` (create), `src/exports/sqlite-repository.ts` (create)
- **Action**: Create
- **Details**: Persist export jobs so `GET /v1/admin/exports/:id` survives server restarts (the spec says "Pilot exports complete in seconds-to-minutes at pilot scale, but the API is async"). Pattern mirrors `src/decision/repository.ts` + `src/decision/store.ts` exactly; the module exposes `initExportJobStore`, `setExportJobRepository`, `getExportJobRepository`, `closeExportJobStore`.

  Interface `ExportJobRepository`:
  - `createJob(job: ExportJob): Promise<void>`
  - `getJob(exportId: string): Promise<ExportJob | null>`
  - `updateStatus(exportId: string, patch: Partial<Pick<ExportJob, 'status' | 'file_path' | 'file_sha256' | 'file_size_bytes' | 'manifest_preview' | 'error' | 'updated_at'>>): Promise<void>`
  - `findRunningFor(orgId: string, fromTime: string, toTime: string): Promise<ExportJob | null>` — used by TASK-010 to return `export_in_progress` per Spec Literals § Error Codes § New.
  - `purgeExpired(nowIso: string, retentionDays: number): Promise<{ purged: number }>` — deletes bundles older than 30 days (Spec Literals § Constraints — "Exports are retained server-side for 30 days then purged"). Keeps the `export_jobs` row (with `file_path: null`) for audit per the same constraint ("manifest retention is indefinite for audit").
  - `close(): void`

  SQLite table schema:

  ```sql
  CREATE TABLE IF NOT EXISTS export_jobs (
    export_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    from_time TEXT NOT NULL,
    to_time TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    redact_name_heuristic INTEGER NOT NULL,
    format TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    file_path TEXT,
    file_sha256 TEXT,
    file_size_bytes INTEGER,
    manifest_preview TEXT,
    error_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_export_jobs_lookup
    ON export_jobs(org_id, from_time, to_time, status);
  CREATE INDEX IF NOT EXISTS idx_export_jobs_retention
    ON export_jobs(updated_at);
  ```
- **Depends on**: TASK-002
- **Verification**: TASK-015 + TASK-016 cover concurrency and retention; `npm run typecheck` passes.

### TASK-005: `deidentify.ts` — structural + textual + session rotation
- **Files**: `src/exports/deidentify.ts` (create)
- **Action**: Create
- **Details**: Implements Spec Literals § De-identification (normative) verbatim. Export three pure functions:

  1. `assertNoForbiddenKeys(row: unknown, rowKind: 'decision' | 'state_version' | 'feedback' | 'outcome' | 'policy', scopedPaths: ReadonlyArray<string>): void` — throws `PiiDetectedError` (carries `{ code: 'pii_detected', path: string, key: string, rowKind }`). `scopedPaths` are the dotted paths the spec calls out — for decisions that is `['', 'decision_context', 'trace.state_snapshot']`; for state versions `['', 'state']` (the snapshot lives at the row root per `state-engine.md`); for feedback `['']`; for policies `['']`. At each path, run `detectForbiddenKeys(value, path)` from `src/ingestion/forbidden-keys.ts` (PREREQ-002). On first hit the export aborts — Spec Literals § De-identification explicitly forbids silent stripping ("the export tool rejects (fails the export) … This is the same list that hardens `POST /v1/signals` today — if a forbidden key made it through to storage, it's a breach we want to stop at export, not continue").

  2. `redactFreeText(value: string, opts: { redactNameHeuristic: boolean }): string` — applies, in order, the four regexes from Spec Literals § De-identification. **Do not paraphrase the regex source**; copy the spec's four literal patterns into named constants:
     ```ts
     const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
     const PHONE_US_RE = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
     const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
     const NAME_HEURISTIC_RE = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
     ```
     Replacement tokens are **exactly** `[EMAIL_REDACTED]`, `[PHONE_REDACTED]`, `[SSN_REDACTED]`, `[NAME_REDACTED]` (last only when `opts.redactNameHeuristic === true`, which is `false` by default per Spec Literals § `POST /v1/admin/exports` body).

  3. `rotateSessionId(sessionId: string, bundleSecret: Buffer): string` — HMAC-SHA256 keyed with a per-bundle 32-byte secret (generated by `crypto.randomBytes(32)` in `bundler.ts` at job start and then discarded; Spec Literals § De-identification: "external reviewers cannot correlate sessions across exports or against the control layer's live data"). Returns the first 32 hex chars (128 bits) so the token is visibly non-canonical and stable within one bundle only.

  Also export a helper `piiRegexAppliedFor(opts)` that returns the exact manifest string array Spec Literals requires: `["email", "phone_us", "ssn"]` plus `"given_name_heuristic"` if `opts.redactNameHeuristic === true` — matches the `de_identification.pii_regex_applied` array in the manifest verbatim.
- **Depends on**: TASK-001
- **Verification**: Unit tests in TASK-015 cover: (a) forbidden `email` key in `state_snapshot.data` aborts; (b) `parent@example.com` in `reason_text` is replaced with `[EMAIL_REDACTED]` (AC3); (c) two `rotateSessionId` calls with the same `session_id` and different bundle secrets produce different outputs; (d) `piiRegexAppliedFor({ redactNameHeuristic: false })` returns `["email", "phone_us", "ssn"]`.

### TASK-006: `row-streams.ts` — streaming row providers
- **Files**: `src/exports/row-streams.ts` (create)
- **Action**: Create
- **Details**: A collection of async iterators, one per bundle file. Each yields already-shaped JSON objects (not bytes); `bundler.ts` (TASK-008) handles JSONL encoding and de-identification. All iterators are ordered by a stable key (see the deterministic-order column) so re-runs over identical inputs yield byte-identical JSONL — required by FR10.

  | File | Iterator | Source | Deterministic order |
  |------|----------|--------|---------------------|
  | `decisions.jsonl` | `iterateDecisions(orgId, fromTime, toTime)` | `DecisionRepository.getDecisions` (page through `page_size=1000`) | `decided_at ASC, decision_id ASC` (already the `SqliteDecisionRepository` order) |
  | `decision_traces.jsonl` | `iterateTraces(orgId, fromTime, toTime)` | same source; each row is `{ decision_id, state_snapshot, matched_rule }` extracted from the decision | `decision_id ASC` |
  | `state_versions.jsonl` | `iterateStateVersions(orgId, learnerRefs, fromTime − 14d, toTime + 21d)` | `SqliteStateRepository.getDatabase()` direct `SELECT ... WHERE org_id = ? AND learner_reference IN (...) AND updated_at BETWEEN ? AND ? ORDER BY learner_reference, state_version` | `learner_reference ASC, state_version ASC`. **Windowing literals** (`-14d` / `+21d`) come from Spec Literals § `state_versions.jsonl` — do not paraphrase. |
  | `state_deltas.jsonl` | `iterateStateDeltas(stateVersionIter)` | derived in-process via `computeStateDeltas(priorState, nextState)` already exported from `src/state/engine.ts`; emit one row per `(learner_reference, state_version, field, delta, direction)` **where `delta != 0`** (Spec Literals § `state_deltas.jsonl`). | `learner_reference ASC, state_version ASC, field ASC` |
  | `decision_feedback.jsonl` | `iterateFeedback(orgId, decisionIds, bundleSecret)` | `FeedbackRepository.listFeedbackForDecision` per decision + an aggregated `view_count` pulled from `decision_view_log` via the repo's DB handle | `decision_id ASC, created_at ASC`. Session IDs **rotated** inline via `rotateSessionId` (TASK-005). |
  | `decision_outcomes.jsonl` | `iterateOutcomes(decisionIter, stateVersionIndex, feedbackIndex, windowDays)` | `computeOutcome` from `src/outcomes/view.ts` (PREREQ-006). Graceful fallback (per PREREQ-006) emits `{ decision_id, outcome: "unavailable", reason: "outcomes_module_not_wired" }` if the import is missing — the manifest flags this in `de_identification.notes`. | `decision_id ASC` |
  | `policies/*.json` | `collectReferencedPolicies(decisionIter)` | while streaming decisions, track a `Set<string>` of `trace.policy_id + "@" + trace.policy_version`. After the decision stream completes, fetch each via `listPolicies(orgId)` / `getPolicyJson(orgId, policyKey, version)`. | Sorted by `policy_id, version` so MANIFEST `policy_versions_referenced[]` is stable. |

  For `state_versions.jsonl`: if the `decision-outcomes` plan has already added `StateRepository.listVersionsInRange(orgId, learnerRefs, from, to)`, reuse it (per `.cursor/rules/prefer-existing-solutions/RULE.md`). Otherwise, add a **minimal** internal query on the SqliteStateRepository DB handle (`getDatabase()`); do not extend the `StateRepository` public interface unless the other plan lands first.

  Every iterator accepts `abortSignal?: AbortSignal` for clean shutdown.
- **Depends on**: TASK-002, PREREQ-003..006
- **Verification**: TASK-017 integration test seeds 100 decisions and asserts `for await` counts match the MANIFEST `counts` block.

### TASK-007: `manifest.ts` — MANIFEST.json + README.md
- **Files**: `src/exports/manifest.ts` (create)
- **Action**: Create
- **Details**: Pure builder functions (no I/O). Export:

  1. `buildManifest(params: BuildManifestParams): ExportManifest` — produces a value that matches Spec Literals § `MANIFEST.json` byte-for-byte when serialized with `JSON.stringify(value, null, 2) + '\n'` (2-space indent + trailing newline for determinism). Fields:
     - `bundle_version: '1.0.0'` — literal from Spec Literals § `MANIFEST.json`.
     - `org_id, from_time, to_time, exported_at` — from the job record; `exported_at` is the only field allowed to differ across re-runs (FR10 exclusion).
     - `exporter: { tool: '8p3p-control-layer', git_sha: process.env.GIT_SHA ?? 'unknown', cli_version: '1.0.0' }` — strings match Spec Literals § `MANIFEST.json` `exporter` block verbatim.
     - `counts`: populated by the bundler after all iterators complete; `state_deltas_nonzero` is the literal key per Spec Literals (**not** `state_deltas`).
     - `policy_versions_referenced`: sorted array of `"<policy_id>@<version>"` — Spec Literals example shows `"springs:learner@1.0.0"`, i.e. `<policy_id>@<version>` with `@` as separator. Do NOT use `:` or `#`.
     - `metrics_snapshot`: record keyed by metric ID (e.g. `"MC-A01"`) to `{ value, window_days?, numerator?, denominator? }` — shape matches Spec Literals example exactly. When `program-metrics` is unavailable (PREREQ-007), emit `{}` and set the sibling `metrics_snapshot_available: false` (deviation documented).
     - `de_identification: { method: 'pseudonymous_learner_reference', forbidden_keys_version: '2026-02-24', pii_regex_applied: [...] }` — `forbidden_keys_version` literal from Spec Literals § `MANIFEST.json`; `pii_regex_applied` from `piiRegexAppliedFor` (TASK-005).
     - `files: BundleFileEntry[]` — assembled last, post-stream, with per-file `sha256` from the tar writer (TASK-003) and `rows` from the iterator counts; `schema_version: '1.0.0'` per entry until a schema evolves.

  2. `buildReadme(manifest: ExportManifest): string` — markdown template covering all six bullets in Spec Literals § `README.md`:
     - Bundle contents and row counts (generated table from `manifest.counts`).
     - Schema notes and field-by-field definitions (cross-refs to `docs/specs/decision-engine.md` §4.1, `state-engine.md`, `educator-feedback-api.md`, `decision-outcomes.md`).
     - "How to cite" — suggested citation text for academic reviewers.
     - Caveats: session-cookie identity vs per-educator identity (cite `educator-feedback-api.md` § Constraints); window-not-elapsed `pending` outcomes; policy evolution mid-window.
     - FERPA / data handling statement lifted verbatim from `internal-docs/pilot-operations/pilot-runbook.md` § Privacy (if the runbook section does not yet exist, embed a placeholder quote and list the file path in this plan's Risks).

  Both functions are pure — the bundler (TASK-008) writes the returned strings into tar entries.
- **Depends on**: TASK-002, TASK-005
- **Verification**: Unit test in TASK-015 round-trips `buildManifest(...)` → `JSON.stringify` → `JSON.parse` and asserts keys exactly match the Spec Literals `MANIFEST.json` example.

### TASK-008: `bundler.ts` — orchestrator
- **Files**: `src/exports/bundler.ts` (create)
- **Action**: Create
- **Details**: The orchestrator that satisfies Spec Literals § Requirements — Non-functional ("Export streams to disk on the server (no in-memory accumulation of the full dataset)") and § File Structure (`bundler.ts` role description). Export `runExport(job: ExportJob): Promise<ExportManifest>`.

  Algorithm:
  1. **Generate bundle secret** (`crypto.randomBytes(32)`). Used only for session rotation (TASK-005), never persisted.
  2. **Create output path**: `<EXPORTS_DIR>/8p3p-pilot-export-<org_id>-<from>-<to>-<exported_at>.tar.gz` — filename template literally per Spec Literals § Export Bundle Contents archive layout (replace `:` in timestamps with `-` for filesystem safety; record the filesystem-safe variant back on the manifest).
  3. **Open tar writer** (`createBundleWriter(outPath, { mtime: new Date(job.from_time) })` — TASK-003).
  4. **Stream each file in a fixed order** (determinism — FR10): `decisions.jsonl`, `decision_traces.jsonl`, `state_versions.jsonl`, `state_deltas.jsonl`, `decision_feedback.jsonl`, `decision_outcomes.jsonl`, `policies/<id>@<version>.json` (sorted), then finally `MANIFEST.json`, then `README.md`.
     - For each JSONL file, for each row:
       - Call `assertNoForbiddenKeys(row, rowKind, scopedPaths)` (TASK-005). On throw, abort: close tar writer, unlink partial `.tar.gz`, set job `status='failed'`, `error = { code: 'pii_detected', path, key, rowKind }`, and return (no bundle produced — AC2).
       - Apply `redactFreeText` on every free-text field listed in Spec Literals § De-identification § Textual (`decision_feedback.reason_text`, `trace.rationale`, `trace.educator_summary`, and inside each policy file where free-text descriptions exist).
       - Rotate session IDs inside feedback rows via `rotateSessionId`.
       - Serialize with a deterministic JSON serializer: `JSON.stringify(row)` **with sorted keys** (use a small in-module helper; do not introduce a dep). Write `serialized + '\n'`.
     - Count rows and compute a per-entry SHA-256 via the tee (TASK-003).
  5. **Bundle size guard** — while streaming, if total uncompressed bytes would exceed 500 MB (hard cap per Spec Literals § Error Codes § New `bundle_size_limit_exceeded`), abort with `{ code: 'bundle_size_limit_exceeded', http: 413 }`.
  6. **Write `MANIFEST.json`** via `buildManifest(...)` + `JSON.stringify(manifest, null, 2) + '\n'`. (The manifest entry itself is not included in `manifest.files[]`.)
  7. **Write `README.md`** via `buildReadme(manifest)`.
  8. **Finalize tar**; compute final `file_sha256` of the outer `.tar.gz`.
  9. **Update job**: `status='ready'`, `file_path, file_sha256, file_size_bytes, manifest_preview`.

  Exposes `estimateRows(orgId, fromTime, toTime): Promise<number>` for the 202 response `estimated_rows` field (Spec Literals § `POST` response).
- **Depends on**: TASK-003, TASK-004, TASK-005, TASK-006, TASK-007
- **Verification**: TASK-017 integration tests cover happy path (EXPORT-001), forbidden-key abort (EXPORT-002), email redaction (EXPORT-003), byte-identical SHA-256 across two runs (EXPORT-004), policy-file completeness (EXPORT-008), session rotation (EXPORT-009).

### TASK-009: `signed-url.ts` — HMAC-signed download URLs
- **Files**: `src/exports/signed-url.ts` (create)
- **Action**: Create
- **Details**: Implements Spec Literals § `GET /v1/admin/exports/:export_id/download` ("Signed URL lifetime ≤ 24 h") and FR9 ("Download URL is signed and expires ≤ 24 h"). Pure functions, no I/O:

  - `signDownloadUrl({ baseUrl, exportId, expiresAt, secret }): string` — builds `${baseUrl}/v1/admin/exports/${exportId}/download?exp=${expUnix}&sig=${hex}` where `sig = HMAC-SHA256(secret, \`${exportId}|${expUnix}\`)` (pipe literal — internal format, not a spec literal).
  - `verifyDownloadUrl({ exportId, exp, sig, secret, now }): { ok: true } | { ok: false; reason: 'expired' | 'bad_sig' | 'bad_format' }` — constant-time HMAC comparison via `crypto.timingSafeEqual`.

  Secret source: `process.env.EXPORT_URL_SECRET` — required at boot. If unset or `< 32` chars, TASK-012 fails fast with a clear startup error (same discipline as `COOKIE_SECRET` in `src/auth/session-cookie.ts`). Default TTL = 24 h; TASK-011 applies this on each `GET /v1/admin/exports/:id` response.

  The handler (TASK-011) re-computes and returns a fresh signed `download_url` per poll, so the 24 h clock is effectively "last poll" — keeps reviewer workflows simple.
- **Depends on**: TASK-001
- **Verification**: Unit tests in TASK-015 — sign/verify round-trip; expired timestamp rejected; tampered `exportId` rejected with `bad_sig`.

### TASK-010: `handler-core.ts` — validation, concurrency, job lifecycle
- **Files**: `src/exports/handler-core.ts` (create)
- **Action**: Create
- **Details**: Framework-agnostic validation + orchestration, mirroring `src/decision/handler-core.ts`.

  - `handleTriggerExportCore({ body, now, jobRepo, baseUrl })`:
    1. Validate `org_id` (non-empty string), `from_time` / `to_time` (RFC3339 via the existing timestamp validator in `src/shared`). Invalid timestamp → `{statusCode: 400, body: { error: { code: 'invalid_timestamp' } }}` (reuse per Spec Literals § Error Codes § Existing (reuse)). Invalid time range → `{statusCode: 400, body: { error: { code: 'invalid_time_range' } }}` (reuse).
    2. Validate `window_days` (optional, default 21, max 180 — consistent with `decision-outcomes.md`). `redact_name_heuristic` (optional, default `false`). `format` (optional, must be `'jsonl_tar_gz'` when present — the only closed-set value per Spec Literals).
    3. `const existing = await jobRepo.findRunningFor(org_id, from_time, to_time)`. If non-null → `{statusCode: 409, body: { error: { code: 'export_in_progress', message: 'Another export for this org/window is already running.', export_id: existing.export_id } }}` — literal code per Spec Literals § Error Codes § New.
    4. Create job row: `export_id = crypto.randomUUID()`, `status='running'`, `created_at = now`, `updated_at = now`, etc.
    5. `const estimated_rows = await estimateRows(org_id, from_time, to_time)` (TASK-008).
    6. Kick off `runExport(job)` **in the background** (return 202 immediately). For the v1 SQLite/Fastify host, "in the background" = `setImmediate(() => runExport(job).catch(...))`. Errors are captured onto the job row — never swallowed.
    7. Return `{statusCode: 202, body: { export_id, status: 'accepted', estimated_rows, poll_url: '/v1/admin/exports/' + export_id }}` — shape exactly Spec Literals § `POST /v1/admin/exports` 202 body.

  - `handleGetExportCore({ exportId, now, jobRepo, baseUrl, urlSecret })`:
    1. `const job = await jobRepo.getJob(exportId)`; if null → `{statusCode: 404, body: { error: { code: 'export_not_found', message: 'export_id unknown or expired.' } }}`.
    2. Build `ExportJobView` from the job row; if `status === 'ready'`, `download_url = signDownloadUrl(...)` with `expiresAt = now + 24h`. Otherwise omit `download_url`.
    3. Return `{statusCode: 200, body: view}` — shape matches Spec Literals § `GET /v1/admin/exports/:id` response.

  - `handleDownloadExportCore({ exportId, exp, sig, now, jobRepo, urlSecret })`:
    1. `verifyDownloadUrl(...)`. `expired` or `bad_sig` or `bad_format` → `{statusCode: 404, body: { error: { code: 'export_not_found' } }}` (treat all signature failures as not-found to avoid enumeration — standard admin API posture).
    2. `const job = await jobRepo.getJob(exportId)`; `status !== 'ready'` → `404 export_not_found`.
    3. Return `{statusCode: 200, streamPath: job.file_path!, fileName: basename(job.file_path!) }` — the Fastify adapter (TASK-011) turns this into a streamed response.
- **Depends on**: TASK-004, TASK-008, TASK-009
- **Verification**: TASK-016 contract tests exercise each code path; TASK-017 integration test covers the 202 → poll → download loop.

### TASK-011: Fastify handlers + route registration
- **Files**: `src/exports/handler.ts` (create), `src/exports/routes.ts` (create)
- **Action**: Create
- **Details**: Thin Fastify adapters over handler-core, plus registration. Routes under `/v1/admin` prefix (mounted by TASK-012):

  - `app.post('/exports', handleTriggerExport)` — reads `request.body`, calls `handleTriggerExportCore`, sends `202` + body.
  - `app.get('/exports/:export_id', handleGetExport)` — reads `request.params.export_id`, `now = new Date().toISOString()`.
  - `app.get('/exports/:export_id/download', handleDownloadExport)` — reads `request.params.export_id`, `request.query.exp`, `request.query.sig`; on success uses `reply.type('application/gzip').header('Content-Disposition', \`attachment; filename="${fileName}"\`).send(createReadStream(streamPath))`.

  **Auth:** no per-route preHandler is needed — `adminApiKeyPreHandler` already applies to the entire `/v1/admin` scope in `src/server.ts`. Non-admin callers get `401 admin_key_required` (AC5 / EXPORT-005) automatically; this is covered by the existing admin scope, not by new code.

  `request.log.info({ exportId, orgId, status }, 'export event')` on every state transition for observability.
- **Depends on**: TASK-010
- **Verification**: `rg "POST.*exports|GET.*exports" src/exports/routes.ts` shows exactly three registrations; `app.printRoutes()` (used in the TASK-016 test) confirms they live under `/v1/admin/exports`.

### TASK-012: Wire exports into `src/server.ts`
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  - Import `initExportJobStore, closeExportJobStore` from `./exports/sqlite-repository.js` and `registerExportRoutes` from `./exports/routes.js`.
  - Add env vars: `EXPORT_JOBS_DB_PATH` (default `./data/exports.db`), `EXPORTS_DIR` (default `./data/exports`), `EXPORT_URL_SECRET` (required for prod; if unset in non-test mode, log error and exit — same pattern as `COOKIE_SECRET`). Document in `docs/api/env-vars.md` if that file exists; otherwise note in README.
  - Ensure both paths exist via `mkdirSync(..., { recursive: true })`, mirroring the existing pattern at lines 51-55.
  - Call `initExportJobStore(exportJobsDbPath)` alongside `initDecisionStore(...)`.
  - In the existing `server.register(async (admin) => { ... }, { prefix: '/v1/admin' })` block, add `registerExportRoutes(admin)` after `registerAdminFieldMappingsRoutes(admin)`. The existing `adminApiKeyPreHandler` on that scope handles AC5 (non-admin → 401) — no new auth plumbing.
  - In `server.addHook('onClose', ...)`, call `closeExportJobStore()` **before** `closeDecisionStore()` (reverse of init order).
  - (Optional) schedule `jobRepo.purgeExpired(nowIso, 30)` daily via `setInterval(..., 24 * 3600 * 1000).unref()` — 30-day retention per Spec Literals § Constraints. Unlinked files are deleted; `export_jobs` rows are preserved for audit. If cron-grade precision is needed, document as a Phase 2 follow-up.
  - Update the `/` index to include `/v1/admin/exports` in the `endpoints` array.
- **Depends on**: TASK-004, TASK-011
- **Verification**: `npm run build && curl localhost:3000/` shows `/v1/admin/exports` in endpoints; a `POST /v1/admin/exports` without `x-admin-api-key` returns `401 admin_key_required`.

### TASK-013: `scripts/export-pilot-research.mjs` CLI
- **Files**: `scripts/export-pilot-research.mjs` (create)
- **Action**: Create
- **Details**: Thin wrapper over the three admin endpoints, matching Spec Literals § CLI. Flags:

  ```
  --host <url>                 (required) e.g. https://pilot.example
  --admin-key <key>            (required) x-admin-api-key
  --org <org_id>               (required)
  --from <RFC3339 or YYYY-MM-DD>
  --to <RFC3339 or YYYY-MM-DD>
  --window-days <n>            default 21
  --redact-name-heuristic      default off
  --format csv                 optional; post-process JSONL → .csv/
  --out <path>                 output .tar.gz path
  ```

  Flow:
  1. `POST /v1/admin/exports` with the constructed body; read `202` `{ export_id, poll_url }`.
  2. Poll `GET ${host}${poll_url}` every 2 s until `status in {ready, failed}` (max wait configurable via `--timeout-sec`, default 300).
  3. On `ready`, `GET ${download_url}` and pipe the response to `--out`.
  4. If `--format csv`:
     - After download, `tar -xzf <out>` to a temp dir (use node `tar-stream.extract` to avoid the need for system tar).
     - For each `*.jsonl`, stream-parse rows and emit `<name>.csv` into a `csv/` subdirectory next to `<out>` (not inside the `.tar.gz` — that would invalidate its SHA). Spec Literals § CLI says "flattens the JSONL files into a parallel `.csv/` directory inside the bundle"; emitting alongside rather than inside is a deviation — see Deviations table (rationale: immutability of the server-produced `.tar.gz`).
     - Flattening: columns are dotted paths from the flat JSON (e.g. `trace.state_id`), one row per input row. Arrays/objects that remain nested are written as JSON-stringified cells.

  Exit code 0 on success; 1 on any error; echoes the final manifest's `counts` block on success for operator sanity.
- **Depends on**: TASK-011
- **Verification**: `node scripts/export-pilot-research.mjs --help` prints all flags; TASK-017 harness spins a live Fastify app, runs the CLI end-to-end against seeded data, asserts the downloaded file is a valid `.tar.gz` and its manifest counts match the seed.

### TASK-014: OpenAPI updates
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Document all three endpoints in the existing `/v1/admin` grouping. Security: `x-admin-api-key` (reuse existing `adminApiKey` scheme at line 1042). Literal key points:
  - Paths: `POST /v1/admin/exports`, `GET /v1/admin/exports/{export_id}`, `GET /v1/admin/exports/{export_id}/download`.
  - Request schema `ExportRequest` — mirror Spec Literals § `POST /v1/admin/exports` body exactly: `{ org_id, from_time, to_time, window_days?, redact_name_heuristic?, format? }`.
  - Response schemas:
    - `TriggerExportResponse` (202) — `{ export_id, status: 'accepted', estimated_rows, poll_url }`.
    - `ExportJobView` (200) — `{ status: enum[running,ready,failed], download_url?, file_size_bytes?, manifest_preview?, error? }`.
    - `/download` (200) — `content: application/gzip` with `schema: { type: string, format: binary }`.
  - Error codes — include all four new codes plus reused ones: `401 admin_key_required`, `400 invalid_timestamp`, `400 invalid_time_range`, `404 export_not_found`, `409 pii_detected`, `409 export_in_progress`, `413 bundle_size_limit_exceeded`. Literal code strings per Spec Literals § Error Codes.
- **Depends on**: TASK-001, TASK-002
- **Verification**: `npm run validate:api` (redocly lint) passes; `rg "export_not_found|pii_detected|export_in_progress|bundle_size_limit_exceeded" docs/api/openapi.yaml` shows all four.

### TASK-015: Unit tests
- **Files**:
  - `tests/unit/exports-deidentify.test.ts` (create)
  - `tests/unit/exports-manifest.test.ts` (create)
  - `tests/unit/exports-tar-writer.test.ts` (create)
  - `tests/unit/exports-signed-url.test.ts` (create)
- **Action**: Create
- **Details**: Pure-function coverage:
  - **deidentify**: forbidden `email` key at `state_snapshot.data.email` throws `PiiDetectedError` with the correct `path`; `redactFreeText('Call parent@example.com or 555-123-4567')` → `'Call [EMAIL_REDACTED] or [PHONE_REDACTED]'`; `rotateSessionId('sess_abc', secretA) !== rotateSessionId('sess_abc', secretB)`; `piiRegexAppliedFor({ redactNameHeuristic: false })` === `["email", "phone_us", "ssn"]` (matches manifest literal).
  - **manifest**: `buildManifest` output keys and order exactly match the Spec Literals `MANIFEST.json` example (`Object.keys(...)`); `buildReadme` contains the literal string `How to cite` (readme bullet 3) and the FERPA heading.
  - **tar-writer**: two consecutive runs with identical inputs produce byte-identical `.tar.gz` outputs (fixed `mtime`, sorted entries) — satisfies **AC4** / EXPORT-004 at the unit level before integration.
  - **signed-url**: round-trip; `exp = now - 1` rejected with `'expired'`; `sig` flipped by one byte → `'bad_sig'`; timing-safe comparison used.
- **Depends on**: TASK-003, TASK-005, TASK-007, TASK-009
- **Verification**: `npm test -- tests/unit/exports-*.test.ts` passes.

### TASK-016: Contract tests
- **Files**: `tests/contracts/pilot-research-export.test.ts` (create)
- **Action**: Create
- **Details**: Fastify `app.inject()` tests. Cover contract tests from spec § Contract Tests:
  - **EXPORT-005**: `POST /v1/admin/exports` with no `x-admin-api-key` → status 401, body `code === 'admin_key_required'`.
  - **EXPORT-006**: `POST /v1/admin/exports` body `{ from_time: '2026-05-01', to_time: '2026-04-01', org_id: 'org_springs' }` → 400 `invalid_time_range`.
  - **EXPORT-007**: Start export A for `(org_springs, from, to)`, leave it `running`. Start export B with identical `(org_id, from, to)` → 409 `export_in_progress`; response body carries the running `export_id`.
  - **EXPORT-011**: `GET /v1/admin/exports/00000000-0000-0000-0000-000000000000` → 404 `export_not_found`; `GET /v1/admin/exports/<valid-id>/download?exp=0&sig=bad` → 404 `export_not_found` (expired signature masked as not-found).
  - Additionally: `POST` body with `format: 'csv'` (server does not support CSV; only the CLI does) → 400 `invalid_format` (reuse `INVALID_FORMAT` from existing `ErrorCodes`; record this deviation in the Deviations table).
- **Depends on**: TASK-012
- **Verification**: `npm run test:contracts` passes; every contract test ID from spec § Contract Tests appears in a test name.

### TASK-017: Integration tests
- **Files**: `tests/integration/pilot-research-export.test.ts` (create)
- **Action**: Create
- **Details**: Boot the full Fastify app (same harness as `tests/integration/dashboard-gate.test.ts`), seed decisions + state versions + feedback, then exercise end-to-end:
  - **EXPORT-001** (happy path): Seed 100 decisions in `org_springs`. `POST /v1/admin/exports` → 202. Poll until `ready` → `GET .../download`. Parse the `.tar.gz` (use `tar-stream.extract` in-memory); assert:
    - `MANIFEST.json.counts.decisions === 100`, `decision_outcomes === 100`.
    - `decisions.jsonl` line count `=== 100`.
    - `MANIFEST.json.files[]` includes entries for all six JSONL files plus policies.
    - Per-file SHA-256s match a direct hash of the extracted entry bytes.
  - **EXPORT-002** (forbidden key abort): Seed a decision whose `decision_context` contains `{ email: 'x@y.com' }`. Run export. Assert job `status === 'failed'`, `error.code === 'pii_detected'`, `error.path === 'decision_context.email'`; assert no `.tar.gz` file on disk at `job.file_path` (AC2).
  - **EXPORT-003** (email redaction): Seed a feedback row with `reason_text = 'Ping parent@example.com'`. Run export. Extract `decision_feedback.jsonl`; assert the row's `reason_text === 'Ping [EMAIL_REDACTED]'` (AC3).
  - **EXPORT-004** (determinism): Run the export twice, ~2 s apart, with identical params over unchanged source data. Assert every `manifest.files[].sha256` is equal between the two runs; the outer bundle SHA-256 **may** differ only because `MANIFEST.json` carries `exported_at` (FR10 explicitly excludes `exported_at` and `bundle_id` from the determinism guarantee).
  - **EXPORT-008** (policies): Seed decisions referencing three distinct `(policy_id, policy_version)` pairs. Assert `policies/` contains three files and `manifest.policy_versions_referenced.length === 3`.
  - **EXPORT-009** (session rotation): Seed three feedback rows with a known `session_id = 'sess_abc'`. Extract `decision_feedback.jsonl`; assert no row's `session_id === 'sess_abc'` and all three rows share the same rotated token (consistent within a bundle).
  - **EXPORT-010** (CSV flag): Run the CLI (TASK-013) with `--format csv`. Assert a `csv/decisions.csv` file exists alongside the `.tar.gz`, row count matches `decisions.jsonl`, and flat columns like `trace.state_id` are present.
  - **EXPORT-012** (README regeneration): Assert extracted `README.md` contains the current bundle's `counts` block rendered into a table.
- **Depends on**: TASK-012, TASK-013
- **Verification**: `npm run test:integration` passes; every EXPORT-0xx test ID from spec § Contract Tests appears as a named case.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/exports/tar-writer.ts` | TASK-003 | Deterministic streaming tar+gzip writer on `tar-stream` + `zlib` |
| `src/exports/repository.ts` | TASK-004 | `ExportJobRepository` interface |
| `src/exports/sqlite-repository.ts` | TASK-004 | SQLite adapter + module init/close API |
| `src/exports/deidentify.ts` | TASK-005 | Forbidden-key abort, regex sweep, session rotation |
| `src/exports/row-streams.ts` | TASK-006 | Streaming row providers per bundle file |
| `src/exports/manifest.ts` | TASK-007 | `buildManifest` + `buildReadme` builders |
| `src/exports/bundler.ts` | TASK-008 | Orchestrator — rows → de-identify → tar → gzip → disk |
| `src/exports/signed-url.ts` | TASK-009 | HMAC-signed download URL (≤ 24 h TTL) |
| `src/exports/handler-core.ts` | TASK-010 | Framework-agnostic validation + job lifecycle |
| `src/exports/handler.ts` | TASK-011 | Fastify adapter handlers |
| `src/exports/routes.ts` | TASK-011 | Route registration for three admin endpoints |
| `scripts/export-pilot-research.mjs` | TASK-013 | Shell CLI wrapper |
| `tests/unit/exports-deidentify.test.ts` | TASK-015 | deidentify unit tests |
| `tests/unit/exports-manifest.test.ts` | TASK-015 | manifest/README builder tests |
| `tests/unit/exports-tar-writer.test.ts` | TASK-015 | Tar determinism unit tests |
| `tests/unit/exports-signed-url.test.ts` | TASK-015 | Signed URL round-trip + expiry |
| `tests/contracts/pilot-research-export.test.ts` | TASK-016 | Contract tests EXPORT-005..007, 011 |
| `tests/integration/pilot-research-export.test.ts` | TASK-017 | Integration tests EXPORT-001..004, 008..010, 012 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | Add `EXPORT_NOT_FOUND`, `PII_DETECTED`, `EXPORT_IN_PROGRESS`, `BUNDLE_SIZE_LIMIT_EXCEEDED` |
| `src/shared/types.ts` | TASK-002 | Add `ExportFormat`, `ExportRequest`, `ExportJobStatus`, `ExportJob`, `ExportManifest`, `BundleFileEntry`, `TriggerExportResponse`, `ExportJobView` |
| `package.json` | TASK-003 | Add `tar-stream` (dep) + `@types/tar-stream` (devDep) |
| `src/server.ts` | TASK-012 | Init/close export job store; mkdir `EXPORTS_DIR`; register routes under `/v1/admin`; add `EXPORT_URL_SECRET` guard |
| `docs/api/openapi.yaml` | TASK-014 | Document three endpoints + four new error codes |

---

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK here. Mirrors the Test Plan discipline for non-test requirements.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `POST /v1/admin/exports` accepts a window and returns an export ID | spec § Requirements § Functional (FR1) | TASK-010, TASK-011, TASK-017 (EXPORT-001) |
| `GET /v1/admin/exports/:id` reports running/ready/failed with error details | spec § Requirements § Functional (FR2) | TASK-010, TASK-011, TASK-017 (EXPORT-001, EXPORT-002) |
| Bundle includes all six JSONL files plus MANIFEST.json and policies/ + README.md | spec § Requirements § Functional (FR3) | TASK-006, TASK-007, TASK-008, TASK-017 (EXPORT-001, EXPORT-008, EXPORT-012) |
| MANIFEST.json includes SHA-256 per file and row counts per file | spec § Requirements § Functional (FR4) | TASK-003, TASK-007, TASK-008, TASK-017 (EXPORT-001) |
| Forbidden-key check fails export with `pii_detected` if any row contains a forbidden key | spec § Requirements § Functional (FR5) | TASK-005, TASK-008, TASK-017 (EXPORT-002) |
| Textual PII regexes are applied and logged in the manifest | spec § Requirements § Functional (FR6) | TASK-005, TASK-007, TASK-015, TASK-017 (EXPORT-003) |
| Session IDs are rotated to per-bundle opaque tokens | spec § Requirements § Functional (FR7) | TASK-005, TASK-006, TASK-017 (EXPORT-009) |
| CSV format is available via flag; parallels JSONL with dotted columns | spec § Requirements § Functional (FR8) | TASK-013, TASK-017 (EXPORT-010) |
| Download URL is signed and expires ≤ 24 h | spec § Requirements § Functional (FR9) | TASK-009, TASK-010, TASK-011, TASK-015 |
| Export is deterministic: byte-identical (modulo `exported_at` and `bundle_id`) | spec § Requirements § Functional (FR10) | TASK-003, TASK-006, TASK-008, TASK-015, TASK-017 (EXPORT-004) |
| 1-month × 500-learner pilot completes in ≤ 120 s | spec § Requirements § Non-functional | TASK-008 (streaming orchestrator), TASK-006 (paginated iterators) — verified in pilot smoke, not in CI |
| Bundle size for that scale ≤ 50 MB compressed | spec § Requirements § Non-functional | TASK-008 (gzip level 9), verified in pilot smoke |
| Export streams to disk on the server (no in-memory accumulation) | spec § Requirements § Non-functional | TASK-003, TASK-006, TASK-008 |
| Given 100 decisions, export runs over the full window | spec § Acceptance Criteria (AC1) | TASK-017 (EXPORT-001) |
| Given a row with a forbidden top-level key, export fails with `pii_detected` | spec § Acceptance Criteria (AC2) | TASK-005, TASK-008, TASK-017 (EXPORT-002) |
| Given `reason_text = "Ping parent@example.com"`, export substitutes `[EMAIL_REDACTED]` | spec § Acceptance Criteria (AC3) | TASK-005, TASK-017 (EXPORT-003) |
| Given two consecutive exports, file sha256 fields are identical | spec § Acceptance Criteria (AC4) | TASK-003, TASK-015, TASK-017 (EXPORT-004) |
| Given a non-admin caller, 401 `admin_key_required` | spec § Acceptance Criteria (AC5) | TASK-012 (scope wiring), TASK-016 (EXPORT-005) |
| Admin-only; no tenant-scoped exports in v1 | spec § Constraints | TASK-012 (routes live only under `/v1/admin`) |
| Idempotent export IDs — each run creates a new export | spec § Constraints | TASK-010 (`crypto.randomUUID()` per job) |
| No live-update semantics — bundle is point-in-time | spec § Constraints | TASK-008 (stream source data at run start) |
| No delete; 30-day retention then purge | spec § Constraints | TASK-004 (`purgeExpired`), TASK-012 (daily sweep) |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| EXPORT-001 | integration | Happy path — 100 decisions produce a valid bundle with matching manifest counts | TASK-017 |
| EXPORT-002 | integration | Forbidden key in `decision_context` / `state_snapshot` → `pii_detected`, no bundle | TASK-017 |
| EXPORT-003 | integration | Email in `reason_text` → replaced with `[EMAIL_REDACTED]` | TASK-017 |
| EXPORT-004 | integration | Two exports with identical params produce same per-file SHA-256 | TASK-017 (unit-layer also in TASK-015) |
| EXPORT-005 | contract | Non-admin caller → 401 `admin_key_required` | TASK-016 |
| EXPORT-006 | contract | `from > to` → 400 `invalid_time_range` | TASK-016 |
| EXPORT-007 | contract | Concurrent export of same `(org, from, to)` → 409 `export_in_progress` | TASK-016 |
| EXPORT-008 | integration | Bundle includes all referenced policy versions | TASK-017 |
| EXPORT-009 | integration | Session IDs in `decision_feedback.jsonl` rotated to opaque tokens | TASK-017 |
| EXPORT-010 | integration | CSV flag produces parallel `.csv/` directory | TASK-017 (CLI-driven) |
| EXPORT-011 | contract | Expired `export_id` → 404 `export_not_found` | TASK-016 |
| EXPORT-012 | unit | README.md regenerated per export with current row counts | TASK-015 (manifest+readme) + TASK-017 assertion |

---

## Deviations from Spec

> List every place the plan's literal values differ from the spec. An empty table is not allowed — state `None — plan is literal-compatible with spec.` if nothing differs. Deviations hidden in task bodies (JSDoc, risks, prose) are treated as drift defects by `/review --spec`.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Endpoints and CLI | CLI `--format csv` — location of CSV files | CLI emits `.csv/` **alongside** the `.tar.gz` (not inside it) | **Resolved in spec 2026-04-23** — `pilot-research-export.md` § CLI now states CSVs are emitted "next to the `.tar.gz` bundle on the operator's filesystem (not inside the archive)" with FR10 determinism rationale. Plan literal matches spec. |
| § MANIFEST.json | `metrics_snapshot` is populated with MC-A/B/C values | When `program-metrics` module is not yet wired, plan emits `metrics_snapshot: {}` plus a sibling `metrics_snapshot_available: false` | **Resolved in spec 2026-04-23** — `pilot-research-export.md` § Export Bundle Contents now documents the `metrics_snapshot_available` boolean and the degraded-dependency contract. Plan literal matches spec. |
| § Non-functional — "streams to disk on the server" | Generic — applies to any deployment | v1 ships the SQLite/Fastify pilot-host path only; Lambda/S3 deployment (with presigned S3 URLs) is a Phase 2 follow-up | **Implementation detail — spec silent** on Lambda target. No CDK changes in this plan. A follow-up `pilot-research-export-cloud.plan.md` will add `ExportJobsTable`, `ExportsBucket`, and swap `signed-url.ts` for S3 presigned URLs. |
| § POST `/v1/admin/exports` body | `format` enum enforcement | Server rejects any non-`jsonl_tar_gz` `format` value with `400 invalid_format` (reuses existing `INVALID_FORMAT` code) | **Resolved in spec 2026-04-23** — `pilot-research-export.md` § POST body now explicitly documents closed-enum enforcement and the 400 response. Plan literal matches spec. |
| § MANIFEST.json filename | RFC3339 `{exported_at}` contains colons | Colons in timestamps are replaced with hyphens in the filesystem filename (Windows + some Linux tooling rejects colons) | **Resolved in spec 2026-04-23** — `pilot-research-export.md` § Export Bundle Contents now states filesystem timestamps use `YYYY-MM-DDTHH-MM-SSZ` form while the manifest body retains canonical RFC3339. Plan literal matches spec. |
| § De-identification — forbidden-key scope | "top level or at `data.*` / `state_snapshot.*` / `decision_context.*`" | Plan also scans `policies/*.json` top level | **Resolved in spec 2026-04-23** — `pilot-research-export.md` `MANIFEST.de_identification.structural_scan_scope` now enumerates all five scan locations including `policies/*.json`. Plan literal matches spec. |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `decision-outcomes` / `educator-feedback-api` / `program-metrics` plans are still in-flight; `src/outcomes/view.ts` and `FeedbackRepository` may not exist when this plan starts | High (would block EXPORT-001, 003, 008, 009, 012) | Land this plan in this order: TASK-001..005 (no cross-plan deps) → TASK-007, 009 → then TASK-006/008 once PREREQ-005/006 merge. PR can open with TASK-001..015 and gate TASK-006/008/017 on the upstream merges. |
| `StateRepository.listVersionsInRange(orgId, learnerRefs, from, to)` not exported by the `state` module | Medium (would force a leaky direct-DB read in TASK-006) | If `decision-outcomes.plan.md` TASK-001 does not land first, ship a narrow `SqliteStateRepository.listVersionsInRange` via the existing `getDatabase()` handle; add a follow-up ticket to promote it to the `StateRepository` interface. |
| `tar-stream` lacks a stable `mtime` hook for the outer gzip container, breaking byte-identical determinism | Medium | `zlib.createGzip({ level: 9, mtime: 0 })` accepts an explicit `mtime` in Node 22+; confirm at TASK-003 and add a unit test (TASK-015) that does a raw byte-compare of two consecutive bundles. If `mtime` is not honored on the gzip side, fall back to per-file SHA as the determinism contract (already captured in AC4 language — "file sha256 fields are identical"). |
| Exports larger than RAM written to local disk could exhaust pilot-host disk (50 MB compressed * 10 runs = 500 MB) | Low | TASK-012 schedules daily purge; hard cap of 500 MB uncompressed per export per Spec Literals § Error Codes `bundle_size_limit_exceeded` guards against runaway windows. |
| `EXPORT_URL_SECRET` misconfigured in production → all download URLs rejected | Low | TASK-012 fails fast at server boot if the secret is `< 32` chars (same discipline as `COOKIE_SECRET`). |
| `forbidden_keys_version` in the manifest is a literal date `"2026-02-24"` but `src/ingestion/forbidden-keys.ts` is not versioned in code | Low | Add a constant `export const FORBIDDEN_KEYS_VERSION = '2026-02-24'` to `forbidden-keys.ts` in TASK-005; that way future edits to the set require bumping the date and the manifest stays honest. |
| Educators paste PII into `reason_text`; regex sweep is best-effort only | Medium (FERPA exposure) | Spec § De-identification explicitly labels the textual sweep "belt-and-suspenders". TASK-005 records the applied regex list in the manifest so reviewers see the floor. Add a runbook line item in TASK-007 `README.md` caveats. |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm test` passes (unit + contracts + integration)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run validate:api` (redocly) passes
- [ ] `npm run validate:contracts` passes
- [ ] `npm run cdk:synth` still passes (this plan does not touch CDK; regression check only)
- [ ] All 12 `EXPORT-0xx` test IDs appear as named cases in the test suite
- [ ] Manual check: `POST /v1/admin/exports` without `x-admin-api-key` returns `{ error: { code: 'admin_key_required' } }`
- [ ] Manual check: a happy-path bundle extracted with `tar -xzf` contains exactly `MANIFEST.json`, six `*.jsonl`, `policies/` directory, and `README.md`
- [ ] Manual check: running the export twice produces identical `manifest.files[].sha256` for every entry
- [ ] Manual check: a bundle containing `email: 'x@y.com'` in `decision_context` never lands on disk and the job row shows `status='failed', error.code='pii_detected'`
- [ ] Deviations from spec documented and resolved (all five original deviations resolved in spec on 2026-04-23 — see Deviations table)

---

## Implementation Order

```
TASK-001 ─┐
TASK-002 ─┼─► TASK-003 ──► TASK-008 ─┬─► TASK-010 ─► TASK-011 ─► TASK-012 ─► TASK-016
          │    TASK-004 ──►           │                                       TASK-017
          │    TASK-005 ──►           │
          │    TASK-006 ──►           │
          │    TASK-007 ──────────────┤
          │    TASK-009 ──────────────┘
          └─► TASK-014

TASK-003/005/007/009 ─► TASK-015
TASK-011 ─► TASK-013
```

Parallelizable clusters:
- `TASK-001` + `TASK-002` land first — no deps; unblock everything downstream.
- `TASK-003`, `TASK-004`, `TASK-005`, `TASK-007`, `TASK-009`, `TASK-014` can proceed in parallel after TASK-002.
- `TASK-015` unit tests can start as soon as their target module compiles (no need to wait for server wiring).
- `TASK-006` + `TASK-008` must wait on the repository/outcomes upstream plans (see Risks) — land last among the `src/exports/` modules.
