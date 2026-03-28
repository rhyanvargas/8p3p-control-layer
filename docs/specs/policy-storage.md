# Policy Storage for AWS

> DynamoDB-backed policy storage so policies can be created, updated, and disabled independently of code deploys.

## Overview

Policy JSON files currently live on disk at `src/decision/policies/{orgId}/{userType}.json` and are loaded via `fs.readFileSync` in `policy-loader.ts`. This works locally but fails on AWS Lambda — policies are baked into the deployment package, so changing a threshold means a full redeploy. This spec introduces DynamoDB-backed policy storage (`PoliciesTable`) so policies can be written, cached, and updated independently of code deploys.

**Key principle:** `policy-loader.ts` already has a clean resolution chain (`loadPolicyForContext`). This spec adds a DynamoDB read ahead of the filesystem read, with in-memory caching and TTL. Zero changes to the policy evaluation engine or decision logic.

**Policy status:** Each policy record carries a `status` field (`active | disabled`). The resolution chain skips disabled policies and falls through to the next candidate. A disabled org-level policy falls back to the global default; a disabled global default falls back to the bundled failsafe. Toggled via `PATCH /v1/admin/policies/:org_id/:policy_key` (see `docs/specs/policy-management-api.md`).

---

## Access Patterns

Derived from [First steps for modeling relational data in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html): *"You shouldn't start designing your schema until you know the questions that it needs to answer."*

| # | Access Pattern | DynamoDB Operation | Key Expression |
|---|---------------|--------------------|----------------|
| 1 | Get policy for one org + policy_key | `GetItem` | `PK=org_id, SK=policy_key` |
| 2 | List all policies for one org | `Query` | `PK=org_id` |
| 3 | Resolution chain: org+userType → org+default → global default | 3× `GetItem` in order; skip item if `status !== "active"` | `PK=org_id SK=userType`, `PK=org_id SK=default`, `PK=global SK=default` |
| 4 | Admin list across all orgs (operator only) | `Scan` | — (full table; acceptable for pilot, see Notes) |

The resolution chain uses individual `GetItem` calls (not `Query`) because lookup keys are known at call time and `GetItem` is cheaper and lower-latency than `Query` for single-item retrieval.

---

## Architecture

```
Policy Write Flow:
  PUT /v1/admin/policies/:org_id/:policy_key  (ADMIN_API_KEY required)
         │
         ▼
  AdminFunction Lambda → DynamoDB PutItem → PoliciesTable
         PK: org_id  │  SK: policy_key
         policy_json (Map)
         status: "active"
         policy_version: N
         updated_at / updated_by

Policy Read Flow (per signal):
  policy-loader.ts → GetItem(PK=org_id, SK=userType)  → skip if status != "active"
                   → GetItem(PK=org_id, SK=default)   → skip if status != "active"
                   → GetItem(PK=global, SK=default)   → skip if status != "active"
                   → bundled failsafe (fs.readFileSync)
```

### Resolution Order (updated)

```
1. DynamoDB: PoliciesTable / org_id={orgId} / policy_key={userType}   → skip if status != "active"
2. DynamoDB: PoliciesTable / org_id={orgId} / policy_key=default      → skip if status != "active"
3. DynamoDB: PoliciesTable / org_id=global / policy_key=default       → skip if status != "active"
4. Bundled:  src/decision/policies/default.json                       ← failsafe only
```

DynamoDB is the primary source; bundled files are a cold-start failsafe if DynamoDB is unreachable.

---

## Schema

Derived from the access patterns above. Reference: [Item sizes and formats](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.html) — 400 KB item limit; pilot policies are 1–5 KB.

### Key Schema

| Attribute | Type | Role | Notes |
|-----------|------|------|-------|
| `org_id` | String (S) | Partition key (PK) | e.g., `"springs"`, `"global"` |
| `policy_key` | String (S) | Sort key (SK) | e.g., `"learner"`, `"default"`, `"staff"` |

`org_id` as partition key is acceptable for pilot (low cardinality). Document that a GSI or composite key redesign may be needed if cross-org query volume grows. Reference: [Best practices for designing partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-uniform-load.html).

### Item Attributes

| Attribute | DynamoDB Type | Description |
|-----------|--------------|-------------|
| `policy_json` | Map (M) | Full `PolicyDefinition` as a native DynamoDB Map — avoids a JSON parse step on read and enables future `UpdateExpression` patches on nested attributes |
| `policy_version` | Number (N) | Monotonically incrementing integer; used for optimistic locking |
| `status` | String (S) | `"active"` or `"disabled"` — resolution chain skips items where `status !== "active"` |
| `updated_at` | String (S) | ISO 8601 timestamp of last write |
| `updated_by` | String (S) | API key prefix of the admin who last wrote this record |

### Example Item

