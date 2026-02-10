# /generate-report

Generate an executive summary report for stakeholders with live API evidence, browser screenshots, and test results.

## Usage

Generate a full report:
```
/generate-report
```

Generate with a specific focus:
```
/generate-report focus on the decision engine provenance tracing
```

Generate for a specific milestone:
```
/generate-report POC v2 — policy expansion
```

## Behavior

1. **Discover** — Scan the project to understand current state
2. **Verify** — Run the test suite and hit live API endpoints
3. **Capture** — Take browser screenshots of each API route via Swagger UI
4. **Compose** — Write a structured markdown report with embedded evidence
5. **Deliver** — Save to `docs/reports/` with screenshots

## Instructions

When the user invokes `/generate-report`:

### Step 1: Gather Project Context

Read these files to understand the current state:

| File | Purpose |
|------|---------|
| `.cursor/rules/project-context/RULE.md` | Tech stack, architecture, key commands |
| `package.json` | Version, dependencies, scripts |
| `docs/foundation/architecture.md` | System architecture and data flow |
| `docs/foundation/ip-defensibility-and-value-proposition.md` | Value proposition and IP thesis |
| `docs/api/openapi.yaml` | OpenAPI spec for endpoint discovery |

Also scan for any existing reports in `docs/reports/` to avoid duplication and to maintain version continuity.

### Step 2: Run the Test Suite

```bash
npm test
```

Capture:
- Total test count and pass/fail status
- Test file breakdown by category (unit, contract, integration)
- Duration

### Step 3: Hit Each API Endpoint

Ensure the dev server is running (`npm run dev`). Then call each endpoint using `curl` and capture the JSON responses.

**Required endpoints:**

| Method | Path | Test Payload / Parameters |
|--------|------|--------------------------|
| `GET` | `/health` | No params |
| `POST` | `/v1/signals` | Use a representative SignalEnvelope from `docs/testing/qa-test-pocv1.md` (QA-001 body) |
| `GET` | `/v1/signals` | `org_id`, `learner_reference`, `from_time`, `to_time` matching the ingested signal |
| `GET` | `/v1/decisions` | Same query params as signals |

For test data, reference the QA test cases in `docs/testing/qa-test-pocv1.md`.

### Step 4: Capture Browser Screenshots

Navigate to the Swagger UI at `http://localhost:3000/docs` using the browser tools.

For each API route:
1. Expand the endpoint in Swagger UI
2. Take a screenshot showing: endpoint description, parameters, request body schema (if POST), and response codes
3. Save screenshots with descriptive filenames to `docs/reports/screenshots/`

**Required screenshots:**

| Filename | Content |
|----------|---------|
| `swagger-overview.png` | Full Swagger UI showing all endpoints |
| `01-post-signals-endpoint.png` | POST /v1/signals expanded — description and request body |
| `02-post-signals-body-schema.png` | Request body schema detail |
| `03-post-signals-responses.png` | 200 and 400 response schemas |
| `04-get-signals-endpoint.png` | GET /v1/signals expanded — description and parameters |
| `05-get-signals-params-responses.png` | Full parameter list with pagination |
| `06-get-decisions-endpoint.png` | GET /v1/decisions expanded — description and parameters |
| `07-get-decisions-params-responses.png` | Full parameter list |
| `08-get-decisions-response-schema.png` | 200 response with trace object visible |

### Step 5: Compose the Report

Write the report to `docs/reports/{name}-summary-report.md` using this structure:

```markdown
# {Project Name} — {Milestone} Summary Report

**Date:** {today's date}
**Version:** {version from package.json}
**Status:** {Complete/In Progress} — {brief status line}

---

## Executive Summary

{2-3 sentences: What is this project? What does this milestone prove?}

---

## System Architecture

{Architecture diagram or pipeline description from docs/foundation/architecture.md}

| Stage | Component | What It Does |
|-------|-----------|-------------|
{Table of pipeline stages}

### Key Properties

{Bullet list of architectural properties: determinism, immutability, multi-tenant, etc.}

---

## Tech Stack

| Category | Technology |
|----------|-----------|
{From package.json and project context}

---

## API Endpoints

{Swagger UI overview screenshot}

| Method | Path | Purpose |
|--------|------|---------|
{Endpoint table}

### Route N: `METHOD /path` — Title

**Purpose:** {description from OpenAPI spec}

{Screenshot(s) from Swagger UI}

**Live Response ({status code}):**

```json
{actual JSON response from curl}
```

**Key behaviors:**
{Bullet list of notable behaviors for this endpoint}

---

{Repeat for each route}

---

## Test Results

**{N} tests passing across {M} test files.** {Pass/fail status.}

```
{Vitest output}
```

### Test Coverage by Category

| Category | Files | Tests | What's Verified |
|----------|-------|-------|----------------|
{Breakdown by unit/contract/integration}

---

## What This Proves

### 1. {Capability}
{1-2 sentences with concrete evidence}

{Repeat for each key capability demonstrated}

---

## What's Next

| Feature | Description |
|---------|-------------|
{Roadmap items from docs/foundation/ or .cursor/plans/}

---

*Report generated: {date} | Source: Live API responses from `http://localhost:3000`*
```

### Step 6: Verify and Deliver

1. Ensure all screenshot paths in the markdown are relative and resolve correctly from `docs/reports/`
2. Verify the report renders properly
3. Tell the user the report location and summarize what's included

## Report Quality Checklist

- [ ] Executive summary is concise (2-3 sentences) and non-technical enough for a business stakeholder
- [ ] Architecture section references `docs/foundation/architecture.md`
- [ ] Every API route has at least one Swagger UI screenshot
- [ ] Every API route has a live JSON response (not a mock)
- [ ] Test results are from an actual `npm test` run (not copy-pasted from memory)
- [ ] "What This Proves" ties capabilities back to business value, not just technical facts
- [ ] Roadmap section references existing plans in `.cursor/plans/` if available
- [ ] All screenshots saved to `docs/reports/screenshots/`
- [ ] No hardcoded dates — use today's date
- [ ] Version pulled from `package.json`

## File References

| Resource | Path |
|----------|------|
| Project context | `.cursor/rules/project-context/RULE.md` |
| Architecture | `docs/foundation/architecture.md` |
| Value proposition | `docs/foundation/ip-defensibility-and-value-proposition.md` |
| QA test cases | `docs/testing/qa-test-pocv1.md` |
| OpenAPI spec | `docs/api/openapi.yaml` |
| Existing reports | `docs/reports/` |
| Implementation plans | `.cursor/plans/` |
| Screenshots output | `docs/reports/screenshots/` |
