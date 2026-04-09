# Pilot Integration Guide (v2)

**Audience:** Pilot customer IT administrators and integration engineers
**Goal:** Get from "we use Canvas" → "signals flow automatically" → "we consume decisions" in minutes, not days.
**API contract:** `docs/api/openapi.yaml` (served at `/docs`)

---

## 1) What you implement

### Primary path: Activate a connector (recommended)

If your school uses Canvas, I-Ready, or Branching Minds, 8P3P has pre-built connectors. No custom code required:

1. **Activate** — 8P3P operator activates your LMS connector. You receive a webhook URL and setup instructions.
2. **Configure** — Add the webhook URL to your LMS admin settings (e.g., Canvas → Admin → Developer Keys → Webhooks). Include your `x-api-key` as a custom header.
3. **Done** — Signals flow automatically. 8P3P handles envelope extraction, field mapping, and normalization.

You only need to implement one call: **read decisions**.

### Advanced path: Direct API (custom integrations)

For LMS platforms without a pre-built connector, or for custom data sources, send signals directly:

- **Endpoint:** `POST /v1/signals`
- **Purpose:** Send learner events in a standard `SignalEnvelope`. The control layer persists the signal, updates state, and generates a decision.
- See §8 for the `SignalEnvelope` schema and §9 for the direct integration checklist.

### Read decisions (both paths)

- **Endpoint:** `GET /v1/decisions`
- **Purpose:** Poll for decisions per learner and time range. You decide what to do with them in your system (we emit decisions; we do not enforce workflows).
- **Common use-case:** If you need decisions for **all learners in an org** (export/analytics), use the supported fan-out workflow: list learners → fetch decisions per learner. See [`get-all-learner-decisions-from-org.md`](get-all-learner-decisions-from-org.md).

---

## 2) Access + authentication (v1 pilot)

### API key (required in pilot)

8P3P will provide an API key for the pilot environment. Include it on every `/v1/*` request:

- **Header:** `x-api-key: <your_key>`

If the key is missing or invalid, you will receive **401** with `api_key_required` or `api_key_invalid`.

### Org scoping

- **When 8P3P sets `API_KEY_ORG_ID`** (typical single-tenant pilot): the server overrides every request's `org_id` with that value. You cannot access another org; sending a different `org_id` has no effect. You may omit or leave `org_id` as a placeholder — the server fills it in.
- **When `API_KEY_ORG_ID` is not set (local dev / controlled testing only):** the server uses the `org_id` you send in the body (POST) or query (GET). This mode does **not** prevent cross-org access if more than one org's data exists in the same environment, so it is not used for pilot deployments.

---

## 3) Quick start — Connector path (recommended)

If 8P3P has activated a connector for your org, the quick start is:

### Step 1: Verify your connector is active

Ask your 8P3P operator to confirm the connector is activated and provide:
- **Webhook URL:** `https://api.8p3p.dev/v1/webhooks/canvas-lms` (or your LMS)
- **API key:** your `x-api-key` value
- **Event types:** which LMS events are being ingested (e.g., `submission_created`, `grade_updated`)

### Step 2: Add the webhook URL to your LMS

In Canvas: Admin → Developer Keys → Webhooks → add the webhook URL with your API key as a custom header.

### Step 3: Verify signals are flowing

After a student submits an assignment (or trigger a test event), check that decisions are being produced:

```bash
curl -sS "https://api.8p3p.dev/v1/decisions?learner_reference=<student_id>&from_time=2026-04-01T00:00:00Z&to_time=2026-04-30T00:00:00Z" \
  -H "x-api-key: <your_key>"
```

If decisions are returned, your integration is working end-to-end.

---

## 4) Quick start — Direct API path

For a minimal first-run (verify access → send one signal → read one decision), see [Customer Onboarding Quick Start](customer-onboarding-quickstart.md). Below is the same flow inline.

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

## 5) How connectors handle data mapping (you don't have to)

When using a pre-built connector, the data mapping from your LMS to 8P3P's canonical fields is handled automatically by the Connector Layer. Here's what happens behind the scenes:

1. Your LMS fires a raw webhook (e.g., Canvas `submission_created` event)
2. The **Webhook Adapter** extracts envelope fields (`learner_reference`, `signal_id`, `timestamp`) from the raw body using configured dot-paths
3. The **Transform Engine** applies declarative transforms to normalize LMS-specific fields into canonical state fields (e.g., `submission.score / 100` → `stabilityScore`)
4. The resulting `SignalEnvelope` enters the standard ingestion pipeline

