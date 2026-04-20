# Policy Management API

> Admin write API for creating, replacing, toggling, and deleting policies in DynamoDB — with soft enable/disable via `PATCH` status.

## Overview

Policies are stored in DynamoDB `PoliciesTable` (see `docs/specs/policy-storage.md`). This spec defines the admin HTTP API for managing those records. The primary consumers are the operator (you) and future customer self-service tooling. Customers view policies via `GET /v1/policies` (see `docs/specs/policy-inspection-api.md`); only admin-key holders write them.

**What this is:** Admin HTTP endpoints for policy lifecycle management — create, replace, toggle status, validate, delete, and list.
**What this is not:** A customer-facing write API. All endpoints require `ADMIN_API_KEY` and are unreachable with tenant API keys.

---

## Access Patterns

Derived from [First steps for modeling relational data in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html): *"You shouldn't start designing your schema until you know the questions that it needs to answer."*

| # | API Operation | DynamoDB Operation | Key Expression | Condition |
|---|---------------|--------------------|----------------|-----------|
| 1 | PUT policy (create or replace) | `PutItem` | `PK=org_id, SK=policy_key` | Optional: `attribute_not_exists(org_id) OR policy_version = :expected` (when `If-Match` sent) |
| 2 | PATCH policy status | `UpdateItem` | `PK=org_id, SK=policy_key` | `attribute_exists(org_id) AND attribute_exists(policy_key)` → 404 if fails |
| 3 | DELETE policy | `DeleteItem` | `PK=org_id, SK=policy_key` | `attribute_exists(org_id) AND attribute_exists(policy_key)` → 204 if deleted, 404 if not present |
| 4 | GET all policies (admin list) | `Scan` | — | Full table scan; acceptable for pilot (low org count, admin-only, low frequency) |
| 5 | POST validate (no DB write) | — | — | Pure in-process validation via `validatePolicyStructure` |

---

## Endpoints

### `PUT /v1/admin/policies/:org_id/:policy_key`

Create or replace a policy. Sets `status: "active"` by default. Body must be a valid `PolicyDefinition` JSON object.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `org_id` | Organization ID (e.g., `springs`, `global`) |
| `policy_key` | Policy key (e.g., `learner`, `staff`, `default`) |

**Request Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `x-admin-api-key` | Yes | Admin API key — must match `ADMIN_API_KEY` env var |
| `If-Match` | No | Optimistic lock version: `policy_version` integer. When present, write uses `ConditionExpression: attribute_not_exists(org_id) OR policy_version = :expected`. Omit for unconditional overwrite. |

**Request Body:**

```json
{
  "policy_id": "springs:learner",
  "policy_version": "1.1.0",
  "description": "Springs Charter School — learner policy v1.1",
  "rules": [
    {
      "rule_id": "rule-intervene",
      "condition": {
        "all": [
          { "field": "stabilityScore", "operator": "lt", "value": 0.3 },
          { "field": "timeSinceReinforcement", "operator": "gt", "value": 172800 }
        ]
      },
      "decision_type": "intervene"
    }
  ]
}
```

> **Note on `default_decision_type`:** Optional and **deprecated** (see [`decision-engine.md`](decision-engine.md) §4.6). Accepted on PUT for back-compat of existing admin payloads and — if present — validated as a valid `DecisionType`, but **ignored by the evaluator**; `validatePolicyStructure` emits a one-shot `policy_default_decision_type_deprecated` warning log (see `src/decision/policy-loader.ts`). New policies should omit the field. When no rule matches, no decision is emitted and no LIU is counted (runbook § Policy rule, 2026-04-18).

**Response (200):**

```json
{
  "org_id": "springs",
  "policy_key": "learner",
  "status": "active",
  "policy_version": 4,
  "updated_at": "2026-03-28T12:00:00Z"
}
```

**Response (400) — validation error:**

```json
{
  "error": {
    "code": "invalid_policy_structure",
    "message": "rules[1].condition.all must have at least 2 children"
  }
}
```

