# API Key Middleware Specification

> Minimal access control for v1 pilot. Single key per deployment, env-configured. Prevents open-endpoint security objection without full tenant provisioning (v1.1).

## Overview

The control layer currently has no authentication. Any caller can pass any `org_id` and access any tenant's data. For a paid pilot, this creates a security objection that can block the deal — "you're running on open endpoints."

This spec defines a **minimal API key middleware** for v1: one key per deployment, configured via environment variables, checked on every request. When the key is valid, `org_id` is resolved server-side from the key's binding (single-tenant pilot = one org per deployment). This is not full tenant provisioning — no DynamoDB, no API Gateway, no CLI. Just enough to (a) close the open-endpoint objection, (b) enforce org scoping by key, and (c) keep the pilot environment controlled.

**What this is:** A Fastify preHandler hook that validates `x-api-key` and optionally overrides `org_id`.  
**What this is not:** Tenant provisioning, key rotation, rate limits, multi-tenant key management. Those are v1.1 (`docs/specs/tenant-provisioning.md`).

---

## Deployment Requirements (Pilot / Non-Local)

For any pilot environment reachable by a customer (or any shared environment with >1 org's data), the following are **required**:

- **`API_KEY` must be set** (auth enforced on `/v1/*`)
- **`API_KEY_ORG_ID` must be set** (org_id resolved server-side; caller cannot self-declare org)
- **One org per deployment**: a single running process must serve exactly one `org_id`

If you need multiple concurrent pilots in one environment, do **not** run v1 in “caller-provided org_id” mode. Use v1.1 tenant provisioning (`docs/specs/tenant-provisioning.md`) for key→org enforcement + rate limits.

---

## Requirements

### Functional

- [ ] Middleware validates `x-api-key` header on all `/v1/*` requests
- [ ] When `API_KEY` env var is set: requests without a valid key are rejected with 401
- [ ] When `API_KEY` env var is **not** set: middleware is disabled (local dev, backward compatible)
- [ ] Valid key = header value matches `API_KEY` (constant-time comparison)
- [ ] When `API_KEY_ORG_ID` is set: request `org_id` (body or query) is overridden with this value — caller cannot impersonate another org
- [ ] When `API_KEY_ORG_ID` is not set: org_id from request is used (**local dev / controlled testing only**). This mode does **not** prevent cross-org reads if multiple orgs exist in the same datastore.
- [ ] Exempt routes: `/`, `/health`, `/docs`, `/docs/*` — no key required
- [ ] Rejection response: 401, JSON body with `code` and `message` (matches existing error schema)

### Acceptance Criteria

- Given `API_KEY` is set and `API_KEY_ORG_ID=org_pilot1`, when a request includes `x-api-key: <correct_key>` and body has `org_id: org_other`, then the request is processed with `org_id: org_pilot1` (overridden)
- Given `API_KEY` is set, when a request has no `x-api-key` header, then response is 401 with `api_key_required`
- Given `API_KEY` is set, when a request has `x-api-key: wrong_value`, then response is 401 with `api_key_invalid`
- Given `API_KEY` is not set (or empty), when any request is made, then no auth check runs (existing behavior)
- Given a request to `GET /health`, when no key is provided, then response is 200 (exempt)

---

## Constraints

- **No key storage** — key value lives in env var only. No database, no file.
- **No key rotation** — changing the key requires env update and server restart.
- **Single key per process** — one deployment = one key. Multi-tenant key lookup is v1.1.
- **Constant-time comparison** — use `crypto.timingSafeEqual()` (or equivalent) to prevent timing attacks.
- **Org override, not reject** — when key is valid and `API_KEY_ORG_ID` is set, override `org_id` silently. Do not reject mismatches (avoids leaking org existence).

---

## Key Lifecycle (v1 — Manual)

v1 is fully manual. There is no self-service. 8P3P owns key generation, configuration, and distribution.

### Generation

8P3P generates a cryptographically random key:

```bash
openssl rand -hex 32
```

This produces a 64-character hex string. The key is never stored in a database — it exists only in the deployment environment and in the pilot customer's integration config.

### Configuration

8P3P sets the key in the deployment environment:

```bash
API_KEY=<generated_key>
API_KEY_ORG_ID=org_pilot1
```

Server restart required for the key to take effect.

### Distribution

8P3P shares the key with the pilot customer via a secure channel (encrypted email, shared password vault, or secure messaging). The key is shared once. The customer stores it in their integration system's config.

### Re-generation (Key Compromise or Scheduled Change)

If the key needs to change (compromised, customer request, or scheduled rotation):

1. 8P3P generates a new key (`openssl rand -hex 32`)
2. 8P3P updates the `API_KEY` env var in the deployment
3. 8P3P restarts the server — old key immediately stops working
4. 8P3P shares the new key with the pilot customer
5. Pilot customer updates their integration config

**Downtime:** Brief (server restart duration). There is no grace period — old key is invalid as soon as the new env is loaded. Coordinate the handoff with the pilot customer to minimize disruption. For a single-tenant pilot with low request volume, this is acceptable.

### Who Does What

| Action | Owner | Pilot Customer |
|--------|-------|----------------|
| Generate key | 8P3P | — |
| Configure env | 8P3P | — |
| Distribute key | 8P3P | Receives key |
| Store key in integration | — | Pilot Customer |
| Request re-generation | — | Pilot Customer (via email/Slack) |
| Execute re-generation | 8P3P | Updates their config |

### Migration to v1.1

v1.1 (`docs/specs/tenant-provisioning.md`) replaces this manual flow with:
- CLI-driven provisioning (`provision-tenant.ts`)
- API Gateway-managed keys with built-in rotation and grace periods
- DynamoDB key → org mapping
- Self-serve is still not in scope for v1.1 (CLI-only), but the process is automated and repeatable

**Tech debt:** The v1 middleware (`src/auth/api-key-middleware.ts`) is disposable. When v1.1 deploys to AWS, API Gateway handles key validation at the edge and the Fastify middleware is bypassed or removed. No code in this middleware carries forward — it is intentionally throwaway.

---

## Out of Scope

- API Gateway API keys (v1.1)
- DynamoDB key → org mapping (v1.1)
- Key rotation with grace period (v1.1)
- Self-serve key provisioning or regeneration
- Rate limiting (v1.1)
- Per-endpoint permissions (all keys have full access to their org)
- JWT / OAuth

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Fastify server, route registration | `src/server.ts` | Implemented ✓ |
| Request body/query shape (org_id) | `docs/specs/signal-ingestion.md`, `docs/specs/signal-log.md`, `docs/specs/decision-engine.md` | Defined ✓ |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Authenticated request context (org_id override) | All `/v1/*` handlers |
| 401 rejection for unauthenticated requests | API contract |

---

## Implementation

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | No | The expected API key value. If unset or empty, middleware is disabled. |
| `API_KEY_ORG_ID` | No | When set, overrides request `org_id` with this value. Caller cannot access another org. If unset, org_id from request is used (**local dev / controlled testing only**). |

**Pilot use — when to set `API_KEY_ORG_ID`:**

- **Set it** when the deployment is **one org per key**: the server forces all requests to that org; client-supplied `org_id` is ignored. Use for single-tenant pilot and when org must not be self-declared by the caller.
- **Leave unset** only for **local dev** or **controlled testing** with non-sensitive data. Do **not** use this mode for any shared environment or any environment where >1 org's data could exist.

### Header

| Header | Description |
|--------|-------------|
| `x-api-key` | Bearer-style API key. Must match `API_KEY` when auth is enabled. |

### Middleware Placement

- Register as Fastify `preHandler` hook on the `/v1` prefix (or on each v1 route group)
- Run **before** route handlers
- Exempt: `GET /`, `GET /health`, `GET /docs`, `GET /docs/*` (Swagger UI static assets)

### Org Override Behavior

When `API_KEY` is valid and `API_KEY_ORG_ID` is set:

1. **POST /v1/signals** — Override `request.body.org_id` with `API_KEY_ORG_ID` before handler runs
2. **GET /v1/signals** — Override query param `org_id` with `API_KEY_ORG_ID`
3. **GET /v1/decisions** — Override query param `org_id` with `API_KEY_ORG_ID`

Handlers receive the overridden value; they do not need to change. The override happens in the middleware before the request reaches the handler.

### Disabled Auth (Local Dev)

When `API_KEY` is unset or empty:
- Middleware does not run (or no-ops)
- All requests proceed as today — no 401
- Allows existing contract tests and local development without key configuration

---

## Error Codes

### New (add to `src/shared/error-codes.ts`)

| Code | Description | Trigger |
|------|-------------|---------|
| `api_key_required` | API key header missing | Request to protected route has no `x-api-key` |
| `api_key_invalid` | API key does not match | Request has `x-api-key` but value ≠ `API_KEY` |

### Response Format

Reuse existing error response pattern. Example:

```json
{
  "code": "api_key_required",
  "message": "API key required. Provide x-api-key header."
}
```

HTTP status: `401 Unauthorized`.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| AUTH-001 | Valid key, org override | `API_KEY` set, `API_KEY_ORG_ID=org_pilot1`, request with valid key, body `org_id: org_other` | Request processed with `org_id: org_pilot1` |
| AUTH-002 | Valid key, no org override | `API_KEY` set, `API_KEY_ORG_ID` unset, request with valid key, body `org_id: org_pilot1` | Request processed with `org_id: org_pilot1` (unchanged) |
| AUTH-003 | Missing key rejected | `API_KEY` set, request without `x-api-key` to `POST /v1/signals` | 401, `api_key_required` |
| AUTH-004 | Invalid key rejected | `API_KEY` set, request with wrong `x-api-key` to `POST /v1/signals` | 401, `api_key_invalid` |
| AUTH-005 | Auth disabled when API_KEY unset | `API_KEY` unset, request without key to `POST /v1/signals` | 200 (or 400 on validation) — no 401 |
| AUTH-006 | Exempt route: /health | `API_KEY` set, request without key to `GET /health` | 200 |
| AUTH-007 | Exempt route: /docs | `API_KEY` set, request without key to `GET /docs` | 200 (or redirect) |

> **Test strategy:** AUTH-001, AUTH-002 test the full request flow (signal ingestion or decisions) to verify org override. AUTH-003 through AUTH-007 test the middleware directly (unit or integration).

---

## File Structure

```
src/
├── auth/
│   ├── api-key-middleware.ts   # Fastify preHandler: validate key, override org_id
│   └── types.ts                # Optional: AuthContext type if needed
└── server.ts                   # Register middleware on /v1 prefix
```

---

## OpenAPI Update

Add to `docs/api/openapi.yaml`:

```yaml
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
      description: API key for pilot access (required when API_KEY env is set)

# Per-path or global (when auth enabled):
security:
  - ApiKeyAuth: []
```

Note: OpenAPI documents the contract. The actual enforcement is env-dependent (disabled when `API_KEY` unset). Document this in the API description.

---

## Success Criteria

Implementation is complete when:

- [ ] Middleware validates `x-api-key` on `/v1/*` when `API_KEY` is set
- [ ] 401 returned for missing or invalid key with correct error codes
- [ ] `API_KEY_ORG_ID` override works for signals, signal log query, decisions query
- [ ] `/`, `/health`, `/docs` exempt from auth
- [ ] Auth disabled when `API_KEY` unset (backward compatible)
- [ ] Constant-time key comparison used
- [ ] AUTH-001 through AUTH-007 contract tests pass
- [ ] Existing 343+ tests still pass (run with `API_KEY` unset or provide key in test setup)

---

## Notes

- **Why env var, not config file?** Env vars are standard for secrets in 12-factor apps. No file to accidentally commit. Easy to vary per environment.
- **Why is API_KEY_ORG_ID optional in code?** It preserves local-dev flexibility and backward compatibility. For pilot / non-local deployments, treat `API_KEY_ORG_ID` as **required** to prevent org_id impersonation.
- **Migration path:** v1.1 tenant provisioning replaces this middleware with API Gateway + Lambda org resolution. The middleware can be removed or bypassed when deployed to AWS.

---

## Reference Documents

| Document | Path | Relevance |
|----------|------|-----------|
| CTO Response — CEO Scope & Timeline | `docs/reports/2026-02-22-cto-response-ceo-scope-timeline.md` | Rationale for v1 API key scope |
| Pilot Readiness v1 | `docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md` | Artifact #8, Week 1 deliverable |
| Tenant Provisioning (v1.1) | `docs/specs/tenant-provisioning.md` | Full key management; supersedes this for v1.1 |

---

*Spec created: 2026-02-22 | Scope: v1 pilot only | Superseded by: tenant-provisioning.md (v1.1)*