```json
{
  "org_id": "springs",
  "policy_key": "learner",
  "policy_json": {
    "version": "1.0.0",
    "decisionType": "recommend_support",
    "rules": [
      { "field": "stabilityScore", "operator": "lt", "threshold": 0.4, "decision": "intervene" }
    ]
  },
  "policy_version": 3,
  "status": "active",
  "updated_at": "2026-03-28T12:00:00Z",
  "updated_by": "adm_key_..."
}
```

---

## Conditional Writes and Optimistic Locking

Spec must document the exact DynamoDB `ConditionExpression` patterns so implementers don't guess. Reference: [ConditionExpression](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html).

### PUT (create or replace)

The admin write path uses `PutItem` unconditionally by default. When the client sends an `If-Match: <version>` header, the write uses an optimistic lock:

```
ConditionExpression: attribute_not_exists(org_id) OR policy_version = :expected_version
ExpressionAttributeValues: { ":expected_version": <client-provided version> }
```

Without `If-Match`, the PUT is an unconditional overwrite (last-writer-wins for operator use cases).

### PATCH (status toggle)

`UpdateItem` with existence check — prevents silently creating a ghost record:

```
ConditionExpression: attribute_exists(org_id) AND attribute_exists(policy_key)
UpdateExpression: SET #status = :status, updated_at = :now, updated_by = :who
```

Returns 404 if the item does not exist (condition fails).

### DELETE (hard delete)

`DeleteItem` with existence check — makes 404 vs. 204 deterministic:

```
ConditionExpression: attribute_exists(org_id) AND attribute_exists(policy_key)
```

Returns 204 if deleted, 404 if not present.

### Resolution Read (status filter)

`GetItem` returns the full item; application code checks `status !== "active"` and skips to the next candidate. No `FilterExpression` on `GetItem` (single-item reads do not support FilterExpression). Disabled policy logging: emit a structured warning `{ event: "policy_skipped", org_id, policy_key, status }` so operators can detect accidental disables.

---

## Requirements

### Functional

- [ ] `loadPolicyForContext` reads policy JSON from DynamoDB (`GetItem`) before falling back to bundled files
- [ ] `loadRoutingConfigForOrg` reads routing JSON from DynamoDB before falling back to bundled files
- [ ] Resolution chain skips DynamoDB items where `status !== "active"` and falls through to next candidate
- [ ] Loaded policies are cached in Lambda memory with configurable TTL (default: 5 minutes)
- [ ] CDK stack includes `PoliciesTable` with Lambda read permissions granted to IngestFunction and InspectFunction
- [ ] AdminFunction receives read-write permissions on `PoliciesTable`
- [ ] Bundled `policies/default.json` remains as a failsafe when DynamoDB is unreachable or returns no active policy

### Acceptance Criteria

- Given a policy item in DynamoDB with `status: "active"` for org `springs` / `policy_key: "learner"`, when a signal arrives for org `springs`, then the DynamoDB policy (not bundled) is used for evaluation
- Given S3/DynamoDB is unreachable (simulated timeout), when a signal arrives, then the bundled default policy is used and the decision succeeds (degraded, not broken)
- Given a policy is cached in Lambda memory, when the TTL expires and a new request arrives, then the policy is re-fetched from DynamoDB
- Given a policy item in DynamoDB with `status: "disabled"` for org `springs`, when a signal arrives, then the resolution chain falls through to the next candidate (org default or global default)
- Given only a disabled global default exists in DynamoDB, when a signal arrives, then the bundled failsafe is used

---

## Constraints

