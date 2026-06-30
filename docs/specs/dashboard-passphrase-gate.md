# Dashboard Passphrase Gate Specification

> Lightweight session-based access control for the Decision Panel. Prevents unauthenticated access to PII-adjacent data (learner names, skills, decision rationale) without requiring a full identity platform.

> **Implementation (2026-06):** Gate runs in the **Next.js dashboard** (`dashboard/middleware.ts`, `dashboard/app/(auth)/login/route.ts`, `dashboard/lib/*`). Fastify `src/auth/dashboard-*.ts` routes are **removed**. Cookie scheme (`dp_session`, HMAC + `COOKIE_SECRET`) is unchanged. Login is at **`/login`** (not `/dashboard/login`). Standalone app uses `Path=/` for `dp_session` — see [`nextjs-amplify-dashboard-migration.md`](nextjs-amplify-dashboard-migration.md) § Cookie path change.

## Overview

The Decision Panel displays `learner_reference` values that may resolve to real student names, skills where students are struggling, and educator-facing decision rationale. In a FERPA-regulated school environment, an open URL where anyone could view student data without authentication is not defensible.

This spec defines a **passphrase-based session gate** for the Decision Panel: shared access code(s), server-validated, that issue an `HttpOnly` session cookie. It is the minimum viable auth layer that makes the panel defensible under FERPA scrutiny while adding zero user management overhead.

**Interim pilot (2026-06-29):** Organic educator wave uses **dual access codes** — educator passphrase vs compliance/admin passphrase — resolved at login into a session **persona** (`educator` | `compliance`). Middleware enforces route/nav allowlists per persona ([`dashboard-design-requirements.md`](dashboard-design-requirements.md) §2.2 D5). Phase 2 Cognito replaces codes, **not** D5 IA rules.

**What this is:** Next.js **middleware** (plus login/logout route handlers) that requires a valid session cookie for dashboard pages and `/api/control/*`, with a single-field login form for first access.

