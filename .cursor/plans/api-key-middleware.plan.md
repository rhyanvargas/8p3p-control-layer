---
name: API Key Middleware
overview: "Implement minimal API key middleware for v1 pilot: Fastify preHandler that validates x-api-key header on /v1/*, optionally overrides org_id from API_KEY_ORG_ID, uses constant-time comparison, and disables when API_KEY env is unset. Closes open-endpoint security objection without full tenant provisioning."
todos:
  - id: TASK-001
    content: Add API_KEY_REQUIRED and API_KEY_INVALID to src/shared/error-codes.ts
    status: pending
  - id: TASK-002
    content: Create src/auth/api-key-middleware.ts with preHandler logic
    status: pending
  - id: TASK-003
    content: Register api-key preHandler in server.ts v1 scope
    status: pending
  - id: TASK-004
    content: Update docs/api/openapi.yaml with securitySchemes and 401 responses
    status: pending
  - id: TASK-005
    content: Unit tests for middleware (validateKey, org override, disabled)
    status: pending
  - id: TASK-006
    content: Contract tests AUTH-001 through AUTH-007
    status: pending
  - id: TASK-007
    content: Regression check — all tests pass, existing tests unaffected
    status: pending
isProject: false
---

# API Key Middleware

**Spec**: `docs/specs/api-key-middleware.md`

## Prerequisites

- [ ] No lint or type errors
- [ ] All existing tests pass
- [ ] `docs/specs/api-key-middleware.md` reviewed and approved

## Tasks

### TASK-001: Add API_KEY_REQUIRED and API_KEY_INVALID to error-codes.ts

- **Status**: pending
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
  Add two new error codes following existing convention (`UPPER_SNAKE: 'lower_snake'`):

  ```typescript
  // ==========================================================================
  // API Key Middleware (v1 pilot)
  // ==========================================================================

  /** API key header missing */
  API_KEY_REQUIRED: 'api_key_required',

  /** API key does not match */
  API_KEY_INVALID: 'api_key_invalid',
  ```

- **Verification**: `npm run build` succeeds; `ErrorCode` type includes new values.

---

### TASK-002: Create src/auth/api-key-middleware.ts

- **Status**: pending
- **Files**: `src/auth/api-key-middleware.ts`
- **Action**: Create
- **Depends on**: TASK-001
- **Details**:
  Create Fastify preHandler that:
  1. Reads `API_KEY` and `API_KEY_ORG_ID` from `process.env`
  2. If `API_KEY` is unset or empty: call `done()` immediately (no-op)
  3. If `API_KEY` is set:
     - Read `x-api-key` header (case-insensitive per HTTP)
     - If missing: reply 401 with `{ code: 'api_key_required', message: '...' }`, return
     - If present: compare with `API_KEY` using `crypto.timingSafeEqual()`. Must pad to same length (Buffer) before comparison to avoid length-leak; treat length mismatch as invalid.
     - If invalid: reply 401 with `{ code: 'api_key_invalid', message: '...' }`, return
  4. If valid and `API_KEY_ORG_ID` is set:
     - For POST (body): override `request.body.org_id` with `API_KEY_ORG_ID`
     - For GET (query): override `request.query.org_id` with `API_KEY_ORG_ID`
  5. Call `done()` to proceed

  **Constant-time comparison**: Use `crypto.timingSafeEqual(a, b)` where `a` and `b` are Buffers of equal length. If lengths differ, treat as invalid (do not compare).

  **Export**: `export function apiKeyPreHandler(request, reply, done): void`

- **Verification**: `npm run build` succeeds; middleware compiles.

---

### TASK-003: Register api-key preHandler in server.ts v1 scope

- **Status**: pending
- **Files**: `src/server.ts`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
  - Import `apiKeyPreHandler` from `./auth/api-key-middleware.js`
  - Inside the `server.register(async (v1) => { ... }, { prefix: '/v1' })` callback, add `v1.addHook('preHandler', apiKeyPreHandler)` **before** route registration
  - Order: preHandler runs first, then `registerIngestionRoutes`, `registerSignalLogRoutes`, `registerDecisionRoutes`

  Exempt routes (`/`, `/health`, `/docs`, `/docs/*`) are registered outside the `/v1` scope, so they never hit this hook.

- **Verification**: `npm run build` succeeds; server starts without error.

---

### TASK-004: Update docs/api/openapi.yaml

- **Status**: pending
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Depends on**: none (can run in parallel with TASK-002)
- **Details**:
  1. Add `securitySchemes` under `components`:
     ```yaml
     components:
       securitySchemes:
         ApiKeyAuth:
           type: apiKey
           in: header
           name: x-api-key
           description: API key for pilot access (required when API_KEY env is set)
     ```
  2. Update top-level `security` from `[]` to `[ApiKeyAuth: []]` and add a note in `info.description` that auth is env-dependent (disabled when `API_KEY` unset)
  3. Add 401 response to `POST /v1/signals`, `GET /v1/signals`, `GET /v1/decisions`:
     ```yaml
     '401':
       description: Unauthorized (missing or invalid API key)
       content:
         application/json:
           schema:
             type: object
             properties:
               code:
                 type: string
                 enum: [api_key_required, api_key_invalid]
               message:
                 type: string
     ```

- **Verification**: `npm run validate:api` passes; `npm run validate:contracts` passes if applicable.

---

### TASK-005: Unit tests for middleware

