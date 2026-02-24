# Tenant-Scoped Payload Field Mappings (DEF-DEC-006)

## Overview
Phase 2 introduces an **opt-in, per-tenant payload normalization + enforcement layer** during signal ingestion. The goal is to allow stricter payload semantics per tenant (required fields, alias normalization, primitive type checks) **without breaking vendor-agnosticism** or changing the `POST /v1/signals` contract shape.

This is explicitly scoped in `docs/foundation/ip-defensibility-and-value-proposition.md` under “Phase 2: Tenant-Scoped Field Mappings (DEF-DEC-006)”.

## Requirements

### Functional
- [ ] **Opt-in per tenant**: Enforcement MUST apply only when a payload mapping exists for the incoming `org_id`. When absent, ingestion behavior remains Phase 1 (payload is opaque except structural validation + forbidden key scan).
- [ ] **Pipeline placement**: Tenant mapping normalization/validation MUST run after structural schema validation and forbidden semantic key detection, and before idempotency persistence.
- [ ] **Alias normalization**: If a canonical field is missing and exactly one alias candidate is present, the system MUST copy the alias value into the canonical field path.
- [ ] **No destructive edits**: Normalization MUST NOT delete alias fields; it may only add canonical fields.
- [ ] **Required field enforcement**: After normalization, all configured required canonical payload fields MUST be present (non-null; strings must be non-blank) or ingestion MUST reject.
- [ ] **Primitive type enforcement**: When configured, fields MUST match expected primitive types (`string`, `number`, `boolean`, `object`) or ingestion MUST reject.
- [ ] **Config loading**: When `TENANT_FIELD_MAPPINGS_PATH` is set at runtime and points to a valid JSON file, the server MUST load it at startup. If the file is missing/invalid, the server MUST **fail open** (start normally) and log a warning.

### Acceptance Criteria
- Given a tenant mapping that requires `payload.stabilityScore`, when a signal arrives without `stabilityScore` and without any configured alias present, then ingestion returns `rejected` with `missing_required_field` and `field_path=payload.stabilityScore`.
- Given a tenant mapping with `aliases.stabilityScore = ["stability_score"]` and `required=["stabilityScore"]`, when a signal arrives with `payload.stability_score=0.5`, then ingestion returns `accepted` and the stored payload includes both `stability_score` and `stabilityScore`.
- Given a tenant mapping with `aliases.stabilityScore = ["a","b"]`, when a signal arrives with both `payload.a` and `payload.b` present and `payload.stabilityScore` absent, then ingestion returns `rejected` with `invalid_format` and `field_path=payload.stabilityScore`.
- Given a tenant mapping with `types.level="number"`, when a signal arrives with `payload.level="5"`, then ingestion returns `rejected` with `invalid_type` and `field_path=payload.level`.

## Constraints
- Tenant mappings MUST remain **declarative** and must not embed domain logic (e.g., computed transforms such as dividing by 100).
- Enforcement MUST preserve Phase 1 contract stability: no route renames, no changes to the `SignalEnvelope` schema shape.
- The system MUST remain vendor-agnostic: mappings are tenant-owned configuration, not hardcoded partner logic.

## Out of Scope
- Transform functions (e.g., “map `mathMastery` to `stabilityScore` via `value/100`”).
- Remote configuration stores (DynamoDB/S3/etc.) and dynamic reload; Phase 2 uses a static file load via env var.
- Per-tenant OpenAPI schema generation (payload remains “object” in Phase 2).

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `POST /v1/signals` ingestion pipeline ordering + behavior | `docs/specs/signal-ingestion.md` | Defined ✓ |
| DEF-DEC-006 motivation and scope | `docs/foundation/ip-defensibility-and-value-proposition.md` | Defined ✓ |
| Canonical error codes | `src/shared/error-codes.ts` | Defined ✓ |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| `normalizeAndValidateTenantPayload()` | Signal Ingestion (Stage 1) |

## Error Codes

### Existing (reuse)
| Code | Source |
|------|--------|
| `missing_required_field` | Signal Ingestion |
| `invalid_type` | Signal Ingestion |
| `invalid_format` | Signal Ingestion |
| `payload_not_object` | Signal Ingestion |

### New (add during implementation)
| Code | Description |
|------|-------------|
| (none) | All errors are expressed via existing codes |

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| SIG-API-012 | Required canonical field enforced | Mapping requires `stabilityScore`, payload missing it | `rejected`, `missing_required_field`, `field_path=payload.stabilityScore` |
| SIG-API-013 | Alias normalization satisfies required canonical | Mapping aliases `stabilityScore <- stability_score`, payload has alias | `accepted`; stored payload includes both keys |
| SIG-API-014 | Alias conflict rejected | Canonical missing; multiple alias candidates present | `rejected`, `invalid_format`, `field_path=payload.stabilityScore` |
| SIG-API-015 | Type enforcement rejected | Mapping types `level=number`, payload `level="5"` | `rejected`, `invalid_type`, `field_path=payload.level` |

> **Test strategy note:** These are contract-level HTTP tests over `POST /v1/signals` with store-side assertions for normalization side effects. Unit tests for the mapping function are optional defense-in-depth and do not replace these.

## Notes

### Configuration File Shape (v1)
The tenant mappings file loaded by `TENANT_FIELD_MAPPINGS_PATH` is JSON:

```json
{
  "version": 1,
  "tenants": {
    "org-A": {
      "payload": {
        "required": ["stabilityScore", "timeSinceReinforcement"],
        "aliases": {
          "stabilityScore": ["stability_score"],
          "timeSinceReinforcement": ["time_since_reinforcement_seconds"]
        },
        "types": {
          "stabilityScore": "number",
          "timeSinceReinforcement": "number"
        }
      }
    }
  }
}
```

