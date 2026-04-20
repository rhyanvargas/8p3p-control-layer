# LIU Usage Meter

> Admin-facing endpoint and inspection panel for tracking Learning Intelligence Unit (LIU) consumption per org per billing period — the metering foundation for 8P3P's usage-based pricing model.

## Overview

An LIU (Learning Intelligence Unit) is one governed learning decision: signals in → state updated → policy applied → decision produced = 1 LIU. LIU is the core billing metric for usage-based pricing. For the billing model to function — and for admins to monitor consumption — the platform must count and expose LIU volume per org per month. See `internal-docs/foundation/roadmap.md` for pricing details.

This spec adds:
1. **LIU counter** — a lightweight per-org monthly counter incremented atomically on each successful decision
2. **Admin usage endpoint** — `GET /v1/admin/usage` returning current and historical LIU counts per org, per billing period
3. **Tenant usage endpoint** — `GET /v1/usage` returning the calling org's own LIU counts (self-service visibility)

The counter is derived from the existing decision pipeline — no new computation, just a counter increment in the write path after `saveDecision()` succeeds.

---

## What Counts as an LIU

| Event | Counts as LIU? | Rationale |
|-------|-----------------|-----------|
| `POST /v1/signals` → decision produced (any type: reinforce, advance, intervene, pause) | **Yes** | Full pipeline completed: signal → state → policy → decision |
| `POST /v1/signals` → signal accepted but no decision (e.g., state update only, no policy matched) | **No** | No governed decision was produced |
| `POST /v1/signals` → rejected (validation failure, duplicate, forbidden keys) | **No** | Signal was not processed |
| `GET /v1/decisions` (query existing decisions) | **No** | Read-only — no new decision |
| `GET /v1/state` or any inspection endpoint | **No** | Read-only |
| Admin operations (PUT policy, etc.) | **No** | Configuration, not learning decisions |

This aligns with `internal-docs/pilot-operations/pilot-runbook.md` § Policy rule: *"If no policy rule matches, no decision is created and no LIU is counted."* The engine enforces this behavior — see `evaluateState()` in `src/decision/engine.ts`.

**Rule:** 1 LIU = 1 new row in the decisions store. The counter increments in the same transaction/write path as `saveDecision()`.

---

## Data Model

### Usage Counter Table (DynamoDB)

| Attribute | Type | Description |
|-----------|------|-------------|
| `org_id` (PK) | String | Organization identifier |
| `period` (SK) | String | Billing period in `YYYY-MM` format (e.g., `2026-04`) |
| `liu_count` | Number | Atomic counter — total LIUs in this period |
| `updated_at` | String (ISO 8601) | Last increment timestamp |

**Access patterns:**

| Pattern | Operation | Key condition |
|---------|-----------|---------------|
| Increment counter | `UpdateItem` with `ADD liu_count :1` | `PK = org_id, SK = YYYY-MM` |
| Get current month usage | `GetItem` | `PK = org_id, SK = current YYYY-MM` |
| Get usage history | `Query` | `PK = org_id, SK BETWEEN start AND end` |
| List all orgs (admin) | `Scan` with `period` filter | Filter `SK = YYYY-MM` |

**SQLite fallback (local dev):** Single `usage_counter` table with `(org_id, period)` unique constraint, `liu_count INTEGER DEFAULT 0`. Increment via `INSERT ... ON CONFLICT DO UPDATE SET liu_count = liu_count + 1`.

### CDK Addition

```typescript
const usageTable = new dynamodb.Table(this, 'UsageTable', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'period', type: dynamodb.AttributeType.STRING },
});
usageTable.grantReadWriteData(ingestFn);
usageTable.grantReadData(queryFn);
usageTable.grantReadData(adminFn);
```

---

## Endpoints

### `GET /v1/admin/usage` (Admin)

Return LIU usage across all orgs for a given period range.

