# Feature tour captions

Screenshots of major Decision Panel surfaces (local `springs` org). Captured with no Next.js issue overlay visible.

## Core surfaces

| # | File | Feature | Caption |
|---|------|---------|---------|
| 01 | `01-overview.png` | Program overview | At-a-glance KPIs, classroom activity trends, and recent decisions so educators can answer “is anything wrong right now?” |
| 02 | `02-attention-queue.png` | Attention queue | Prioritized intervene/pause recommendations with Approve/Reject so educators clear the review backlog in one place. |
| 03 | `03-learners-roster.png` | Learners roster | Program roster with mastery level, trend, and at-risk status so you can find who needs follow-up. |
| 04 | `04-learner-detail.png` | Learner overview | Single-learner summary: level, focus skill, policy, recent decisions, plus an in-context intervene action bar. |
| 05 | `05-learner-trajectory.png` | Learner trajectory | Per-field mastery/stability trends across state versions to show how the learner got here. |
| 06 | `06-decisions-stream.png` | Decisions stream | Filterable audit stream of emitted decisions for provenance and review status. |
| 07 | `07-decision-peek.png` | Decision peek | Side-sheet quick view of educator summary, rule, policy, and rationale before opening the full trace. |
| 08 | `08-decision-trace.png` | Decision trace | Read-only compliance trust view with full decision metadata and rule rationale for audit. |
| 09 | `09-signals-ingestion.png` | Signals ingestion | Ingestion health log—source, schema, and accepted/rejected outcomes for LMS signal traffic. |
| 10 | `10-signals-upload.png` | Signals upload (entry) | Guided upload wizard entry — drop JSON/CSV/XLSX to start ingestion. |
| 10a | `10a-upload-step-1-upload.png` | Upload wizard · Upload | Step 1: choose a file (JSON/CSV/XLSX) to begin the ingestion wizard. |
| 10b | `10b-upload-step-2-map.png` | Upload wizard · Map | Step 2: map file columns to envelope fields; payload columns carry mastery/skill data. |
| 10c | `10c-upload-step-3-validate.png` | Upload wizard · Validate | Step 3: client validation + server dry-run; accepted rows show “Ready to commit.” |
| 10d | `10d-upload-step-4-review.png` | Upload wizard · Review | Step 4: confirm valid row count and preflight verdict before committing. |
| 10e | `10e-upload-step-5-done.png` | Upload wizard · Done | Step 5: commit outcomes (accepted/duplicate/rejected) with link to the ingestion log. |
| 12 | `12-settings.png` | Settings | Org/environment context, theme preference, and read-only active policy inspection. |
| 13 | `13-learner-struggles.png` | Struggles & progress | Skill-level stability gaps (“what do they need help with?”) tied to intervene recommendations. |
| 14 | `14-learner-state.png` | Learner state | Historical state snapshots (v1–vN) for the canonical learner state used by the decision engine. |

**Reports omitted:** `/reports` depends on `GET /v1/program-metrics`, which is not implemented yet. The page only shows an empty “Program metrics are not available yet” state — not demoable.

## AI educator explanations (demo)

Enable with `NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true` in `dashboard/.env.local` (restart Next.js). This fills empty `educator_explanation` fields with production-shaped mock narratives. Real production uses control-layer `AI_EXPLANATIONS_ENABLED` at decision time.

| # | File | Feature | Caption |
|---|------|---------|---------|
| 15 | `15-ai-overview-insights.png` | AI educator insights | Overview priority queue: one “Act now” recommendation with AI explanation + Approve/Reject, plus a compact “Also watching” list (explanations on demand). |
| 16 | `16-ai-attention-explanation.png` | Attention · AI explanation | Review sheet shows generative “why this decision” copy for an intervene recommendation. |
| 17 | `17-ai-decision-peek.png` | Decision peek · AI | Side-sheet AI explanation alongside the short educator summary and rule rationale. |
| 18 | `18-ai-decision-trace.png` | Decision trace · AI | Audit trace includes the AI explanation field with the deterministic rationale below. |
| 19 | `19-ai-learner-summaries.png` | Learner · AI summaries | Learner recent-decisions Summary column shows generative narratives per decision type. |

## Re-capture

```bash
cd dashboard
# Ensure NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true and restart `npm run dev`
PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-feature-tour.mjs
PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-upload-wizard.mjs
PLAYWRIGHT_BROWSERS_PATH=0 DASHBOARD_ACCESS_CODE=dev-local node scripts/capture-ai-demo.mjs
```

Requires the dashboard on `http://localhost:3001` and the control-layer API on `http://localhost:3000`.
