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
3. **Report** - Show actionable drift details
4. **Fix** - Optionally apply corrections (with user confirmation)

## Instructions

When the user invokes `/sync-contracts`:

1. Read all JSON Schemas from `src/contracts/schemas/` (source of truth)
2. Read `docs/api/openapi.yaml` and `docs/api/asyncapi.yaml`
3. For each schema, compare against its API doc counterparts using this mapping:

   | JSON Schema `$id`  | OpenAPI path                        | AsyncAPI path                  |
   | ------------------- | ----------------------------------- | ------------------------------ |
   | `decision`          | `components.schemas.Decision`       | `components.schemas.Decision`  |
   | `signal-envelope`   | `components.schemas.SignalEnvelope` | `components.schemas.Signal`    |

4. Compare these structural properties:
   - `required` arrays (set equality)
   - `properties` keys (set equality)
   - `enum` values where present (sorted array equality)
   - Nested `required`/`properties` on sub-objects (e.g., `trace`, `metadata`)
5. For each mismatch found, report:
   - Which field/enum is mismatched
   - What the JSON Schema says (source of truth)
   - What the API doc says (drifted value)
   - Suggested fix (update the API doc to match the JSON Schema)
6. If no mismatches found, report "All contracts aligned."
7. If mismatches found, offer to apply fixes. Only apply after user confirms.
8. After fixes are applied (or if already aligned), run `npm run validate:contracts` to confirm.

## Report Format

### When Aligned

```markdown
## Contract Sync Report

✅ All contracts aligned.

| Schema           | OpenAPI | AsyncAPI |
| ---------------- | ------- | -------- |
| decision         | ✅       | ✅        |
| signal-envelope  | ✅       | ✅        |

No action needed.
```

### When Drift Detected

```markdown
## Contract Sync Report

⚠️ Contract drift detected — 2 mismatch(es) found.

### DRIFT-1: Decision `trace.required` — OpenAPI missing field

- **Source of truth** (JSON Schema): `["signal_id", "decision_id", "matched_rule_id", "timestamp"]`
- **Drifted** (OpenAPI `Decision.trace.required`): `["signal_id", "decision_id", "timestamp"]`
- **Fix**: Add `"matched_rule_id"` to `docs/api/openapi.yaml` → `components.schemas.Decision.properties.trace.required`

### DRIFT-2: Decision `decision_type` enum — AsyncAPI extra value

- **Source of truth** (JSON Schema): `["allow", "deny", "flag", "defer"]`
- **Drifted** (AsyncAPI `Decision.decision_type.enum`): `["allow", "deny", "flag", "defer", "promote"]`
- **Fix**: Remove `"promote"` from `docs/api/asyncapi.yaml` → `components.schemas.Decision.properties.decision_type.enum`

Would you like me to apply these fixes?
```

## Next Step

After running `/sync-contracts`, suggest:

> Run `/review` to verify contract alignment and overall quality.

## References

- JSON Schemas: `src/contracts/schemas/`
- OpenAPI spec: `docs/api/openapi.yaml`
- AsyncAPI spec: `docs/api/asyncapi.yaml`
- Enforcement rule: `.cursor/rules/contract-enforcement/RULE.md`
- Validation script: `scripts/validate-contracts.ts`
