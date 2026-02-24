# QA Test Execution — Post–Repository Extraction

Manual test cases for the 8P3P Control Layer **after completion of all repository extraction plans** (Idempotency, Signal Log, State). Use this for QA sign-off at the current implementation point.

**Scope:** Full pipeline (Ingestion → Signal Log → STATE Engine → Decision Engine), API key behavior, inspection endpoints, and regression of existing behavior. The repository layer is internal; no API contract changes.

**Swagger UI:** `http://localhost:3000/docs`

---

## Prerequisites

```bash
npm install
npm run build
npm run dev
```

- Server: `http://localhost:3000`
- Docs: `http://localhost:3000/docs`

### Authentication

- If **`API_KEY`** is set in the environment, all `/v1/*` requests require the **`x-api-key`** header with that value. Missing or wrong key → `401` with `code`: `api_key_required` or `api_key_invalid`.
- If **`API_KEY`** is unset (typical local dev), auth is disabled and no header is needed.
- **`API_KEY_ORG_ID`** (optional): When set, the server overrides every request’s `org_id` with this value (one org per key; client cannot self-declare org). When unset, the client’s `org_id` in body/query is used. For single-tenant pilot, set it; for multi-org or local testing, leave unset.

**Generate a key:** run `npm run generate:api-key` and add the printed line to your `.env`. Do not commit `.env`.

In Swagger UI: use **Authorize** and set `x-api-key` when the server is run with `API_KEY` set.

---

## Test Cases

### QA-RE-001: Health Check

**Endpoint:** `GET /health`

**Steps:** Execute with no body.

**Expected:** Status `200`, body `{ "status": "ok" }`.

---

### QA-RE-002: Ingest Valid Signal (Happy Path)

**Endpoint:** `POST /v1/signals`

**Body:**

```json
{
  "org_id": "org_8p3p",
  "signal_id": "qa-re-sig-001",
  "source_system": "external-lms",
  "learner_reference": "maya-k",
  "timestamp": "2026-02-09T12:00:00Z",
  "schema_version": "v1",
  "payload": {
    "firstName": "Maya",
    "gradeLevel": "K",
    "stabilityScore": 0.28,
    "timeSinceReinforcement": 90000,
    "progress": { "totalXp": 320, "currentLevel": 3 }
  }
}
```

**Expected:** Status `200`, `"status": "accepted"`, `org_id` and `signal_id` echoed.

---

### QA-RE-003: Full Pipeline — State and Decision After Ingestion

**Depends on:** QA-RE-002

1. **GET /v1/state**  
   - Query params: `org_id=org_8p3p`, `learner_reference=maya-k`  
   - **Expected:** Status `200`, state object with `state_version >= 1`, `provenance.last_signal_id` consistent with ingested signal.

2. **GET /v1/decisions**  
   - Query params: `org_id=org_8p3p`, `learner_reference=maya-k`, `from_time=2020-01-01T00:00:00Z`, `to_time=2030-12-31T23:59:59Z`  
   - **Expected:** Status `200`, `decisions` array with at least one decision; `trace.policy_version` present; for default policy v2, REINFORCE/INTERVENE or other types as per rules.

---

### QA-RE-004: Duplicate Signal (Idempotency)

**Endpoint:** `POST /v1/signals`

**Steps:** Re-send the **exact same** body as QA-RE-002 (same `signal_id`).

**Expected:** Status `200`, `"status": "duplicate"`. No new decision for that signal (re-run GET /v1/decisions — count unchanged for that learner).

---

### QA-RE-005: List Learners (State Inspection)

**Depends on:** QA-RE-002 (at least one learner with state)

**Endpoint:** `GET /v1/state/list`

**Steps:** Query with `org_id=org_8p3p`, `limit=50`.

**Expected:** Status `200`, `learners` array containing at least one entry with `learner_reference=maya-k` and latest `state_version`; `next_cursor` null or present per pagination.

---

### QA-RE-006: Query Signal Log

**Depends on:** QA-RE-002

**Endpoint:** `GET /v1/signals`

**Steps:** `org_id=org_8p3p`, `learner_reference=maya-k`, `from_time=2020-01-01T00:00:00Z`, `to_time=2030-12-31T23:59:59Z`.

**Expected:** Status `200`, `signals` array with the accepted signal; payload and `accepted_at` present.

---

### QA-RE-007: Validation Rejection — Missing Required Field

**Endpoint:** `POST /v1/signals`

**Body:** Omit `learner_reference` (e.g. remove the field from QA-RE-002 body).

**Expected:** Status `400`, `"status": "rejected"`, `rejection_reason.code`: `"missing_required_field"`.

---

### QA-RE-008: Validation Rejection — Forbidden Semantic Key

**Endpoint:** `POST /v1/signals`

