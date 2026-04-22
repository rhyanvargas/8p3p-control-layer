# Pilot Research Export

> FERPA-safe, de-identified bulk export of a pilot window's decisions, traces, state deltas, educator feedback, and decision outcomes — suitable for DOE/IES efficacy review and Phase II data contracts. Closes the evidence loop defined in `docs/specs/program-metrics.md`.

## Overview

SBIR Phase I reviewers (and Phase II evaluators) expect to inspect the *raw-ish* evidence behind any efficacy claim. The audit-quality receipts we already emit (`docs/specs/receipts-api.md`) are designed for single-decision drill-down; they are not a research dataset. An external reviewer cannot realistically curl `GET /v1/decisions` for 15 k decisions and reassemble the outcome picture.

This spec adds a **bulk export** endpoint and CLI that produces a versioned, self-describing research bundle:

- **Scope:** one org, one date window
- **Format:** JSON Lines (`.jsonl`, streaming-friendly) with per-file schemas; optional CSV flattening for reviewers who prefer spreadsheets
- **De-identification:** pseudonymous `learner_reference` only; every free-text field is scrubbed against the forbidden-PII keys list (`src/ingestion/forbidden-keys.ts`) plus a name/email/phone regex sweep
- **Self-describing:** every bundle includes a `MANIFEST.json` with schema versions, export params, policy versions referenced, MC-metric values at export time, and a SHA-256 of each file for integrity

The bundle is the **single artifact** we hand a DOE reviewer. It pairs with the logic model (`internal-docs/foundation/logic-model.md`) and the metrics spec (`program-metrics.md`) to form the complete evidence package.

---

## Export Bundle Contents

A bundle is a tar.gz archive with this layout:

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

### `MANIFEST.json`

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

### `decisions.jsonl`

One JSON object per line — a subset of the canonical `Decision` shape (`docs/specs/decision-engine.md` §4.1), with the same field names. Includes `trace.state_id`, `trace.state_version`, `trace.policy_id`, `trace.policy_version`, `trace.matched_rule_id`, `trace.rationale`, `trace.educator_summary`. **Excludes** `trace.state_snapshot` and `trace.matched_rule` (those live in `decision_traces.jsonl` to keep the main file small and flat).

### `decision_traces.jsonl`

One JSON object per line with `{decision_id, state_snapshot, matched_rule}` — the bulky enriched-trace payload separated for consumers who only want decisions without full snapshots.

### `state_versions.jsonl`

All state versions for learners who received at least one decision in the window, bounded to `[from_time - 14d, to_time + 21d]` (the 14-day pre-window lets reviewers see what led up to a decision; the 21-day post-window matches the default outcome window per `decision-outcomes.md`).

### `state_deltas.jsonl`

Derived from `state-delta-detection.md`: one row per (learner_reference, state_version, field, delta, direction) where `delta != 0`. Populated from the state store at export time (no new storage).

### `decision_feedback.jsonl`

All rows from `educator-feedback-api.md` § `decision_feedback`, plus the derived `decision_view_log` counts aggregated per decision (not raw views, to avoid a 100x row explosion). Session IDs are **rotated to opaque per-bundle tokens** so cross-bundle correlation is not possible — educators cannot be tracked across pilots.

### `decision_outcomes.jsonl`

One row per decision with the full outcome projection from `decision-outcomes.md` computed against the bundle's fixed `window_days` (default 21; exporter flag `--window-days` overrides). Decisions whose outcome would be `pending` at export time are included with `outcome: "pending"` and clearly labeled.

### `policies/{policy_id}-{version}.json`

Every policy version referenced in `decisions[].trace.policy_version`, exported verbatim so reviewers can see the rule logic that produced each decision.

### `README.md`

Auto-generated. Includes:

- Bundle contents and row counts
- Schema notes and field-by-field definitions
- "How to cite" (suggested citation text for academic reviewers)
- Known caveats: session-cookie identity vs. per-educator identity (per `educator-feedback-api.md` § Constraints); window-not-elapsed `pending` outcomes; policy evolution mid-window
- FERPA / data handling statement lifted from `internal-docs/pilot-operations/pilot-runbook.md` § Privacy

---

## De-identification

Two layers, applied in order during export:

