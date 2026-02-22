# API Specs

Machine-readable interface specifications for the 8P3P Control Layer.

## Current Endpoints

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `POST` | `/v1/signals` | Ingest a learning signal → triggers state update + decision | Implemented |
| `GET` | `/v1/signals` | Query the immutable signal log | Implemented |
| `GET` | `/v1/decisions` | Query decisions for a learner | Implemented |
| `GET` | `/v1/ingestion` | Query ingestion outcomes (accepted/rejected/duplicate) | v1 — spec'd |
| `GET` | `/v1/state` | Query current learner state | v1 — spec'd |
| `GET` | `/v1/state/list` | List learners per org | v1 — spec'd |
| `GET` | `/health` | Health check | Implemented |
| `GET` | `/docs` | Swagger UI (interactive API docs) | Implemented |
| `GET` | `/inspect` | Inspection panels (4 read-only panels) | v1 — spec'd |

## Machine-Readable Specs

- [`openapi.yaml`](openapi.yaml) — REST API contract (v1); interactive docs served at `/docs`
- [`asyncapi.yaml`](asyncapi.yaml) — event contracts (e.g. `signal.ingested`, `decision.emitted`)

## Prose Specs

New endpoints and enriched trace fields are defined in:

- [`docs/specs/inspection-api.md`](../specs/inspection-api.md) — ingestion log, state query, enriched decision trace, decision stream metadata
- [`docs/specs/inspection-panels.md`](../specs/inspection-panels.md) — 4 read-only inspection panels at `/inspect`

## Historical reviews

Historical `/review` outputs and other narrative review artifacts are archived under:

- [`docs/archive/reviews/`](../archive/reviews/)

They are preserved for traceability but **may be stale** vs the current implementation.

