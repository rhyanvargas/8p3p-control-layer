# Tenant Provisioning Specification

> API key issuance, tenant onboarding, and key-to-org mapping using API Gateway-native usage plans. Required for paid pilot access.

## Overview

Today, the control layer has no authentication. Any caller can pass any `org_id` and access any tenant's data. This is acceptable for local development but blocks paid pilots — enterprise customers need (a) a secure API key, (b) rate limits, and (c) assurance that their data is isolated.

This spec defines a minimal tenant provisioning system using **API Gateway-native API keys and usage plans** (Option A from the pilot readiness assessment). This approach keeps authentication at the infrastructure layer, requires zero changes to the core pipeline business logic, and is the lowest-effort path to pilot-ready access control.

**What this is:** A registration + key management system for pilot customers.
**What this is not:** A full identity platform, RBAC system, or self-serve portal. Those are deferred.

---

## Architecture

```
┌─────────────────┐
│  Pilot Customer  │
│  (has API key)   │
└────────┬────────┘
         │ x-api-key: pk_abc123...
         ▼
┌──────────────────────────────────────────────────┐
│              API Gateway (REST API)               │
│                                                   │
│  1. Validate API key (built-in)                  │
│  2. Look up usage plan → apply rate limits       │
│  3. Inject org_id into request context           │
│     (via request mapping template)               │
│  4. Forward to Lambda                            │
└──────────────────┬───────────────────────────────┘
                   │  event.requestContext.identity.apiKey
                   │  + mapped org_id
                   ▼
┌──────────────────────────────────────────────────┐
│                Lambda Function                    │
│                                                   │
│  1. Extract org_id from API Gateway context      │
│  2. Override any org_id in request body/params   │
│     (caller cannot impersonate another org)       │
│  3. Process normally                             │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Key validation | API Gateway built-in | Zero custom code. Gateway rejects invalid keys before Lambda runs. $0 per validation. |
| Rate limiting | API Gateway usage plans | Per-key throttle (burst + rate) and monthly quota. No custom rate limiter needed. |
| Key → org_id mapping | DynamoDB lookup table + API Gateway mapping | API key identifies the tenant; a thin mapping resolves it to `org_id`. This prevents callers from self-declaring their org. |
| Tenant registration | CLI tool + DynamoDB | Manual for Phase 1 (solo dev provisions pilots). Self-serve portal is out of scope. |
| Key format | API Gateway default (40-char alphanum) | Standard, secure, no custom key generation needed. |

---

## Tenant Lifecycle

### 1. Registration (Manual — Phase 1)

A solo dev registers a new pilot customer via a CLI command:

```bash
npx tsx scripts/provision-tenant.ts \
  --org-id "org_acme" \
  --name "Acme Learning" \
  --contact "cto@acme.com" \
  --plan "pilot"
```

This command:
1. Creates a tenant record in DynamoDB (`tenants` table)
2. Creates an API Gateway API key via AWS SDK
3. Creates or assigns a usage plan (pilot-tier rate limits)
4. Associates the API key with the usage plan
5. Stores the key → org_id mapping in DynamoDB (`api_keys` table)
6. Outputs the API key to stdout (shown once, never stored in plaintext after this)

### 2. Key Distribution

The API key is communicated to the pilot customer via a secure channel (encrypted email, shared vault, etc.). The key is a bearer credential — anyone with the key can make API calls as that org.

### 3. Active Use

Every API request includes the key:

```bash
curl -H "x-api-key: pk_abc123..." \
  https://api.8p3p.dev/v1/signals \
  -d '{"org_id": "org_acme", ...}'
