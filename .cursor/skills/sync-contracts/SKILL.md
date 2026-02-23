---
name: sync-contracts
description: Detect and resolve contract drift between JSON Schemas and OpenAPI/AsyncAPI. Use when the user runs /sync-contracts.
disable-model-invocation: true
---

# /sync-contracts

Detect and resolve contract drift between JSON Schemas and API documentation.

## Usage

Check for drift:
```
/sync-contracts
```

## Behavior

1. **Load** - Read all JSON Schemas and API docs
2. **Compare** - Detect mismatches between sources
3. **Report** - Emit precise drift details
4. **Fix** - Apply only after user confirmation

## Instructions

When the user invokes `/sync-contracts`:

1. Read all JSON Schemas from `src/contracts/schemas/` (source of truth)
2. Read `docs/api/openapi.yaml` and `docs/api/asyncapi.yaml`
3. Use mapping from `.cursor/rules/contract-enforcement/RULE.md` and verify it matches `scripts/validate-contracts.ts`
4. Compare:
   - `required` arrays
   - `properties` keys
   - `enum` values
   - nested `required`/`properties` for key objects (`trace`, `metadata`, etc.)
5. For each mismatch, report:
   - Schema id + path
   - Source value (JSON Schema)
   - Drifted value (OpenAPI/AsyncAPI)
   - Exact file/path to update
6. If no mismatches, report "All contracts aligned."
7. If mismatches exist, ask for confirmation before applying fixes.
8. After changes, run:
   - `npm run validate:contracts`
   - `npm run validate:api` when OpenAPI changed
## Output Format

- **Status**: aligned | drift detected
- **Drift items**: bullet list with source vs drifted value
- **Validation**: `validate:contracts` (and `validate:api` when applicable)

## Next Steps

After sync-contracts:
- If drift fixed: run `npm run validate:contracts` and `npm run validate:api` to confirm
- Run `/review` to verify contract alignment and overall quality

