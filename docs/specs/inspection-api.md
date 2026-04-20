# Inspection API Specification

> Backend read-only query endpoints for control-plane inspection. Powers the four inspection panels required for enterprise pilots, integration debugging, and auditability.

## Overview

The Inspection API adds read-only query surfaces over data the control layer already owns. It does not introduce mutations, workflows, or enforcement — it exposes the internal pipeline state for external observation. The four capabilities are: (1) an ingestion log with validation outcomes, (2) a public state query endpoint, (3) enriched decision stream metadata, and (4) a self-contained decision receipt with frozen state and rule details.

**Motivation:** Enterprise pilots require proof that the loop works: signals → state → decisions → receipts. The existing API (`POST /v1/signals`, `GET /v1/signals`, `GET /v1/decisions`) proves ingestion and decisions but leaves state invisible and decision trace incomplete. This spec closes those gaps.

**Architectural constraint:** All endpoints are read-only. No endpoint in this spec mutates state, creates decisions, or influences the pipeline. This aligns with the "no UI ownership" doctrine — these are inspection surfaces, not product features.

---

## 1. Ingestion Outcome Log

### Problem

Rejected and duplicate signals are returned to the caller as HTTP responses but are not persisted. Integration teams cannot query historical validation outcomes after the fact. Panel 1 (Signal Intake) needs a time-ordered stream of all ingestion attempts with their outcomes.

### Solution

Persist every ingestion attempt (accepted, rejected, duplicate) in a new `ingestion_log` table, queryable via a new endpoint.

### 1.1 Data Schema: IngestionOutcome

```json
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "string (RFC3339)",
  "schema_version": "string",
  "outcome": "accepted | rejected | duplicate",
  "received_at": "string (RFC3339)",
  "rejection_reason": {
    "code": "string",
    "message": "string",
    "field_path": "string"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `org_id` | string | Tenant identifier (from the request, even if invalid — captured for debugging) |
| `signal_id` | string | Signal identifier (may be empty if missing from request) |
| `source_system` | string | Source system (may be empty if missing) |
| `learner_reference` | string | Learner reference (may be empty if missing) |
| `timestamp` | string | Signal timestamp as provided |
| `schema_version` | string | Schema version as provided |
| `outcome` | string | `accepted`, `rejected`, or `duplicate` |
| `received_at` | string | When the ingestion attempt was processed (RFC3339) |
| `rejection_reason` | object or null | Present only when `outcome = rejected`. Contains `code`, `message`, and optional `field_path`. |

### 1.2 Storage

```sql
CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL DEFAULT '',
  signal_id TEXT NOT NULL DEFAULT '',
  source_system TEXT NOT NULL DEFAULT '',
  learner_reference TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL DEFAULT '',
  schema_version TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL,
  received_at TEXT NOT NULL,
  rejection_code TEXT,
  rejection_message TEXT,
  rejection_field_path TEXT
);

CREATE INDEX idx_ingestion_log_query
  ON ingestion_log(org_id, received_at);

CREATE INDEX idx_ingestion_log_outcome
  ON ingestion_log(org_id, outcome, received_at);
```

**Immutability:** Append-only. No UPDATE or DELETE.

### 1.3 API Endpoint

```
GET /v1/ingestion
```

**Parameters:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `org_id` | string | Yes | 1–128 characters |
| `limit` | integer | No | 1–500, default 50 |
| `outcome` | string | No | Filter: `accepted`, `rejected`, `duplicate` |
| `cursor` | string | No | Opaque pagination cursor |

**Response: IngestionLogResponse**

```json
{
  "org_id": "string",
  "entries": [
    {
      "signal_id": "string",
      "source_system": "string",
      "learner_reference": "string",
      "timestamp": "string",
      "schema_version": "string",
      "outcome": "accepted | rejected | duplicate",
      "received_at": "string (RFC3339)",
      "rejection_reason": null
    }
  ],
  "next_cursor": "string | null"
}
```

**Ordering:** Most recent first (`received_at DESC`). This matches the "last N events" requirement for Panel 1.

### 1.4 Integration with Signal Ingestion

The ingestion handler (`src/ingestion/handler.ts`) must be modified to call `appendIngestionOutcome()` for every request — accepted, rejected, and duplicate — before returning the HTTP response. This is a write-path addition to the existing ingestion flow, not a new trigger.

**Critical constraint:** Ingestion outcome logging must not fail signal acceptance. If the log write fails, log the error but do not reject the signal.

---

## 2. State Query API

### Problem

The STATE Engine stores learner state internally but exposes no public endpoint. The state-engine spec explicitly marks this as out of scope ("No REST API endpoint for state queries"). Panel 2 (State Viewer) requires read-only access to current learner state.

### Solution

Add a read-only `GET /v1/state` endpoint. This does not violate STATE authority — it exposes existing state for observation without allowing mutations.

### 2.1 API Endpoint

```
GET /v1/state
```

**Parameters:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `org_id` | string | Yes | 1–128 characters |
| `learner_reference` | string | Yes | 1–256 characters |
| `version` | integer | No | Specific state version. Omit for current (latest). |

**Response: StateQueryResponse**

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "state_id": "string",
  "state_version": 1,
  "updated_at": "string (RFC3339)",
  "state": {},
  "provenance": {
    "last_signal_id": "string",
    "last_signal_timestamp": "string (RFC3339)"
  }
}
```