**Body:** Same as QA-RE-002 but add a forbidden key in payload, e.g. `"ui": { "screen": "home" }`.

**Expected:** Status `400`, `"status": "rejected"`, `rejection_reason.code`: `"forbidden_semantic_key_detected"`, `rejection_reason.field_path` references the key.

---

### QA-RE-009: Org Data Partitioning (Decisions)

**Depends on:** QA-RE-002 (data under `org_8p3p`)

**Endpoint:** `GET /v1/decisions`

**Steps:** Same params as QA-RE-003 but `org_id=org_other`.

**Expected:** Status `200`, `decisions` array **empty** (proves decisions are partitioned by `org_id` at query time).

**Note:** This test does **not** prove org **access control** by itself. To verify that a caller cannot *choose* another org in a pilot deployment, run QA-RE-012 (API key org override).

---

### QA-RE-012: Org Access Control (API_KEY_ORG_ID Override)

**Depends on:** QA-RE-002 (a decision exists for `org_8p3p` + `maya-k`)

**Precondition:** Server started with `API_KEY=test-key` **and** `API_KEY_ORG_ID=org_8p3p`.

**Endpoint:** `GET /v1/decisions`

**Steps:**
- Send the same request as QA-RE-003, but set `org_id=org_other`.
- Include header `x-api-key: test-key`.

**Expected:**
- Status `200`
- Response `org_id` is **`org_8p3p`** (server override), not `org_other`
- `decisions` is **non-empty** (same data as QA-RE-003, proving caller cannot impersonate another org)

---

### QA-RE-010: Ingestion Log (Inspection API)

**Endpoint:** `GET /v1/ingestion`

**Steps:** Query with `org_id=org_8p3p`, `from_time` and `to_time` covering QA-RE-002 and QA-RE-004.

**Expected:** Status `200`, entries for both the accepted and duplicate ingestion attempts; `outcome` values `accepted` and `duplicate` present.

---

### QA-RE-011: API Key Enforced (When API_KEY Set)

**Precondition:** Server started with `API_KEY=test-key` (or any value).

**Steps:** Call `POST /v1/signals` or `GET /v1/decisions` **without** the `x-api-key` header.

**Expected:** Status `401`, body with `code`: `api_key_required` or `api_key_invalid`.

Then send the same request **with** `x-api-key: test-key`; expect success (e.g. 200) as in the corresponding test above.

---

## Test Matrix Summary

| ID        | Area           | Endpoint / Action        | Expected Status | Key Assertion                          |
|-----------|----------------|---------------------------|-----------------|----------------------------------------|
| QA-RE-001 | Health         | GET /health              | 200             | `status: ok`                           |
| QA-RE-002 | Ingestion      | POST /v1/signals          | 200             | `status: accepted`                     |
| QA-RE-003 | Pipeline       | GET /v1/state, /v1/decisions | 200         | State and decisions returned           |
| QA-RE-004 | Idempotency    | POST /v1/signals (duplicate) | 200          | `status: duplicate`                    |
| QA-RE-005 | State list     | GET /v1/state/list        | 200             | Learners list with correct org/learner |
| QA-RE-006 | Signal log     | GET /v1/signals           | 200             | Signals and payload preserved          |
| QA-RE-007 | Validation     | POST /v1/signals (invalid) | 400          | `code: missing_required_field`         |
| QA-RE-008 | Validation     | POST /v1/signals (forbidden key) | 400     | `code: forbidden_semantic_key_detected` |
| QA-RE-009 | Partitioning   | GET /v1/decisions (wrong org) | 200         | Empty decisions                        |
| QA-RE-010 | Inspection     | GET /v1/ingestion         | 200             | Accepted + duplicate outcomes          |
| QA-RE-011 | Auth           | /v1/* without key (when API_KEY set) | 401   | `api_key_required` or `api_key_invalid` |
| QA-RE-012 | Access control | GET /v1/decisions (org override) | 200        | `org_id` overridden; caller cannot impersonate org |

---

## Optional: Decision Types (Demo Anchors)

Per CEO scope, demo narrative anchors on **REINFORCE** and **INTERVENE**. To verify other decision types (policy v2), ingest signals that satisfy the rule conditions for each type, then run GET /v1/decisions and assert `decision_type` and `trace.matched_rule_id`. Reference: `docs/testing/qa-test-pocv2.md` optional table (8a–8g).

---

## Sign-Off

- [ ] All QA-RE-001 through QA-RE-012 executed.
- [ ] Optional decision-type cases run if required.
- [ ] Failures documented with environment (with/without API_KEY), request, and response.
- [ ] Build and automated tests already passing: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`.

**Reference — Next steps after QA:** `docs/reports/2026-02-23-post-repository-extraction-next-steps.md`
