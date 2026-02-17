# QA Testing — POC v1 (Swagger UI)

Manual QA test cases for the 8P3P Control Layer POC v1.
All tests are performed via Swagger UI at **http://localhost:3000/docs**.

> **Note**: This document targets the historical **POC v1** default policy (`policy_version: "1.0.0"`).  
> The current repo default policy is **POC v2** (`policy_version: "2.0.0"`). Use `docs/testing/qa-test-pocv2.md` for current expectations.

## Prerequisites

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Server starts at `http://localhost:3000`. Open **http://localhost:3000/docs** in your browser.

## Endpoint Reference

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/signals` | Ingest a signal → triggers state + decision |
| `GET` | `/v1/signals` | Query signal log |
| `GET` | `/v1/decisions` | Query decisions |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |

---

## Test Cases

### QA-001: Ingest a Valid Signal (Happy Path)

**Endpoint**: `POST /v1/signals`

1. Expand **POST /v1/signals** (`ingestSignal`).
2. Click **"Try it out"**.
3. Paste this request body:

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-sig-001",
  "source_system": "external-lms",
  "learner_reference": "maya-k",
  "timestamp": "2026-02-09T12:00:00Z",
  "schema_version": "v1",
  "payload": {
    "firstName": "Maya",
    "gradeLevel": "K",
    "age": 5,
    "stabilityScore": 0.28,
    "timeSinceReinforcement": 90000,
    "progress": {
      "totalXp": 320,
      "currentLevel": 3
    }
  }
}
```

4. Click **"Execute"**.

**Expected**:
- Status: `200`
- `"status": "accepted"`
- `org_id` and `signal_id` echoed back

---

### QA-002: Query Decision — Rule Fires (Both Conditions Met)

**Endpoint**: `GET /v1/decisions`

> Depends on: QA-001 (signal must be ingested first)

1. Expand **GET /v1/decisions** (`getDecisions`).
2. Click **"Try it out"**.
3. Fill in parameters:
   - `org_id`: `org_8p3p`
   - `learner_reference`: `maya-k`
   - `from_time`: `2020-01-01T00:00:00Z`
   - `to_time`: `2030-12-31T23:59:59Z`
4. Click **"Execute"**.

**Expected**:
- Status: `200`
- `decisions` array with **1 decision**
- `decision_type`: `"reinforce"`
- `trace.matched_rule_id`: `"rule-reinforce"` (Maya meets both conditions: `stabilityScore < 0.7` AND `timeSinceReinforcement > 86400`)
- `trace.policy_version`: `"1.0.0"`
- `trace.state_version`: `1`

---

### QA-003: Ingest Second Learner — Default Decision Path

**Endpoint**: `POST /v1/signals`

1. Paste this request body:

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-sig-002",
  "source_system": "external-lms",
  "learner_reference": "aisha-5th",
  "timestamp": "2026-02-09T12:05:00Z",
  "schema_version": "v1",
  "payload": {
    "firstName": "Aisha",
    "gradeLevel": "5",
    "stabilityScore": 0.78,
    "timeSinceReinforcement": 172800
  }
}
```

2. Click **"Execute"**.

**Expected**: Status `200`, `"status": "accepted"`.

3. Now query `GET /v1/decisions` with:
   - `org_id`: `org_8p3p`
   - `learner_reference`: `aisha-5th`
   - `from_time`: `2020-01-01T00:00:00Z`
   - `to_time`: `2030-12-31T23:59:59Z`

**Expected**:
- `decision_type`: `"reinforce"` (default)
- `trace.matched_rule_id`: **`null`** (Aisha's `stabilityScore` 0.78 is NOT < 0.7, so the rule did not fire — she hit the default path)

---

### QA-004: Duplicate Signal (Idempotency)

**Endpoint**: `POST /v1/signals`

1. Re-submit the **exact same** QA-001 body (same `signal_id: "qa-sig-001"`).
2. Click **"Execute"**.

**Expected**:
- Status: `200`
- `"status": "duplicate"`
- No new decision is created (verify by re-running QA-002 — still 1 decision)

---

### QA-005: Validation Rejection — Missing Required Field

**Endpoint**: `POST /v1/signals`

1. Paste a body **missing `learner_reference`**:

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-sig-bad-001",
  "source_system": "external-lms",
  "timestamp": "2026-02-09T12:00:00Z",
  "schema_version": "v1",
  "payload": { "data": 1 }
}
```

2. Click **"Execute"**.

**Expected**:
- Status: `400`
- `"status": "rejected"`
- `rejection_reason.code`: `"missing_required_field"`

---

### QA-006: Validation Rejection — Forbidden Semantic Key

**Endpoint**: `POST /v1/signals`