- **Read-only from Lambda (non-admin paths)** — IngestFunction and InspectFunction only read from `PoliciesTable`; writes come exclusively from AdminFunction via the policy management API
- **Conditional writes** — all writes use `ConditionExpression` to enforce existence checks and optional optimistic locking (see above)
- **status field required** — all items must carry `status: "active" | "disabled"`; resolution chain must check this field on every candidate
- **No versioning** (Phase 1) — `policy_version` is for optimistic locking only; no history table. DynamoDB Streams-based audit trail is deferred.
- **Single table** — all orgs share `PoliciesTable`, isolated by `org_id` partition key

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|-------------|
| DynamoDB Streams audit trail | Not required for pilot; `updated_at` / `updated_by` fields provide basic auditability | Compliance requirement or policy revert request from customer |
| GSI on `status` for cross-org filtered list | Operator `GET /v1/admin/policies` uses a full `Scan`; acceptable at pilot org count. GSI on `status` would add write cost for minimal read benefit. | Cross-org filtered queries become a bottleneck |
| DynamoDB TTL on policy items | No expiry requirement for pilot | Time-limited policy activation (e.g., promo periods) |
| S3 versioning | Previously considered; superseded by DynamoDB + conditional writes | — |
| Customer self-service policy editing UI | Not required for pilot | Dashboard investment post-pilot |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| CDK stack (`infra/lib/control-layer-stack.ts`) | `docs/specs/aws-deployment.md` | Spec'd — TASK-001 |
| Lambda functions with env vars (`POLICIES_TABLE`) | `docs/specs/aws-deployment.md` | Spec'd — CDK environment block |
| `PolicyDefinition` type + validation | `docs/specs/decision-engine.md` §4.6 | **Complete** |
| `loadPolicyForContext` / `loadRoutingConfigForOrg` | `src/decision/policy-loader.ts` | **Complete** |
| AdminFunction Lambda (write path) | `docs/specs/policy-management-api.md` | Spec creation pending (TASK-004) |

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| DynamoDB `PoliciesTable` (read path) | Policy Inspection API (`GET /v1/policies`) |
| `PoliciesTable` CDK resource definition | AWS Deployment (`infra/lib/control-layer-stack.ts`) |
| Cache invalidation pattern | Future: EventBridge on DynamoDB Streams |
| `status` field semantics | Policy Management API (PATCH status endpoint) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `policy_not_found` | Decision Engine — no active policy for org+userType in DynamoDB or bundled files |
| `invalid_format` | Policy loader — JSON parse failure |
| `invalid_policy_version` | Policy loader — semver validation failure |
| `invalid_decision_type` | Policy loader — decision type not in closed set |

### New (add during implementation)

| Code | Description |
|------|-------------|
| `policy_dynamo_degraded` | DynamoDB read failed; fell back to bundled or cached policy (logged as warning, not returned to caller) |
| `policy_skipped_disabled` | Policy item found but `status === "disabled"`; fell through to next resolution candidate (logged as structured warning, not returned to caller) |

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| POL-S3-001 | DynamoDB policy loaded for org context | Insert active item in DynamoDB mock; send signal for that org | Decision uses DynamoDB policy (not bundled) |
| POL-S3-002 | DynamoDB fallback to bundled on read failure | DynamoDB mock returns error | Decision uses bundled default policy; `policy_dynamo_degraded` warning logged |
| POL-S3-003 | Cache TTL respected | Load policy, update DynamoDB item, wait for TTL | Re-fetched policy (with updates) used after TTL |
| POL-S3-004 | Invalid DynamoDB policy rejected gracefully | Insert malformed policy JSON as Map in DynamoDB mock | Previous cached policy used; `policy_dynamo_degraded` logged |
| POL-S3-005 | Routing config loaded from DynamoDB | Insert routing item in DynamoDB mock for org | Correct userType resolved from source_system |
| POL-S3-006 | Disabled policy skipped in resolution | Insert item with `status: "disabled"` as org-level candidate; insert active global default | Resolution uses global default; `policy_skipped_disabled` warning logged |

> **Test strategy:** POL-S3-001 through POL-S3-006 are unit tests against `policy-loader.ts` with mocked `@aws-sdk/client-dynamodb` client. No integration test against real DynamoDB needed for pilot.

---

## Notes

- **Why DynamoDB, not S3?** The admin write API (`PUT /v1/admin/policies`) requires conditional writes for optimistic locking and existence-check semantics. DynamoDB `ConditionExpression` provides this natively; S3 does not have conditional put semantics. DynamoDB also enables `status`-based soft disable without overwriting the policy JSON. S3 was appropriate for read-only policy storage; DynamoDB is the right fit now that policies are managed via API.
- **Cache strategy:** `Map<string, { policy: PolicyDefinition; loadedAt: number }>` keyed on `{orgId}:{policyKey}`. On request, check `Date.now() - loadedAt > TTL_MS`. If expired, fetch from DynamoDB asynchronously (non-blocking) and serve stale until fresh arrives. This prevents DynamoDB latency from impacting signal ingestion latency.
- **Env var:** `POLICIES_TABLE` — set in Lambda env vars via CDK stack. When unset (local dev), `loadPolicyForContext` falls back to filesystem (current behavior unchanged).
- **Partition key cardinality:** `org_id` as partition key is acceptable for pilot (low org count, admin-only writes, high read concentration on per-org requests). Document for future: if cross-org query patterns grow (e.g., batch processing across all orgs), consider a GSI or composite key redesign. Reference: [Best practices for designing partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-uniform-load.html).
- **policy_json as Map (M):** Storing as a native DynamoDB Map (not a JSON string) allows Lambda to read nested attributes directly without a parse step and enables future `UpdateExpression` patches on individual rule fields. Item size remains well under the 400 KB limit.

---

*Spec created: 2026-03-09 | Updated: 2026-03-28 (S3 → DynamoDB PoliciesTable; added status field, conditional writes, access patterns, POL-S3-006). Depends on: aws-deployment.md, decision-engine.md, policy-management-api.md*
