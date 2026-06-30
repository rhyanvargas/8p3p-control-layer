# Policy Generation Service (External)

> **Separate service, not part of the control-layer core.** The Policy Generation Service (PGS) accepts natural-language policy requirements and returns **draft `PolicyDefinition` JSON** for human review. The control layer treats PGS as an **untrusted HTTP dependency** — all output is re-validated via `validatePolicyStructure` before any caller sees it.

## Overview

[`US-POLICY-BUILDER-001`](../backlog/user-stories-v1.2.md) requires AI-assisted policy drafting without embedding LLM SDK code in the control-layer API or decision engine. PGS mirrors the decoupling pattern used by the [Document Extraction Service](document-extraction-service.md): separate deployable, HTTP contract, no shared database.

**Deployment relationship:**

```
[Dashboard compliance user]
       → POST /v1/admin/policies/generate (control layer, x-admin-api-key)
              → POST /generate (PGS, internal network)
              ← { policy, confidence, clarification_needed }
       → validatePolicyStructure (in-process, trusted)
       ← draft to reviewer
```

PGS is intended to run as a **separate repository / separate deployable** (Lambda function or small container). The control layer calls it over HTTPS with an internal auth token. PGS does **not** write to DynamoDB `PoliciesTable` — commit remains explicit `PUT` on the control layer.

**What this is:** LLM-backed policy draft generator with schema-constrained JSON output.

**What this is not:** Policy evaluation, decision engine, or auto-commit to production policies.

---

## Requirements

### Functional

#### Generate

- [ ] `POST /generate` accepts JSON body:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Natural-language policy requirement (≤ 4000 chars) |
| `policy_schema` | object | Yes | JSON Schema or embedded schema reference for `PolicyDefinition` |
| `decision_types` | string[] | Yes | Closed set: `reinforce`, `advance`, `intervene`, `pause` |
| `org_id` | string | No | Hint for policy_id naming; not used for tenancy enforcement in PGS |
| `policy_key` | string | No | Hint for policy_id naming |
| `existing_policy` | object | No | Optional baseline for "modify this rule" flows (MVP-1.1) |

- [ ] Response (200):

```json
{
  "policy": {
    "policy_id": "southwest-charter:learner",
    "policy_version": "1.0.0",
    "description": "...",
    "rules": []
  },
  "confidence": 0.85,
  "clarification_needed": [
    "Should 'declining for two signals' mean consecutive ingest events or calendar days?"
  ]
}
```

- [ ] Output `policy` MUST be valid JSON object matching the supplied schema shape (rules array, rule_id, condition trees, decision_type per rule).
- [ ] If the model cannot produce valid JSON after internal retry (default 2), return **422** with `{ "error": "policy_generation_failed", "message": "..." }`.
- [ ] `confidence` is a float 0–1 derived from model logprobs or heuristic self-check — informational only; control layer does not trust it for commit decisions.
- [ ] `clarification_needed` is a string array (may be empty) when the description is ambiguous.

#### Health

- [ ] `GET /health` returns `{ "status": "ok" }` for load balancer / Lambda warming.

### Non-functional

- [ ] P95 latency ≤ 15s for single generate (pilot); control layer timeout configurable (default 20s).
- [ ] No PII in prompts — description is operator-authored policy logic only; do not accept learner identifiers in generate requests.
- [ ] Structured logging: `request_id`, `model_id`, `latency_ms`, `retry_count`, `validation_outcome` — no raw prompt/response in prod logs (sampled debug only).
- [ ] Idempotent from caller perspective: same description may yield slightly different drafts; control layer never auto-commits.

---

## LLM prompt contract (normative)

PGS system prompt MUST include:

