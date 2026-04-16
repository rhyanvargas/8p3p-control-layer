# Dashboard Passphrase Gate Specification

> Lightweight session-based access control for the Decision Panel. Prevents unauthenticated access to PII-adjacent data (learner names, skills, decision rationale) without requiring a full identity platform.

## Overview

The Decision Panel at `/dashboard` displays `learner_reference` values that may resolve to real student names, skills where students are struggling, and educator-facing decision rationale. In a FERPA-regulated school environment, an open URL with an API key baked into the build is not defensible — any staff member (or anyone with the URL) could view student data without authentication.

This spec defines a **passphrase-based session gate** for the Decision Panel: a single shared access code, server-validated, that issues an `HttpOnly` session cookie. It is the minimum viable auth layer that makes the panel defensible under FERPA scrutiny while adding zero user management overhead.

**What this is:** A Fastify preHandler hook that requires a valid session cookie for `/dashboard/*` routes, with a single-field login form for first access.
**What this is not:** User accounts, RBAC, SSO/OAuth, or per-user audit trails. Those are Phase 2 (`8p3p-admin` platform).

### Why Not SSO/OAuth?

| Factor | Passphrase Gate (this spec) | SSO/OAuth |
|--------|----------------------------|-----------|
| Setup per customer | 1 env var + share passphrase | Register OAuth client with their IdP, configure callbacks, handle token refresh |
| Time to implement | 2–4 hours | 2–4 days + per-customer config |
| Dependencies | None | IdP-specific libraries, callback URLs, CORS config |
| Sufficient for pilot | Yes — same trust model as sharing a WiFi password | Over-engineered for single-school pilot |
| Phase 2 upgrade path | Replace hook with SSO middleware | Correct long-term answer |

---

## Architecture

```
Browser → GET /dashboard
     │
     ├── Has valid session cookie? → Serve SPA
     │
     └── No cookie (or expired) → 302 → /dashboard/login
              │
              └── POST /dashboard/login { passphrase: "..." }
                    │
                    ├── Match? → Set HttpOnly cookie, 302 → /dashboard
                    │
                    └── No match? → Re-render login form with error
```

The passphrase gate sits **in front of** the static SPA. The SPA itself is unchanged — it still uses `VITE_API_KEY` for API calls. The passphrase and API key are independent credentials serving different purposes:

| Credential | Purpose | Who holds it | Storage |
|-----------|---------|-------------|---------|
| `DASHBOARD_ACCESS_CODE` | Human access to the web UI | School staff (shared by IT admin) | Env var (server) |
| `VITE_API_KEY` / `API_KEY` | Machine access to API endpoints | Baked into SPA build or stored in localStorage | Env var (build-time) |

---

## Requirements

### Functional

- [ ] New env var `DASHBOARD_ACCESS_CODE`: when set, passphrase gate is enabled for `/dashboard/*`
- [ ] When `DASHBOARD_ACCESS_CODE` is not set (or empty), gate is disabled — `/dashboard` serves the SPA directly (local dev backward compatible)
- [ ] `GET /dashboard/login` serves a minimal HTML login form (single field: "Access Code")
- [ ] `POST /dashboard/login` validates the submitted passphrase against `DASHBOARD_ACCESS_CODE` using constant-time comparison
- [ ] On valid passphrase: set a signed `HttpOnly`, `Secure` (in production), `SameSite=Strict` session cookie and redirect to `/dashboard`
- [ ] On invalid passphrase: re-render login form with "Invalid access code" error (no details about the expected value)
- [ ] All `/dashboard/*` routes (except `/dashboard/login`) check for a valid session cookie via Fastify `preHandler` hook
- [ ] Missing or invalid session cookie → 302 redirect to `/dashboard/login`
- [ ] Session cookie TTL: configurable via `DASHBOARD_SESSION_TTL_HOURS` env var (default: 8 hours — one school day)
- [ ] `GET /dashboard/logout` clears the session cookie and redirects to `/dashboard/login`
- [ ] Rate limit login attempts: max 5 failed attempts per IP per 15-minute window → 429 response

### Non-Functional

