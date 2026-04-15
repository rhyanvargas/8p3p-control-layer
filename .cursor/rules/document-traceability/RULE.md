---
description: "Document traceability rules - ensuring specs, plans, and implementations stay correctly scoped"
alwaysApply: true
---

# Document Traceability Rules

These rules ensure that specifications, plans, and implementations maintain proper separation of concerns and cross-document references are explicit and correct.

## Document Hierarchy

```
docs/foundation/           ← Source of truth (contracts, validation rules)
    ↓
docs/specs/               ← Component specifications (derive from foundation)
    ↓
.cursor/plans/            ← Implementation plans (derive from specs)
    ↓
src/                      ← Implementation (realizes plans)
    ↓
tests/                    ← Verification (validates implementation)
```

## Single Source of Truth Principle

Each function, type, or interface should be **defined in exactly one place**:

| Artifact Type | Defined In | Referenced By |
|---------------|-----------|---------------|
| API contracts | `docs/foundation/...Interface Contracts.md` | All specs |
| Component functions | Component's spec (e.g., `docs/specs/signal-log.md`) | Dependent specs |
| Error codes | Spec lists them; `src/shared/error-codes.ts` implements | Plans, implementation |
| Types | Spec defines structure; `src/shared/types.ts` implements | Plans, implementation |
| Contract tests | Spec defines test IDs and vectors; `tests/contracts/` implements | Plans (as tasks), `/review` (as checklist) |

## Cross-Document Reference Rules

### DO: Reference with explicit paths
```markdown
**Dependency:** Requires `getSignalsByIds()` function (see `docs/specs/signal-log.md`)
```

### DON'T: Define functions that belong elsewhere
```markdown
<!-- WRONG: Defining a Signal Log function in STATE Engine spec -->
**Requires new Signal Log function:**
getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[]
```

### Correct Approach
1. Identify the function belongs in Signal Log
2. Update `docs/specs/signal-log.md` to add the function
3. Reference it in STATE Engine spec as a dependency

## Issue Traceability Protocol

When an issue is discovered:

### Step 1: Root Cause Analysis
- **What document introduced this requirement?**
- **Is this a local issue or a cross-document dependency?**
- **Which document should own the fix?**

### Step 2: Issue Registry
Track all issues with explicit assignments:

| ID | Issue | Root Cause Document | Remediation Document | Status |
|----|-------|--------------------|--------------------|--------|
| ISS-001 | Missing function X | `signal-log.md` incomplete | `signal-log.md` | Pending |

### Step 3: Remediation Assignment

| Issue Type | Correct Remediation Location |
|------------|------------------------------|
| Missing dependency function | Source component's spec |
| Missing error code | Implementation task in plan |
| Unclear requirement | Source spec |
| Implementation bug | Source code file |
| Missing test | Test file |

## Spec Scoping Rules

### A spec SHOULD contain:
- Functions/interfaces this component exposes
- Error codes this component uses
- Dependencies on other components (as references)
- Contract tests for this component

### A spec SHOULD NOT contain:
- Function definitions that belong to other components
- Implementation details (save for plan)
- Inline type definitions that exist in `src/shared/types.ts`

## Spec ↔ implementation parity (prevent drift)

After coding (especially before merge), reconcile **literal** details between `docs/specs/`, `.cursor/plans/`, and `src/`:

| Drift type | Example | Fix |
|------------|---------|-----|
| **Numeric constants** in validation vs spec prose | Spec said bind to `0` but `a / b` needs non-zero test values | Update the spec sentence to match the chosen constant (`1` in `validateTransformExpression`). |
| **Public API shape** | Spec describes “two overloads” but ESLint rejected duplicate `export function` | Prefer TS overload declarations + one implementation; if tooling required a rule change, document in `eslint.config.js` why `no-redeclare` is off for `.ts`. |
| **Immutability of shared sets** | Plan said `ReadonlySet`; code used `Set` | Type the export as `ReadonlySet<string>` so accidental `.add()` is a type error. |
| **Finished plans** | Plan body still says old literals | Update plan TASK details when behavior changes, or add “superseded by spec section X” in the report. |

**Agent checklist:** When `/implement-spec` or `/review --spec` finds a spec/plan mismatch, **fix the owning document** (usually the spec) in the same PR unless the implementation is wrong.

## Validation During Review

When reviewing a spec, verify:

1. **No orphaned definitions** - Every function defined has a clear owner
2. **Explicit dependencies** - All cross-component dependencies reference source docs
3. **Correct error code handling** - Existing codes referenced, new codes listed for implementation
4. **No scope creep** - Spec only defines what this component owns
5. **Test traceability** - Every spec-defined contract test ID (e.g., DEC-001) has a corresponding test implementation in `tests/contracts/`, with one explicit `it(...)` per ID. Every new public export has at least one direct test.
6. **Error assertion precision** - Contract tests for error paths must assert exact expected error codes (e.g., `missing_required_field`), not just presence/type of `code`.

## Recovery Protocol

If traceability is violated:

1. **Stop** - Do not proceed with implementation
2. **Enumerate** - List all issues in an Issue Registry
3. **Root cause** - Identify which document should own each fix
4. **Remediate** - Fix issues in correct documents, in dependency order
5. **Verify** - Re-review to confirm traceability is restored