1. **Structural.** The export tool rejects (fails the export) if any row contains a key in `src/ingestion/forbidden-keys.ts` at top level or at `data.*` / `state_snapshot.*` / `decision_context.*`. This is the same list that hardens `POST /v1/signals` today — if a forbidden key made it through to storage, it's a breach we want to stop at export, not continue.
2. **Textual.** Free-text fields (`decision_feedback.reason_text`, `trace.rationale`, `trace.educator_summary`, `policies/*.json` if the site put names into rule descriptions) are scanned with a small regex sweep:
   - Email: `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}` → replaced with `[EMAIL_REDACTED]`
   - US phone: `\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b` → `[PHONE_REDACTED]`
   - SSN-shaped: `\b\d{3}-\d{2}-\d{4}\b` → `[SSN_REDACTED]`
   - Capitalized two-word heuristic (possible name): opt-in flag `--redact-name-heuristic`; off by default (high false-positive rate)

The sweep is intentionally simple — we rely primarily on the **structural** PII prevention at ingest time. The textual sweep is a belt-and-suspenders catch for the reason-text field. The manifest records which regexes were applied so reviewers know the floor.

**Pseudonymous IDs.** `learner_reference` remains as-is (sites send pseudonymous IDs per `internal-docs/reports/2026-02-24-it-pilot-positioning-alignment.md`). The bundle does **not** include any site-provided mapping back to SIS IDs — that mapping stays with the site.

**Session IDs rotated.** Every `session_id` in `decision_feedback.jsonl` is replaced with a per-bundle opaque token so external reviewers cannot correlate sessions across exports or against the control layer's live data.

---

## Endpoints and CLI

### `POST /v1/admin/exports` (trigger)

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

Pilot exports complete in seconds-to-minutes at pilot scale, but the API is async to accommodate large Phase II runs.

### `GET /v1/admin/exports/:export_id`

Returns `{status: "running"|"ready"|"failed", download_url, file_size_bytes, manifest_preview, error?}`.

### `GET /v1/admin/exports/:export_id/download`

Streams the `.tar.gz`. Signed URL lifetime ≤ 24 h.

### CLI (`scripts/export-pilot-research.mjs`)

A thin wrapper around the three endpoints above, useful for operators who prefer shell. The CLI also supports `--format csv` which flattens the JSONL files into a parallel `.csv/` directory inside the bundle for spreadsheet users.

```bash
node scripts/export-pilot-research.mjs \
  --host "https://<pilot-host>" \
  --admin-key "<admin_key>" \
  --org "org_springs" \
  --from "2026-02-01" \
  --to "2026-04-30" \
  --out ./exports/springs-pilot-phase0.tar.gz
```

---

## Requirements

### Functional

- [ ] `POST /v1/admin/exports` accepts a window and returns an export ID
- [ ] `GET /v1/admin/exports/:id` reports `running` / `ready` / `failed` with error details when applicable
- [ ] Bundle includes all six JSONL files plus MANIFEST.json and policies/ + README.md
- [ ] MANIFEST.json includes SHA-256 per file and row counts per file
- [ ] Forbidden-key check fails the export with `pii_detected` if any row contains a forbidden key (the export tool does not silently strip)
- [ ] Textual PII regexes are applied and logged in the manifest
- [ ] Session IDs are rotated to per-bundle opaque tokens
- [ ] CSV format is available via flag; it parallels JSONL but flattens nested fields into dotted columns
- [ ] Download URL is signed and expires ≤ 24 h
- [ ] Export is deterministic: two exports with identical params over the same data produce byte-identical bundles (modulo `exported_at` and `bundle_id`)

### Acceptance Criteria

- Given 100 decisions, when export runs over the full window, then `decisions.jsonl` has 100 rows, `MANIFEST.json` counts match, and `decision_outcomes.jsonl` has 100 rows
- Given a row with a forbidden top-level key (e.g. a rogue `"email"` field), then export fails with `pii_detected` and no bundle is produced
- Given `reason_text = "Ping parent@example.com"`, then export substitutes `[EMAIL_REDACTED]`
- Given two consecutive exports, then `file sha256` fields are identical except where source data changed
- Given a non-admin caller, then 401 `admin_key_required`

### Non-functional

- [ ] Export for 1-month × 500-learner pilot completes in ≤ 120 s
- [ ] Bundle size for that scale ≤ 50 MB compressed
- [ ] Export streams to disk on the server (no in-memory accumulation of the full dataset)

---

## Constraints