**You do not need to normalize scores, map fields, or construct `SignalEnvelope` objects.** The connector template handles all of this. If you need to customize the mapping (power users only), ask your 8P3P operator about custom mapping overrides.

### Canonical fields (reference)

All score-like fields use a **0.0–1.0 scale**. These are the fields that drive policy evaluation:

| Field | Type | Range | What it means |
|------|------|-------|---------------|
| `stabilityScore` | number | 0.0–1.0 | Stability in current path |
| `masteryScore` | number | 0.0–1.0 | Mastery/competency |
| `timeSinceReinforcement` | number | >= 0 | Seconds since last reinforcement/positive feedback |
| `confidenceInterval` | number | 0.0–1.0 | Confidence in the assessment |
| `riskSignal` | number | 0.0–1.0 | Risk of regression / struggle |

---

## 6) Consuming decisions (what you do with output)

Decisions are advisory outputs. Your system decides how to act on them.

### The two primary demo anchors

In the pilot narrative, we anchor on:

- **`reinforce`**: prevent decay / prevent future failure before it happens
- **`intervene`**: high-risk now; take action immediately

These map directly to enterprise pain (waste + risk). The other two types (`advance`, `pause`) are fully supported and may appear in the Decision Stream; we simply don't lead with them unless asked.

### All 4 types may occur

The system returns exactly four decision types:
`reinforce`, `advance`, `intervene`, `pause`.

**Integration recommendation:** Implement handling for all 4, so the system never feels "surprising" in pilot.

### Traceability (why enterprises trust it)

Each decision includes a `trace` object (state_id/state_version, policy_version, matched_rule_id). This supports audit and reproducibility. (Enriched receipts are part of v1 pilot-readiness work; see `docs/specs/inspection-api.md`.)

---

## 7) View your active policies (v1.1)

After v1.1 deployment, you can **read** the policy configuration 8P3P applies to your org (thresholds, rule order, default decision) without asking an operator for a file export. Writes remain admin-only; see `docs/specs/policy-management-api.md`.

**List policies for your org** (requires tenant `x-api-key`; returns metadata and active keys):

```bash
curl -sS "https://<host>/v1/policies" \
  -H "x-api-key: <your_key>"
```

**Fetch one policy by key** (e.g. `learner`, `default`, or org routing target from `docs/specs/decision-engine.md`):

```bash
curl -sS "https://<host>/v1/policies/learner" \
  -H "x-api-key: <your_key>"
```

Typical response body includes `policy_id`, `policy_version`, `rules[]` with `rule_id`, `condition`, `decision_type`, and `default_decision_type`. Use this to align your LMS mapping with the thresholds your integration will hit in production.

**Spec:** `docs/specs/policy-inspection-api.md`

---

## 8) Troubleshooting and common errors

### 401 Unauthorized

- `api_key_required`: you didn't send `x-api-key`
- `api_key_invalid`: the key value doesn't match the pilot environment key

### 400 Rejected signals

The response includes `rejection_reason.code` and `field_path`. Common causes:

- `missing_required_field`: required field absent
- `invalid_timestamp`: not RFC3339 or missing timezone
- `payload_not_object`: payload is not a JSON object
- `forbidden_semantic_key_detected`: payload contains UI/workflow semantics (blocked intentionally)

### 204 No Content (webhook path)

If your LMS fires an event type that isn't in the connector's allowed list (e.g., `enrollment_created`), the webhook adapter silently drops it with 204. This is expected — only pedagogically relevant events become signals.

### Debugging using the API docs

- Swagger UI: `GET /docs`
- OpenAPI source: `docs/api/openapi.yaml`

---

## 9) Integration checklists

### Connector path checklist (recommended)

- [ ] Receive webhook URL and API key from 8P3P operator
- [ ] Confirm which event types are configured for your connector
- [ ] Add webhook URL to your LMS admin settings with `x-api-key` header
- [ ] Verify first signal flows (check `GET /v1/decisions` after a student submits an assignment)
- [ ] Implement decision polling from `GET /v1/decisions`
- [ ] Implement handling for all 4 decision types (`reinforce`, `advance`, `intervene`, `pause`)
- [ ] Use `/docs` as schema reference during implementation

### Direct API checklist (advanced)

- [ ] Choose `learner_reference` format (stable ID from your system)
- [ ] Choose `signal_id` strategy (use upstream event ID; safe retry)
- [ ] Implement event → `SignalEnvelope` transformation
- [ ] Implement canonical field mapping + normalization (0.0–1.0)
- [ ] Send signals to `POST /v1/signals` with `x-api-key`
- [ ] Poll decisions from `GET /v1/decisions`
- [ ] Implement handling for all 4 decision types (`reinforce`, `advance`, `intervene`, `pause`)
- [ ] Use `/docs` as schema reference during implementation

