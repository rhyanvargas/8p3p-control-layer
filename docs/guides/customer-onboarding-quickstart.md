# Customer Onboarding Quick Start

**Audience:** New pilot customers (integration engineers, IT)  
**Goal:** First meaningful API output in under 15 minutes using real data.  
**Prerequisite:** 8P3P has provisioned your API key and base URL (and, for single-tenant pilot, your org is set server-side).

---

## What you need from 8P3P

| Item | Description |
|------|-------------|
| **Base URL** | e.g. `https://api.8p3p.example.com` or `http://localhost:3000` (shared dev) |
| **API key** | Sent on every request as `x-api-key`. Store securely; do not commit. |
| **Org ID** | Your organization identifier (e.g. `org_acme`). In single-tenant pilot the server may override any `org_id` you send — you can still pass it as a placeholder. |

---

## Step 1: Verify access (30 seconds)

**Health check** (no key required):

```bash
curl -sS "https://<host>/health"
```

Expected: `{"status":"ok"}`

**Authenticated request** — replace `<host>` and `<your_key>`:

```bash
curl -sS -X POST "https://<host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{"org_id":"<org_id>","signal_id":"quickstart-001","source_system":"quickstart","learner_reference":"learner-1","timestamp":"2026-03-01T10:00:00Z","schema_version":"v1","payload":{}}'
```

- **200** with `"status": "accepted"` or `"duplicate"` → you’re in.  
- **401** → key missing or invalid; confirm with 8P3P.

---

## Step 2: Send one signal with canonical fields (2 minutes)

Use a **canonical payload** so the decision engine can produce a real decision type (e.g. `reinforce`, `intervene`, `advance`). All score-like fields are **0.0–1.0**; `timeSinceReinforcement` is in **seconds**.

```bash
curl -sS -X POST "https://<host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "<org_id>",
    "signal_id": "evt-000001",
    "source_system": "your-lms",
    "learner_reference": "learner-123",
    "timestamp": "2026-03-01T10:00:00Z",
    "schema_version": "v1",
    "payload": {
      "stabilityScore": 0.65,
      "masteryScore": 0.72,
      "timeSinceReinforcement": 90000,
      "confidenceInterval": 0.80,
      "riskSignal": 0.20
    }
  }'
```

Replace:

- `<host>` — your base URL  
- `<your_key>` — your API key  
- `<org_id>` — your org (e.g. `org_acme`)

**Expected response:** `"status": "accepted"` (or `"duplicate"` if you re-send the same `signal_id`).

**Canonical fields (reference):**

| Field | Type | Meaning |
|-------|------|--------|
| `stabilityScore` | 0.0–1.0 | Stability in current path |
| `masteryScore` | 0.0–1.0 | Mastery/competency |
| `timeSinceReinforcement` | ≥ 0 (seconds) | Time since last reinforcement/positive feedback |
| `confidenceInterval` | 0.0–1.0 | Confidence in the assessment |
| `riskSignal` | 0.0–1.0 | Risk of regression / struggle |

If you don’t have a value yet, you can omit optional fields or use neutral defaults (e.g. `stabilityScore: 0.5`, `confidenceInterval: 0.8`). See [Pilot Integration Guide §5](pilot-integration-guide.md#5-the-real-integration-work-mapping-your-data--canonical-fields) for normalization examples.

---

## Step 3: Read the decision (1 minute)

Query decisions for the same org and learner, with a time range that includes the signal timestamp:

```bash
curl -sS "https://<host>/v1/decisions?org_id=<org_id>&learner_reference=learner-123&from_time=2026-03-01T00:00:00Z&to_time=2026-03-02T00:00:00Z" \
  -H "x-api-key: <your_key>"
```

You should see at least one decision with:

- `decision_type` — one of `reinforce`, `advance`, `intervene`, `pause`
- `trace.policy_version`, `trace.matched_rule_id` — audit trail

That is **meaningful output** from the APIs: one signal → one decision with a type and trace.

---

## Optional: Inspection panels (if you have UI access)

If 8P3P has given you access to the inspection UI:

1. Open `https://<host>/inspect/` in a browser.
2. Enter your **API key** in the header (if the server requires it).
3. Enter **org_id** (e.g. `org_acme`) and click **Refresh**.
4. Use the four panels: **Signal Intake**, **State Viewer**, **Decision Stream**, **Decision Trace**.

To preload demo data (same host, e.g. for training): run `npm run seed:demo` against the server with `--api-key <your_key>` and `--org <org_id>` (or use the org assigned to your key).

---

## Next steps: real data at scale

| Step | Action | Reference |
|------|--------|-----------|
| **Stable identity** | Choose a canonical `learner_reference` per person (e.g. SIS/HR id). Same person across systems must use the same value. | [Pilot Integration Guide §10](pilot-integration-guide.md#10-identity-resolution-learner_reference-as-canonical-key) |
| **Idempotency** | Use your upstream event ID (or a deterministic hash) as `signal_id`; reuse on retries so the server returns `duplicate` instead of double-applying. | [Pilot Integration Guide §4](pilot-integration-guide.md#4-signal-envelope-requirements-what-must-be-true) |
| **Map your data** | Transform your LMS/source events into the canonical payload fields (0.0–1.0 scores, seconds for `timeSinceReinforcement`). | [Pilot Integration Guide §5](pilot-integration-guide.md#5-the-real-integration-work-mapping-your-data--canonical-fields) |
| **Integration checklist** | End-to-end: learner_reference format, signal_id strategy, POST signals, GET decisions, handle all 4 decision types. | [Pilot Integration Guide §8](pilot-integration-guide.md#8-integration-checklist-pilot) |
| **Org-wide decisions** | To fetch decisions for all learners in your org: list learners via `GET /v1/state/list`, then `GET /v1/decisions` per learner. | [Get all learner decisions from org](get-all-learner-decisions-from-org.md) |

---

## API reference

- **Interactive docs:** `https://<host>/docs` (OpenAPI Swagger UI)  
- **Full integration guide:** [Pilot Integration Guide (v1)](pilot-integration-guide.md)  
- **All guides:** [Guides index](README.md)

---

## Troubleshooting

| Response | Cause | Action |
|----------|--------|--------|
| **401** `api_key_required` | Missing `x-api-key` header | Send `x-api-key: <your_key>` on every `/v1/*` request |
| **401** `api_key_invalid` | Key doesn’t match server | Confirm key with 8P3P; check for extra spaces or copy/paste errors |
| **400** with `rejection_reason` | Invalid envelope (e.g. missing required field, bad timestamp) | Check `field_path` and [OpenAPI schema](pilot-integration-guide.md#4-signal-envelope-requirements-what-must-be-true); timestamps must be RFC3339 with timezone |
| **Empty decisions array** | Time range or learner/org mismatch | Ensure `from_time` / `to_time` include the signal time; use the same `org_id` and `learner_reference` as in the signal |

---

*Quick start v1 — minimal path to real data and meaningful API output.*
