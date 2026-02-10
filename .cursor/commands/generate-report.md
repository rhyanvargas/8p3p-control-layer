# /generate-report

Generate an executive-level changelog report. Adapts to what actually changed — API routes, policy rules, schema updates, bug fixes, or infrastructure. Not every report needs screenshots; not every report needs curl output. The report reflects reality.

## Usage

```
/generate-report                              # auto-detect changes since last report or tag
/generate-report since v1.0.0                 # changes since a specific tag/commit
/generate-report policy update — added escalate rule
/generate-report milestone: POC v1 complete   # full milestone summary (includes API evidence)
```

## Behavior

1. **Detect** — Determine what changed and classify change types
2. **Assess** — Decide which report sections are relevant
3. **Verify** — Run tests; gather live evidence only if warranted
4. **Compose** — Write an adaptive report scoped to the changes
5. **Deliver** — Save to `docs/reports/` with date-stamped filename

---

## Instructions

### Step 1: Detect What Changed

Determine the diff baseline. Use the **first match**:

1. If the user provides a ref (tag, commit, branch): `git diff {ref}...HEAD`
2. If previous reports exist in `docs/reports/`: use the date of the most recent report to find commits since then via `git log --since`
3. Fallback: `git diff HEAD~10` (last 10 commits)

Run these commands to build a change inventory:

```bash
git log {baseline}..HEAD --oneline                    # commit summary
git diff {baseline}..HEAD --stat                      # files changed
git diff {baseline}..HEAD --name-status               # added/modified/deleted
```

### Step 2: Classify Changes

Categorize every changed file into one or more change types:

| Change Type | File Patterns | Report Impact |
|-------------|---------------|---------------|
| **API** | `src/ingestion/`, `src/output/`, `docs/api/openapi.yaml`, route files | Include endpoint table, live curl responses, Swagger screenshots |
| **Policy** | `src/decision/policy*.json`, `src/decision/engine*` | Include before/after rule comparison, decision trace example |
| **Schema** | `src/contracts/schemas/`, `docs/api/asyncapi.yaml` | Include schema diff summary, contract alignment status |
| **State Engine** | `src/state/` | Include state versioning impact, migration notes if any |
| **Data Layer** | `src/signalLog/`, `src/shared/db*`, `scripts/` | Include storage/migration notes |
| **Tests** | `tests/` | Include test count delta (before → after), new coverage areas |
| **Docs** | `docs/` (excluding `docs/reports/`) | Mention updated documentation |
| **Config / Infra** | `package.json`, `tsconfig.json`, `.cursor/`, CI files | Include dependency or tooling changes |
| **Bug Fix** | Any — inferred from commit messages containing "fix", "bug", "patch" | Include what was broken, what's fixed, how verified |

If **no API files changed**, skip Swagger screenshots and curl responses.
If **no policy files changed**, skip policy comparison.
Only gather live evidence for the change types that are present.

### Step 3: Read Project Context

Read these files for background (always):

| File | Purpose |
|------|---------|
| `.cursor/rules/project-context/RULE.md` | Tech stack, architecture, commands |
| `package.json` | Version number |

Read these files **only if relevant** to the change types detected:

| Condition | File |
|-----------|------|
| API changes | `docs/api/openapi.yaml` |
| Policy changes | The policy JSON file(s) that changed |
| Architecture context needed | `docs/foundation/architecture.md` |
| Milestone report | `docs/foundation/ip-defensibility-and-value-proposition.md` |
| Test changes | The specific test files that changed |

### Step 4: Gather Evidence (Adaptive)

#### Always

```bash
npm test    # capture pass/fail count, file breakdown, duration
```

#### Only if API changes detected

1. Ensure dev server is running (`npm run dev`)
2. `curl` each **changed or new** endpoint — not all endpoints, just the affected ones
3. Open Swagger UI (`http://localhost:3000/docs`) in the browser
4. Screenshot only the **changed or new** endpoints (expand in Swagger, capture)
5. Save screenshots to `docs/reports/screenshots/` with descriptive names

#### Only if policy changes detected

1. Show the before/after policy diff (rule added, threshold changed, priority reordered)
2. If the server is running, demonstrate one decision trace that exercises the changed rule

#### Only if schema changes detected

```bash
npm run validate:contracts    # confirm alignment
```

### Step 5: Compose the Report

Save to `docs/reports/{YYYY-MM-DD}-{slug}.md` (e.g., `2026-02-10-poc-v1-complete.md`).

