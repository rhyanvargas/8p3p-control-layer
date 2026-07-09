# Feature tour captions

Screenshots of major Decision Panel surfaces (`springs` org). Captured with no Next.js issue overlay visible.

Use the **Investor deck sequence** below for accelerator / final-round slides. Supporting shots are appendix only.

Sidebar environment chip: set `NEXT_PUBLIC_ENVIRONMENT_LABEL=Pilot` for hosted framing (see `24`). Dual-code auth (`DASHBOARD_ACCESS_CODE_EDUCATOR` + `DASHBOARD_ACCESS_CODE_COMPLIANCE`) required for persona shots (`23a` / `23b`).

---

## Investor deck sequence (~10–12 slides)

| Slide | File | Feature | Caption |
|------:|------|---------|---------|
| 1 | `15-ai-overview-insights.png` | AI Act now | Overview “Act now” card: one intervene recommendation with plain-language AI explanation, Approve/Reject, plus compact “Also watching” watchlist. |
| 2 | `21-learning-gap-attention.png` | Learning gap | Attention review for `stu-20891`: within-subject gap — ELA-201 at 30% mastery (English) while focus skill is ELA-101 — with AI explanation and Approve/Reject. |
| 3 | `02-attention-queue.png` | Attention queue | Prioritized intervene/pause backlog sorted by urgency — who needs help now, with skill focus. |
| 4 | `20b-decision-approved-result.png` | Human-in-the-loop | Post-approve confirmation toast (“Approved · …”) — educator confirms high-stakes calls; review status persists. |
| 5 | `18-ai-decision-trace.png` | Audit / compliance trust | Full decision trace with AI explanation plus deterministic rule rationale, thresholds, and frozen state — receipt-backed, not a black box. |
| 6 | `10b-upload-step-2-map.png` | Ingest · Map | Upload wizard: map LMS export columns to envelope fields (no custom ETL per vendor). |
| 7 | `10c-upload-step-3-validate.png` | Ingest · Validate | Client validation + server dry-run; accepted rows show “Ready to commit.” |
| 8 | `10d-upload-step-4-review.png` | Ingest · Review | Confirm valid row count and preflight verdict before commit. |
| 9 | `10e-upload-step-5-done.png` | Ingest · Done | Commit outcomes (accepted/duplicate/rejected) with link to the ingestion log. |
| 10 | `22a-send-feedback-sheet.png` | Send feedback | Product feedback sheet from the app shell — idea/problem/praise/question with page context (customer loop). |
| 11 | `22b-send-feedback-success.png` | Feedback sent | Success toast (“Feedback sent — thank you.”) after submit — signal reaches CS triage. |
| 12a | `23a-persona-educator-nav.png` | Educator persona | Educator login: nav limited to Overview / Attention / Learners — action path only. |
| 12b | `23b-persona-compliance-nav.png` | Compliance persona | Compliance login: full nav including Decisions, Signals, Reports — audit path. |
| — | `24-pilot-environment.png` | Pilot environment | Same Overview with sidebar chip **Pilot** (not Local) for hosted/deployable framing. Pair with slide 1 or 12b. |

**Optional tighten (if slide budget is tight):** slides 1–5 + one upload (`10e` or `10b`) + `22b` + `23a`/`23b` side-by-side + `24`. Drop intermediate wizard steps.

---

## Appendix — supporting shots

Not in the primary deck order. Use for deep-dive, backup, or Q&A.

### Program & learners

| # | File | Feature | Caption |
|---|------|---------|---------|
| 01 | `01-overview.png` | Program overview | At-a-glance KPIs, classroom activity trends, and recent decisions — “is anything wrong right now?” |
| 03 | `03-learners-roster.png` | Learners roster | Program roster with mastery level, trend, and at-risk status. |
| 04 | `04-learner-detail.png` | Learner overview | Single-learner summary: level, focus skill, policy, recent decisions, plus in-context intervene bar. |
| 05 | `05-learner-trajectory.png` | Learner trajectory | Per-field mastery/stability trends across state versions. |
| 13 | `13-learner-struggles.png` | Struggles & progress | Skill-level stability gaps with sticky Action required bar (deck uses `21` for the gap narrative). |
| 14 | `14-learner-state.png` | Learner state | Historical state snapshots (v1–vN) used by the decision engine. |
| 19 | `19-ai-learner-summaries.png` | Learner · AI summaries | Recent-decisions Summary column with generative narratives. |
| 19b | `19b-ai-learner-struggles.png` | Learner · Struggles + AI | Struggles tab paired with intervene context (pairs with Overview AI). |

