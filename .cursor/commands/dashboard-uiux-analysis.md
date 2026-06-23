# /dashboard-uiux-analysis

Produce a full tenant-dashboard UX/UI design analysis breakdown for the 8P3P control-layer dashboard: a scored critical-path scorecard (per-tenant view-only access, data file upload, critical-path health, developer observability, end-user clarity/freshness), per-lens findings, an icon-first overview-page redesign, and a prioritized roadmap — with every recommendation backed by a frontend skill or the design source-of-truth.

**Source of truth:** `.cursor/skills/dashboard-uiux-analysis/SKILL.md` (workflow is maintained there to avoid duplication).

## Usage

```
/dashboard-uiux-analysis                      # full analysis of the current dashboard
/dashboard-uiux-analysis overview             # focus the overview-page redesign section
/dashboard-uiux-analysis upload               # focus the data-upload critical path
/dashboard-uiux-analysis observability        # focus developer error observability
```

## Instructions

When the user invokes `/dashboard-uiux-analysis`, follow `.cursor/skills/dashboard-uiux-analysis/SKILL.md`.

Recommendations MUST be backed by the project's frontend skills (`.agents/skills/frontend-design`, `vercel-react-best-practices`, `shadcn`) or `docs/specs/dashboard-design-requirements.md` — a report with un-cited design recommendations is incomplete.
