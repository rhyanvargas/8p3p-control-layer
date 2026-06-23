# Dashboard UI/UX Analysis — Output Template

Use this structure verbatim for the report. Keep it icon-first and scannable — the report should model the product principle it advocates (icons + tables over prose). Every recommendation line ends with a citation: `— per {skill}` or `— per dashboard-design-requirements.md §{n}`.

```markdown
# 8P3P Dashboard — UX/UI Design Analysis

**Date:** {today}
**Scope:** {full | overview | upload | observability}
**Skills referenced:** frontend-design, vercel-react-best-practices, shadcn{, others}
**Ground truth:** docs/specs/dashboard-design-requirements.md + dashboard/ implementation

## Executive Summary
{3–5 sentences: overall health, the single biggest customer-value win, the top risk.}

## Critical-Path Scorecard

| # | Lens | Status | One-line verdict |
|---|------|--------|------------------|
| 1 | 🔒 Per-tenant view-only access | 🔴/🟡/🟢 | {…} |
| 2 | 📤 Data file upload (JSON/Excel) | 🔴/🟡/🟢 | {…} |
| 3 | 🔗 Critical-path health (upload→dashboard) | 🔴/🟡/🟢 | {…} |
| 4 | 🔍 Developer observability (what/why/where) | 🔴/🟡/🟢 | {…} |
| 5 | 👁️ End-user clarity & data freshness | 🔴/🟡/🟢 | {…} |

## Findings by Lens

### 1. 🔒 Per-tenant view-only access — {status}
- **Current state:** {claim} `({file}:{line} or §)`
- **Gap:** {what's missing/risky}
- **Recommendation:** {action} — per {skill / doc §}

### 2. 📤 Data file upload — {status}
- **Current state:** {…} `(evidence)`
- **Gap:** {drag-drop? states? field-level rejection? Excel/CSV parse?}
- **Recommendation:** {…} — per {citation}

### 3. 🔗 Critical-path health — {status}
- **Current state:** {end-to-end flow trace} `(evidence)`
- **Gap:** {silent failures / dead ends / missing status reflection}
- **Recommendation:** {…} — per {citation}

### 4. 🔍 Developer observability — {status}
- **What:** {is the error type/code visible?} `(evidence)`
- **Why:** {is the reason/message surfaced, not swallowed?}
- **Where:** {route + layer + request id traceable?}
- **Recommendation:** {…} — per {citation}

### 5. 👁️ End-user clarity & freshness — {status}
- **Current state:** {scannability, icon usage, freshness indicators, polling/refetch} `(evidence)`
- **Gap:** {…}
- **Recommendation:** {…} — per {citation}

## Overview Page Redesign (icon-first, customer-value ranked)

Answers "Is anything wrong right now?" (§8). ≤4 KPIs, one chart, one recent table (§2.1).

| Rank | Metric | Icon (Lucide) | Why it's high customer value | Semantic color + label |
|------|--------|---------------|------------------------------|------------------------|
| 1 | {Needs attention} | `AlertCircle` | {…} | --urgency-* + "Needs help" |
| 2 | {…} | `…` | {…} | … |
| 3 | {…} | `…` | {…} | … |
| 4 | {…} | `…` | {…} | … |

- **Chart:** {single metric, range selector, adjacent text summary} — per dashboard-design-requirements.md §8 / vercel-react-best-practices (Suspense).
- **Recent table:** {default columns only, row → L1 Sheet} — per §2.1.
- **Icons over prose:** {specific verbose-text → icon swaps} — per frontend-design.
- **Components:** {shadcn blocks/primitives to compose} — per shadcn.

## Design System Notes
{Typography, color tokens, density, motion restraint — each — per frontend-design / §4.}

## Observability Recommendations (what / why / where)
{Concrete: error state contracts (§10), reason-code mapping, request-id propagation, log/trace surfacing for devs.}

## Prioritized Roadmap

| Priority | Item | Lens | Effort | Citation |
|----------|------|------|--------|----------|
| P0 | {must-fix} | {#} | {S/M/L} | {skill/§} |
| P1 | {high-value} | {#} | {…} | {…} |
| P2 | {polish} | {#} | {…} | {…} |

## Skills & References Cited
- `.agents/skills/frontend-design/SKILL.md` — {what it backed}
- `.agents/skills/vercel-react-best-practices/SKILL.md` — {…}
- `.agents/skills/shadcn/SKILL.md` — {…}
- `docs/specs/dashboard-design-requirements.md` — §{…}
- {find-skills result, if any}
```