- [ ] Login page is styled with 8P3P brand tokens (black header, warm palette) to feel like part of the product
- [ ] Login page is accessible: WCAG 2.1 AA, keyboard-navigable, proper ARIA labels
- [ ] Login page loads in < 500ms (server-rendered HTML, no JS framework)
- [ ] No JavaScript required for login flow (progressive enhancement only)
- [ ] Session cookie is signed using `COOKIE_SECRET` env var (Fastify `@fastify/cookie` with `@fastify/secure-session` or HMAC signing)

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHBOARD_ACCESS_CODE` | No | — | The passphrase value. When set, gate is active. When unset/empty, gate is disabled. |
| `DASHBOARD_SESSION_TTL_HOURS` | No | `8` | Session cookie lifetime in hours. |
| `COOKIE_SECRET` | Yes (when gate active) | — | Secret used to sign session cookies. Min 32 chars. Generate with `openssl rand -hex 32`. |

---

## Login Page

Server-rendered HTML. No React, no build step. Served by Fastify route handler.

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

The template uses simple string interpolation (no template engine dependency needed — Fastify `reply.html()` with string replacement).

---

## Cookie Specification

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| Name | `dp_session` | Scoped to `/dashboard` via `Path` attribute below. The `__Host-` prefix was considered but is incompatible with `Path=/dashboard` — browsers enforce that `__Host-` cookies MUST have `Path=/` and no `Domain`. Path-scoping to `/dashboard` is the higher-value property (cookie is not sent on `/v1/*` API calls), so the prefix is dropped. See § Implementation Notes for the future-hardening note. |
| Value | HMAC-SHA256 signature of `{ exp: <unix_timestamp> }` | Stateless — no server-side session store needed |
| `HttpOnly` | `true` | Not accessible via JavaScript — XSS cannot steal the cookie |
| `Secure` | `true` (production); `false` (localhost) | Only sent over HTTPS in production |
| `SameSite` | `Strict` | Not sent on cross-site requests — CSRF protection |
| `Path` | `/dashboard` | Only sent for dashboard routes — not leaked to API routes |
| `Max-Age` | `DASHBOARD_SESSION_TTL_HOURS * 3600` | Configurable expiry |

### Cookie Value Structure

```
HMAC-SHA256( COOKIE_SECRET, JSON.stringify({ exp: 1713100800 }) )
  + "."
  + base64url( JSON.stringify({ exp: 1713100800 }) )
```

Verification: split on `.`, verify HMAC of the payload portion, parse payload, check `exp > Date.now()/1000`.

---

## Rate Limiting

Login attempts are rate-limited per IP to prevent brute-force attacks on the passphrase.

| Parameter | Value |
|-----------|-------|
| Window | 15 minutes |
| Max attempts (per IP) | 5 |
| Response on exceed | 429 Too Many Requests |
| Storage | In-memory Map (sufficient for single-instance pilot; no Redis needed) |

After the window expires, the counter resets. Failed attempts are counted; successful logins do not increment the counter.

---

## Acceptance Criteria

- Given `DASHBOARD_ACCESS_CODE=springfield-math-2026` and a browser with no session cookie, when navigating to `/dashboard`, then the browser is redirected to `/dashboard/login`
- Given the login form, when submitting the correct passphrase, then a session cookie is set and the browser is redirected to `/dashboard` where the SPA loads
- Given the login form, when submitting an incorrect passphrase, then the form re-renders with "Invalid access code" and no cookie is set
- Given a valid session cookie, when navigating to `/dashboard`, then the SPA serves directly (no login redirect)
- Given a session cookie older than `DASHBOARD_SESSION_TTL_HOURS`, when navigating to `/dashboard`, then the browser is redirected to `/dashboard/login`
- Given `DASHBOARD_ACCESS_CODE` is unset, when navigating to `/dashboard`, then the SPA serves directly (gate disabled, local dev mode)
- Given 5 failed login attempts from the same IP within 15 minutes, when a 6th attempt is made, then the response is 429
- Given a valid session, when navigating to `/dashboard/logout`, then the session cookie is cleared and the browser is redirected to `/dashboard/login`

---

## Constraints

- **No user accounts** — the passphrase is a shared secret. The school's IT admin decides who gets it.
- **No per-user audit trail** — all sessions are anonymous. Phase 2 SSO enables per-user logging.
- **No password storage** — the passphrase lives in an env var only. It is compared at runtime, never stored in a database.
- **Stateless sessions** — no server-side session store. The signed cookie is self-contained. Server restart does not invalidate sessions (only `COOKIE_SECRET` rotation does).
- **Single passphrase per deployment** — same as the API key model (one per org). Multi-passphrase is Phase 2.

---

## Key Lifecycle

Mirrors the API key lifecycle (`docs/specs/api-key-middleware.md`) but for the access code.

### Generation

8P3P generates a human-memorable passphrase for the school:

```bash
# Example: 3 random words + year
echo "springfield-math-2026"
```

Unlike API keys, the access code should be **memorable** (educators type it in a browser). Use lowercase words, hyphens, and a year or school identifier.

### Distribution

8P3P shares the access code with the school's IT admin via secure channel. The IT admin shares it with authorized staff (teachers, principals) according to their internal policy.

### Rotation

To change the access code:

1. 8P3P updates `DASHBOARD_ACCESS_CODE` in the deployment env
2. Server restart — existing sessions remain valid (cookie-based), but new logins require the new code
3. 8P3P notifies IT admin of the new code; IT admin distributes to staff

To force all sessions to expire (e.g. staff turnover):

1. Rotate `COOKIE_SECRET` — all existing signed cookies become invalid
2. All users must re-authenticate with the (new or existing) access code

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| SSO / OAuth / SAML | Over-engineered for single-school pilot | Phase 2 admin platform |
| Per-user accounts / RBAC | No user management system exists yet | Phase 2 |
| Per-user audit log (who viewed what) | Requires user identity | Phase 2 SSO |
| MFA / 2FA | Passphrase + HTTPS is sufficient for pilot | Phase 2 if required |
| Password complexity enforcement | Passphrase is operator-generated, not user-chosen | N/A |
| Automated session revocation API | Cookie secret rotation covers this | Phase 2 |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| Fastify server, `/dashboard` static serving | `docs/specs/decision-panel-ui.md` | **Spec'd** |
| `@fastify/cookie` plugin | — | Add to `package.json` |
| `@fastify/formbody` plugin (for POST form parsing) | — | Add to `package.json` |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| FERPA-defensible access control for Decision Panel | Pilot readiness gate |
| Session cookie pattern | Future admin platform auth |
| Rate-limited login | Security baseline |

---

## File Structure

```
src/
├── auth/
│   ├── api-key-middleware.ts       # Existing — API key validation
│   ├── dashboard-gate.ts           # NEW — passphrase gate preHandler hook
│   ├── dashboard-login.ts          # NEW — login form routes (GET + POST)
│   ├── session-cookie.ts           # NEW — sign/verify/clear cookie helpers
│   └── login-rate-limiter.ts       # NEW — in-memory IP-based rate limiter
```

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| GATE-001 | integration | `/dashboard` with no cookie → redirect | 302 to `/dashboard/login` |
| GATE-002 | integration | POST valid passphrase → cookie set + redirect | 302 to `/dashboard`, `Set-Cookie` header present |
| GATE-003 | integration | POST invalid passphrase → error re-render | 200, body contains "Invalid access code" |
| GATE-004 | integration | `/dashboard` with valid cookie → SPA served | 200, HTML content |
| GATE-005 | integration | `/dashboard` with expired cookie → redirect | 302 to `/dashboard/login` |
| GATE-006 | integration | Gate disabled when `DASHBOARD_ACCESS_CODE` unset | 200 on `/dashboard` without cookie |
| GATE-007 | unit | Cookie sign/verify round-trip | Signed cookie verifies correctly |
| GATE-008 | unit | Expired cookie rejected | `verify()` returns null for expired cookie |
| GATE-009 | unit | Tampered cookie rejected | `verify()` returns null for modified payload |
| GATE-010 | integration | 6th failed login within 15 min → 429 | 429 response |
| GATE-011 | integration | `/dashboard/logout` clears cookie | `Set-Cookie` with `Max-Age=0`, redirect to login |

---

## Implementation Notes

- **Constant-time comparison:** Use `crypto.timingSafeEqual()` for passphrase validation (same as API key middleware).
- **HMAC signing:** Use `crypto.createHmac('sha256', COOKIE_SECRET)` — no external JWT library needed.
- **Login form:** Server-rendered HTML string in the route handler. No template engine dependency. Use string replacement for the error message.
- **Why not the `__Host-` cookie prefix:** The `__Host-` prefix gives browser-enforced protection against cookie injection attacks, but it is only valid when the cookie is scoped to `Path=/` with no `Domain` attribute. This spec scopes the session cookie to `Path=/dashboard` so it is not sent on `/v1/*` API requests — a stronger isolation property for this deployment than the injection protection would provide. Future hardening: if the dashboard is ever split onto its own subdomain (e.g. `dashboard.8p3p.io`), revisit this decision — a subdomain-scoped deployment can safely adopt `__Host-dp_session` with `Path=/`.
- **Integration with Decision Panel build:** No changes to the SPA. The gate sits in front of `@fastify/static`. The SPA loads after the gate passes.

---

*Spec created: 2026-04-14 | Phase: Pilot Wave 2 (same wave as Decision Panel UI) | Depends on: decision-panel-ui.md*