This is the existing `LearnerState` shape (see `docs/specs/state-engine.md` §3.1) returned directly. No transformation.

**Error responses:**

| Condition | HTTP | Code |
|-----------|------|------|
| `org_id` missing/blank | 400 | `org_scope_required` |
| `learner_reference` missing/blank | 400 | `missing_required_field` |
| No state for learner | 404 | `state_not_found` |
| Requested version not found | 404 | `state_version_not_found` |

### 2.2 State Listing (Optional — Panel Enhancement)

For Panel 2's "learnerId + skillId list" view:

```
GET /v1/state/list
```

**Parameters:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `org_id` | string | Yes | 1–128 characters |
| `limit` | integer | No | 1–500, default 50 |
| `cursor` | string | No | Opaque pagination cursor |

**Response: StateSummaryListResponse**

```json
{
  "org_id": "string",
  "learners": [
    {
      "learner_reference": "string",
      "state_version": 1,
      "updated_at": "string (RFC3339)"
    }
  ],
  "next_cursor": "string | null"
}
```

This lightweight listing avoids loading full state objects and gives Panel 2 a browsable index.

### 2.3 Implementation

Register routes in a new `src/state/routes.ts` module. The handler reads from the existing STATE Store (`getState()`, `getStateByVersion()`) — no new storage layer required.

**Dependency:** Requires `getState()` and `getStateByVersion()` from `src/state/store.ts` (defined in `docs/specs/state-engine.md`).

---

## 3. Enriched Decision Trace

### Problem

The current decision trace contains references (`state_id`, `state_version`, `policy_version`, `matched_rule_id`) but not the data those references point to. Panel 4 (Decision Trace / Receipt) requires the actual state snapshot, the rule condition that fired, threshold values, and a rationale — making each decision a self-contained audit record.

### Solution

Extend the `trace` object in the Decision record with three new fields: `state_snapshot`, `matched_rule`, and `rationale`.

### 3.1 Extended Trace Schema

```json
{
  "trace": {
    "state_id": "string",
    "state_version": 1,
    "policy_version": "string",
    "matched_rule_id": "string | null",
    "state_snapshot": {},
    "matched_rule": {
      "rule_id": "string",
      "decision_type": "string",
      "condition": {},
      "evaluated_fields": [
        {
          "field": "string",
          "operator": "string",
          "threshold": "number | string | boolean",
          "actual_value": "number | string | boolean | null"
        }
      ]
    },
    "rationale": "string"
  }
}
```

#### New Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `trace.state_snapshot` | object | Frozen copy of the **canonical** state fields at evaluation time. Per CEO directive (2026-02-24), receipts must exclude PII. The snapshot includes only the fields the policy actually evaluates (e.g., `stabilityScore`, `masteryScore`, `timeSinceReinforcement`, `confidenceInterval`, `riskSignal`) plus `learner_reference` (pseudonymous ID) and versioning metadata (`state_id`, `state_version`). Non-canonical or PII fields from STATE are excluded. Enables audit without state store lookup and without exposing personal data. |
| `trace.matched_rule` | object or null | The complete rule that fired. `null` when `matched_rule_id` is `null` (default path). |
| `trace.matched_rule.rule_id` | string | Same as `matched_rule_id` (denormalized for convenience) |
| `trace.matched_rule.decision_type` | string | The decision type this rule produces |
| `trace.matched_rule.condition` | object | The full condition tree (ConditionNode) from the policy |
| `trace.matched_rule.evaluated_fields` | array | Flattened list of every leaf comparison performed, with both threshold and actual value |
| `trace.matched_rule.evaluated_fields[].field` | string | State field name |
| `trace.matched_rule.evaluated_fields[].operator` | string | Comparison operator used |
| `trace.matched_rule.evaluated_fields[].threshold` | any | The value from the policy rule |
| `trace.matched_rule.evaluated_fields[].actual_value` | any | The value from the learner's state at evaluation time. `null` if field was missing. |
| `trace.rationale` | string | Human-readable summary of why this decision was made. Generated from the matched rule and state. Example: `"Rule rule-escalate fired: confidenceInterval (0.2) < 0.3 AND stabilityScore (0.2) < 0.3"` |

