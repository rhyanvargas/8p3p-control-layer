# /review

Perform a post-implementation quality review.

## Usage

Review recent changes:
```
/review
```

Review specific files:
```
/review path/to/file.ts
```

Review against a spec:
```
/review --spec docs/specs/{feature-name}.md
```

## Behavior

1. **Scan** - Identify changed or specified files
2. **Analyze** - Check for issues and improvements
3. **Report** - Provide actionable feedback
4. **Fix** - Optionally apply suggested fixes

## Review Checklist

### Code Quality
- [ ] Clear, descriptive naming
- [ ] Functions are focused and small
- [ ] No unnecessary complexity
- [ ] Error handling is appropriate

### Standards Compliance
- [ ] Follows coding style rules
- [ ] Matches architectural patterns
- [ ] Consistent with existing code

### Testing
- [ ] Tests exist for new code
- [ ] Edge cases covered
- [ ] Tests are readable

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No obvious vulnerabilities

### Performance
- [ ] No obvious inefficiencies
- [ ] Appropriate data structures
- [ ] No unnecessary computations

### Document Traceability (for spec reviews)
- [ ] All dependencies reference correct source documents
- [ ] No inline definitions that belong in other specs
- [ ] Error codes listed but implementation deferred to plan
- [ ] Cross-document references use explicit paths

## Instructions

When the user invokes `/review`:

1. Identify the scope:
   - If no arguments, review recent changes (git diff)
   - If file path provided, review that file
   - If --spec provided, verify against spec requirements
2. For each file in scope:
   - Check against the review checklist
   - Identify issues with severity (error, warning, info)
   - Suggest specific improvements
3. **For each issue found, perform root cause analysis:**
   - Identify which document is responsible (spec, plan, implementation, test)
   - Determine if the issue originated in this document or was inherited from a dependency
   - Assign remediation to the correct document
4. Generate a review report with Issue Registry
5. If requested, apply fixes automatically (only to appropriate documents)
6. **Suggest next step**: If issues found, suggest fixing and re-running `/review`. If all checks pass, tell the user the implementation is ready to commit or open a PR

## Issue Traceability Protocol

When issues are discovered during review, follow this protocol:

### Step 1: Enumerate Issues
Create an Issue Registry table:

| ID | Issue | Root Cause | Responsible Document | Status |
|----|-------|-----------|---------------------|--------|
| ISS-001 | {description} | {why this happened} | {doc path} | Needs remediation |

### Step 2: Root Cause Analysis
For each issue, determine:
- **Origin**: Where did this requirement/definition first appear?
- **Scope**: Is this issue local to one document or cross-cutting?
- **Responsible Document**: Which document should be modified?

### Step 3: Remediation Assignment
Apply the **Single Source of Truth** principle:
- **Specs** define requirements and interfaces
- **Plans** define implementation tasks
- **Implementation** realizes the plan
- **Tests** verify the implementation

| Issue Type | Remediation Location |
|------------|---------------------|
| Missing function in dependency | Dependency's spec (e.g., `signal-log.md`) |
| Missing error code | Implementation task in plan |
| Unclear requirement | Source spec |
| Cross-document dependency | Add to Dependencies section, define in source |
| Implementation bug | Source code |
| Missing test | Test file |

### Step 4: Apply Corrections Deliberately
- **Never** define a function/type in a dependent spec that belongs in the source spec
- **Always** update the source document first, then reference it
- **Verify** changes stay within document scope

## Report Format

```markdown
## Review Summary

**Files Reviewed**: 3
**Issues Found**: 2 errors, 1 warning

### Issue Registry

| ID | Issue | Root Cause | Responsible Document | Status |
|----|-------|-----------|---------------------|--------|
| ISS-001 | Missing function X | Spec incomplete | `docs/specs/source.md` | Needs remediation |
| ISS-002 | Error code not defined | Implementation task | Plan (deferred) | Deferred to impl |

### Errors
- `file.ts:42` - Missing error handling for API call
  - **Root Cause**: Error handling requirement not in spec
  - **Remediation**: Update `docs/specs/feature.md` to add error handling requirement

### Warnings  
- `file.ts:15` - Function could be simplified

### Suggestions
- Consider extracting common logic to a utility

### Spec Compliance (if --spec provided)
- [x] Requirement 1: Implemented
- [ ] Requirement 2: Partially implemented - missing edge case

### Cross-Document Dependencies
- [x] Dependency A: Defined in source spec, correctly referenced
- [ ] Dependency B: **Incorrectly defined inline** - should be in `source.md`
```

## Next Steps

After review:
- Address any errors
- Consider warnings and suggestions
- Re-run `/review` after fixes