**What this is not:** User accounts, SSO/OAuth, or per-user audit trails. Those are Phase 2 (`8p3p-admin` platform) / Phase 5 Cognito ([`nextjs-amplify-dashboard-migration.md`](nextjs-amplify-dashboard-migration.md)). **Per-persona route allowlists (D5)** are specified here and in [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §2.2 — not backend RBAC.

### Why Not SSO/OAuth?

| Factor | Passphrase Gate (this spec) | SSO/OAuth |
|--------|----------------------------|-----------|
| Setup per customer | 1 env var + share passphrase | Register OAuth client with their IdP, configure callbacks, handle token refresh |
| Time to implement | 2–4 hours | 2–4 days + per-customer config |
| Dependencies | None | IdP-specific libraries, callback URLs, CORS config |
| Sufficient for pilot | Yes — same trust model as sharing a WiFi password | Over-engineered for single-school pilot |
| Phase 2 upgrade path | Replace hook with SSO middleware | Correct long-term answer |

---

## Dual access codes (interim pilot — normative)

Organic educator wave (Zoom 50–100) requires **two shared secrets** so educators never land on compliance-only surfaces by default. Implementation: [`.cursor/plans/dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) PE-001–PE-003.

### Environment variables (dual-code mode)

| Variable | Required | Description |
|----------|----------|-------------|
| `DASHBOARD_ACCESS_CODE_EDUCATOR` | When dual-code mode active | Passphrase for educator persona — classroom triage surfaces only (D5) |
| `DASHBOARD_ACCESS_CODE_COMPLIANCE` | When dual-code mode active | Passphrase for compliance/admin persona — full nav and audit routes |
| `DASHBOARD_ACCESS_CODE` | Legacy / single-code fallback | When **only** this var is set (dual vars unset), login grants **compliance-equivalent** session (full nav). Preserves pre-D5 deploys until PE-001 ships |

**Dual-code mode is active** when both `DASHBOARD_ACCESS_CODE_EDUCATOR` and `DASHBOARD_ACCESS_CODE_COMPLIANCE` are non-empty. When dual-code mode is active, `DASHBOARD_ACCESS_CODE` is ignored for login validation.

**Alias pattern (optional):** Operators may document the same values under runbook aliases (e.g. `DASHBOARD_ACCESS_CODE_TEACHER` → educator) as long as the dashboard runtime maps them to the two canonical vars above before middleware reads them.

### Login validation

```
POST /login { passphrase: "..." }
  │
  ├── Match DASHBOARD_ACCESS_CODE_EDUCATOR? → persona = educator
  ├── Match DASHBOARD_ACCESS_CODE_COMPLIANCE? → persona = compliance
  ├── Match DASHBOARD_ACCESS_CODE (legacy only)? → persona = compliance
  │
  └── No match → error (constant-time compare per code tried)
```

Each code is compared with **constant-time** equality. Failed attempts count toward the existing IP rate limit (5 / 15 min).

### Session cookie payload (persona)

Extend the signed payload (§ Cookie Value Structure) with an optional persona field:

```json
{ "exp": 1713100800, "persona": "educator" }
```

| `persona` value | Set when |
|-----------------|----------|
| `educator` | Educator access code matched |
| `compliance` | Compliance access code or legacy single code matched |

When persona is absent (older cookies minted before PE-001), middleware treats the session as **compliance** (full nav) for backward compatibility.

Verification order unchanged: HMAC → `exp` → read `persona` for allowlist enforcement.

### Route allowlists (middleware — spec prose)

Educator persona **allowed page routes** (prefix match unless noted):

| Allowed | Blocked (302 → `/` or `/attention`) |
|---------|-------------------------------------|
| `/`, `/attention`, `/learners`, `/learners/*` | `/decisions`, `/decisions/*` |
| `/settings` | `/signals`, `/signals/*` |
| `/login`, `/logout` | `/reports` |

**Learner detail tabs:** Educator sessions may only render **Overview** and **Struggles & progress** tabs on `/learners/[ref]`; direct URL to `?tab=state`, `?tab=trajectory`, or `?tab=skills` redirects to Overview (PE-004).

Compliance persona: **no route allowlist** — full sidebar per [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §5.1.

**API proxy (`/api/control/*`):** Page middleware is the primary gate. Compliance-only API paths (e.g. admin preflight, program-metrics export) must not be callable from educator sessions when persona-aware proxy filtering ships (PE-003 scope — document here; impl in persona plan).

### Distribution

| Audience | Code | Share via |
|----------|------|-----------|
| Teachers, instructional coaches | Educator code | School IT — **never** in same channel as compliance demo for Zoom educators track |
| Admin, compliance, 8P3P operator | Compliance code | Secure channel; required for signal upload, audit, export |

See [`organic-educator-wave-zoom.md`](../guides/playbooks/organic-educator-wave-zoom.md) and [`faq.md`](../guides/customers/faq.md) § Dashboard access.

### Phase 2 upgrade

Cognito/SSO replaces passphrase entry and binds sessions to user identity. **D5 route/nav/tab allowlists remain** — mapped from IdP groups or app roles (`educator`, `compliance_admin`) instead of login code choice.

---

## Architecture

```
Browser → GET / (or any dashboard page)
     │
     ├── Has valid dp_session cookie? → Serve page / proxy API
     │
     └── No cookie (or expired) → 302 → /login
              │
              └── POST /login { passphrase: "..." }
                    │
                    ├── Match? → Set HttpOnly cookie(s), 303 → /
                    │
                    └── No match? → Re-render login with error
```

The passphrase gate sits **in front of** the Next.js app. API calls from the browser go to **`/api/control/*`** on the same origin; the route handler attaches `CONTROL_LAYER_API_KEY` server-side. Passphrase and API key are independent:

| Credential | Purpose | Who holds it | Storage |
|-----------|---------|-------------|---------|
| `DASHBOARD_ACCESS_CODE_EDUCATOR` | Educator UI access (D5 subset) | Teachers / coaches (via IT) | Dashboard runtime env |
| `DASHBOARD_ACCESS_CODE_COMPLIANCE` | Compliance UI access (full nav) | Admin / compliance / operator | Dashboard runtime env |
| `DASHBOARD_ACCESS_CODE` | Legacy single-code full access | School staff (shared) | Dashboard runtime env — **fallback when dual vars unset** |
| `CONTROL_LAYER_API_KEY` / `API_KEY` | Machine access to control-layer `/v1/*` | Dashboard server (proxy only) | Dashboard runtime env — **never** in browser bundle |

*(Legacy: Fastify served a Vite SPA at `/dashboard` with `VITE_API_KEY` in the client bundle — retired.)*

---

## Requirements

### Functional

- [x] Env var `DASHBOARD_ACCESS_CODE`: when set on the **dashboard app**, passphrase gate is active
- [x] When `DASHBOARD_ACCESS_CODE` is unset (or empty), gate is disabled — dashboard loads without login (local dev default)
- [x] `GET /login` serves the login form (see `dashboard/lib/login-page.ts`)
- [x] `POST /login` validates passphrase with constant-time comparison
- [x] On valid passphrase: signed `HttpOnly` session cookie + redirect to `/`
- [x] On invalid passphrase: login page with "Invalid access code"
- [x] Middleware protects dashboard pages and `/api/control/*` (exempt: `/login`, `/logout`)
- [x] Missing or invalid cookie → redirect to `/login`
- [x] Session TTL: `DASHBOARD_SESSION_TTL_HOURS` (default 8)
- [x] `GET /logout` clears session cookie(s) and redirects to `/login`
- [x] Rate limit: 5 failed attempts per IP per 15 minutes → 429 (`dashboard/lib/login-rate-limiter.ts`)

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
| `DASHBOARD_ACCESS_CODE_EDUCATOR` | Dual-code mode | — | Educator passphrase; sets session persona `educator` |
| `DASHBOARD_ACCESS_CODE_COMPLIANCE` | Dual-code mode | — | Compliance passphrase; sets session persona `compliance` |
| `DASHBOARD_ACCESS_CODE` | No | — | Legacy single passphrase; full nav when dual vars unset. Ignored when dual-code mode active |
| `DASHBOARD_SESSION_TTL_HOURS` | No | `8` | Session cookie lifetime in hours. |
| `COOKIE_SECRET` | Yes (when gate active) | — | HMAC signing secret. Min 32 chars. Same on dashboard (and API if minting `fb_session` for feedback). |
| `CONTROL_LAYER_API_KEY` | When API auth on | — | Server-only; used by proxy — not part of the gate but required for live data. |

---

## Login Page

Server-rendered HTML via Next.js route handler (`dashboard/lib/login-page.ts`). No client React on the login route.

*(HTML template below is representative; live markup is in `login-page.ts`.)*

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
      <form method="POST" action="/login">
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
| Name | `dp_session` | Standalone Next app: `Path=/` (see migration spec). Legacy Fastify path scope was `/dashboard`. |
| Value | HMAC-SHA256 signature of `{ exp: <unix_timestamp> }` | Stateless — no server-side session store needed |
| `HttpOnly` | `true` | Not accessible via JavaScript — XSS cannot steal the cookie |
| `Secure` | `true` (production); `false` (localhost) | Only sent over HTTPS in production |
| `SameSite` | `Strict` | Not sent on cross-site requests — CSRF protection |
| `Path` | `/` (standalone Next dashboard) | Legacy: `/dashboard` when served under Fastify |
| `Max-Age` | `DASHBOARD_SESSION_TTL_HOURS * 3600` | Configurable expiry |

### Cookie Value Structure

```
hex( HMAC-SHA256( COOKIE_SECRET, JSON.stringify({ exp: 1713100800 }) ) )
  + "."
  + base64url( JSON.stringify({ exp: 1713100800 }) )
```

The signature portion is the lowercase hex encoding of the HMAC-SHA256 digest. The payload portion is the `base64url` encoding (RFC 4648 §5, no padding) of the UTF-8 JSON payload. The two portions are joined by a single `.` separator.

Verification: split on `.`, hex-decode the signature, recompute `HMAC-SHA256(COOKIE_SECRET, payloadJson)` over the original (base64url-decoded) payload bytes, compare with `crypto.timingSafeEqual`, parse payload, check `exp > Date.now()/1000`.

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

- Given `DASHBOARD_ACCESS_CODE` set and no cookie, when navigating to `/`, then redirect to `/login`
- Given correct passphrase POST, then session cookie set and redirect to `/`
- Given invalid passphrase, then login shows error and no cookie
- Given valid cookie, when navigating to protected routes, then content loads
- Given expired cookie, then redirect to `/login`
- Given `DASHBOARD_ACCESS_CODE` unset, then dashboard loads without redirect
- Given 6 failed login attempts within 15 min, then 429
- Given `/logout`, then cookies cleared and redirect to `/login`
- Given dual-code mode and educator passphrase POST, then session cookie payload includes `"persona":"educator"` and educator nav only (after PE-002)
- Given dual-code mode and compliance passphrase POST, then session cookie payload includes `"persona":"compliance"` and full nav
- Given educator persona and `GET /decisions`, then redirect away from compliance-only route (after PE-003)

## Constraints

- **No user accounts** — passphrases are shared secrets. The school's IT admin decides who gets which code.
- **No per-user audit trail** — all sessions are anonymous. Phase 2 SSO enables per-user logging.
- **No password storage** — passphrases live in env vars only. Compared at runtime, never stored in a database.
- **Stateless sessions** — no server-side session store. The signed cookie is self-contained. Server restart does not invalidate sessions (only `COOKIE_SECRET` rotation does).
- **Dual passphrases per deployment (interim pilot)** — educator + compliance codes replace the single-code model when both dual vars are set. Legacy single `DASHBOARD_ACCESS_CODE` remains for backward compatibility until persona middleware ships.

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
| Next.js dashboard app | `docs/specs/decision-panel-ui.md`, `dashboard/` | **Implemented ✓** |
| Cookie helpers (shared scheme) | `dashboard/lib/session-cookie.ts`, `src/auth/session-cookie.ts` | **Implemented ✓** |
| Server-side API proxy | `dashboard/app/api/control/[...path]/route.ts` | **Implemented ✓** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| FERPA-defensible access control for Decision Panel | Pilot readiness gate |
| Session cookie pattern | Future admin platform auth |
| Rate-limited login | Security baseline |

---

## File Structure (current)

```
dashboard/
├── middleware.ts                  # Gate redirect + cookie check
├── app/(auth)/
│   ├── login/route.ts             # GET/POST login
│   └── logout/route.ts
├── lib/
│   ├── session-cookie.ts          # sign/verify (ports Fastify scheme)
│   ├── login-page.ts              # HTML login form
│   ├── login-rate-limiter.ts
│   └── auth-gate.ts
```

Fastify `src/auth/dashboard-gate.ts`, `dashboard-login.ts`, and `login-rate-limiter.ts` are **removed**.

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| GATE-001 | integration | Protected route with no cookie → redirect | 302 to `/login` |
| GATE-002 | integration | POST valid passphrase → cookie set + redirect | 303 to `/`, `Set-Cookie` present |
| GATE-003 | integration | POST invalid passphrase → error | 200 login, "Invalid access code" |
| GATE-004 | integration | Valid cookie → dashboard served | 200 |
| GATE-005 | integration | Expired cookie → redirect | 302 to `/login` |
| GATE-006 | integration | Gate disabled when unset | 200 without cookie |
| GATE-007–009 | unit | Cookie sign/verify/tamper | Parity with `src/auth/session-cookie.ts` |
| GATE-010 | integration | Rate limit exceeded | 429 |
| GATE-011 | integration | `/logout` clears cookies | Redirect to `/login` |

Tests: `tests/integration/dashboard-auth-gate.test.ts`, Playwright e2e in `dashboard/e2e/`.

---

## Implementation Notes

- **Gate exempt paths:** `/login`, `/logout` (see `dashboard/middleware.ts` matcher).
- **Login form:** HTML from `dashboard/lib/login-page.ts`.
- **Cookie path:** Standalone Next deployment uses `Path=/`. API and dashboard are different origins in production, so `dp_session` is not sent to `/v1/*` on the API host. **`__Host-dp_session`** recommended for production HTTPS standalone deploy — see `nextjs-amplify-dashboard-migration.md`.
- **Integration with Decision Panel:** Gate runs in middleware before App Router pages and before `/api/control/*` proxy handlers.

---

## Sibling cookie: `fb_session`

> **Added 2026-04-23** to resolve an isolation conflict surfaced during `/review` of `educator-feedback-api.plan.md`. The `dp_session` cookie specification above is **unchanged**.

To preserve API isolation, **`/login`** mints a **sibling cookie** `fb_session` alongside `dp_session` on successful passphrase match. **`/logout`** clears both.

*(When dashboard and API share one origin in legacy Fastify+SPA deploys, `dp_session` used `Path=/dashboard` so it was not sent to `/v1/*`. With split origins, isolation is by host; `fb_session` still uses `Path=/v1/decisions` for feedback API calls from the browser to the API host.)*

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| Name | `fb_session` | Disjoint from `dp_session`; name signals educator-feedback session (see `educator-feedback-api.md`). |
| Value | **Identical** to `dp_session` for the same login (same HMAC signature + `base64url` payload — both cookies are produced by `signSession(COOKIE_SECRET, maxAgeSeconds)` called once, with the resulting string set on both cookies). Callers derive an opaque `session_id` from the HMAC prefix; the identical value keeps that derivation stable across both cookies. |
| Secret | `COOKIE_SECRET` (same env var as `dp_session`) | Single rotation point; no new env vars. |
| Path | `/v1/decisions` | Browsers send `fb_session` on `/v1/decisions/*` requests used by the Educator Feedback API (`…/feedback`, `…/view`, and `…/feedback/pending`). Does **not** reach `/v1/signals`, `/v1/state`, or other `/v1/*` namespaces outside that prefix. |
| Domain | Not set | Host-only. Same property as `dp_session`. |
| Max-Age | Same as `dp_session` (default 8h, overridable via `DASHBOARD_SESSION_TTL_HOURS`) | Both cookies expire together; no partial-auth states. |
| HttpOnly | `true` | Not JS-accessible. |
| Secure | `true` in production (`NODE_ENV === 'production'`) | HTTPS-only in prod. |
| SameSite | `Strict` | Blocks CSRF identical to `dp_session`. |

**Consumer contract.** Any spec that needs to authenticate educator feedback requests must reference this section and gate on `fb_session` — not `dp_session`. New `/v1/*` namespaces that need dashboard-gated auth must mint their own sibling cookie following this same pattern (name, path scope, same `COOKIE_SECRET`) rather than widening `dp_session`.

**Logout.** `GET /logout` clears `dp_session` and `fb_session` before redirecting to `/login`.

**Tests.** Dual-cookie behavior: `tests/integration/dashboard-auth-gate.test.ts`, educator feedback: `educator-feedback-api.md` (FEEDBACK-003).

---

*Spec created: 2026-04-14 | Updated: 2026-06-29 (§ Dual access codes — educator/compliance passphrases, persona cookie, route allowlists; legacy single-code fallback) | Prior: 2026-06 (Next.js middleware; Fastify gate removed) | Sibling cookie: 2026-04-23 | Depends on: decision-panel-ui.md, dashboard-design-requirements.md §D5, nextjs-amplify-dashboard-migration.md*