### 3.2 Rationale Generation

The rationale is a deterministic string built from the matched rule and state values. Format:

- **When a rule matches:** `"Rule {rule_id} fired: {field} ({actual}) {op} {threshold} AND/OR ..."` — flattened condition summary with actual values.
- **When no rule matches:** no rationale is produced — per runbook § Policy rule (2026-04-18), no governed decision is emitted and no row is persisted, so there is no `trace.rationale` to render. `policy.default_decision_type` is **not** consulted (see [`decision-engine.md`](decision-engine.md) §4.6 and § Policy Evaluation Semantics).

Rationale must be deterministic: same state + same policy → same rationale string (excluding timestamp formatting).

### 3.3 Impact on Existing Schema

The `trace` object in the Decision schema (`src/contracts/schemas/decision.json`, `docs/api/openapi.yaml`) must be extended. The three new fields are **required** for new decisions but **not** present on historical decisions created before this change. Consumers must tolerate missing `state_snapshot`, `matched_rule`, and `rationale` on historical records.

**Migration strategy:** No backfill. Historical decisions retain their original trace shape. New decisions include the enriched trace. The panel should render what's available and show "N/A" for missing enriched fields on old records.

### 3.4 Storage Impact

The `state_snapshot`, `matched_rule`, and `rationale` fields are serialized as JSON text within the decision record. This increases row size but keeps the decision self-contained (no joins required for audit).

New columns on `decisions` table:

```sql
ALTER TABLE decisions ADD COLUMN trace_state_snapshot TEXT;
ALTER TABLE decisions ADD COLUMN trace_matched_rule TEXT;
ALTER TABLE decisions ADD COLUMN trace_rationale TEXT;
```

### 3.5 Implementation

Modify `evaluateState()` in `src/decision/engine.ts`:

1. After fetching state, clone the `state` object as `state_snapshot`
2. After policy evaluation, capture the full matched rule (condition tree + evaluated field values)
3. Generate rationale string from the evaluation results
4. Include all three in the `trace` when constructing the Decision

Modify `evaluatePolicy()` in `src/decision/policy-loader.ts`:

1. Extend the return type to include the evaluated field details: `{ decision_type, matched_rule_id, matched_rule, evaluated_fields }`
2. During condition tree walk, collect each leaf comparison's field, operator, threshold, and actual value

---

## 4. Decision Stream Metadata

### Problem

Panel 3 (Decision Stream) needs `priority`, `TTL`, and `downstream_target` to show operational context. These fields do not exist in the current decision model.

### Solution

Add optional output metadata to the `decision_context` object (or a new top-level `output_metadata` field on the Decision). These are informational annotations for downstream consumers, not decision logic inputs.

### 4.1 Output Metadata Schema