1. Paste a body with a forbidden key in the payload:

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-sig-forbidden-001",
  "source_system": "external-lms",
  "learner_reference": "test-learner",
  "timestamp": "2026-02-09T12:00:00Z",
  "schema_version": "v1",
  "payload": {
    "ui": { "screen": "home" },
    "stabilityScore": 0.5
  }
}
```

2. Click **"Execute"**.

**Expected**:
- Status: `400`
- `"status": "rejected"`
- `rejection_reason.code`: `"forbidden_semantic_key_detected"`
- `rejection_reason.field_path`: `"payload.ui"`

---

### QA-007: Query Signal Log

**Endpoint**: `GET /v1/signals`

> Depends on: QA-001 (signal must be ingested first)

1. Expand **GET /v1/signals** (`querySignals`).
2. Click **"Try it out"**.
3. Fill in:
   - `org_id`: `org_8p3p`
   - `learner_reference`: `maya-k`
   - `from_time`: `2020-01-01T00:00:00Z`
   - `to_time`: `2030-12-31T23:59:59Z`
4. Click **"Execute"**.

**Expected**:
- Status: `200`
- `signals` array contains the accepted signal from QA-001
- Full payload intact (including `firstName`, `gradeLevel`, `progress`, `stabilityScore`, etc.)
- `accepted_at` timestamp present

---

### QA-008: Org Isolation

**Endpoint**: `GET /v1/decisions`

> Depends on: QA-001 (signal ingested under `org_8p3p`)

1. Query `GET /v1/decisions` with:
   - `org_id`: `org_other`
   - `learner_reference`: `maya-k`
   - `from_time`: `2020-01-01T00:00:00Z`
   - `to_time`: `2030-12-31T23:59:59Z`
2. Click **"Execute"**.

**Expected**:
- Status: `200`
- `decisions` array is **empty** (decisions are scoped to the org that ingested them)

---

### QA-009: Invalid Time Range

**Endpoint**: `GET /v1/decisions`

1. Query with `from_time` **after** `to_time`:
   - `org_id`: `org_8p3p`
   - `learner_reference`: `maya-k`
   - `from_time`: `2030-01-01T00:00:00Z`
   - `to_time`: `2020-01-01T00:00:00Z`
2. Click **"Execute"**.

**Expected**:
- Status: `400`
- `code`: `"invalid_time_range"`

---

### QA-010: Pagination

**Endpoint**: `POST /v1/signals` then `GET /v1/decisions`

1. Ingest 3 signals for the same learner (each with a unique `signal_id`):

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-page-001",
  "source_system": "external-lms",
  "learner_reference": "page-learner",
  "timestamp": "2026-02-09T13:00:00Z",
  "schema_version": "v1",
  "payload": { "stabilityScore": 0.3, "timeSinceReinforcement": 100000 }
}
```

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-page-002",
  "source_system": "external-lms",
  "learner_reference": "page-learner",
  "timestamp": "2026-02-09T13:01:00Z",
  "schema_version": "v1",
  "payload": { "stabilityScore": 0.25, "timeSinceReinforcement": 110000 }
}
```

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-page-003",
  "source_system": "external-lms",
  "learner_reference": "page-learner",
  "timestamp": "2026-02-09T13:02:00Z",
  "schema_version": "v1",
  "payload": { "stabilityScore": 0.2, "timeSinceReinforcement": 120000 }
}
```

2. Query `GET /v1/decisions` with:
   - `org_id`: `org_8p3p`
   - `learner_reference`: `page-learner`
   - `from_time`: `2020-01-01T00:00:00Z`
   - `to_time`: `2030-12-31T23:59:59Z`
   - `page_size`: `1`
3. Click **"Execute"**.

**Expected (Page 1)**:
- `decisions` array has **1** decision
- `next_page_token` is **not null**

4. Copy the `next_page_token` value and add it as the `page_token` parameter. Execute again.

**Expected (Page 2)**:
- `decisions` array has **1** different decision
- `next_page_token` is **not null**

5. Repeat with the new token.

**Expected (Page 3)**:
- `decisions` array has **1** decision
- `next_page_token` is **`null`** (no more pages)

6. Verify: all 3 `decision_id` values are unique (no duplicates across pages).

---

## Test Matrix Summary

| ID | Test Case | Method | Expected Status | Key Assertion |
|----|-----------|--------|-----------------|---------------|
| QA-001 | Valid signal ingestion | POST /v1/signals | 200 | `status: accepted` |
| QA-002 | Decision — rule fires | GET /v1/decisions | 200 | `matched_rule_id: rule-reinforce` |
| QA-003 | Decision — default path | POST + GET | 200 | `matched_rule_id: null` |
| QA-004 | Duplicate signal | POST /v1/signals | 200 | `status: duplicate` |
| QA-005 | Missing required field | POST /v1/signals | 400 | `code: missing_required_field` |
| QA-006 | Forbidden semantic key | POST /v1/signals | 400 | `code: forbidden_semantic_key_detected` |
| QA-007 | Signal log query | GET /v1/signals | 200 | Full payload preserved |
| QA-008 | Org isolation | GET /v1/decisions | 200 | Empty decisions for wrong org |
| QA-009 | Invalid time range | GET /v1/decisions | 400 | `code: invalid_time_range` |
| QA-010 | Pagination | GET /v1/decisions | 200 | `next_page_token` cycling works |
