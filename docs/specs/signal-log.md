# Signal Log Specification

> Derived from Component Interface Contracts, Contract Test Matrix, and Interface Validation Ruleset.

## Overview

The Signal Log is an **immutable, append-only** storage layer that records all accepted signals with full provenance. It serves as the evidence stream for STATE updates, ensuring every signal can be audited and replayed. The Signal Log receives signals from Ingestion, stores them permanently, and exposes a read-only query API.

**Lifecycle Position:** Stage 2 of 5 (Ingestion → **Signal Log** → STATE Engine → Decision Engine → Output)

## API Endpoint

```
GET /signals
```

### Request Schema: SignalLogReadRequest

Query parameters:

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `org_id` | string | Yes | 1–128 characters |
| `learner_reference` | string | Yes | 1–256 characters |
| `from_time` | string | Yes | RFC3339 format |
| `to_time` | string | Yes | RFC3339 format, must be >= from_time |
| `page_token` | string | No | Opaque pagination token |
| `page_size` | integer | No | 1–1000, default 100 |

### Response Schema: SignalLogReadResponse

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "signals": [
    {
      "org_id": "string",
      "signal_id": "string",
      "source_system": "string",
      "learner_reference": "string",
      "timestamp": "string (RFC3339)",
      "schema_version": "string",
      "payload": {},
      "metadata": {
        "correlation_id": "string",
        "trace_id": "string"
      },
      "accepted_at": "string (RFC3339)"
    }
  ],
  "next_page_token": "string | null"
}
```

## Data Schema

### SignalRecord (Stored Format)

The SignalRecord contains all fields from SignalEnvelope plus the `accepted_at` timestamp:

```json
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "string (RFC3339)",
  "schema_version": "string",
  "payload": {},
  "metadata": {
    "correlation_id": "string",
    "trace_id": "string"
  },
  "accepted_at": "string (RFC3339)"
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `org_id` | Tenant identifier (inherited from SignalEnvelope) |
| `signal_id` | Unique signal identifier within org |
| `source_system` | System that emitted the signal |
| `learner_reference` | Learner identifier |
| `timestamp` | When the event occurred (from source) |
| `schema_version` | Envelope schema version |
| `payload` | Opaque signal data |
| `metadata` | Optional tracing information |
| `accepted_at` | **NEW**: When the signal was accepted by ingestion |

## Core Constraints

### Immutability

- **No UPDATE operations** - Records cannot be modified after creation
- **No DELETE operations** - Records cannot be removed
- **Append-only** - Only INSERT operations are allowed

### Org Isolation

- All queries **must** include `org_id`
- Signals from org A are **never** visible to org B
- Missing or blank `org_id` → `org_scope_required` error

### Determinism

- Same query with same parameters → same results (order preserved)
- Pagination is stable: same `page_token` returns same page
- Records are immutable: re-reading returns identical data

## Validation Rules

### Time Range Validation

| Condition | Result |
|-----------|--------|
| `from_time > to_time` | `rejected`, `invalid_time_range` |
| Invalid RFC3339 format | `rejected`, `invalid_timestamp` |
| Missing timezone | `rejected`, `invalid_timestamp` |

### Pagination Validation

| Condition | Result |
|-----------|--------|
| `page_size = 0` | `rejected`, `page_size_out_of_range` |
| `page_size > 1000` | `rejected`, `page_size_out_of_range` |
| Invalid `page_token` | `rejected`, `invalid_page_token` |

## Error Codes

### Query Errors (GET /signals)

| Code | Description | Example Trigger |
|------|-------------|-----------------|
| `invalid_time_range` | from_time is after to_time | `from_time=2026-02-01, to_time=2026-01-01` |
| `invalid_timestamp` | Time not RFC3339 or missing timezone | `from_time=2026-01-25 10:00:00` |
| `invalid_page_token` | page_token is malformed or expired | Corrupted token |
| `page_size_out_of_range` | page_size is 0, negative, or > 1000 | `page_size=0` |
| `org_scope_required` | Missing or blank org_id | `org_id=""` |
| `learner_not_found` | No signals for learner in time range | Query returns empty |

### Internal Function Errors (getSignalsByIds)

| Code | Description | Example Trigger |
|------|-------------|-----------------|
| `unknown_signal_id` | Signal ID not found in log | `signalIds=["nonexistent"]` |
| `signals_not_in_org_scope` | Signal belongs to different org | Request org A, signal belongs to org B |

## Implementation Components

### 1. Signal Log Store (`src/signalLog/store.ts`)

SQLite-backed storage for signal records:

```sql
CREATE TABLE IF NOT EXISTS signal_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  learner_reference TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  metadata TEXT,
  accepted_at TEXT NOT NULL,
  UNIQUE(org_id, signal_id)
);

CREATE INDEX idx_signal_log_query 
  ON signal_log(org_id, learner_reference, accepted_at);
```

**Functions:**
- `initSignalLogStore(dbPath: string): void` - Initialize database
- `appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord` - Store accepted signal
- `querySignals(request: SignalLogReadRequest): SignalLogReadResponse` - Query signals by time range
- `getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[]` - Retrieve specific signals by ID

