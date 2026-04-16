---
name: draft-spec
description: Generate a specification document from a feature idea or brief description. Use when the user runs /draft-spec.
disable-model-invocation: true
---

# /draft-spec

Generate a specification document from a feature idea or brief description.

## Usage

```
/draft-spec "your feature idea or description"
```

## Behavior

1. **Clarify** - Resolve missing scope/acceptance criteria
2. **Research** - Check related specs/code for dependencies
3. **Draft** - Create `docs/specs/{feature-name}.md`
4. **Gate** - Confirm test IDs and dependency ownership

## Instructions

When the user invokes `/draft-spec`:

1. Parse the user request into: problem, user, expected outcomes.
2. If unclear, ask targeted clarifying questions before drafting.
3. Search related specs and code for reuse/dependencies.
4. **Check existing solutions** (per `.cursor/rules/prefer-existing-solutions/RULE.md`):
   - Query relevant MCP servers (AWS docs, DynamoDB modeling, IaC) for official patterns and best practices for each external integration the feature touches.
   - Check `package.json` for existing libraries that already solve parts of the problem.
   - Reference official SDK/library docs for recommended abstractions (e.g. high-level clients over low-level + manual serialization).
   - Document findings in the spec's Dependencies or Notes section. If custom code is proposed where a library exists, include a justification (cheaper, faster, less complex, or higher DX).
5. Draft spec with these required sections:
   - Overview
   - Functional requirements + acceptance criteria
   - Constraints + out of scope
   - Dependencies (explicit source doc references)
   - Error codes (existing vs new)
   - Contract tests (explicit test IDs)
   - **Concrete Values Checklist** (see below)
   - **Production Correctness Notes** (see below)
6. **Concrete Values Checklist** — for each normative literal the spec introduces, pin the value **in the spec itself**, not in the plan. A spec that leaves these to be decided downstream invites paraphrase-drift:
   - Wire formats: byte order of signed payloads (`payload.hmac` vs `hmac.payload`), encoding of each segment (hex / base64url / base64 / utf-8), separator character.
   - HTTP specifics: exact status codes for each transition (`302` vs `303`, `200` vs `401` on re-render), `Content-Type` of responses, required response headers (`Retry-After`, `Cache-Control`).
   - Cookie attributes: complete `Name | Value | HttpOnly | Secure | SameSite | Path | Max-Age` table; `__Host-` prefix constraints (requires `Secure=true`, `Path=/`, no `Domain`) if prefix is used.
   - Env vars: full table with `Variable | Required | Default | Type | Description`. Every env var the component reads must appear here.
   - Constants: rate-limit window + max, TTL defaults, body size limits, min-length checks, exempt route lists.
   - Route list: every route the component registers, with method + path + auth exemption status.
7. **Production Correctness Notes** — add a short section covering cross-cutting infra the component depends on. Minimum: one sentence per item, `N/A — <why>` is acceptable but must be explicit:
   - Proxy / `trustProxy` (affects `request.ip`, `request.protocol`, rate-limiting correctness).
   - CORS policy (origins, credentials, preflight).
   - CSP / other security headers.
   - Cookie prefix constraints vs `Path=` scoping.
   - Content-type parsing (e.g. `application/x-www-form-urlencoded` requires `@fastify/formbody`).
   - Body size limits for untrusted inputs.
   - Rate-limit storage scope (in-process Map vs shared Redis/DynamoDB; single-instance vs horizontal scaling).
   - Error-code surface visible to end users (to avoid leaking internals).
8. Enforce dependency ownership:
   - Reference cross-component functions/types in source specs
   - Do not define another component's interfaces inline
9. Save file at `docs/specs/{feature-name}.md`.
10. Recommend `/plan-impl docs/specs/{feature-name}.md`.

## Spec Template

```markdown
# {Feature Name}

## Overview
{One paragraph describing what this feature does and why}

## Requirements

### Functional
- [ ] {Requirement 1}
- [ ] {Requirement 2}

### Acceptance Criteria
- Given {context}, when {action}, then {result}

## Constraints
- {Technical or business constraint}

## Out of Scope
- {What this does NOT include}

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `functionName()` | `docs/specs/source.md` | Defined ✓ / **GAP** |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| `myFunction()` | Decision Engine (Stage 4) |

## Error Codes

### Existing (reuse)
| Code | Source |
|------|--------|
| `error_code` | Signal Ingestion |

### New (add during implementation)
| Code | Description |
|------|-------------|
| `new_error_code` | {description} |

## Contract Tests

Define the tests that verify this component's contract. These become implementation requirements — `/plan-impl` must include tasks for each, and `/review` will verify they exist.

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| {PREFIX}-001 | {Happy path} | {Valid input} | {Expected output} |
| {PREFIX}-002 | {Validation failure} | {Invalid input} | rejected, `{error_code}` |

> **Test strategy note:** Distinguish tests that exercise the full flow end-to-end from tests that exercise validators/safety-nets directly. Document which strategy each test uses so implementers know where to place them.

## Concrete Values Checklist

> Pin every normative literal **here**, in the spec. `/plan-impl` quotes these verbatim into `## Spec Literals` and tasks cite them by anchor. Leaving any row as "TBD by plan" invites paraphrase-drift.

### Wire formats / signed payloads
- Byte order: `<segmentA>.<segmentB>` — specify which segment is which.
- Encoding per segment: hex | base64url | base64 | utf-8 json.
- Separator character.

### HTTP behavior
| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| {e.g. unauthenticated → login} | 302 | — | `Location` |
| {e.g. invalid credential re-render} | 200 | `text/html` | — |

### Cookies (if applicable)
| Name | HttpOnly | Secure | SameSite | Path | Max-Age |
|------|----------|--------|----------|------|---------|
| {cookie_name} | true | true (prod) / false (dev) | Strict | /path | {seconds} |

### Env vars
| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `{VAR}` | yes/no | `{default}` | string/number/bool | {what it controls} |

### Constants / limits
- {e.g. Rate limit: 5 attempts / 15 minutes / per IP.}
- {e.g. Body size limit: 1 KB for login POST.}

### Routes registered
| Method | Path | Auth exempt? |
|--------|------|--------------|
| GET | `/path` | yes/no |

## Production Correctness Notes

> One sentence per item. `N/A — <why>` is acceptable but must be explicit. This section catches cross-cutting infra concerns that skip the functional-requirements list.

- **Proxy / `trustProxy`**: {e.g. Fastify must be started with `trustProxy: true` so `request.ip` reflects the real client IP for rate limiting.}
- **CORS**: {origins, credentials, preflight — or `N/A — same-origin only`}
- **CSP / security headers**: {policy or `N/A — served behind CDN with policy X`}
- **Cookie prefix vs Path scoping**: {`__Host-` requires `Path=/`; if narrower path needed, drop the prefix and document why}
- **Content-type parsing**: {which Fastify plugins are required; e.g. `@fastify/formbody` for form POSTs}
- **Body size limits**: {limit + rationale, or `N/A — uses Fastify default 1 MB`}
- **Rate-limit storage scope**: {in-process Map vs shared store; document horizontal-scaling implications}
- **Error-code surface**: {which internal codes are user-visible; none should leak DB schema or stack traces}

## Notes
- {Any additional context}
```

## Next Steps

After generating the spec:
- Review requirements and test IDs with stakeholders
- Run `/plan-impl docs/specs/{feature-name}.md`
