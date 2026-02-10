---
description: "Contract sync protocol — ensures JSON Schemas, OpenAPI, and AsyncAPI stay aligned"
globs:
  - "src/contracts/**"
  - "docs/api/**"
---

# Contract Enforcement

When editing files in `src/contracts/` or `docs/api/`, follow this protocol to prevent contract drift.

## Single Source of Truth

`src/contracts/schemas/*.json` is the authoritative source for all data shapes. OpenAPI and AsyncAPI docs are derived representations — they must mirror the JSON Schemas, not the other way around.

## Propagation Order

When modifying any schema:

1. **Update the JSON Schema first** (`src/contracts/schemas/*.json`)
2. **Propagate to OpenAPI** (`docs/api/openapi.yaml`)
3. **Propagate to AsyncAPI** (`docs/api/asyncapi.yaml`)

Never add fields, required entries, or enum values to OpenAPI/AsyncAPI that don't exist in the corresponding JSON Schema.

## What to Keep in Sync

| Property           | Sync required? | Notes                                              |
| ------------------ | -------------- | -------------------------------------------------- |
| `required` arrays  | Yes            | Must be set-equal across all sources                |
| `properties` keys  | Yes            | Must be set-equal across all sources                |
| `enum` values      | Yes            | Must match as sorted arrays                         |
| Nested sub-objects | Yes            | `required` + `properties` one level deep (e.g., `trace`, `metadata`) |
| `description`      | No             | Documentation-only, may differ per context          |
| `example`          | No             | Documentation-only, may differ per context          |

## Schema Mapping

| JSON Schema `$id`  | OpenAPI path                        | AsyncAPI path                  |
| ------------------- | ----------------------------------- | ------------------------------ |
| `decision`          | `components.schemas.Decision`       | `components.schemas.Decision`  |
| `signal-envelope`   | `components.schemas.SignalEnvelope` | `components.schemas.Signal`    |

## Verification

After any schema change, run:

```bash
npm run validate:contracts
```

This must pass before considering the task complete.

## Relationship to Other Rules

- **`control-layer-constraints`** defines *what* contracts must exist and their behavioral guarantees.
- **This rule** defines *how* to keep contract files in sync when changes are made.

## References

- JSON Schemas: `src/contracts/schemas/`
- OpenAPI spec: `docs/api/openapi.yaml`
- AsyncAPI spec: `docs/api/asyncapi.yaml`
- Validation script: `scripts/validate-contracts.ts`
- Spec docs: `docs/specs/*.md`