### getSignalsByIds (Internal Function)

Retrieve specific signals by their IDs for downstream processing (used by STATE Engine).

**Signature:**
```typescript
getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[]
```

**Behavior:**
- Returns signals matching the provided IDs
- All signals must belong to the specified `org_id` (enforces org isolation)
- Returns signals ordered by `accepted_at` ascending
- Throws error if any `signal_id` is not found
- Throws error if any signal belongs to a different org

**Error Conditions:**

| Condition | Error Code |
|-----------|------------|
| Signal ID not found | `unknown_signal_id` |
| Signal belongs to different org | `signals_not_in_org_scope` |

**Usage:** This function is called by the STATE Engine to fetch signal payloads when applying signals to learner state.

### 2. Signal Log Types (`src/shared/types.ts`)

Add new types:

```typescript
interface SignalRecord extends SignalEnvelope {
  accepted_at: string;
}

interface SignalLogReadRequest {
  org_id: string;
  learner_reference: string;
  from_time: string;
  to_time: string;
  page_token?: string;
  page_size?: number;
}

interface SignalLogReadResponse {
  org_id: string;
  learner_reference: string;
  signals: SignalRecord[];
  next_page_token: string | null;
}
```

### 3. Signal Log Validator (`src/signalLog/validator.ts`)

Validate query parameters:
- Time range validation (from_time <= to_time)
- RFC3339 timestamp validation
- page_size bounds validation (1-1000)
- page_token format validation

### 4. Signal Log Handler (`src/signalLog/handler.ts`)

Fastify route handler for `GET /signals`:
1. Parse and validate query parameters
2. Query the signal log store
3. Generate pagination token if more results
4. Return response

### 5. Signal Log Routes (`src/signalLog/routes.ts`)

Register `GET /signals` endpoint with Fastify.

### 6. Integration with Ingestion (`src/ingestion/handler.ts`)

Modify the ingestion handler to:
1. After acceptance, call `appendSignal()` to store in Signal Log
2. Use the `accepted_at` timestamp from storage in the response

## Contract Tests

Implement all tests from the Contract Test Matrix:

| Test ID | Description | Expected |
|---------|-------------|----------|
| SIGLOG-001 | Query valid time window | Returns `signals[]` + optional `next_page_token` |
| SIGLOG-002 | Invalid time range (from > to) | `rejected`, `invalid_time_range` |
| SIGLOG-003 | Page size = 0 | `rejected`, `page_size_out_of_range` |
| SIGLOG-004 | Paging determinism | Same query twice → identical signal sequence |
| SIGLOG-005 | Immutability guarantee | Record unchanged on re-read |

### Additional Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| SIGLOG-006 | org_id isolation | Signals from org B not visible to org A |
| SIGLOG-007 | Empty result | Valid query with no matches → empty `signals[]` |
| SIGLOG-008 | Pagination continuation | Second page with token returns next batch |
| SIGLOG-009 | Default page_size | No page_size → defaults to 100 |
| SIGLOG-010 | Integration with ingestion | Accepted signal appears in log |

## File Structure

```
src/
├── signalLog/
│   ├── store.ts                      # SQLite storage layer
│   ├── validator.ts                  # Query parameter validation
│   ├── handler.ts                    # GET /signals handler
│   └── routes.ts                     # Fastify route registration
├── shared/
│   ├── types.ts                      # Add SignalRecord, SignalLogRead* types
│   └── error-codes.ts                # Add new error codes
└── ingestion/
    └── handler.ts                    # Modify to append to Signal Log

tests/
├── contracts/
│   └── signal-log.test.ts            # SIGLOG-* contract tests
└── unit/
    └── signal-log-store.test.ts      # Store unit tests
```

## Success Criteria

Implementation is complete when:

- [ ] `GET /signals` returns SignalLogReadResponse for valid queries
- [ ] Time range validation enforces `from_time <= to_time`
- [ ] page_size validation enforces 1-1000 bounds
- [ ] Pagination returns stable, deterministic results
- [ ] Records are immutable (no UPDATE/DELETE)
- [ ] org_id isolation prevents cross-tenant access
- [ ] Signal Ingestion forwards accepted signals to Signal Log
- [ ] All SIGLOG-001 through SIGLOG-005 contract tests pass
- [ ] Determinism: same query always produces same output

## Dependencies

- **better-sqlite3** - Already installed (used for idempotency store)
- **Fastify** - Already installed (v5.7.2)

## Integration Points

### Receives From

- **Signal Ingestion** (`POST /signals`) - Accepted signals are forwarded here

### Feeds Into

- **STATE Engine** (Stage 3) - Will query Signal Log to apply signals to learner state

## Notes

- **Read-only external surface** - Only internal components can write
- **Append happens during ingestion** - Not via a separate API
- **Payload is stored as-is** - No transformation or semantic interpretation
- **Ordering** - Results ordered by `accepted_at` ascending (oldest first)
- **Pagination token** - Opaque string encoding position (e.g., base64 of `id`)