### Decisions & review

| # | File | Feature | Caption |
|---|------|---------|---------|
| 06 | `06-decisions-stream.png` | Decisions stream | Filterable audit stream of emitted decisions. |
| 07 | `07-decision-peek.png` | Decision peek | Side-sheet: educator summary, rule, policy, rationale before full trace. |
| 08 | `08-decision-trace.png` | Decision trace (no AI) | Compliance trust view — metadata + rule rationale (use `18` in deck when AI is on). |
| 16 | `16-ai-attention-explanation.png` | Attention · AI explanation | Review sheet generative “why this decision” for intervene. |
| 17 | `17-ai-decision-peek.png` | Decision peek · AI | Side-sheet AI explanation beside short summary and rule rationale. |
| 20a | `20a-decision-approve.png` | Approve decision | Attention review sheet with Approve + Reject before submit. |
| 20c | `20c-decision-reject.png` | Reject decision | Reject-reason step: why rejecting, optional notes, Submit rejection. |
| 20d | `20d-decision-rejected-result.png` | Rejected result | Post-reject confirmation toast after submitting a reason. |

### Overview AI variants

| # | File | Feature | Caption |
|---|------|---------|---------|
| 15b | `15b-ai-overview-watch-why.png` | Insights · Why | “Also watching” row expanded via Why. |
| 15c | `15c-ai-overview-reject-step.png` | Insights · Reject | Featured-action Reject flow with reason selection. |
| 15d | `15d-ai-overview-recent-summaries.png` | Overview · Recent AI | Recent decisions table Summary column with narratives. |
| 15e | `15e-ai-overview-decision-peek.png` | Overview · Peek AI | Peek from Overview recent decisions with AI explanation. |

### Signals, settings, upload entry

| # | File | Feature | Caption |
|---|------|---------|---------|
| 09 | `09-signals-ingestion.png` | Signals ingestion | Ingestion health log — source, schema, accepted/rejected outcomes. |
| 10 | `10-signals-upload.png` | Upload entry | Guided wizard entry — drop JSON/CSV/XLSX. |
| 12 | `12-settings.png` | Settings | Org/environment context, theme, read-only active policy. |

### Omitted from deck / review

| File | Reason |
|------|--------|
| `10a-upload-step-1-upload.png` | Duplicate of `10` |
| `15a-ai-overview-read-more.png` | Duplicate of `15` |
| `/reports` | Depends on `GET /v1/program-metrics` (not implemented) — empty state, not demoable |

---

## AI demo flag

Enable with `NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true` in `dashboard/.env.local` (restart Next.js). Fills empty `educator_explanation` fields with production-shaped mock narratives. Production uses control-layer `AI_EXPLANATIONS_ENABLED` at decision time.

## Re-capture

```bash
cd dashboard
# Ensure NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true and restart `npm run dev`
# For persona + Pilot chip shots also set:
#   DASHBOARD_ACCESS_CODE_EDUCATOR / DASHBOARD_ACCESS_CODE_COMPLIANCE
#   NEXT_PUBLIC_ENVIRONMENT_LABEL=Pilot
# Dual-code mode: pass a valid persona code (legacy DASHBOARD_ACCESS_CODE alone will fail login)
export DASHBOARD_ACCESS_CODE=demo-compliance
export DASHBOARD_ACCESS_CODE_EDUCATOR=demo-educator
export DASHBOARD_ACCESS_CODE_COMPLIANCE=demo-compliance
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/capture-feature-tour.mjs
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/capture-upload-wizard.mjs
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/capture-ai-demo.mjs
# Gaps before approve/reject — reviewing empties the Attention queue
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/capture-investor-gaps.mjs
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/capture-approve-reject.mjs
```


Requires the dashboard on `http://localhost:3001` and the control-layer API on `http://localhost:3000`.