1. Full `PolicyDefinition` shape (rules, conditions, operators aligned with [`decision-engine.md`](decision-engine.md)).
2. Closed `decision_types` list passed in request.
3. Instruction: **JSON only**, no markdown fences, no commentary outside JSON.
4. Deprecation note: omit `default_decision_type` on new policies ([`policy-management-api.md`](policy-management-api.md)).
5. Field names available for conditions (e.g. `stabilityScore`, dot-path skill fields per [`skill-level-tracking.md`](skill-level-tracking.md)).

User prompt = `description` + optional `existing_policy` excerpt.

Post-process: parse JSON → schema validate → if fail, retry with repair prompt (max `PGS_MAX_RETRIES`, default 2).

---

## Security

| Concern | Mitigation |
|---------|------------|
| Untrusted output | Control layer runs `validatePolicyStructure` before returning to dashboard |
| Service authentication | `PGS_INTERNAL_TOKEN` or mTLS between control layer and PGS |
| Prompt injection in `description` | Strip control characters; max length; no tool execution in PGS |
| Data residency | Bedrock region configurable; pilot default `us-east-1` |

PGS MUST NOT hold tenant API keys or write to control-layer DynamoDB.

---

## Environment variables (PGS deployable)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PGS_PROVIDER` | No | `amazon-bedrock` | `amazon-bedrock` or `gateway` (local dev) |
| `PGS_MODEL` | When LLM on | Claude Haiku class | Model ID for provider |
| `PGS_REGION` | No | `us-east-1` | Bedrock region |
| `PGS_MAX_RETRIES` | No | `2` | JSON repair retries |
| `PGS_TIMEOUT_MS` | No | `12000` | Per LLM call timeout |
| `PGS_INTERNAL_TOKEN` | Yes (prod) | — | Bearer token control layer sends |

Control layer env (consumer):

| Variable | Description |
|----------|-------------|
| `POLICY_GENERATION_SERVICE_URL` | Base URL, e.g. `https://pgs.internal.example` |
| `POLICY_GENERATION_SERVICE_TOKEN` | Matches `PGS_INTERNAL_TOKEN` |

---

## Control layer integration

`POST /v1/admin/policies/generate` (see [`educator-policy-builder.md`](educator-policy-builder.md)):

1. Authenticate `x-admin-api-key`.
2. Forward to PGS `POST /generate` with schema + decision_types constants from codebase.
3. On PGS 422 → map to `policy_generation_failed`.
4. On PGS 5xx / timeout → `policy_generation_unavailable`.
5. Run `validatePolicyStructure` on returned `policy`; if fail → `policy_generation_failed` (do not return invalid draft).
6. Return `{ policy, confidence, clarification_needed }` to caller.

No LLM SDK imports in `src/decision/` or policy loader paths.

---

## Contract tests (planned)

| Test ID | Description | Expected |
|---------|-------------|----------|
| PGS-001 | Valid description → valid policy JSON | 200, schema-valid rules |
| PGS-002 | Ambiguous description | 200, non-empty `clarification_needed` |
| PGS-003 | Unrecoverable garbage input | 422 `policy_generation_failed` |
| PGS-004 | Health | 200 ok |
| PGS-005 | Control layer rejects PGS output that fails validatePolicyStructure | 502/422 to dashboard caller |

---

## Dependencies

| Dependency | Document |
|------------|----------|
| Policy validation gate | [`policy-management-api.md`](policy-management-api.md) |
| Dashboard orchestration | [`educator-policy-builder.md`](educator-policy-builder.md) |
| Decision types + condition fields | [`decision-engine.md`](decision-engine.md), [`skill-level-tracking.md`](skill-level-tracking.md) |

---

## Out of scope

| Item | Rationale |
|------|-----------|
| Policy storage | Control layer `PoliciesTable` only |
| Real-time evaluation against live state | Decision engine responsibility |
| Educator-facing NL interface in MVP-1 | Compliance persona only |
| Multi-tenant PGS billing | Single pilot deployment first |

---

*Spec created: 2026-06-29 | Plan: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-008 | Backlog: US-POLICY-BUILDER-001*
