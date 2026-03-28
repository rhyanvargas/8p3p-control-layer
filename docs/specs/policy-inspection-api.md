# Policy Inspection API

> Read-only API endpoints for pilot customers to view their active policies, rules, and routing configuration.

## Overview

Pilot customers can see which policy fired per decision (via `trace.policy_id` and `trace.matched_rule_id` in `GET /v1/decisions`), but they cannot list all active policies, view unmatched rules, or inspect thresholds before sending signals. This spec adds read-only inspection endpoints so customers and integration teams can answer: "What policies are active for my org? What rules will evaluate my signals? What thresholds trigger each decision type?"

These endpoints follow the same pattern as existing inspection endpoints (`GET /v1/state`, `GET /v1/ingestion`) — read-only, org-scoped, API key protected.

---

## Endpoints

### `GET /v1/policies`

List all active policies for an org.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID (overridden from API key on AWS) |

**Response (200):**

```json
{
  "org_id": "springs",
  "policies": [
    {
      "policy_id": "springs:learner",
      "policy_version": "1.0.0",
      "policy_key": "learner",
      "description": "Springs Charter School — learner policy...",
      "rule_count": 4,
      "default_decision_type": "reinforce"
    },
    {
      "policy_id": "springs:staff",
      "policy_version": "1.0.0",
      "policy_key": "staff",
      "description": "Springs Charter School — staff policy...",
      "rule_count": 4,
      "default_decision_type": "reinforce"
    }
  ],
  "routing": {
    "source_system_map": {
      "canvas-lms": "learner",
      "blackboard-lms": "learner",
      "absorb-lms": "staff"
    },
    "default_policy_key": "learner"
  }
}
```

### `GET /v1/policies/:policy_key`

Get full policy detail including rules and conditions.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `policy_key` | Policy key (e.g., `learner`, `staff`) |

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID |

**Response (200):**

```json
{
  "org_id": "springs",
  "policy_key": "learner",
  "policy": {
    "policy_id": "springs:learner",
    "policy_version": "1.0.0",
    "description": "Springs Charter School — learner policy...",
    "rules": [
      {
        "rule_id": "rule-intervene",
        "decision_type": "intervene",
        "condition": {
          "all": [
            { "field": "stabilityScore", "operator": "lt", "value": 0.3 },
            { "field": "timeSinceReinforcement", "operator": "gt", "value": 172800 }
          ]
        }
      }
    ],
    "default_decision_type": "reinforce"
  }
}
```

**Response (404) — policy not found:**

```json
{
  "error": { "code": "policy_not_found", "message": "No policy 'admin' found for org 'springs'" }
}
```

---

## Requirements

### Functional

- [ ] `GET /v1/policies` returns all active policies for the org (summary: id, version, key, rule count, default type) plus routing config
- [ ] `GET /v1/policies/:policy_key` returns the full policy definition including rules and conditions
- [ ] Both endpoints are read-only — no mutations, no side effects
- [ ] Both endpoints require `org_id` and enforce API key → org isolation (same pattern as all `/v1/*` routes)
- [ ] Policies are loaded via `loadPolicyForContext` (respects DynamoDB `PoliciesTable` → bundled resolution per `policy-storage.md`; filesystem-only for local dev when configured)

### Acceptance Criteria

- Given org `springs` with learner + staff policies, when `GET /v1/policies?org_id=springs` is called, then both policies appear in the response with correct metadata
- Given org `springs`, when `GET /v1/policies/learner?org_id=springs` is called, then the full learner policy with all rules and conditions is returned
- Given org `springs`, when `GET /v1/policies/admin?org_id=springs` is called (no admin policy exists), then 404 with `policy_not_found` is returned
- Given `API_KEY` is set and no key is provided, when either endpoint is called, then 401 is returned (existing auth middleware)

---

## Constraints