**Response (409) — optimistic lock conflict (when `If-Match` sent and version does not match):**

```json
{
  "error": {
    "code": "version_conflict",
    "message": "Policy version conflict. Expected version 3, current is 4. Fetch the latest and retry."
  }
}
```

---

### `PATCH /v1/admin/policies/:org_id/:policy_key`

Toggle policy status only — `"active"` or `"disabled"`. Does not overwrite `policy_json`. Returns 404 if the policy does not exist.

**Path Parameters:** same as PUT.

**Request Body:**

```json
{ "status": "active" }
```

or

```json
{ "status": "disabled" }
```

**Response (200):**

```json
{
  "org_id": "springs",
  "policy_key": "learner",
  "status": "disabled",
  "updated_at": "2026-03-28T12:01:00Z"
}
```

**Response (404) — policy not found:**

```json
{
  "error": {
    "code": "policy_not_found",
    "message": "No policy 'learner' found for org 'springs'"
  }
}
```

**DynamoDB operation:**

```
UpdateItem(
  Key: { org_id: "springs", policy_key: "learner" },
  UpdateExpression: "SET #status = :status, updated_at = :now, updated_by = :who",
  ConditionExpression: "attribute_exists(org_id) AND attribute_exists(policy_key)"
)
```

`ConditionalCheckFailedException` maps to 404.

---

### `POST /v1/admin/policies/validate`

Validate a policy JSON payload without writing to DynamoDB. Returns `{ "valid": true }` or a validation error. No side effects.

**Request Body:** same shape as PUT body (`PolicyDefinition`).

**Response (200) — valid:**

```json
{ "valid": true }
```

**Response (400) — invalid:**

```json
{
  "valid": false,
  "error": {
    "code": "invalid_policy_structure",
    "message": "rules[0].decision_type 'explode' is not a valid decision type"
  }
}
```

Validation reuses `validatePolicyStructure` from `src/decision/policy-loader.ts` — single source of truth. No new validation logic here.

---

### `DELETE /v1/admin/policies/:org_id/:policy_key`

Permanently remove a policy record from DynamoDB. For soft deactivation, use `PATCH` with `status: "disabled"` instead.

**Path Parameters:** same as PUT.

**Response (204):** Policy deleted; empty body.

**Response (404) — policy not found:**

```json
{
  "error": {
    "code": "policy_not_found",
    "message": "No policy 'learner' found for org 'springs'"
  }
}
```

**DynamoDB operation:**

```
DeleteItem(
  Key: { org_id: "springs", policy_key: "learner" },
  ConditionExpression: "attribute_exists(org_id) AND attribute_exists(policy_key)"
)
```

`ConditionalCheckFailedException` maps to 404.

---

### `GET /v1/admin/policies`

List all policies across all orgs, including `status` for each entry. Operator-only.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | No | Filter to a single org (uses `Query` instead of `Scan` when provided) |

**Response (200):**

```json
{
  "policies": [
    {
      "org_id": "springs",
      "policy_key": "learner",
      "policy_version": 4,
      "status": "active",
      "updated_at": "2026-03-28T12:00:00Z",
      "updated_by": "adm_key_..."
    },
    {
      "org_id": "springs",
      "policy_key": "staff",
      "policy_version": 2,
      "status": "disabled",
      "updated_at": "2026-03-27T09:00:00Z",
      "updated_by": "adm_key_..."
    },
    {
      "org_id": "global",
      "policy_key": "default",
      "policy_version": 1,
      "status": "active",
      "updated_at": "2026-03-01T10:00:00Z",
      "updated_by": "adm_key_..."
    }
  ],
  "count": 3
}
```

**Implementation note:** Without `org_id`, this requires a full table `Scan`. Acceptable for pilot (low org count, admin-only, low frequency). A GSI on `status` for cross-org filtered queries is out of scope. Reference: [General design principles](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html) — Scan is an explicit trade-off for this single admin use case.

---

## Auth

Admin endpoints use a **separate admin API key** checked before the tenant API key.

| Header | Value |
|--------|-------|
| `x-admin-api-key` | Value must match `ADMIN_API_KEY` environment variable |

