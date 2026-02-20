# 8P3P Control Layer — POC v2 QA Test Execution

**Date:** 2026-02-18  
**Version:** 1.0.0  
**Baseline:** `73d9cb6..HEAD` (1 commit)

---

## Summary

Executed the POC v2 manual QA plan (`docs/testing/qa-test-pocv2.md`) against the running local server and captured evidence via live API calls. All required cases (QA-001/002/003) and the optional v2 decision vectors (8a–8g) produced the expected `decision_type`, `trace.matched_rule_id`, and `trace.policy_version: "2.0.0"`. Automated tests also passed cleanly.

---

## What Changed

### Docs / Plans

- Only change since the baseline commit range: updates to `.cursor/plans/policy-expansion.plan.md`.
- This report adds QA execution evidence and screenshots (no product behavior changes were introduced as part of this QA run).

---

## QA Results (POC v2)

Swagger UI used: `http://localhost:3000/docs`

> Note: The running dev DB already contained prior decisions for `maya-k` (with `policy_version: "1.0.0"`). Assertions below are based on the **latest** decision created by this QA run (timestamp `2026-02-18T21:27:36.692Z`) which correctly reflects `policy_version: "2.0.0"`.

### Required Cases

| Case | Endpoint(s) | Expected | Observed |
|------|-------------|----------|----------|
| QA-001 | `POST /v1/signals` | `200`, `status: accepted` | PASS |
| QA-002 | `GET /v1/decisions` | `decision_type: reinforce`, `matched_rule_id: rule-reinforce`, `policy_version: 2.0.0` | PASS (latest decision) |
| QA-003 | `POST /v1/signals` + `GET /v1/decisions` | default `decision_type: reinforce`, `matched_rule_id: null`, `policy_version: 2.0.0` | PASS |

**Live API outputs (curl):**

QA-001 `POST /v1/signals` (Maya):

```json
{"org_id":"org_8p3p","signal_id":"qa2-sig-001","status":"accepted","received_at":"2026-02-18T21:27:36.690Z"}
```

QA-002 `GET /v1/decisions` (Maya) — latest decision created by this run:

```json
{
  "learner_reference": "maya-k",
  "decision_id": "5dacec1a-f2f3-4dd9-8bd0-312777865e95",
  "decision_type": "reinforce",
  "decided_at": "2026-02-18T21:27:36.692Z",
  "trace": {
    "state_id": "org_8p3p:maya-k:v4",
    "state_version": 4,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-reinforce"
  }
}
```

QA-003 `GET /v1/decisions` (Aisha):

```json
{
  "learner_reference": "aisha-5th",
  "decision_id": "6288a07c-3566-4420-ab28-d3ffd376a625",
  "decision_type": "reinforce",
  "decided_at": "2026-02-18T21:27:47.057Z",
  "trace": {
    "state_id": "org_8p3p:aisha-5th:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": null
  }
}
```

### Optional: Non-Default Decision Types (Vectors 8a–8g)

| Case | Learner | Expected `decision_type` | Expected `matched_rule_id` | Observed |
|------|---------|--------------------------|----------------------------|----------|
| 8a | `vec-8a` | `escalate` | `rule-escalate` | PASS |
| 8b | `vec-8b` | `pause` | `rule-pause` | PASS |
| 8c | `vec-8c` | `reroute` | `rule-reroute` | PASS |
| 8d | `vec-8d` | `intervene` | `rule-intervene` | PASS |
| 8e | `vec-8e` | `reinforce` | `rule-reinforce` | PASS |
| 8f | `vec-8f` | `advance` | `rule-advance` | PASS |
| 8g | `vec-8g` | `recommend` | `rule-recommend` | PASS |

**Live API outputs (curl) — evidence for 8a–8g:**

8a (`vec-8a`):

```json
{
  "learner_reference": "vec-8a",
  "decision_id": "3e23d50d-a2c2-4bc0-9d55-f1b7497662d9",
  "decision_type": "escalate",
  "decided_at": "2026-02-18T21:27:57.955Z",
  "trace": {
    "state_id": "org_8p3p:vec-8a:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-escalate"
  }
}
```

8b (`vec-8b`):

```json
{
  "learner_reference": "vec-8b",
  "decision_id": "a9d6191e-0d1c-4b5f-bc2f-3d69fea6bde3",
  "decision_type": "pause",
  "decided_at": "2026-02-18T21:28:02.158Z",
  "trace": {
    "state_id": "org_8p3p:vec-8b:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-pause"
  }
}
```

8c (`vec-8c`):

```json
{
  "learner_reference": "vec-8c",
  "decision_id": "3535e0d5-9c5d-4a6b-925a-b65736273fba",
  "decision_type": "reroute",
  "decided_at": "2026-02-18T21:28:06.140Z",
  "trace": {
    "state_id": "org_8p3p:vec-8c:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-reroute"
  }
}
```

8d (`vec-8d`):

```json
{
  "learner_reference": "vec-8d",
  "decision_id": "5475a99e-91ca-4eb3-8402-7c96ff07eee0",
  "decision_type": "intervene",
  "decided_at": "2026-02-18T21:28:09.949Z",
  "trace": {
    "state_id": "org_8p3p:vec-8d:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-intervene"
  }
}
```

8e (`vec-8e`):

```json
{
  "learner_reference": "vec-8e",
  "decision_id": "139ec2de-88d2-4eb3-a800-dff2dea72ab2",
  "decision_type": "reinforce",
  "decided_at": "2026-02-18T21:28:14.117Z",
  "trace": {
    "state_id": "org_8p3p:vec-8e:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-reinforce"
  }
}
```

8f (`vec-8f`):

```json
{
  "learner_reference": "vec-8f",
  "decision_id": "29140518-9ef9-4a69-adba-4c41224c893e",
  "decision_type": "advance",
  "decided_at": "2026-02-18T21:28:18.168Z",
  "trace": {
    "state_id": "org_8p3p:vec-8f:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-advance"
  }
}
```

8g (`vec-8g`):

```json
{
  "learner_reference": "vec-8g",
  "decision_id": "1f5c7ec0-105e-4e95-9ce3-c93a62810aca",
  "decision_type": "recommend",
  "decided_at": "2026-02-18T21:28:21.965Z",
  "trace": {
    "state_id": "org_8p3p:vec-8g:v1",
    "state_version": 1,
    "policy_version": "2.0.0",
    "matched_rule_id": "rule-recommend"
  }
}
```

---

## Verification

**Manual QA:** PASS (QA-001/002/003 + optional 8a–8g)  
**Tests:** 343 passing across 17 files (Vitest, ~468ms)  
**Contract alignment:** N/A (not run for this QA execution)  
**Linting:** N/A (not run for this QA execution)

---

## Impact

- Confirms POC v2 policy evaluation is producing the expected decision traces (`policy_version: "2.0.0"`) across both default and non-default decision paths.
- Provides JSON trace evidence suitable for stakeholder review and regression tracking.

---

## What's Next

- Add a lightweight “QA dataset reset” workflow (or ephemeral DB per run) to keep Swagger-based QA deterministic and avoid mixed historical decisions.
- Optionally codify the POC v2 Swagger QA plan into an automated integration test harness (seed → ingest → assert decisions).

---

*Generated: 2026-02-18 | Commits: `73d9cb6..HEAD` (1 commit)*