```json
{
  "output_metadata": {
    "priority": 1,
    "ttl_seconds": 3600,
    "downstream_targets": ["string"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `priority` | integer | Rule evaluation order (1 = highest priority). Derived from the rule's position in the policy array. `null` when default path (no rule matched). |
| `ttl_seconds` | integer or null | Decision time-to-live in seconds. `null` in Phase 1 (no TTL enforcement yet). Reserved for Phase 2 when downstream consumers need expiry semantics. |
| `downstream_targets` | array of string | Intended downstream consumer(s). Empty array in Phase 1 (no routing configured). Reserved for Phase 2 when EventBridge routing is active. |

### 4.2 Priority Derivation

`priority` is the 1-based index of the matched rule in the policy's `rules` array. For the current POC v2 policy:

| Rule | Priority |
|------|----------|
| `rule-escalate` | 1 |
| `rule-pause` | 2 |
| `rule-reroute` | 3 |
| `rule-intervene` | 4 |
| `rule-reinforce` | 5 |
| `rule-advance` | 6 |
| `rule-recommend` | 7 |
| (default) | null |

### 4.3 Implementation

Add `output_metadata` as a new field on the Decision record (peer to `decision_context`, not nested inside it). The Decision Engine populates it during evaluation. Store as a JSON text column:

```sql
ALTER TABLE decisions ADD COLUMN output_metadata TEXT;
```

---

## Requirements

### Functional

- [ ] `GET /v1/ingestion` returns time-ordered ingestion outcomes (accepted/rejected/duplicate)
- [ ] Rejected signals are persisted with rejection code, message, and field path
- [ ] Duplicate signals are persisted with `outcome: duplicate`
- [ ] `GET /v1/state` returns current learner state for a given org + learner
- [ ] `GET /v1/state?version=N` returns a specific historical state version
- [ ] `GET /v1/state/list` returns a paginated learner index per org
- [ ] New decisions include `trace.state_snapshot` (frozen state at evaluation time)
- [ ] New decisions include `trace.matched_rule` (full rule condition + evaluated fields)
- [ ] New decisions include `trace.rationale` (human-readable decision explanation)
- [ ] New decisions include `output_metadata.priority` (rule evaluation order)
- [ ] Historical decisions without enriched trace render gracefully (no errors)

### Acceptance Criteria

- Given a rejected signal, when `GET /v1/ingestion?org_id=X` is called, then the rejected signal appears with `outcome: rejected` and the correct `rejection_reason.code`
- Given a learner with state, when `GET /v1/state?org_id=X&learner_reference=Y` is called, then the full current state is returned including all canonical fields
- Given a new decision, when `GET /v1/decisions` returns it, then `trace.state_snapshot` contains the exact state values that were evaluated and `trace.rationale` is a non-empty string
- Given a decision from before the enrichment upgrade, when `GET /v1/decisions` returns it, then `trace.state_snapshot`, `trace.matched_rule`, and `trace.rationale` are absent or null (no error)

---

## Constraints

- All endpoints are **read-only** — no mutations
- Ingestion outcome logging **must not** fail signal acceptance
- State endpoint **must not** allow writes (STATE authority preserved)
- Enriched trace fields **must** be deterministic: same state + policy → same trace output
- `state_snapshot` is a frozen copy — it does not change if the learner's state is updated later
- Org isolation enforced on every endpoint (`org_id` required, cross-org access blocked)

---

## Out of Scope

- State mutation API (violates STATE authority doctrine)
- Decision replay/re-evaluation API (future: on-demand evaluate)
- TTL enforcement in downstream systems (Phase 2, EventBridge)
- Downstream target routing configuration (Phase 2, EventBridge)
- Ingestion outcome log retention/purging policy
- Rationale localization or templating

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `getState()` | `docs/specs/state-engine.md` | Defined |
| `getStateByVersion()` | `docs/specs/state-engine.md` | Defined |
| `evaluateState()` | `docs/specs/decision-engine.md` | Defined |
| `evaluatePolicy()` | `docs/specs/decision-engine.md` §4.6 | Defined |
| `appendSignal()` | `docs/specs/signal-log.md` | Defined |
| Signal Ingestion handler | `docs/specs/signal-ingestion.md` | Defined |

### Provides to Other Specs

| Function | Used By |
|----------|---------|
| `GET /v1/ingestion` | Inspection Panels (Panel 1) |
| `GET /v1/state` | Inspection Panels (Panel 2) |
| `GET /v1/state/list` | Inspection Panels (Panel 2) |
| Enriched `trace` on Decision | Inspection Panels (Panel 3, Panel 4) |
| `output_metadata` on Decision | Inspection Panels (Panel 3) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `org_scope_required` | Signal Ingestion |
| `missing_required_field` | Signal Ingestion |
| `state_not_found` | Decision Engine |
| `invalid_page_token` | Signal Log |

### New (add during implementation)

| Code | Description |
|------|-------------|
| `state_version_not_found` | Requested state version does not exist for this learner |
| `invalid_outcome_filter` | `outcome` parameter is not one of: accepted, rejected, duplicate |
| `limit_out_of_range` | `limit` parameter is 0, negative, or > 500 |

---

## Contract Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| INSP-001 | Ingestion log captures accepted signal | Entry with `outcome: accepted` |
| INSP-002 | Ingestion log captures rejected signal | Entry with `outcome: rejected`, correct `rejection_reason.code` |
| INSP-003 | Ingestion log captures duplicate signal | Entry with `outcome: duplicate` |
| INSP-004 | `GET /v1/ingestion` returns entries in descending order | Most recent first |
| INSP-005 | `GET /v1/ingestion?outcome=rejected` filters correctly | Only rejected entries |
| INSP-006 | `GET /v1/state` returns current learner state | Full LearnerState object |
| INSP-007 | `GET /v1/state?version=N` returns specific version | Correct state_version |
| INSP-008 | `GET /v1/state` for unknown learner returns 404 | `state_not_found` |
| INSP-009 | `GET /v1/state/list` returns learner index | Array of learner summaries |
| INSP-010 | New decision includes `trace.state_snapshot` | Snapshot matches state at evaluation time |
| INSP-011 | New decision includes `trace.matched_rule` with evaluated fields | Field values match state |
| INSP-012 | New decision includes `trace.rationale` | Non-empty deterministic string |
| INSP-013 | New decision includes `output_metadata.priority` | Matches rule position in policy |
| INSP-014 | Historical decision without enriched trace returns cleanly | No error, missing fields tolerated |
| INSP-015 | Org isolation on `GET /v1/ingestion` | Entries from org B not visible to org A |
| INSP-016 | Org isolation on `GET /v1/state` | State from org B not visible to org A |
| INSP-017 | No-match path emits no governed decision | `evaluateState` returns `{ ok: true, matched: false }`; `GET /v1/decisions` returns an empty list; no row is persisted (see `src/decision/engine.ts` no-match short-circuit and `tests/contracts/inspection-api.test.ts`) |

---

## File Structure

```
src/
├── ingestion/
│   ├── handler.ts                    # Modified: log outcome for every request
│   ├── ingestion-log-store.ts        # NEW: ingestion outcome storage
│   └── ingestion-log-handler.ts      # NEW: GET /v1/ingestion handler
├── state/
│   ├── routes.ts                     # NEW: GET /v1/state, GET /v1/state/list
│   ├── handler.ts                    # NEW: state query handler
│   └── store.ts                      # Existing: getState(), getStateByVersion()
├── decision/
│   ├── engine.ts                     # Modified: enriched trace generation
│   ├── policy-loader.ts              # Modified: return evaluated field details
│   ├── store.ts                      # Modified: new columns for enriched trace
│   └── handler.ts                    # Existing: GET /v1/decisions (returns enriched data)
├── contracts/
│   └── schemas/
│       ├── decision.json             # Modified: extended trace schema
│       └── ingestion-outcome.json    # NEW: ingestion outcome schema
└── shared/
    ├── types.ts                      # Modified: new types
    └── error-codes.ts                # Modified: new error codes