**Rules:**
- Admin endpoints (`/v1/admin/*`) check `x-admin-api-key` exclusively. A valid tenant `x-api-key` is **not** sufficient — 401 is returned.
- The `ADMIN_API_KEY` check runs before any tenant key lookup in the middleware chain.
- `ADMIN_API_KEY` is an env var on AdminFunction Lambda; it is never exposed in responses.

---

## Storage

All writes target DynamoDB `PoliciesTable` (defined in `docs/specs/policy-storage.md`).

| Field | Set By | Notes |
|-------|--------|-------|
| `org_id` | Path param | Partition key |
| `policy_key` | Path param | Sort key |
| `policy_json` | PUT body | Stored as DynamoDB Map (M) — not a JSON string |
| `policy_version` | Auto-increment | Lambda reads current version; increments by 1 on each PUT |
| `status` | PUT (default `"active"`) / PATCH | `"active"` or `"disabled"` |
| `updated_at` | Lambda | ISO 8601 timestamp at write time |
| `updated_by` | Lambda | Truncated admin key prefix (e.g., `adm_key_abc…`) — never full key |

### ConditionExpression Patterns

See `docs/specs/policy-storage.md` §Conditional Writes and Optimistic Locking for the full reference. Summary for this API:

| Operation | ConditionExpression | Failure → HTTP |
|-----------|---------------------|----------------|
| PUT (no `If-Match`) | None (unconditional overwrite) | — |
| PUT (with `If-Match: N`) | `attribute_not_exists(org_id) OR policy_version = :expected` | 409 Conflict |
| PATCH | `attribute_exists(org_id) AND attribute_exists(policy_key)` | 404 Not Found |
| DELETE | `attribute_exists(org_id) AND attribute_exists(policy_key)` | 404 Not Found |

---

## Resolution Impact

`policy-loader.ts` skips policies where `status !== "active"` when reading from DynamoDB:

- Disabling an org-level policy (`PATCH status: "disabled"`) → resolution falls through to the org's `default` policy key, then `global/default`, then bundled failsafe.
- Disabling `global/default` → resolution falls through to bundled failsafe only.
- Re-enabling (`PATCH status: "active"`) → policy resumes at its position in the chain on the next cache miss (within TTL, stale active policy may still be served).

Operators should anticipate up to one TTL window (default: 5 minutes) before a status change is reflected in live traffic.

---

## Thin CLI Wrappers

`scripts/upload-policy.ts` and `scripts/validate-policy.ts` are thin HTTP wrappers around these endpoints for operator convenience:

- `upload-policy.ts` → calls `PUT /v1/admin/policies/:org_id/:policy_key`
- `validate-policy.ts` → calls `POST /v1/admin/policies/validate`

They are not the primary implementation. The API is the source of truth; scripts are convenience wrappers.

---

## Requirements

### Functional

- [ ] `PUT /v1/admin/policies/:org_id/:policy_key` validates the body via `validatePolicyStructure` before writing; rejects invalid payloads with 400
- [ ] `PUT` stores `policy_json` as a DynamoDB Map (M), not a JSON string
- [ ] `PUT` sets `status: "active"` by default; increments `policy_version`; records `updated_at` and `updated_by`
- [ ] `PUT` supports optional optimistic locking via `If-Match` header; returns 409 on version conflict
- [ ] `PATCH /v1/admin/policies/:org_id/:policy_key` updates only `status`, `updated_at`, `updated_by`; returns 404 if policy does not exist
- [ ] `POST /v1/admin/policies/validate` runs full structural validation; returns `{ "valid": true }` or 400 with error; makes no DynamoDB writes
- [ ] `DELETE /v1/admin/policies/:org_id/:policy_key` removes the item; returns 204 on success, 404 if not present
- [ ] `GET /v1/admin/policies` returns all policies (Scan); supports optional `org_id` filter (Query)
- [ ] All endpoints require `x-admin-api-key`; tenant key returns 401
- [ ] AdminFunction Lambda has read-write IAM permissions on `PoliciesTable`