- **Admin-only.** Research exports cross educator sessions and potentially orgs (future). Tenant-scoped exports are possible in a future version but not in v1; the DOE reviewer ask is per-org anyway.
- **Idempotent export IDs.** Re-running the same params creates a new export; we do not dedupe by params because schema version or data may have changed.
- **No live-update semantics.** A bundle is a point-in-time snapshot. Reviewers who need a refresh request a new export.
- **No delete.** Exports are retained server-side for 30 days then purged; manifest retention is indefinite for audit (just the manifest, not the data).

---

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| Real-time streaming export | Batch export is appropriate for efficacy review | Never (different tool) |
| Differential privacy / k-anonymity | Pseudonymous IDs + small pilot cohort sizes do not justify DP overhead at this stage | Phase II if dataset scale crosses published thresholds |
| Cross-org exports (all pilots in one bundle) | Cross-site aggregation is an external analyst's job | Phase II with explicit MOU |
| Signed / notarized exports (e.g. Keyless JWT, Sigstore) | Pilot trust model is bilateral; SHA-256 is sufficient | If DOE requires signed artifacts |
| Automatic upload to AWS S3 / reviewer-supplied bucket | Out-of-band sharing is simpler and gives the pilot site control | Phase II |
| Full SIS reintegration mapping | Pseudonymity is a feature, not a bug | Never |

---

## Dependencies

### Required from other specs

| Dependency | Source | Status |
|------------|--------|--------|
| Decisions + trace | `docs/specs/decision-engine.md` | **Complete** |
| State versions + deltas | `docs/specs/state-engine.md`, `docs/specs/state-delta-detection.md` | **Complete** |
| Educator feedback | `docs/specs/educator-feedback-api.md` | **New — this review** |
| Decision outcomes | `docs/specs/decision-outcomes.md` | **New — this review** |
| Metrics snapshot | `docs/specs/program-metrics.md` | **New — this review** |
| Forbidden PII keys | `src/ingestion/forbidden-keys.ts` (per DEF-DEC-008-PII) | **Complete** |
| Admin API key | `docs/specs/policy-management-api.md` | **Complete** |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| Research bundle | SBIR proposal data appendix; external reviewer handoff; Phase II MOU data delivery |
| Self-describing manifest | Efficacy auditor workflow; internal `internal-docs/reports/YYYY-MM-DD-sbir-phase-i-evidence.md` |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `admin_key_required` | Admin auth |
| `invalid_timestamp`, `invalid_time_range` | Shared |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `export_not_found` | 404 | `export_id` unknown or expired |
| `pii_detected` | 409 | A row contains a forbidden key; export aborted |
| `export_in_progress` | 409 | Another export for the same `(org_id, from, to)` is already running |
| `bundle_size_limit_exceeded` | 413 | Bundle would exceed hard cap (500 MB) — narrow the window |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| EXPORT-001 | integration | Happy path: 100 decisions produce a valid bundle with matching manifest counts | 202 then 200 download |
| EXPORT-002 | integration | Forbidden key in state_snapshot → `pii_detected`, no bundle | 409 |
| EXPORT-003 | integration | Email in `reason_text` → replaced with `[EMAIL_REDACTED]` in the bundle | 200; regex applied |
| EXPORT-004 | integration | Two exports with identical params produce same file SHA-256s | 200; byte-identical |
| EXPORT-005 | contract | Non-admin caller → 401 `admin_key_required` | 401 |
| EXPORT-006 | contract | `from > to` → 400 `invalid_time_range` | 400 |
| EXPORT-007 | contract | Concurrent export of same `(org, from, to)` → 409 `export_in_progress` | 409 |
| EXPORT-008 | integration | Bundle includes all referenced policy versions | 200; file count matches distinct `policy_version` |
| EXPORT-009 | integration | Session IDs in `decision_feedback.jsonl` are rotated to opaque tokens | 200; originals absent |
| EXPORT-010 | integration | CSV format flag produces parallel `.csv/` directory | 200 |
| EXPORT-011 | contract | Expired `export_id` → 404 `export_not_found` | 404 |
| EXPORT-012 | unit | README.md is regenerated per export with current row counts | 200 |

---

## File Structure

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

*Spec created: 2026-04-20 | Phase: v1.1 (pre-Month 0) / SBIR evidence layer | Depends on: all five prior evidence-layer specs | Feeds: DOE/IES SBIR proposal data appendix, Phase II data contracts*
