# API Specs

Machine-readable interface specifications for the 8P3P Control Layer.

## Current Endpoints

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `POST` | `/v1/signals` | Ingest a learning signal → triggers state update + decision | Implemented |
| `GET` | `/v1/signals` | Query the immutable signal log | Implemented |
| `GET` | `/v1/decisions` | Query decisions for a learner | Implemented |
| `GET` | `/v1/receipts` | Compliance/audit query (projection of decision trace) | Implemented |
| `GET` | `/v1/ingestion` | Query ingestion outcomes (accepted/rejected/duplicate) | Implemented |
| `GET` | `/v1/state` | Query current learner state | Implemented |
| `GET` | `/v1/state/list` | List learners per org | Implemented |
| `GET` | `/health` | Health check | Implemented |
| `GET` | `/docs` | Swagger UI (interactive API docs) | Implemented |
| `GET` | `/inspect` | Inspection panels (4 read-only panels) | Implemented |

## Machine-Readable Specs

- [`openapi.yaml`](openapi.yaml) — REST API contract (v1); interactive docs served at `/docs`
- [`asyncapi.yaml`](asyncapi.yaml) — event contracts (e.g. `signal.ingested`, `decision.emitted`)

## Prose Specs

New endpoints and enriched trace fields are defined in:

- [`docs/specs/inspection-api.md`](../specs/inspection-api.md) — ingestion log, state query, enriched decision trace, decision stream metadata
- [`docs/specs/inspection-panels.md`](../specs/inspection-panels.md) — 4 read-only inspection panels at `/inspect`
- [`docs/specs/receipts-api.md`](../specs/receipts-api.md) — GET /v1/receipts compliance/audit query (projection of decision trace)

## Guides (common workflows)

If you're integrating the API for a business workflow (export, analytics, onboarding), start here:

- [`docs/guides/README.md`](../guides/README.md) — Guides index
- [`docs/guides/pilot-integration-guide.md`](../guides/pilot-integration-guide.md) — “Send signals → consume decisions”
- [`docs/guides/get-all-learner-decisions-from-org.md`](../guides/get-all-learner-decisions-from-org.md) — org-wide decision export (fan-out pattern)
- [`docs/guides/deployment-checklist.md`](../guides/deployment-checklist.md) — pilot deployment gates (includes required `API_KEY_ORG_ID`)