### Acceptance Criteria

- Given a valid policy body, when `PUT` is called, then the item appears in DynamoDB with `status: "active"` and the response includes `policy_version`
- Given an invalid policy body (e.g., unknown `decision_type`), when `PUT` is called, then 400 is returned and DynamoDB is not written
- Given policy `springs/learner` exists with `status: "active"`, when `PATCH` with `status: "disabled"` is called, then subsequent signals for `springs` fall through to the next resolution candidate
- Given `PATCH` is called for a non-existent policy, then 404 with `policy_not_found` is returned
- Given `DELETE` is called for an existing policy, then 204 is returned and the item is gone from DynamoDB
- Given `DELETE` is called for a non-existent policy, then 404 is returned
- Given a tenant API key (not admin key), when any `/v1/admin/*` endpoint is called, then 401 is returned

---

## Constraints

- **Admin-only** — `ADMIN_API_KEY` required; tenant keys cannot call these endpoints
- **Hard delete, not soft delete** — `DELETE` removes the item permanently. Use `PATCH status: "disabled"` for soft deactivation.
- **Unconditional PUT by default** — without `If-Match`, `PUT` is last-writer-wins. This is intentional for operator use cases where concurrency is low.
- **No bulk write** — no batch endpoint for pilot. Each policy is written individually.
- **No policy history** — `policy_version` is for optimistic locking only, not a history store. DynamoDB Streams-based audit trail is deferred (see Out of Scope).
- **Validation reuses existing code** — `validatePolicyStructure` from `policy-loader.ts` is the single source of truth. Admin API imports it directly; no parallel validation logic.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|-------------|
| Policy version history / rollback endpoint | Not required for pilot; `updated_at` + `updated_by` provide basic auditability | Compliance requirement or customer policy revert request |
| Bulk PUT / batch import | Low operator write frequency; single PUT is sufficient | High-volume policy seeding workflow |
| Policy diff (compare two versions) | No history store in Phase 1 | Policy history table implemented |
| Policy simulation (dry-run evaluate) | Separate concern from management API | QA tooling investment |
| Customer self-service write API | Not required for pilot; customers view via Inspection API | Dashboard investment post-pilot |
| DynamoDB Streams audit trail | Deferred; `updated_at`/`updated_by` cover pilot needs | Compliance requirement |
| GSI on `status` for filtered Scan | Scan acceptable at pilot org count | Cross-org filtered queries become a bottleneck |
| Per-source policy routing (`source_systems` scope) | Pilot uses org-wide policy for all connectors. Phase 1 adds optional `source_systems: string[]` to `PoliciesTable` items. Decision engine resolution: check for source-scoped policy first → fall back to org-wide default. **Additive change**: absent `source_systems` = applies to all sources. No migration needed. Connector wizard Step 4 (currently informational) becomes a real per-source association. | Phase 1 — when multiple connectors per org need different policies |
| Connector-aware policy association API | Admin currently selects policies and connectors independently. Phase 1 adds `PUT /v1/admin/policies/:org_id/:policy_key/scope` to set `source_systems` on a policy. | Phase 1 — alongside per-source policy routing |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `PoliciesTable` DynamoDB resource | `docs/specs/policy-storage.md` | Spec'd — TASK-002 |
| CDK stack (`infra/lib/control-layer-stack.ts`) with AdminFunction Lambda | `docs/specs/aws-deployment.md` | Spec'd — TASK-001 |
| `validatePolicyStructure` function | `src/decision/policy-loader.ts` | **Complete** |
| `PolicyDefinition` type | `src/shared/types.ts` | **Complete** |
| `ADMIN_API_KEY` env var wired to AdminFunction | `docs/specs/aws-deployment.md` | Spec'd |

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| `PUT /v1/admin/policies` write path | `docs/specs/policy-storage.md` (AdminFunction write path) |
| `PATCH` status toggle | `docs/specs/policy-storage.md` (status field semantics) |
| `POST /v1/admin/policies/validate` endpoint | `scripts/validate-policy.ts` (thin CLI wrapper) |
| Policy lifecycle management | Pilot onboarding checklist, operator runbook |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `policy_not_found` | Policy loader — no item for the given `org_id` + `policy_key` |
| `invalid_policy_structure` | Policy loader — `validatePolicyStructure` failure |
| `invalid_format` | Policy loader — JSON parse failure |
| `invalid_policy_version` | Policy loader — semver validation failure |
| `invalid_decision_type` | Policy loader — decision type not in closed set |