```

API Gateway validates the key, resolves it to an org_id, and Lambda enforces that the request's `org_id` matches the key's org. Mismatches are rejected.

### 4. Rotation

When a key needs to be rotated (compromised, scheduled rotation, customer request):

```bash
npx tsx scripts/rotate-key.ts --org-id "org_acme"
```

This:
1. Creates a new API Gateway API key
2. Associates it with the same usage plan
3. Updates the `api_keys` table mapping
4. Marks the old key as `deprecated` (still valid for a grace period)
5. After the grace period, disables the old key

### 5. Revocation

```bash
npx tsx scripts/revoke-key.ts --org-id "org_acme" --key-id "abc123"
```

Disables the API key in API Gateway immediately. Removes the mapping from `api_keys` table.

---

## Data Schemas

### Tenant Record

```json
{
  "org_id": "string",
  "name": "string",
  "contact_email": "string",
  "plan": "pilot | enterprise",
  "status": "active | suspended | deprovisioned",
  "created_at": "string (RFC3339)",
  "updated_at": "string (RFC3339)"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `org_id` | string | Primary key. Must match the `org_id` used in all API calls. 1–128 chars, same constraints as signal ingestion. |
| `name` | string | Display name for the organization |
| `contact_email` | string | Primary contact email |
| `plan` | string | Tier: `pilot` or `enterprise` (determines rate limits) |
| `status` | string | `active` (can use API), `suspended` (key disabled), `deprovisioned` (data retained, no access) |
| `created_at` | string | When the tenant was provisioned (RFC3339) |
| `updated_at` | string | Last status change (RFC3339) |

### API Key Record

```json
{
  "api_key_id": "string",
  "org_id": "string",
  "key_prefix": "string",
  "status": "active | deprecated | revoked",
  "created_at": "string (RFC3339)",
  "expires_at": "string (RFC3339) | null",
  "revoked_at": "string (RFC3339) | null"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `api_key_id` | string | API Gateway key ID (not the key value — the value is never stored) |
| `org_id` | string | The tenant this key belongs to. This is the mapping that resolves key → org. |
| `key_prefix` | string | First 8 characters of the key, for identification in logs without exposing the full key |
| `status` | string | `active`, `deprecated` (grace period), or `revoked` |
| `created_at` | string | When this key was created |
| `expires_at` | string or null | Optional expiry. Null = no auto-expiry. |
| `revoked_at` | string or null | When the key was revoked, if applicable |

### DynamoDB Table Design

**Tenants Table:**

| Attribute | Role |
|-----------|------|
| PK | `org_id` |

Simple key-value lookup. One item per tenant.

**API Keys Table:**

| Attribute | Role |
|-----------|------|
| PK | `api_key_id` |
| GSI1 PK | `org_id` |
| GSI1 SK | `created_at` |

Primary access pattern: look up org_id by api_key_id (on every request).
Secondary: list all keys for an org (for management/rotation).

---

## Org Enforcement in Lambda

The critical security property: **a valid API key can only access data for its own org.** This is enforced in the Lambda handler layer, not in business logic:

```typescript
function extractOrgFromContext(event: APIGatewayProxyEvent): string {
  const apiKeyId = event.requestContext.identity?.apiKeyId;
  if (!apiKeyId) throw new AuthError('missing_api_key');

  const keyRecord = await apiKeysTable.get(apiKeyId);
  if (!keyRecord || keyRecord.status !== 'active') throw new AuthError('invalid_api_key');

  return keyRecord.org_id;
}
```

The Lambda handler:
1. Extracts `api_key_id` from the API Gateway event context
2. Looks up the `org_id` in the `api_keys` table
3. **Overrides** any `org_id` provided in the request body or query params
4. Passes the verified `org_id` to the business logic

This means: even if a caller sends `"org_id": "org_someone_else"`, the system uses the org_id bound to their API key. The caller's self-declared org_id is ignored.

### Caching

The api_key_id → org_id lookup happens on every request. To avoid a DynamoDB read per request:
- Cache the mapping in Lambda memory (warm instances)
- TTL: 5 minutes (balances freshness with cost)
- Invalidation: key revocation clears the cache entry (best-effort; worst case, revocation takes effect within 5 minutes)

---

## Usage Plans (Rate Limits)

| Plan | Burst | Rate (req/sec) | Monthly Quota | Purpose |
|------|-------|----------------|---------------|---------|
| `pilot` | 20 | 10 | 100,000 | Pilot customers: enough for integration testing + moderate production use |
| `enterprise` | 100 | 50 | 1,000,000 | Enterprise customers: production-grade throughput |
| `internal` | 200 | 100 | Unlimited | 8P3P internal use (demos, testing) |

These are enforced at the API Gateway level — zero Lambda code required. When a customer exceeds their rate limit, API Gateway returns 429 Too Many Requests before Lambda is invoked.

> **Future plan (not yet enabled).** An `evaluation` plan value is anticipated for the controlled-data-evaluation flow described in `internal-docs/Proposal for Controlled Data Evaluation.pdf`. When a signed evaluation engagement lands, we add the enum value, rate limits (likely `pilot`-equivalent), and the mode-aware branch in `ProgramMetricsService.computeReport` in one scoped PR. See `.cursor/plans/pilot-evidence-prep.plan.md` § Decisions D-001 for the defer-until-signal rationale.

---

## Requirements

### Functional

- [ ] Provision tenant CLI creates tenant record in DynamoDB
- [ ] Provision tenant CLI creates API Gateway API key and usage plan association
- [ ] Provision tenant CLI outputs the API key value (shown once)
- [ ] API key → org_id mapping is stored in DynamoDB
- [ ] API Gateway rejects requests without a valid `x-api-key` header (403)
- [ ] Lambda handler extracts org_id from API key mapping, not from request body/params
- [ ] Caller cannot access data outside their org (even if they specify a different org_id)
- [ ] Key rotation creates a new key and deprecates the old one with a grace period
- [ ] Key revocation disables the key immediately
- [ ] Usage plans enforce rate limits and monthly quotas
- [ ] `GET /health` does not require an API key

### Acceptance Criteria

- Given a provisioned tenant with API key, when they call `POST /v1/signals` with the key, then the signal is accepted and stored under their org_id
- Given a valid API key for org_acme, when they call `GET /v1/decisions` with `org_id=org_other`, then the response contains only org_acme decisions (org_id is overridden from key)
- Given no API key in the request, when any `/v1/*` endpoint is called, then API Gateway returns 403 before Lambda is invoked
- Given a revoked API key, when it is used in a request, then API Gateway returns 403
- Given a pilot-tier key at rate limit, when a burst of requests is sent, then API Gateway returns 429 for excess requests

---

## Constraints

- **No self-serve registration** — tenants are provisioned manually via CLI (Phase 1)
- **No key value storage** — the full API key value is shown once at creation and never stored. Only the key ID and prefix are persisted.
- **No custom authorizer Lambda** — API Gateway built-in key validation is sufficient. Custom authorizer adds cold-start latency and cost.
- **No JWT/OAuth** — API keys are the simplest auth mechanism for machine-to-machine pilot integrations. JWT/OAuth is deferred to production.
- **Admin API is separate** — tenant lifecycle (provision, rotate keys) remains CLI or operator tooling for v1.1. **Policy** and **field-mapping** configuration for tenants is handled by the Policy Management API and mapping admin API (`docs/specs/policy-management-api.md`, `docs/specs/tenant-field-mappings.md`), authenticated with `ADMIN_API_KEY`, not tenant keys.
- **Org override, not trust** — the system never trusts the caller's self-declared org_id. The API key is the source of truth.

---

## Out of Scope

- Self-serve tenant registration portal
- JWT / OAuth / OIDC authentication
- Multi-key per tenant (Phase 1: one active key per tenant)
- Per-endpoint permissions (all keys have access to all endpoints for their org)
- Key encryption at rest (API Gateway manages key lifecycle)
- Webhook notifications for key events
- Billing/invoicing integration
- Tenant data export or deletion (GDPR compliance)

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| API Gateway deployment | `docs/specs/aws-deployment.md` | Spec'd — AWS CDK (not yet implemented) |
| DynamoDB tables (tenants, api_keys, policies, field_mappings) | `docs/specs/aws-deployment.md` | Spec'd (not yet implemented) |
| Lambda handler layer | `docs/specs/aws-deployment.md` | Spec'd (not yet implemented) |

### Provides to Other Specs

| Capability | Used By |
|-----------|---------|
| API key validation (API Gateway) | All `/v1/*` endpoints |
| org_id resolution (key → org) | Lambda handler layer |
| Usage plans / rate limiting | API Gateway |
| Tenant records | Future: inspection panels (tenant selector) |

---

## Error Codes

### API Gateway Errors (no Lambda invocation)

| HTTP Status | Condition | Body |
|-------------|-----------|------|
| 403 | Missing `x-api-key` header | `{"message": "Forbidden"}` |
| 403 | Invalid or revoked API key | `{"message": "Forbidden"}` |
| 429 | Rate limit exceeded | `{"message": "Rate exceeded"}` |

### Application Errors (Lambda)

| Code | Description |
|------|-------------|
| `org_key_mismatch` | API key's org_id does not match an org_id specified in request context (informational — the system overrides, doesn't reject) |
| `tenant_not_found` | org_id from key maps to a non-existent or deprovisioned tenant |
| `tenant_suspended` | Tenant exists but has been suspended |

---

## CLI Tools

### `scripts/provision-tenant.ts`

```bash
npx tsx scripts/provision-tenant.ts \
  --org-id "org_acme" \
  --name "Acme Learning" \
  --contact "cto@acme.com" \
  --plan "pilot"
```

**Output:**
```
✓ Tenant created: org_acme (Acme Learning)
✓ API key created: pk_a1b2c3d4...  (SAVE THIS — it will not be shown again)
✓ Usage plan: pilot (10 req/s, 100K/month)
✓ Key ID: abc123def456 (for management reference)
```

### `scripts/rotate-key.ts`

```bash
npx tsx scripts/rotate-key.ts --org-id "org_acme" [--grace-days 7]
```

### `scripts/revoke-key.ts`

```bash
npx tsx scripts/revoke-key.ts --org-id "org_acme" --key-id "abc123def456"
```

### `scripts/list-tenants.ts`

```bash
npx tsx scripts/list-tenants.ts
```

**Output:**
```
org_id        name             plan      status   keys  created
org_acme      Acme Learning    pilot     active   1     2026-03-01
org_beta      Beta EdTech      pilot     active   1     2026-03-05
```

---

## File Structure

```
scripts/
├── provision-tenant.ts          # Create tenant + API key
├── rotate-key.ts                # Rotate API key for a tenant
├── revoke-key.ts                # Revoke an API key
└── list-tenants.ts              # List all tenants

src/
├── tenants/
│   ├── tenant-store.ts          # DynamoDB tenant CRUD
│   ├── key-store.ts             # DynamoDB API key mapping CRUD
│   └── types.ts                 # Tenant, ApiKeyRecord types
└── lambda/
    └── middleware/
        └── org-resolver.ts      # Extract org_id from API key context

infra/
└── template.yaml                # Updated: tenants + api_keys tables, usage plans
```

---

## Success Criteria

Implementation is complete when:

- [ ] `provision-tenant.ts` creates a tenant and API key end-to-end
- [ ] API Gateway rejects keyless requests with 403
- [ ] API Gateway validates keys and applies usage plan rate limits
- [ ] Lambda resolves org_id from API key (not from request body)
- [ ] A pilot customer's key cannot access another org's data
- [ ] `rotate-key.ts` creates a new key and deprecates the old
- [ ] `revoke-key.ts` immediately disables a key
- [ ] `list-tenants.ts` shows all provisioned tenants
- [ ] All existing contract tests still pass (auth is additive, not breaking)
- [ ] At least one test verifies org isolation via API key enforcement

---

## Pilot Onboarding Checklist

When a new pilot customer is ready to onboard:

1. [ ] Run `provision-tenant.ts` with their org details
2. [ ] Securely share the API key with the customer
3. [ ] Provide API documentation URL (`https://api.8p3p.dev/docs`)
4. [ ] Provide quick-start integration guide (signal format, endpoint URLs)
5. [ ] Verify first signal arrives via Panel 1 (Signal Intake)
6. [ ] Confirm decisions are generated via Panel 3 (Decision Stream)

---

## Notes

- **Why API Gateway keys, not custom auth?** API Gateway API keys are validated at the edge with zero Lambda invocation cost. Custom authorizer Lambdas add ~50ms latency and per-invocation cost. For pilot-phase M2M access, native keys are the optimal tradeoff.
- **Why override org_id instead of rejecting mismatches?** Rejecting mismatches leaks information ("this org_id exists"). Overriding silently ensures the caller only ever sees their own data, regardless of what they request.
- **Key prefix for logging:** Storing the first 8 characters of the key allows identifying which key was used in logs without exposing the full credential. This is standard practice (Stripe uses `sk_live_...`, AWS uses `AKIA...`).

---

## Next Steps

1. Deploy AWS infrastructure first (`docs/specs/aws-deployment.md`)
2. Run `/plan-impl docs/specs/tenant-provisioning.md` to create the implementation plan
3. Provision the first internal tenant for demo purposes
4. Provision first pilot customer

---

*Spec created: 2026-02-19 | Depends on: aws-deployment.md*
