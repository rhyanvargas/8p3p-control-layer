# Archived Review: API Contract Foundation (pre–next plan task)

**Archived from:** `docs/api/REVIEW-api-contract-foundation.md`  
**Archived on:** 2026-02-11  
**Note:** This is a historical snapshot and may be stale vs current implementation.  

---

# Review: API Contract Foundation (pre–next plan task)

**Scope:** Work done so far for the API Contract Foundation plan (OpenAPI spec, validation, docs, rule update).  
**Reviewed:** `docs/api/openapi.yaml`, `package.json`, `docs/foundation/setup.md`, `scripts/validate-api.sh`, `.cursor/rules/control-layer-constraints/RULE.md`, `.cursor/plans/api_contract_foundation_cab655d0.plan.md`

---

## Review Summary

**Files Reviewed:** 6 (openapi.yaml, package.json, setup.md, validate-api.sh, RULE.md, plan)  
**Issues Found:** 0 errors, 1 warning (addressed during review)

### Issue Registry

| ID     | Issue | Root Cause | Responsible Document | Status |
|--------|--------|------------|------------------------|--------|
| ISS-001 | Rule did not reference OpenAPI/AsyncAPI specs | Phase 5 “update project rules” not yet applied | `.cursor/rules/control-layer-constraints/RULE.md` | **Fixed** – added contract-first bullet and `npm run validate:api` |

---

## What Was Done So Far

- **Phase 1 – OpenAPI spec:** `docs/api/openapi.yaml` created with OpenAPI 3.1.0; all three REST endpoints documented (`POST /v1/signals`, `GET /v1/signals`, `GET /v1/decisions`). Schemas align with `src/contracts/schemas/signal-envelope.json` and with `docs/specs/signal-ingestion.md` and `docs/specs/signal-log.md`.
- **Validation:** Switched from deprecated `@apidevtools/swagger-cli` to `@redocly/cli`; added `validate:api` script and optional `scripts/validate-api.sh`; OpenAPI lint passes (security and license satisfied).
- **Docs:** `docs/foundation/setup.md` updated with Validate OpenAPI Spec section, NPM Scripts Reference entries for validate scripts, and troubleshooting for `NPM_CONFIG_DEVDIR` and `validate-api.sh`.
- **Plan:** Plan doc updated to use `redocly lint` and validate-script todo marked completed.
- **Rule:** `.cursor/rules/control-layer-constraints/RULE.md` updated to reference `docs/api/openapi.yaml` and `docs/api/asyncapi.yaml` and to require `npm run validate:api`.

---

## Checklist Results

### Code / Config Quality

- Clear naming and focused scripts; `validate-api.sh` is minimal and documented.
- No unnecessary complexity; error handling is appropriate (redocly exit code, `set -e` in script).

### Standards Compliance

- Matches plan (OpenAPI 3.1, versioned paths, security and license present).
- Consistent with existing setup (scripts in `package.json`, docs in `docs/foundation/setup.md`).

### Testing

- No new code under test; OpenAPI spec is validated by `redocly lint`. Existing contract tests still apply to implementation.

### Security

- No secrets; `security: []` explicitly documents no auth for current operations.

### Document Traceability

- OpenAPI descriptions reference `docs/specs/signal-ingestion.md` and `docs/specs/signal-log.md`.
- Component comments reference `src/contracts/schemas/signal-envelope.json` and Component Interface Contracts.
- No inline definitions that belong only in other specs; error codes and shapes match existing contracts.

### Cross-Document Dependencies

- Signal ingestion: OpenAPI matches spec (POST /v1/signals, SignalEnvelope, SignalIngestResult).
- Signal log: OpenAPI matches spec (GET /v1/signals, query params, SignalLogReadResponse).
- Decisions: GET /v1/decisions and GetDecisionsResponse documented; implementation deferred per plan.

---

## Spec Compliance (Plan vs Implementation)

- [x] OpenAPI spec created with all three endpoints.
- [x] validate:api script added (redocly lint).
- [x] Project rules updated to reference specs and validate:api.
- [ ] API versioning (/v1 prefix in server) – **pending**.
- [ ] Swagger integration – **pending**.
- [ ] AsyncAPI spec – **pending**.
- [ ] review-consistency – **pending** (this review is a step toward that).

---

## Next Steps

1. **Commit current work** (openapi.yaml, package.json, setup.md, validate-api.sh, RULE.md, plan, and this review file if desired).
2. **Next plan task:** Implement **api-versioning** (add `/v1` prefix to all routes in `server.ts` per Phase 2 of the plan).
3. Optionally run `/review --spec docs/api/openapi.yaml` again after versioning and swagger are in place to confirm endpoints and schemas align with the running server.

Implementation for the completed items is in good shape and ready to commit before moving on to the next plan task.