- **Status**: pending
- **Files**: `tests/unit/api-key-middleware.test.ts`
- **Action**: Create
- **Depends on**: TASK-002
- **Details**:
  Create unit tests that spin up a minimal Fastify app with the middleware and `/v1/signals` (or a stub route). Use `process.env` manipulation with `beforeEach`/`afterEach` to restore. Cover:
  - Valid key, request proceeds
  - Missing key → 401, `api_key_required`
  - Invalid key → 401, `api_key_invalid`
  - `API_KEY` unset → request proceeds (no 401)
  - Org override: when `API_KEY_ORG_ID` set, body/query `org_id` is overridden before handler
  - Constant-time: ensure `crypto.timingSafeEqual` is used (inspect or mock)

- **Verification**: `npm test -- tests/unit/api-key-middleware.test.ts` passes.

---

### TASK-006: Contract tests AUTH-001 through AUTH-007

- **Status**: pending
- **Files**: `tests/contracts/api-key-middleware.test.ts`
- **Action**: Create
- **Depends on**: TASK-003
- **Details**:
  Create contract test file following `tests/contracts/signal-ingestion.test.ts` pattern. Use Fastify `app.inject()`, full store init (idempotency, signal log, state, decision), and `registerIngestionRoutes`, `registerSignalLogRoutes`, `registerDecisionRoutes`. Add `apiKeyPreHandler` to v1 scope. For exempt routes (AUTH-006, AUTH-007), register `GET /health` and `GET /docs` (or a stub) outside `/v1` so they never hit the middleware.

  | Test ID | Scenario | Env | Request | Expected |
  |---------|----------|-----|---------|----------|
  | AUTH-001 | Valid key, org override | API_KEY=key1, API_KEY_ORG_ID=org_pilot1 | POST /v1/signals, x-api-key: key1, body org_id: org_other | 200, response org_id: org_pilot1 |
  | AUTH-002 | Valid key, no org override | API_KEY=key1, API_KEY_ORG_ID unset | POST /v1/signals, x-api-key: key1, body org_id: org_pilot1 | 200, response org_id: org_pilot1 |
  | AUTH-003 | Missing key rejected | API_KEY=key1 | POST /v1/signals, no x-api-key | 401, code: api_key_required |
  | AUTH-004 | Invalid key rejected | API_KEY=key1 | POST /v1/signals, x-api-key: wrong | 401, code: api_key_invalid |
  | AUTH-005 | Auth disabled | API_KEY unset | POST /v1/signals, no key | 200 or 400 (no 401) |
  | AUTH-006 | Exempt /health | API_KEY=key1 | GET /health, no key | 200 |
  | AUTH-007 | Exempt /docs | API_KEY=key1 | GET /docs, no key | 200 or 302 |

  Use `beforeEach` to set env, `afterEach` to restore. Ensure test isolation.

- **Verification**: `npm test -- tests/contracts/api-key-middleware.test.ts` passes; all 7 scenarios covered.

---

### TASK-007: Regression check

- **Status**: pending
- **Files**: N/A
- **Action**: Verify
- **Depends on**: TASK-001 through TASK-006
- **Details**:
  - Run full test suite with `API_KEY` unset (default): all existing tests must pass
  - Run `npm run check` (build, validate, lint, test)
  - Confirm no regressions in signal-ingestion, signal-log, decision-engine, state-engine, e2e tests

- **Verification**: `npm run check` passes; test count unchanged or increased (new auth tests only).

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/auth/api-key-middleware.ts` | TASK-002 | Fastify preHandler: validate key, override org_id |
| `tests/unit/api-key-middleware.test.ts` | TASK-005 | Unit tests for middleware logic |
| `tests/contracts/api-key-middleware.test.ts` | TASK-006 | Contract tests AUTH-001 through AUTH-007 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | Add API_KEY_REQUIRED, API_KEY_INVALID |
| `src/server.ts` | TASK-003 | Register apiKeyPreHandler on v1 scope |
| `docs/api/openapi.yaml` | TASK-004 | securitySchemes, security, 401 responses |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| AUTH-001 | contract | Valid key, org override on POST /v1/signals | TASK-006 |
| AUTH-002 | contract | Valid key, no org override | TASK-006 |
| AUTH-003 | contract | Missing key → 401 api_key_required | TASK-006 |
| AUTH-004 | contract | Invalid key → 401 api_key_invalid | TASK-006 |
| AUTH-005 | contract | Auth disabled when API_KEY unset | TASK-006 |
| AUTH-006 | contract | Exempt route GET /health | TASK-006 |
| AUTH-007 | contract | Exempt route GET /docs | TASK-006 |
| (unit) | unit | Middleware validateKey, org override, disabled | TASK-005 |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing tests fail when API_KEY required | High | Middleware no-ops when API_KEY unset; default env has it unset |
| process.env mutation in parallel tests | Medium | Use beforeEach/afterEach to save/restore; run auth contract tests in same file sequentially |
| timingSafeEqual length mismatch | Low | Pad both values to same length before compare; length mismatch → invalid |
| GET /docs returns 302 redirect | Low | AUTH-007 accepts 200 or redirect; assert status in [200, 302] |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] OpenAPI valid (`npm run validate:api`)
- [ ] Matches spec requirements
- [ ] Existing 343+ tests still pass

---

## Implementation Order

```
TASK-001 ──┬──► TASK-002 ──► TASK-003 ──► TASK-005 ──► TASK-006 ──► TASK-007
           │         │
TASK-004 ──┘         └─────────────────────────────────────────────────────┘
```

(TASK-004 can run in parallel with TASK-002; TASK-005 and TASK-006 depend on middleware + server registration.)
