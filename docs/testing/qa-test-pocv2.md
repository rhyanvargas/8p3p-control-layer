# QA Testing — POC v2 (Swagger UI)

Manual QA test cases for the 8P3P Control Layer **POC v2** default policy (`policy_version: "2.0.0"`).

Swagger UI: **http://localhost:3000/docs**

## Prerequisites

```bash
npm install
npm run dev
```

Server: `http://localhost:3000` (docs at `http://localhost:3000/docs`).

## Test Cases

### QA-001: Ingest a Valid Signal (Happy Path)

**Endpoint**: `POST /v1/signals`

Use the same payload as `docs/testing/qa-test-pocv1.md` QA-001 (Maya).

**Expected**: Status `200`, `"status": "accepted"`.

---

### QA-002: Query Decision — Rule Fires (Both Conditions Met)

**Endpoint**: `GET /v1/decisions`

> Depends on: QA-001

Query decisions for `org_id=org_8p3p`, `learner_reference=maya-k`.

**Expected**:
- `decision_type`: `"reinforce"`
- `trace.matched_rule_id`: `"rule-reinforce"`
- `trace.policy_version`: `"2.0.0"`

---

### QA-003: Default Decision Path (No Rule Match)

Use the same payload as `docs/testing/qa-test-pocv1.md` QA-003 (Aisha).

**Expected**:
- `decision_type`: `"reinforce"` (default)
- `trace.matched_rule_id`: `null`
- `trace.policy_version`: `"2.0.0"`

---

## Optional: Exercise Non-Default Decision Types (POC v2)

These mirror the DEC-008 v2 vectors. For each case:
1. `POST /v1/signals` with the payload fields below (other fields can be omitted).
2. `GET /v1/decisions` for the same `org_id` + `learner_reference`.
3. Assert `decision_type` and `trace.matched_rule_id`.

| Case | Payload fields (minimal) | Expected `decision_type` | Expected `trace.matched_rule_id` |
| ---- | ------------------------- | ------------------------ | -------------------------------- |
| 8a | `stabilityScore: 0.2, confidenceInterval: 0.2, riskSignal: 0.9` | `escalate` | `rule-escalate` |
| 8b | `stabilityScore: 0.4, confidenceInterval: 0.2` | `pause` | `rule-pause` |
| 8c | `stabilityScore: 0.4, confidenceInterval: 0.5, riskSignal: 0.8` | `reroute` | `rule-reroute` |
| 8d | `stabilityScore: 0.3, confidenceInterval: 0.5` | `intervene` | `rule-intervene` |
| 8e | `stabilityScore: 0.5, timeSinceReinforcement: 100000` | `reinforce` | `rule-reinforce` |
| 8f | `stabilityScore: 0.9, masteryScore: 0.9, riskSignal: 0.1, confidenceInterval: 0.8` | `advance` | `rule-advance` |
| 8g | `stabilityScore: 0.8, riskSignal: 0.6` | `recommend` | `rule-recommend` |

**Also expect** for all cases:
- `trace.policy_version`: `"2.0.0"`

