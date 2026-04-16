---
name: Dashboard Passphrase Gate
overview: |
  Session-based passphrase gate protecting /dashboard/* routes. Adds four files under src/auth/
  (session-cookie, login-rate-limiter, dashboard-login, dashboard-gate) and registers
  @fastify/cookie + @fastify/formbody plugins in src/server.ts. Gate is opt-in via
  DASHBOARD_ACCESS_CODE env var (unset = disabled, preserves local dev UX). Cookie is a
  stateless HMAC-SHA256 signed token carrying an expiry; no server-side session store.
  Rate limits login attempts to 5/IP/15min via in-memory Map. Serves an inline-styled,
  no-JS HTML login form. Pilot Wave 2 — FERPA-defensible access control for Decision Panel.
todos:
  - id: TASK-001
    content: Install @fastify/cookie and @fastify/formbody plugins
    status: pending
  - id: TASK-002
    content: Create src/auth/session-cookie.ts — sign/verify/clear HMAC-SHA256 cookie helpers
    status: pending
  - id: TASK-003
    content: Write tests/unit/session-cookie.test.ts — GATE-007, GATE-008, GATE-009
    status: pending
  - id: TASK-004
    content: Create src/auth/login-rate-limiter.ts — in-memory per-IP sliding-window limiter
    status: pending
  - id: TASK-005
    content: Create src/auth/dashboard-login.ts — GET/POST /dashboard/login + GET /dashboard/logout + inline HTML template
    status: pending
  - id: TASK-006
    content: Create src/auth/dashboard-gate.ts — preHandler hook for /dashboard/* session check
    status: pending
  - id: TASK-007
    content: Wire plugins and routes into src/server.ts in correct order (cookie → formbody → login routes → gate hook → static)
    status: pending
  - id: TASK-008
    content: Write tests/integration/dashboard-gate.test.ts — GATE-001..006, GATE-010, GATE-011
    status: pending
  - id: TASK-009
    content: Update .env.example + README env table with DASHBOARD_ACCESS_CODE, DASHBOARD_SESSION_TTL_HOURS, COOKIE_SECRET
    status: pending
isProject: false
---

# Dashboard Passphrase Gate

**Spec**: `docs/specs/dashboard-passphrase-gate.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Environment Variables

```
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHBOARD_ACCESS_CODE` | No | — | The passphrase value. When set, gate is active. When unset/empty, gate is disabled. |
| `DASHBOARD_SESSION_TTL_HOURS` | No | `8` | Session cookie lifetime in hours. |
| `COOKIE_SECRET` | Yes (when gate active) | — | Secret used to sign session cookies. Min 32 chars. Generate with `openssl rand -hex 32`. |
```

### From spec § Cookie Specification

```
| Attribute | Value | Rationale |
|-----------|-------|-----------|
| Name | `dp_session` | Scoped to `/dashboard` via `Path` attribute below. The `__Host-` prefix was considered but is incompatible with `Path=/dashboard` — browsers enforce that `__Host-` cookies MUST have `Path=/` and no `Domain`. Path-scoping to `/dashboard` is the higher-value property (cookie is not sent on `/v1/*` API calls), so the prefix is dropped. See § Implementation Notes for the future-hardening note. |
| Value | HMAC-SHA256 signature of `{ exp: <unix_timestamp> }` | Stateless — no server-side session store needed |
| `HttpOnly` | `true` | Not accessible via JavaScript — XSS cannot steal the cookie |
| `Secure` | `true` (production); `false` (localhost) | Only sent over HTTPS in production |
| `SameSite` | `Strict` | Not sent on cross-site requests — CSRF protection |
| `Path` | `/dashboard` | Only sent for dashboard routes — not leaked to API routes |
| `Max-Age` | `DASHBOARD_SESSION_TTL_HOURS * 3600` | Configurable expiry |
```

### From spec § Cookie Value Structure

```
HMAC-SHA256( COOKIE_SECRET, JSON.stringify({ exp: 1713100800 }) )
  + "."
  + base64url( JSON.stringify({ exp: 1713100800 }) )
```

> Verification: split on `.`, verify HMAC of the payload portion, parse payload, check `exp > Date.now()/1000`.

### From spec § Rate Limiting

```
| Parameter | Value |
|-----------|-------|
| Window | 15 minutes |
| Max attempts (per IP) | 5 |
| Response on exceed | 429 Too Many Requests |
| Storage | In-memory Map (sufficient for single-instance pilot; no Redis needed) |
```

> After the window expires, the counter resets. Failed attempts are counted; successful logins do not increment the counter.

### From spec § Login Page (HTML template, verbatim)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Decision Panel — Access</title>
  <style>
    /* 8P3P brand tokens inline — no external CSS dependency */
    body { font-family: Inter, system-ui, sans-serif; background: #ffffff; color: #111111; margin: 0; }
    .topbar { background: #000000; padding: 16px 24px; }
    .topbar h1 { color: #ffffff; font-size: 18px; margin: 0; font-weight: 600; }
    .container { max-width: 400px; margin: 80px auto; padding: 0 24px; }
    .card { border: 1px solid #e5e1dc; border-radius: 8px; padding: 32px; }
    h2 { font-size: 20px; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input[type="password"] {
      width: 100%; padding: 10px 12px; border: 1px solid #e5e1dc;
      border-radius: 6px; font-size: 14px; box-sizing: border-box;
    }
    input:focus { outline: 2px solid #111111; outline-offset: 1px; }
    button {
      width: 100%; padding: 10px; margin-top: 16px; background: #111111;
      color: #ffffff; border: none; border-radius: 6px; font-size: 14px;
      font-weight: 500; cursor: pointer;
    }
    button:hover { background: #333333; }
    .error { color: #dc2626; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="topbar"><h1>8P3P</h1></div>
  <div class="container">
    <div class="card">
      <h2>Decision Panel</h2>
      <p>Enter the access code provided by your school's IT administrator.</p>
      <form method="POST" action="/dashboard/login">
        <label for="passphrase">Access Code</label>
        <input type="password" id="passphrase" name="passphrase"
               required autocomplete="off" aria-describedby="error-msg">
        {{#if error}}<p class="error" id="error-msg" role="alert">{{error}}</p>{{/if}}
        <button type="submit">Continue</button>
      </form>
    </div>
  </div>
</body>
</html>
```

### From spec § Implementation Notes (normative)

- Use `crypto.timingSafeEqual()` for passphrase validation.
- Use `crypto.createHmac('sha256', COOKIE_SECRET)` — no external JWT library.
- Server-rendered HTML string, no template engine, string replacement for the error.
- Cookie name is `dp_session` (non-prefixed) so that `Path=/dashboard` scoping can be used. The `__Host-` prefix is explicitly deferred to future subdomain-scoped deployments per spec § Implementation Notes.

## Prerequisites

Before starting implementation:
- [ ] PREREQ-001: Decision Panel UI spec already merged and `/dashboard/*` static serving live in `src/server.ts` (confirmed — `decision-panel-ui.plan.md` is complete).
- [ ] PREREQ-002: `COOKIE_SECRET` value generated for local dev (`openssl rand -hex 32`) and added to `.env.local`. Not required for running tests (tests will set env inline).

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Install @fastify/cookie and @fastify/formbody plugins
- **Files**: `package.json`, `package-lock.json`
- **Action**: Modify
- **Details**: Run `npm install @fastify/cookie @fastify/formbody`. Both are official Fastify plugins listed in the spec's Dependencies table. `@fastify/cookie` provides `reply.setCookie()` / `request.cookies` parsing (we will NOT use its `signCookie` — spec pins a custom `signature.payload` wire format that differs from `@fastify/cookie`'s `value.signature` format). `@fastify/formbody` is required for `POST /dashboard/login` `application/x-www-form-urlencoded` body parsing.
- **Depends on**: none
- **Verification**: `package.json` lists both deps; `npm install` succeeds; `npm run typecheck` passes.

### TASK-002: Create src/auth/session-cookie.ts — sign/verify/clear HMAC-SHA256 cookie helpers
- **Files**: `src/auth/session-cookie.ts`
- **Action**: Create
- **Details**: Implement three functions using Node's `crypto` module (no external lib, per spec § Implementation Notes):
  - `signSession(secret: string, ttlSeconds: number): string` — returns the cookie **value** per spec § Cookie Value Structure (verbatim):
    ```
    HMAC-SHA256( COOKIE_SECRET, JSON.stringify({ exp: 1713100800 }) )
      + "."
      + base64url( JSON.stringify({ exp: 1713100800 }) )
    ```
    where `exp = Math.floor(Date.now()/1000) + ttlSeconds`.
  - `verifySession(secret: string, value: string): { valid: boolean; exp?: number }` — per spec § Cookie Value Structure: "split on `.`, verify HMAC of the payload portion, parse payload, check `exp > Date.now()/1000`". Use `crypto.timingSafeEqual()` on the signature comparison. Return `{ valid: false }` on any parse/HMAC/exp failure (tampered, expired, malformed).
  - `buildSetCookieAttributes({ maxAgeSeconds, secure }): object` — returns options object to hand to `reply.setCookie()` matching spec § Cookie Specification table (with the cookie-name deviation noted in `## Deviations from Spec`): `{ path: '/dashboard', httpOnly: true, secure, sameSite: 'strict', maxAge: maxAgeSeconds }`.
  - `SESSION_COOKIE_NAME = 'dp_session'` exported constant (see Deviations — name drops `__Host-` prefix to preserve `Path=/dashboard` scope).
- **Depends on**: TASK-001
- **Verification**: File exports `signSession`, `verifySession`, `buildSetCookieAttributes`, `SESSION_COOKIE_NAME`; `npm run typecheck` passes; unit tests in TASK-003 pass.

### TASK-003: Write tests/unit/session-cookie.test.ts — GATE-007, GATE-008, GATE-009
- **Files**: `tests/unit/session-cookie.test.ts`
- **Action**: Create
- **Details**: Three unit tests using `vitest`:
  - **GATE-007** (sign/verify round-trip): `signSession(secret, 3600)` → `verifySession(secret, signed)` returns `{ valid: true, exp }` where `exp` is ~1 hour in the future.
  - **GATE-008** (expired rejected): build a signed cookie with `exp` set to `Math.floor(Date.now()/1000) - 60` by calling an internal helper or by stubbing `Date.now`. `verifySession()` returns `{ valid: false }`.
  - **GATE-009** (tampered rejected): sign, then mutate the payload portion (flip one base64url char) → `verifySession()` returns `{ valid: false }`. Also test wrong-secret path (sign with `s1`, verify with `s2`) returns `{ valid: false }`.
- **Depends on**: TASK-002
- **Verification**: `npm run test:unit -- session-cookie` → 3/3 pass.

### TASK-004: Create src/auth/login-rate-limiter.ts — in-memory per-IP sliding-window limiter
- **Files**: `src/auth/login-rate-limiter.ts`
- **Action**: Create
- **Details**: Export `recordFailure(ip: string, now?: number): { blocked: boolean; retryAfterSeconds?: number }` and `clearFailures(ip: string): void`. Storage per spec § Rate Limiting (verbatim): "In-memory Map (sufficient for single-instance pilot; no Redis needed)". Per spec: Window = 15 minutes, Max attempts = 5, Response = 429. Implementation:
  - `Map<string, { count: number; windowStart: number }>` keyed by IP.
  - On each call, if `now - windowStart > 15*60*1000`, reset `count=0, windowStart=now`.
  - Increment `count`; if `count > 5`, return `{ blocked: true, retryAfterSeconds: ceil((windowStart + 15*60*1000 - now)/1000) }`.
  - `clearFailures(ip)` deletes the entry (called on successful login per spec: "successful logins do not increment the counter" — successful login must reset the counter so the user isn't locked out later).
  - Export `_resetForTest()` that clears the whole Map (used by integration tests between cases).

  > **Rationale for not using `@fastify/rate-limit`**: The spec pins "In-memory Map" as the storage literal and requires a specific 5/15min policy applied ONLY to `POST /dashboard/login`. `@fastify/rate-limit` is a full plugin with Redis/Global store abstractions that adds surface area (Lua scripts, nonce headers) unused by this single route. A 30-line Map is less complex and matches the spec verbatim. Custom justified under `.cursor/rules/prefer-existing-solutions/RULE.md` — "less complex".
- **Depends on**: none
- **Verification**: `npm run typecheck` passes. Behavior covered by GATE-010 integration test in TASK-008.

### TASK-005: Create src/auth/dashboard-login.ts — GET/POST /dashboard/login + GET /dashboard/logout + inline HTML template
- **Files**: `src/auth/dashboard-login.ts`
- **Action**: Create
- **Details**: Export `registerDashboardLoginRoutes(fastify: FastifyInstance): void` that registers three routes:
  1. **`GET /dashboard/login`** — returns the HTML from spec § Login Page (copy the full `<!DOCTYPE html>...</html>` block verbatim from `## Spec Literals`). Replace `{{#if error}}...{{/if}}` with the error paragraph when an `?error=1` query param is present, else remove the block entirely. `reply.type('text/html').send(html)`.
  2. **`POST /dashboard/login`** — body shape `{ passphrase: string }` (parsed by `@fastify/formbody`):
     - Read `ip = request.ip`.
     - Read `expected = process.env.DASHBOARD_ACCESS_CODE`. If unset/empty, this route MUST NOT be reachable (gate disabled path — return 404). Spec is silent on this edge; we 404 to avoid advertising the endpoint exists.
     - Compare passphrase using `crypto.timingSafeEqual()` (per spec § Implementation Notes: "Use `crypto.timingSafeEqual()` for passphrase validation").
     - On **mismatch**: call `recordFailure(ip)`. If `blocked`, respond 429 with `Retry-After` header and a short HTML body. Else re-render the login HTML with the error string `"Invalid access code"` inserted (exact string from spec § Functional: "re-render login form with 'Invalid access code' error"). Status 200 (per GATE-003: "200, body contains 'Invalid access code'"). No cookie set.
     - On **match**: call `clearFailures(ip)`. Build TTL: `ttlHours = Number(process.env.DASHBOARD_SESSION_TTL_HOURS ?? 8)`; `maxAgeSeconds = ttlHours * 3600`. Call `signSession(process.env.COOKIE_SECRET, maxAgeSeconds)`. Call `reply.setCookie(SESSION_COOKIE_NAME, signed, buildSetCookieAttributes({ maxAgeSeconds, secure: process.env.NODE_ENV === 'production' }))`. `reply.redirect(302, '/dashboard')`.
  3. **`GET /dashboard/logout`** — `reply.clearCookie(SESSION_COOKIE_NAME, { path: '/dashboard' })` (matches spec § Cookie Specification `Path=/dashboard`) → `reply.redirect(302, '/dashboard/login')` (per spec § Functional: "clears the session cookie and redirects to `/dashboard/login`").

  COOKIE_SECRET validation: on route registration, if `DASHBOARD_ACCESS_CODE` is set but `COOKIE_SECRET` is unset or shorter than 32 chars (per spec § Environment Variables: "Min 32 chars"), log a fatal error and throw from the plugin registration so the server fails fast.
- **Depends on**: TASK-001, TASK-002, TASK-004
- **Verification**: `npm run typecheck` passes. Routes respond with expected status codes (covered by GATE-002, GATE-003, GATE-010, GATE-011 in TASK-008).

### TASK-006: Create src/auth/dashboard-gate.ts — preHandler hook for /dashboard/* session check
- **Files**: `src/auth/dashboard-gate.ts`
- **Action**: Create
- **Details**: Export `dashboardGatePreHandler(request, reply): Promise<void>`. Per spec § Functional:
  - "When `DASHBOARD_ACCESS_CODE` is not set (or empty), gate is disabled" → if unset, `return` immediately (pass through).
  - "All `/dashboard/*` routes (except `/dashboard/login`) check for a valid session cookie" → exempt paths: `/dashboard/login` (GET + POST) and `/dashboard/logout` (logout itself must be reachable without a valid cookie so expired sessions can clear state). Spec lists `logout` under Functional as a logged-in action but does not forbid unauthenticated access; we exempt it to avoid a redirect loop.
  - "Missing or invalid session cookie → 302 redirect to `/dashboard/login`" → read `request.cookies[SESSION_COOKIE_NAME]`, run `verifySession(process.env.COOKIE_SECRET, value)`. If `{ valid: false }` or cookie absent → `reply.redirect(302, '/dashboard/login')`.

  Must also export `DASHBOARD_LOGIN_EXEMPT_PATHS` (readonly) for test assertions and future reuse.
- **Depends on**: TASK-002
- **Verification**: `npm run typecheck` passes. Behavior covered by GATE-001, GATE-004, GATE-005, GATE-006 in TASK-008.

### TASK-007: Wire plugins and routes into src/server.ts
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**: Register, in order, BEFORE the existing `fastifyStatic` registration for `dashboardDist`:
  ```ts
  import cookie from '@fastify/cookie';
  import formbody from '@fastify/formbody';
  import { registerDashboardLoginRoutes } from './auth/dashboard-login.js';
  import { dashboardGatePreHandler } from './auth/dashboard-gate.js';

  await server.register(cookie);       // no secret — we sign manually per spec
  await server.register(formbody);     // POST /dashboard/login body parsing

  if (existsSync(dashboardDist)) {
    // Login + logout routes FIRST (exempt from the gate by path)
    registerDashboardLoginRoutes(server);

    // Register the static SPA inside an encapsulated scope so the preHandler
    // only applies to /dashboard/* and not to /v1 or /inspect.
    await server.register(async (dashScope) => {
      dashScope.addHook('preHandler', dashboardGatePreHandler);
      dashScope.get('/', async (_req, reply) => reply.redirect('/dashboard/'));
      await dashScope.register(fastifyStatic, {
        root: dashboardDist,
        prefix: '/dashboard/',
        decorateReply: false,
      });
    });
  }
  ```
  Remove the pre-existing `server.get('/dashboard', ...)` redirect and `server.register(fastifyStatic, { prefix: '/dashboard/' })` block (replaced by the encapsulated scope above). `@fastify/cookie` and `@fastify/formbody` registration must be top-level (not inside the dashboard scope) so they are available globally — they are cheap no-ops for unrelated routes.
- **Depends on**: TASK-001, TASK-005, TASK-006
- **Verification**: `npm run build && npm run typecheck` pass. Manual smoke: `DASHBOARD_ACCESS_CODE=test COOKIE_SECRET=$(openssl rand -hex 32) npm run dev`; `curl -i http://localhost:3000/dashboard/` returns `302 Location: /dashboard/login`.

### TASK-008: Write tests/integration/dashboard-gate.test.ts — GATE-001..006, GATE-010, GATE-011
- **Files**: `tests/integration/dashboard-gate.test.ts`
- **Action**: Create
- **Details**: Use `Fastify` + `server.inject()` (per `.agents/skills/fastify-best-practices/rules/testing.md`). Build a minimal app that registers cookie, formbody, the login routes, and a stub `/dashboard/` route (we don't need the full SPA static tree for these tests — we can stub with a route that returns `200 "SPA"` so that GATE-004 asserts on the stub). Save/restore `process.env.DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`, `DASHBOARD_SESSION_TTL_HOURS` between tests. Call `_resetForTest()` from the rate limiter in `beforeEach`.

  Test mapping:
  - **GATE-001** `/dashboard` no cookie → 302 `/dashboard/login`: set env, `inject({ url: '/dashboard/', method: 'GET' })` → `statusCode === 302`, `headers.location === '/dashboard/login'`.
  - **GATE-002** POST valid → 302 + Set-Cookie: `inject({ url: '/dashboard/login', method: 'POST', payload: 'passphrase=correct', headers: { 'content-type': 'application/x-www-form-urlencoded' } })` → `statusCode === 302`, `headers.location === '/dashboard'`, `headers['set-cookie']` contains `dp_session=` AND `HttpOnly` AND `SameSite=Strict` AND `Path=/dashboard`.
  - **GATE-003** POST invalid → 200 + error: body includes the literal string `Invalid access code`; no `set-cookie` header.
  - **GATE-004** valid cookie → SPA: call `signSession()` directly, `inject({ url: '/dashboard/', headers: { cookie: 'dp_session=<signed>' } })` → `statusCode === 200`, body is the stub SPA.
  - **GATE-005** expired cookie → 302: sign with `ttlSeconds = -60` (expired) → 302 to `/dashboard/login`.
  - **GATE-006** gate disabled: `delete process.env.DASHBOARD_ACCESS_CODE`, `inject({ url: '/dashboard/' })` → `statusCode === 200`.
  - **GATE-010** 6th failed login → 429: loop 5 invalid POSTs (expect 200 with error), 6th → `statusCode === 429`.
  - **GATE-011** `/dashboard/logout` clears: `inject({ url: '/dashboard/logout', method: 'GET' })` → `statusCode === 302`, `headers.location === '/dashboard/login'`, `set-cookie` includes `dp_session=` with `Max-Age=0` (or `Expires` in the past).
- **Depends on**: TASK-005, TASK-006, TASK-007
- **Verification**: `npm run test:integration -- dashboard-gate` → 8/8 pass. `npm test` (full suite) green.

### TASK-009: Update .env.example + README env table
- **Files**: `.env.example` (create if missing), `README.md`
- **Action**: Modify
- **Details**: Add rows matching spec § Environment Variables verbatim:
  ```
  DASHBOARD_ACCESS_CODE=
  DASHBOARD_SESSION_TTL_HOURS=8
  COOKIE_SECRET=
  ```
  README prose block: "Dashboard Access Gate" subsection referencing `docs/specs/dashboard-passphrase-gate.md` with the `openssl rand -hex 32` generation command for `COOKIE_SECRET`.
- **Depends on**: TASK-007
- **Verification**: `.env.example` lists the three vars; README renders without broken links (`npm run lint` passes).

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/auth/session-cookie.ts` | TASK-002 | HMAC-SHA256 sign/verify helpers matching spec wire format |
| `src/auth/login-rate-limiter.ts` | TASK-004 | In-memory per-IP 5/15min sliding window |
| `src/auth/dashboard-login.ts` | TASK-005 | GET/POST /dashboard/login + GET /dashboard/logout + inline HTML |
| `src/auth/dashboard-gate.ts` | TASK-006 | preHandler that gates /dashboard/* on session cookie |
| `tests/unit/session-cookie.test.ts` | TASK-003 | GATE-007, GATE-008, GATE-009 |
| `tests/integration/dashboard-gate.test.ts` | TASK-008 | GATE-001..006, GATE-010, GATE-011 |
| `.env.example` | TASK-009 | Document new env vars |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `package.json` | TASK-001 | Add `@fastify/cookie`, `@fastify/formbody` dependencies |
| `src/server.ts` | TASK-007 | Register cookie + formbody plugins; wrap /dashboard/ static in encapsulated scope with gate preHandler; register login routes |
| `README.md` | TASK-009 | Document DASHBOARD_ACCESS_CODE / COOKIE_SECRET / DASHBOARD_SESSION_TTL_HOURS |

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` must map to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| FR-1: `DASHBOARD_ACCESS_CODE` env var enables gate when set | spec § Requirements › Functional | TASK-006, TASK-007 |
| FR-2: Unset/empty `DASHBOARD_ACCESS_CODE` disables gate (backward compatible) | spec § Requirements › Functional | TASK-006 |
| FR-3: `GET /dashboard/login` serves minimal HTML form | spec § Requirements › Functional | TASK-005 |
| FR-4: `POST /dashboard/login` validates with `timingSafeEqual` | spec § Requirements › Functional | TASK-005 |
| FR-5: Valid passphrase → signed HttpOnly/Secure(prod)/SameSite=Strict cookie + 302 to `/dashboard` | spec § Requirements › Functional | TASK-002, TASK-005 |
| FR-6: Invalid passphrase → re-render login with `Invalid access code` | spec § Requirements › Functional | TASK-005 |
| FR-7: All `/dashboard/*` routes except `/dashboard/login` check cookie via preHandler | spec § Requirements › Functional | TASK-006, TASK-007 |
| FR-8: Missing/invalid cookie → 302 to `/dashboard/login` | spec § Requirements › Functional | TASK-006 |
| FR-9: TTL via `DASHBOARD_SESSION_TTL_HOURS` (default 8) | spec § Requirements › Functional | TASK-005 |
| FR-10: `GET /dashboard/logout` clears cookie + redirects | spec § Requirements › Functional | TASK-005 |
| FR-11: Rate limit 5/IP/15min → 429 | spec § Requirements › Functional | TASK-004, TASK-005 |
| NFR-1: 8P3P brand-styled login page | spec § Requirements › Non-Functional | TASK-005 (uses verbatim spec HTML) |
| NFR-2: WCAG 2.1 AA accessible (keyboard, ARIA labels) | spec § Requirements › Non-Functional | TASK-005 (spec HTML has `label[for]`, `aria-describedby`, `role="alert"`) |
| NFR-3: Login page loads in <500ms, server-rendered, no framework | spec § Requirements › Non-Functional | TASK-005 |
| NFR-4: No JS required for login flow | spec § Requirements › Non-Functional | TASK-005 (form POST only) |
| NFR-5: Cookie signed via `COOKIE_SECRET` HMAC | spec § Requirements › Non-Functional | TASK-002 |
| AC-1: No cookie + `/dashboard` → redirect to `/dashboard/login` | spec § Acceptance Criteria | TASK-006, TASK-008 (GATE-001) |
| AC-2: Correct passphrase → cookie + redirect to `/dashboard` | spec § Acceptance Criteria | TASK-005, TASK-008 (GATE-002) |
| AC-3: Incorrect passphrase → error, no cookie | spec § Acceptance Criteria | TASK-005, TASK-008 (GATE-003) |
| AC-4: Valid cookie → SPA serves directly | spec § Acceptance Criteria | TASK-006, TASK-008 (GATE-004) |
| AC-5: Expired cookie → redirect | spec § Acceptance Criteria | TASK-002, TASK-006, TASK-008 (GATE-005) |
| AC-6: Unset `DASHBOARD_ACCESS_CODE` → SPA serves | spec § Acceptance Criteria | TASK-006, TASK-008 (GATE-006) |
| AC-7: 6th failed login → 429 | spec § Acceptance Criteria | TASK-004, TASK-005, TASK-008 (GATE-010) |
| AC-8: `/dashboard/logout` → cookie cleared + redirect | spec § Acceptance Criteria | TASK-005, TASK-008 (GATE-011) |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| GATE-001 | integration | `/dashboard` with no cookie → 302 to `/dashboard/login` | TASK-008 |
| GATE-002 | integration | POST valid passphrase → 302 to `/dashboard` + Set-Cookie | TASK-008 |
| GATE-003 | integration | POST invalid passphrase → 200, body contains `Invalid access code` | TASK-008 |
| GATE-004 | integration | `/dashboard` with valid cookie → 200 (SPA served) | TASK-008 |
| GATE-005 | integration | `/dashboard` with expired cookie → 302 to `/dashboard/login` | TASK-008 |
| GATE-006 | integration | Gate disabled when `DASHBOARD_ACCESS_CODE` unset → 200 on `/dashboard` | TASK-008 |
| GATE-007 | unit | Cookie sign/verify round-trip returns `{ valid: true }` | TASK-003 |
| GATE-008 | unit | Expired cookie rejected (`verify` returns `{ valid: false }`) | TASK-003 |
| GATE-009 | unit | Tampered/wrong-secret cookie rejected | TASK-003 |
| GATE-010 | integration | 6th failed login within 15 min → 429 | TASK-008 |
| GATE-011 | integration | `/dashboard/logout` clears cookie + redirects | TASK-008 |

## Deviations from Spec

> Every place the plan's literal values differ from the spec. Drift defects must be resolved before coding.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Cookie Specification, § Implementation Notes | `Name = dp_session` with `Path = /dashboard`; `__Host-` prefix documented as future hardening for subdomain-scoped deployments | `Name = dp_session` with `Path = /dashboard` | **Reverted — plan now matches spec.** Spec was updated in commit accompanying this plan to resolve the internal contradiction between `__Host-dp_session` (browser-requires `Path=/`) and `Path=/dashboard`. Spec chose to preserve the path-scoping rationale and drop the prefix. Plan and spec are now literal-compatible. |
| § Functional (FR-10) | "`GET /dashboard/logout` clears the session cookie and redirects to `/dashboard/login`" | Exempts `/dashboard/logout` from the gate so logout still works when the cookie is already expired/invalid | **Implementation detail — spec silent.** Spec lists logout among the routes but does not specify whether it requires a valid session. Plan exempts it to avoid a redirect loop on expired cookies. |
| § Rate Limiting | "Storage: In-memory Map" | Plan adds an exported `_resetForTest()` helper that clears the Map | **Implementation detail — spec silent.** Test-only affordance, not part of public API. Will be marked `@internal` in JSDoc. |
| § Login Page | HTML uses `{{#if error}}...{{/if}}` Handlebars-like syntax | Plan implements this via a plain `string.replace(/{{#if error}}[\s\S]*?{{\/if}}/, errorHtml \|\| '')` (no Handlebars dep) | **Implementation detail — spec silent.** Spec § Implementation Notes explicitly says "No template engine dependency. Use string replacement for the error message." Plan matches that guidance. |
| § Environment Variables | `COOKIE_SECRET` "Min 32 chars" | Plan fails fast at server startup if `COOKIE_SECRET` is shorter than 32 chars when `DASHBOARD_ACCESS_CODE` is set | **Implementation detail — spec silent on enforcement mechanism.** Plan chooses fail-fast (matches existing `API_KEY` pattern which also validates on boot). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limiter Map is process-local — multi-instance deployments lose limiter state on scale-out | Medium | Spec explicitly scopes this to "single-instance pilot". Redis upgrade is Phase 2. Document in plan TASK-004 rationale. |
| `COOKIE_SECRET` rotation invalidates all active sessions (by design) | Low | Spec § Key Lifecycle documents this as the intended behavior for force-revoke. No mitigation needed; documented in README per TASK-009. |
| `request.ip` can be spoofed behind a proxy without `trustProxy` set | High | Confirm Fastify `trustProxy` setting when deployed behind ALB/CloudFront. Add to TASK-007 verification step: document in README deployment notes that `trustProxy: true` must be set in production. |
| `@fastify/formbody` increases attack surface (form parsing) | Low | Only registered once; `POST /dashboard/login` is the only form route. Plugin is official and maintained. |
| `dashboardDist` exists check at boot means tests that `npm run build:dashboard` hasn't run will skip the scope | Low | Integration test stubs the `/dashboard/` handler (TASK-008) rather than relying on the real SPA build artifact. |
| Spec-plan name mismatch (historical `__Host-dp_session` vs chosen `dp_session`) | Resolved | Spec updated in same commit as this plan — § Cookie Specification Name row now says `dp_session`; § Implementation Notes documents `__Host-` as future hardening. No outstanding deviation. |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Full suite passes (`npm run check`)
- [ ] Manual smoke: `DASHBOARD_ACCESS_CODE=test COOKIE_SECRET=$(openssl rand -hex 32) npm run dev` → `curl -i /dashboard/` returns 302 to `/dashboard/login`; browser POST with correct passphrase lands on SPA.
- [x] `docs/specs/dashboard-passphrase-gate.md` updated: § Cookie Specification Name row and § Implementation Notes reflect `dp_session` + `Path=/dashboard` — spec and plan literal-compatible.
- [ ] Every GATE-0xx test ID from spec § Contract Tests has a corresponding `it(...)` block in `tests/unit/session-cookie.test.ts` or `tests/integration/dashboard-gate.test.ts`.

## Implementation Order

```
TASK-001 (deps)
   ↓
TASK-002 (session-cookie) ──→ TASK-003 (unit tests, TDD)
   ↓
TASK-004 (rate-limiter) ─┐
                         ↓
                      TASK-005 (login routes)
                         ↓
                      TASK-006 (gate preHandler)
                         ↓
                      TASK-007 (server.ts wiring)
                         ↓
                      TASK-008 (integration tests)
                         ↓
                      TASK-009 (env docs)
```