- **Read-only** — these tenant-facing endpoints never modify policies. Write operations are handled by the Policy Management API ([`docs/specs/policy-management-api.md`](policy-management-api.md)) (admin key, separate routes).
- **Same auth model** — `x-api-key` header, org_id from key or query param, same as all `/v1/*` endpoints.
- **Listing vs. routing** — Policy summaries for `GET /v1/policies` come from `PoliciesTable` via `Query` on `org_id` (active items only; see Notes). The `routing` field in that response still comes from `loadRoutingConfigForOrg` (DynamoDB with bundled fallback per `policy-storage.md`), not from the policy query alone.

---

## Out of Scope

- `PUT /v1/policies` or `POST /v1/policies` on the tenant API — policy mutation uses admin routes in [`policy-management-api.md`](policy-management-api.md) instead
- Policy diff / version comparison
- Policy simulation ("what would this state produce under this policy?")
- Tenant-facing policy validation — operators use `POST /v1/admin/policies/validate` per [`policy-management-api.md`](policy-management-api.md)

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `loadPolicyForContext(orgId, userType)` | `docs/specs/decision-engine.md` §4, `src/decision/policy-loader.ts` | **Complete** |
| `loadRoutingConfigForOrg(orgId)` | `src/decision/policy-loader.ts` | **Complete** |
| `PolicyDefinition` type | `src/shared/types.ts` | **Complete** |
| DynamoDB `PoliciesTable` (read path) | [`docs/specs/policy-storage.md`](policy-storage.md) | Spec'd |
| API key middleware | `docs/specs/api-key-middleware.md` | **Complete** |
| Lambda handler for inspect routes | `docs/specs/aws-deployment.md` (TASK-014: `InspectFunction`) | Spec'd |
| Policy writes (not used by this spec) | [`docs/specs/policy-management-api.md`](policy-management-api.md) | Spec'd |

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| Policy visibility for pilot customers | Pilot Integration Guide, Inspection Panels (future Panel 5) |
| Policy metadata API | Future: policy management dashboard |
| Read-only complement to admin writes | [`policy-management-api.md`](policy-management-api.md) — customers inspect; operators mutate via admin API |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `policy_not_found` | Decision Engine — no policy for the given org + policy_key |
| `missing_required_field` | Validation — `org_id` not provided |
| `api_key_required` / `api_key_invalid` | Auth middleware |

### New

No new error codes. All error cases map to existing codes.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| POL-API-001 | List policies for org with routing | `GET /v1/policies?org_id=springs` | 200, policies array with learner + staff, routing config |
| POL-API-002 | List policies for org without routing (default only) | `GET /v1/policies?org_id=unknown-org` | 200, policies array with default policy only, no routing |
| POL-API-003 | Get full policy by key | `GET /v1/policies/learner?org_id=springs` | 200, full policy with rules and conditions |
| POL-API-004 | Get policy — not found | `GET /v1/policies/admin?org_id=springs` | 404, `policy_not_found` |
| POL-API-005 | Auth required | `GET /v1/policies` without `x-api-key` (when API_KEY set) | 401 |

> **Test strategy:** POL-API-001 through POL-API-004 are integration tests (Fastify inject, same pattern as `tests/integration/`). POL-API-005 reuses existing auth middleware test pattern.

---

## Notes

- **Listing policies.** Org policy summaries are read from `PoliciesTable` via `QueryCommand` on the `org_id` partition key (HASH), not a filesystem or S3 scan. Items with `status !== "active"` are omitted from the list (same behavior as resolution in `policy-storage.md`). The `routing` object in the list response is assembled from org routing config (`loadRoutingConfigForOrg`), which may be empty or default-only when no config exists (see contract test POL-API-002).
- **Lambda handler routing:** These two endpoints are added to the `InspectFunction` Lambda (same read-path group). Route on `event.path`: `/v1/policies` (list) vs. `/v1/policies/{key}` (detail).
- **Panels integration (future):** A Panel 5 (Policy Viewer) could consume these endpoints to show active rules and thresholds. Not in scope for this spec.

---

*Spec created: 2026-03-09 | Last updated: 2026-03-27 | Depends on: decision-engine.md, policy-storage.md, api-key-middleware.md, aws-deployment.md; related: policy-management-api.md*