**Headers:** `x-admin-api-key` required.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from_period` | No | Start period (`YYYY-MM`). Defaults to current month. |
| `to_period` | No | End period (`YYYY-MM`). Defaults to `from_period`. |
| `org_id` | No | Filter to a single org. When omitted, returns all orgs. |

**Response (200):**

```json
{
  "periods": [
    {
      "period": "2026-04",
      "orgs": [
        {
          "org_id": "springs",
          "liu_count": 12450,
          "updated_at": "2026-04-04T18:30:00Z"
        },
        {
          "org_id": "demo",
          "liu_count": 340,
          "updated_at": "2026-04-03T12:00:00Z"
        }
      ],
      "total_liu_count": 12790
    }
  ],
  "grand_total_liu_count": 12790
}
```

### `GET /v1/usage` (Tenant)

Return the calling org's own LIU usage. Org is resolved from the API key (same as other `/v1/*` endpoints).

**Headers:** `x-api-key` required.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from_period` | No | Start period (`YYYY-MM`). Defaults to current month. |
| `to_period` | No | End period (`YYYY-MM`). Defaults to `from_period`. |

**Response (200):**

```json
{
  "org_id": "springs",
  "periods": [
    {
      "period": "2026-03",
      "liu_count": 9800,
      "updated_at": "2026-03-31T23:59:00Z"
    },
    {
      "period": "2026-04",
      "liu_count": 12450,
      "updated_at": "2026-04-04T18:30:00Z"
    }
  ],
  "total_liu_count": 22250
}
```

---

## Integration Point

The LIU counter increment occurs inside the ingestion pipeline, after `saveDecision()` succeeds:

```
validateSignal → storeSignal → applyState → evaluatePolicy → saveDecision → incrementLiuCounter
                                                                               ↑ NEW
```

**Implementation sketch:**

```typescript
// In ingestion handler-core, after decision is saved:
if (decision) {
  await usageRepository.incrementLiu(orgId, getCurrentPeriod());
}
```

`getCurrentPeriod()` returns `YYYY-MM` from the decision timestamp (not wall clock — ensures consistency if signals are processed with slight delay).

**Failure handling:** If the counter increment fails (DynamoDB throttle, transient error), log a warning but do **not** fail the signal ingestion. The counter is eventually consistent — a background reconciliation job can recount from the decisions table if drift is detected. Signal processing correctness is never sacrificed for metering.

---

## Requirements

### Functional

- [ ] Each successful decision increments the LIU counter for the org's current billing period
- [ ] `GET /v1/admin/usage` returns LIU counts per org per period (admin-only, `x-admin-api-key`)
- [ ] `GET /v1/usage` returns the calling org's LIU counts (tenant API key, org-scoped)
- [ ] Counter uses atomic increment (`ADD` in DynamoDB, `ON CONFLICT DO UPDATE` in SQLite)
- [ ] Period format is `YYYY-MM` derived from the decision timestamp
- [ ] Counter increment failure does not fail the signal ingestion pipeline
- [ ] Historical periods are queryable (not just current month)

### Acceptance Criteria

- Given 5 signals that each produce a decision for org `springs` in April 2026, when `GET /v1/admin/usage?org_id=springs&from_period=2026-04` is called, then `liu_count` is 5
- Given a signal that is rejected (validation failure), when usage is queried, then `liu_count` is unchanged
- Given a signal accepted but no decision produced (no policy match), when usage is queried, then `liu_count` is unchanged
- Given `GET /v1/usage` called with org `springs` API key, then only `springs` usage is returned (no cross-org leakage)
- Given the counter increment fails (simulated DynamoDB error), then the signal ingestion still returns 200 with the decision

---

## Constraints

- **Counter is eventually consistent** — in rare failure cases, the count may lag behind actual decisions. Reconciliation from the decisions table is the recovery path.
- **No real-time billing** — this provides usage visibility, not payment processing. Billing integration (Stripe, invoicing) is out of scope.
- **Atomic increment only** — no decrement, no reset. Corrections are administrative.
- **Period granularity is monthly** — daily/hourly breakdowns are deferred.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Billing integration (Stripe, invoicing) | Metering and billing are separate concerns; billing requires contract terms | Post-pilot, when payment processing is needed |
| Usage alerts / thresholds | Requires notification infrastructure | Phase 2 (interoperability) |
| Daily/hourly usage breakdown | Monthly is sufficient for pilot billing | Customer requests finer granularity |
| Usage-based rate limiting | API Gateway rate limits are per-key, not per-LIU | Overage enforcement needed |
| Admin usage dashboard UI | API-first; dashboard is out of scope for core layer | Phase 1 dashboard discussions |
| Reconciliation job | Counter drift is rare at pilot volume; manual recount via decisions table is sufficient | Scale beyond 3 customers |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `saveDecision()` in ingestion pipeline | `docs/specs/decision-engine.md` | **Complete** |
| DynamoDB table creation (CDK) | `docs/specs/aws-deployment.md` | Spec'd (v1.1) — add `UsageTable` |
| Admin API key auth (`x-admin-api-key`) | `docs/specs/policy-management-api.md` | **Complete** |
| Tenant API key + org resolution | `docs/specs/api-key-middleware.md` | **Complete** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| LIU metering data | Future billing integration, customer invoicing |
| Usage visibility | Admin dashboard, customer self-service portal |
| Consumption proof | Pilot → contract conversion conversations |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `admin_key_required` | Auth — admin endpoint without `x-admin-api-key` |
| `api_key_required` / `api_key_invalid` | Auth — tenant endpoint without `x-api-key` |
| `invalid_format` | Validation — bad `YYYY-MM` format |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_period_format` | 400 | `from_period` or `to_period` does not match `YYYY-MM` |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| LIU-001 | integration | 3 signals → 3 decisions → `GET /v1/admin/usage` returns `liu_count: 3` | 200; count matches decisions |
| LIU-002 | integration | Rejected signal → count unchanged | `liu_count` same before and after |
| LIU-003 | contract | `GET /v1/usage` returns only calling org's data | 200; no cross-org data |
| LIU-004 | contract | `GET /v1/admin/usage` without admin key → 401 | `admin_key_required` |
| LIU-005 | contract | `GET /v1/usage` without API key → 401 | `api_key_required` |
| LIU-006 | unit | `incrementLiu` failure does not fail ingestion | Decision returned; warning logged |
| LIU-007 | contract | Period range query returns multiple months | 200; array of period objects |
| LIU-008 | unit | `getCurrentPeriod(timestamp)` returns correct `YYYY-MM` | Deterministic |

---

## Implementation Notes

- **Repository pattern:** Follow the existing `*Repository` interface pattern. Create `UsageRepository` interface + `SqliteUsageRepository` (local) + `DynamoDbUsageRepository` (AWS). Wire via `setUsageRepository()` / `getUsageRepository()` pattern.
- **Counter is fire-and-forget in the hot path:** The ingestion pipeline should `await` the increment but catch and log errors without propagating. At pilot volume, DynamoDB `ADD` is effectively free and fast.
- **Admin panel integration:** The `GET /v1/admin/usage` endpoint is the data source for a future admin inspection panel showing LIU consumption. The panel itself is out of scope but the API contract is designed to support it.
- **Reconciliation path:** If counter drift is suspected, an admin can query `GET /v1/decisions?org_id=X` and count results by month. This is the manual verification path until an automated reconciliation job is built.

---

## File Structure

```
src/
├── usage/
│   ├── repository.ts              # UsageRepository interface
│   ├── store.ts                   # SqliteUsageRepository (local dev)
│   ├── dynamodb-repository.ts     # DynamoDbUsageRepository (AWS)
│   ├── handler.ts                 # Fastify route handlers
│   ├── handler-core.ts            # Framework-agnostic logic
│   └── routes.ts                  # Route registration
```

---

*Spec created: 2026-04-04 | Phase: v1.1 (pre-Month 0) | Depends on: decision-engine.md, aws-deployment.md, policy-management-api.md (admin auth), api-key-middleware.md*