### New (add during implementation)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `version_conflict` | 409 | Optimistic lock conflict: client-provided `If-Match` version does not match current `policy_version` in DynamoDB |
| `admin_key_required` | 401 | Request made to `/v1/admin/*` without a valid `x-admin-api-key` |
| `invalid_status_value` | 400 | `PATCH` body `status` field is not `"active"` or `"disabled"` |

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| POL-ADMIN-001 | PUT valid policy → written to DynamoDB | Valid `PolicyDefinition` body | 200, `status: "active"` in DynamoDB; response includes `policy_version` |
| POL-ADMIN-002 | PUT invalid policy JSON → rejected | Body with unknown `decision_type` | 400, `invalid_policy_structure`; no DynamoDB write |
| POL-ADMIN-003 | POST validate valid policy → no DB write | Valid `PolicyDefinition` body | 200, `{ "valid": true }`; DynamoDB `PutItem` never called |
| POL-ADMIN-004 | DELETE policy → removed | Existing policy in DynamoDB mock | 204; `GetItem` afterwards returns no item |
| POL-ADMIN-005 | PATCH `status: "disabled"` → resolution falls through | Active policy; PATCH disabled; send signal for org | 200; signal resolution uses next candidate (not the disabled policy) |
| POL-ADMIN-006 | PATCH `status: "active"` → policy resumes | Disabled policy; PATCH active | 200; policy resumes being used for evaluation after cache TTL |
| POL-ADMIN-007 | PATCH on non-existent policy → 404 | `org_id`+`policy_key` not in DynamoDB | 404, `policy_not_found` |
| POL-ADMIN-008 | Admin endpoint with tenant API key → 401 | Valid `x-api-key` (tenant), no `x-admin-api-key` | 401, `admin_key_required` |

> **Test strategy:** POL-ADMIN-001 through POL-ADMIN-008 are integration tests against AdminFunction with mocked `@aws-sdk/client-dynamodb`. POL-ADMIN-005/006 require the resolution chain (mock `policy-loader.ts` DynamoDB calls). POL-ADMIN-003 asserts no DynamoDB call via mock spy.

---

## Notes

- **Admin vs. tenant auth separation:** The `x-admin-api-key` check runs first in the middleware chain. This means an operator with both keys must send the admin key for admin endpoints — the tenant key will not grant admin access even if both are present on the same request.
- **Optimistic locking is opt-in:** Without `If-Match`, PUT is unconditional. This is appropriate for single-operator workflows during pilot. If multiple operators manage policies concurrently in the future, enforce `If-Match` at the client or add a version check requirement to the API.
- **`policy_json` as Map (M):** Storing as a native DynamoDB Map (not a JSON string) allows Lambda to read nested attributes without a parse step and enables future `UpdateExpression` patches on individual rule fields. See `policy-storage.md` §Schema.
- **Thin CLI wrappers:** `scripts/upload-policy.ts` and `scripts/validate-policy.ts` call these endpoints over HTTP. They are not the primary implementation — just convenience wrappers for operators who prefer CLI over curl.
- **Cache TTL delay on status changes:** After a `PATCH status: "disabled"`, the resolution chain will continue serving the cached policy until the TTL expires (default 5 min). Operators should wait one TTL window before assuming the disable is in effect for live traffic.

---

*Spec updated: 2026-04-06 — added per-source policy routing and connector-aware association to Out of Scope with Phase 1 markers. Original spec created: 2026-03-28. Depends on: policy-storage.md, aws-deployment.md, decision-engine.md*