The report uses a **modular template**. Include only the sections that apply.

```markdown
# {Project Name} — {Title}

**Date:** {today}
**Version:** {from package.json}
**Baseline:** {what this is compared against — tag, commit, or date}

---

## Summary

{2-4 sentences: What changed and why it matters. Written for a non-technical
partner or investor. No jargon. Focus on capability and business value.}

---

## What Changed

{Brief categorized list of changes. One section per change type detected.}

### {Change Type Icon} {Change Type Label}

{Description of what changed, why, and what it enables.}

{Evidence block — adapts per type:}
{- API: endpoint table + curl response + screenshot}
{- Policy: before/after rule diff + decision trace}
{- Schema: alignment status table}
{- Tests: count delta + new coverage areas}
{- Bug fix: what broke, root cause, fix, verification}
{- Infra: dependency or config change summary}
```

#### Change Type Formatting

Use these labels and structure per type:

**API Changes:**
```markdown
### API Changes

{Description of new/modified endpoints.}

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/v1/signals` | Added metadata field support |

**Live Response:**
```json
{curl output}
```

![Endpoint screenshot](screenshots/{filename}.png)
```

**Policy Changes:**
```markdown
### Policy Changes

{What rule was added/modified/removed and its business meaning.}

**Before:** {old rule or "N/A" if new}
**After:**
```json
{new rule JSON}
```

**Decision Trace (demonstrating the change):**
```json
{trace output showing the rule firing}
```
```

**Schema Changes:**
```markdown
### Schema Changes

{What fields were added/modified/removed.}

| Schema | Field | Change |
|--------|-------|--------|
| `SignalEnvelope` | `metadata.trace_id` | Added (optional) |

Contract alignment: `npm run validate:contracts` — PASS
```

**Test Changes:**
```markdown
### Test Coverage

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total tests | 312 | 337 | +25 |
| Test files | 15 | 17 | +2 |

New coverage: {brief description of what's now tested}
```

**Bug Fixes:**
```markdown
### Bug Fixes

**{Bug title}**
- **Symptom:** {what was broken}
- **Root cause:** {why}
- **Fix:** {what changed}
- **Verified by:** {test name or manual verification}
```

#### Closing Sections (always include)

```markdown
---

## Verification

**Tests:** {N} passing across {M} files ({duration})
**Contract alignment:** {PASS/FAIL or N/A}
**Linting:** {PASS/FAIL or N/A}

---

## Impact

{1-3 bullet points: What does this change enable for the product,
the business, or the next development phase?}

---

## What's Next

{Reference open plans in `.cursor/plans/` or state next priorities.
Skip this section if the user didn't ask for it and there's nothing obvious.}

---

*Generated: {date} | Commits: {baseline}..HEAD ({N} commits)*
```

### Step 6: Deliver

1. Save the report to `docs/reports/`
2. Save any screenshots to `docs/reports/screenshots/`
3. Tell the user the file path and give a 2-sentence summary of what the report covers

---

## Decision Logic Cheat Sheet

| Question | Answer |
|----------|--------|
| Should I take Swagger screenshots? | Only if files in `src/ingestion/`, `src/output/`, or `docs/api/` changed |
| Should I curl endpoints? | Only if route handlers or OpenAPI spec changed |
| Should I show policy diffs? | Only if policy JSON or decision engine files changed |
| Should I run `validate:contracts`? | Only if schema or API spec files changed |
| Should I include architecture section? | Only for milestone reports or if architecture files changed |
| Should I include tech stack? | Only for milestone reports or if `package.json` deps changed |
| Should I include "What's Next"? | Only for milestone reports or if the user asked |
| What's the filename format? | `{YYYY-MM-DD}-{slug}.md` — slug from title, lowercase, hyphens |

## File References

| Resource | Path |
|----------|------|
| Project context | `.cursor/rules/project-context/RULE.md` |
| Architecture | `docs/foundation/architecture.md` |
| Value proposition | `docs/foundation/ip-defensibility-and-value-proposition.md` |
| OpenAPI spec | `docs/api/openapi.yaml` |
| QA test cases | `docs/testing/qa-test-pocv1.md` |
| Policy files | `src/decision/policy*.json` |
| Schema files | `src/contracts/schemas/` |
| Existing reports | `docs/reports/` |
| Implementation plans | `.cursor/plans/` |
| Screenshots output | `docs/reports/screenshots/` |
