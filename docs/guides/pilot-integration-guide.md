# Pilot Integration Guide (v1)

**Audience:** Pilot customer integration engineers  
**Goal:** Get from “we have LMS events” → “we send signals” → “we consume decisions” in hours, not days.  
**API contract:** `docs/api/openapi.yaml` (served at `/docs`)

---

## 1) What you implement (two calls)

### A. Send signals (write path)

- **Endpoint:** `POST /v1/signals`
- **Purpose:** Send learner events to the control layer in a standard envelope. The control layer persists the signal, updates state, and generates a decision (advisory).

### B. Read decisions (read path)

- **Endpoint:** `GET /v1/decisions`
- **Purpose:** Poll for decisions per learner and time range. You decide what to do with them in your system (we emit decisions; we do not enforce workflows).

---

## 2) Access + authentication (v1 pilot)

### API key (required in pilot)

8P3P will provide an API key for the pilot environment. Include it on every `/v1/*` request:

- **Header:** `x-api-key: <your_key>`

If the key is missing or invalid, you will receive **401** with `api_key_required` or `api_key_invalid`.

### Org scoping

In v1 pilot, deployments are typically single-tenant. 8P3P may enforce org scoping server-side (your `org_id` in body/query may be overridden). You should still send the correct `org_id` for clarity and log correlation.

---

## 3) Quick start (curl)

### Health check (no key required)

```bash
curl -sS http://<host>:<port>/health
```

### Send a signal

```bash
curl -sS -X POST "http://<host>:<port>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "org_pilot1",
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

Expected response: `status: accepted` (or `duplicate` if re-sent with the same `signal_id`).

### Read decisions for a learner

```bash
curl -sS "http://<host>:<port>/v1/decisions?org_id=org_pilot1&learner_reference=learner-123&from_time=2026-03-01T00:00:00Z&to_time=2026-03-02T00:00:00Z" \
  -H "x-api-key: <your_key>"
```

---

## 4) Signal envelope requirements (what must be true)

Your request body must match the `SignalEnvelope` schema (see OpenAPI `/docs` and `docs/specs/signal-ingestion.md`).

Minimum required fields:

- `org_id` (string, 1–128)
- `signal_id` (string, 1–256; safe charset)
- `source_system` (string)
- `learner_reference` (string, 1–256)
- `timestamp` (RFC3339 with timezone)
- `schema_version` (`v1`, `v2`, …)
- `payload` (JSON object)

### Idempotency: how retries work (important)

`signal_id` is an idempotency key scoped by `(org_id, signal_id)`.

- If you retry the same signal (network retry, timeout), **reuse the same `signal_id`**.
- The server will return `status: duplicate` for repeats and will not double-apply.

**Recommendation:** Use your upstream event’s immutable ID as `signal_id` (or a deterministic hash of it).

---

## 5) The real integration work: mapping your data → canonical fields

The default decision policy evaluates a small set of canonical state fields (see `docs/specs/decision-engine.md` §4.7). In v1 pilot, **you provide these fields directly** in `payload` (no server-side field mapping yet).

### Canonical fields

All score-like fields are on a **0.0–1.0 scale**.

| Field | Type | Range | What it means | If you don’t have it |
|------|------|-------|---------------|-----------------------|
| `stabilityScore` | number | 0.0–1.0 | Stability in current path | Send 0.5 as neutral start, or omit (policy may fall through to defaults) |
| `masteryScore` | number | 0.0–1.0 | Mastery/competency | Normalize from % or rubric |
| `timeSinceReinforcement` | number | >= 0 | Seconds since last reinforcement/positive feedback | If unknown, omit or compute from your event stream |
| `confidenceInterval` | number | 0.0–1.0 | Confidence in your assessment | If unknown, start at 0.8 and refine later |
| `riskSignal` | number | 0.0–1.0 | Risk of regression / struggle | If unknown, omit or compute from negative signals |

### Normalization examples

- A percent score (0–100) → divide by 100 to get 0.0–1.0
- A rubric score (0–4) → divide by 4
- A binary flag → use 0.0/1.0 (only when semantically appropriate)

---

## 6) Consuming decisions (what you do with output)

Decisions are advisory outputs. Your system decides how to act on them.

### The two primary demo anchors

In the pilot narrative, we anchor on:

- `escalate`: low confidence / high risk → elevate to human review
- `advance`: high confidence / high mastery → progress learner

### All 7 types may occur

The system can return any of the 7 decision types:
`reinforce`, `advance`, `intervene`, `pause`, `escalate`, `recommend`, `reroute`.

**Integration recommendation:** Implement handling for all 7 (even if some are no-ops initially), so the system never feels “surprising” in pilot.

### Traceability (why enterprises trust it)

Each decision includes a `trace` object (state_id/state_version, policy_version, matched_rule_id). This supports audit and reproducibility. (Enriched receipts are part of v1 pilot-readiness work; see `docs/specs/inspection-api.md`.)

---

## 7) Troubleshooting and common errors

### 401 Unauthorized

- `api_key_required`: you didn’t send `x-api-key`
- `api_key_invalid`: the key value doesn’t match the pilot environment key

### 400 Rejected signals

The response includes `rejection_reason.code` and `field_path`. Common causes:

- `missing_required_field`: required field absent
- `invalid_timestamp`: not RFC3339 or missing timezone
- `payload_not_object`: payload is not a JSON object
- `forbidden_semantic_key_detected`: payload contains UI/workflow semantics (blocked intentionally)

### Debugging using the API docs

- Swagger UI: `GET /docs`
- OpenAPI source: `docs/api/openapi.yaml`

---

## 8) Integration checklist (pilot)

- [ ] Choose `learner_reference` format (stable ID from your system)
- [ ] Choose `signal_id` strategy (use upstream event ID; safe retry)
- [ ] Implement event → `SignalEnvelope` transformation
- [ ] Implement canonical field mapping + normalization (0.0–1.0)
- [ ] Send signals to `POST /v1/signals` with `x-api-key`
- [ ] Poll decisions from `GET /v1/decisions`
- [ ] Implement handling for all 7 decision types (even if some are initially no-ops)
- [ ] Use `/docs` as schema reference during implementation

---

## Reference Documents

- `docs/api/openapi.yaml` (served at `/docs`)
- `docs/specs/signal-ingestion.md`
- `docs/specs/decision-engine.md` (§4.7 canonical state fields)
- `docs/specs/api-key-middleware.md`
- `docs/specs/inspection-api.md` (enriched receipts, inspection endpoints — v1 scope)