---

## 10) Identity Resolution (learner_reference as canonical key)

The control layer uses `learner_reference` as the **persistent merge key** for all signals from a given org. If the same person exists in multiple systems (Canvas `user_id: 40512`, Internal LMS `user_id: STU-1234`), you must resolve to a single canonical ID before sending signals. All signals for that person — regardless of `source_system` — must carry the same `learner_reference`.

**When using a connector:** The connector's envelope mapping extracts `learner_reference` from a configured field in the LMS payload (e.g., `submission.user_id`). If your LMS uses a stable student ID, this works automatically. If your LMS uses internal IDs that don't match across systems, discuss ID resolution with your 8P3P operator during setup.

### Recommended strategy: SIS/HR primary key

| User type | Canonical ID source | Example `learner_reference` |
|-----------|--------------------|-----------------------------|
| Students | SIS student ID | `"stu-10042"` |
| Staff | HR employee ID | `"emp-00831"` |

You own this mapping. The control layer never calls your SIS or HR system directly.

### Why it works across multiple LMS systems

All LMS systems have some mapping back to a shared SIS/HR record. Once you adopt a canonical `learner_reference`, every signal from any system updates the same STATE record for that person — this is how the cross-system intelligence is unified.

```
Canvas submission (user 40512)     →  learner_reference: "stu-10042"  ─┐
I-Ready diagnostic (student 1234)  →  learner_reference: "stu-10042"  ─┤─→ Single STATE → Single Decision
Branching Minds (LM-9988)         →  learner_reference: "stu-10042"  ─┘
```

---

## 11) Multi-LMS Integration

All LMS systems use the same infrastructure. When using connectors, each connector has its own webhook URL:

| LMS | Webhook URL | Integration pattern |
|-----|-------------|---------------------|
| Canvas | `https://api.8p3p.dev/v1/webhooks/canvas-lms` | Pre-built connector (activate and configure) |
| I-Ready | `https://api.8p3p.dev/v1/webhooks/iready` | Pre-built connector (activate and configure) |
| Branching Minds | `https://api.8p3p.dev/v1/webhooks/branching-minds` | Pre-built connector (activate and configure) |
| Custom LMS | N/A | Direct API: `POST /v1/signals` with custom `source_system` |

The control layer is source-system agnostic. The same pipeline processes signals from all sources.

**Which policy runs?** Policy routing is configured per org (see §12). `source_system` determines which policy evaluates the signal.

---

## 12) Policy Routing (org-scoped, config-driven)

The control layer uses a declarative routing config at `policies/{orgId}/routing.json` to map `source_system` values to policy keys (e.g. `"learner"` or `"staff"`). You do not need to specify a policy in the signal — routing is resolved automatically from `source_system`.

### How it works

```
signal.source_system  →  routing.json lookup  →  policy key  →  loadPolicyForContext(orgId, key)
                                               ↓ (miss)
                                          default_policy_key
```

### Example routing config

```json
{
  "source_system_map": {
    "canvas-lms":        "learner",
    "iready":            "learner",
    "branching-minds":   "learner",
    "hr-training":       "staff"
  },
  "default_policy_key": "learner"
}
```

With this config:
- Canvas, I-Ready, and Branching Minds signals → evaluated against the `learner` policy (student progress thresholds)
- HR training signals → evaluated against the `staff` policy (staff compliance thresholds)
- Any unrecognized `source_system` → falls back to `"learner"` policy

**Policy file resolution order (first found wins):**

1. `policies/{orgId}/{policyKey}.json`
2. `policies/{orgId}/default.json`
3. `policies/default.json`

---

## Reference Documents

- `docs/api/openapi.yaml` (served at `/docs`)
- `docs/specs/integration-templates.md` (Connector Layer — activation, templates, event types)
- `docs/specs/webhook-adapters.md` (raw LMS webhook ingestion)
- `docs/specs/tenant-field-mappings.md` (payload normalization and transforms)
- `docs/specs/signal-ingestion.md` (SignalEnvelope schema, validation)
- `docs/specs/decision-engine.md` (§4.7 canonical state fields)
- `docs/specs/api-key-middleware.md` (authentication)
- `docs/specs/policy-inspection-api.md` (view active policies)

---

*Guide updated: 2026-04-06 (v2) — restructured around Connector Layer: connector path is now the primary integration pattern; direct API path is the advanced option. Removed §9 (build your own webhook receiver) — connectors replace this entirely. Added connector quick start, event type filtering note, and multi-connector table. Original v1: 2026-03-28.*