tests/
├── contracts/
│   ├── inspection-api.test.ts        # NEW: INSP-001 through INSP-017
│   └── decision-engine.test.ts       # Modified: verify enriched trace
└── unit/
    ├── ingestion-log-store.test.ts   # NEW: ingestion log store tests
    └── state-handler.test.ts         # NEW: state query handler tests
```

---

## Success Criteria

Implementation is complete when:

- [ ] Every ingestion attempt (accepted/rejected/duplicate) is persisted in the ingestion log
- [ ] `GET /v1/ingestion` returns paginated, filterable ingestion outcomes
- [ ] `GET /v1/state` returns current learner state with full canonical fields
- [ ] `GET /v1/state?version=N` returns historical state by version
- [ ] `GET /v1/state/list` returns a paginated learner index per org
- [ ] Every new decision includes `trace.state_snapshot`, `trace.matched_rule`, `trace.rationale`, and `output_metadata`
- [ ] Historical decisions without enriched fields render without errors
- [ ] All INSP-001 through INSP-017 tests pass
- [ ] Org isolation enforced on all new endpoints
- [ ] Existing tests (343) continue to pass (no regression)
- [ ] OpenAPI spec (`docs/api/openapi.yaml`) updated with new endpoints and schemas

---

## Notes

- **Ingestion log vs. Signal Log:** The ingestion log records *all* attempts (including failures). The Signal Log records only *accepted* signals. They serve different audiences: ingestion log is for debugging/inspection, Signal Log is for the STATE pipeline.
- **State snapshot size:** Freezing state in the decision trace increases storage per decision. For POC this is acceptable. Phase 2 may optimize with snapshot compression or reference-based lookups if storage becomes a concern.
- **Rationale stability:** Rationale text is a computed artifact, not a human-authored field. It must not contain timestamps or non-deterministic data. Same state + same policy = same rationale, always.

---

## Next Steps

Run `/plan-impl docs/specs/inspection-api.md` to create an implementation plan.

---

*Spec created: 2026-02-19 | Depends on: decision-engine.md, state-engine.md, signal-ingestion.md, signal-log.md*
