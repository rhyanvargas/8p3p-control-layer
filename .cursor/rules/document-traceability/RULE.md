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

## Validation During Review

When reviewing a spec, verify:

1. **No orphaned definitions** - Every function defined has a clear owner
2. **Explicit dependencies** - All cross-component dependencies reference source docs
3. **Correct error code handling** - Existing codes referenced, new codes listed for implementation
4. **No scope creep** - Spec only defines what this component owns

## Recovery Protocol

If traceability is violated:

1. **Stop** - Do not proceed with implementation
2. **Enumerate** - List all issues in an Issue Registry
3. **Root cause** - Identify which document should own each fix
4. **Remediate** - Fix issues in correct documents, in dependency order
5. **Verify** - Re-review to confirm traceability is restored
