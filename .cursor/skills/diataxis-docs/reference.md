# Diátaxis reference (condensed)

Source: [diataxis.fr](https://diataxis.fr/). Use when classifying or rewriting doc sections.

## Tutorials vs how-to guides

Both are **action-oriented** (doing), but serve different needs:

| | Tutorial | How-to |
| --- | -------- | ------ |
| **Purpose** | Learning | Production |
| **Reader** | Beginner / first exposure | Competent practitioner |
| **Outcome** | Skill acquired | Problem solved |
| **Structure** | Carefully guided lesson | Direct path to goal |
| **Failure cost** | Confuses the learner | Blocks the task |

**Fix:** If a "getting started" doc assumes AWS prod access and skips teaching moments → how-to or scenario path, not tutorial. If setup.md walks a first-time dev safely through local run → tutorial.

## Reference vs explanation

Both are **cognition-oriented** (knowing), but serve different needs:

| | Reference | Explanation |
| --- | --------- | ----------- |
| **Purpose** | Describe machinery | Illuminate context |
| **Tone** | Neutral, factual | Discursive |
| **Structure** | Lists, tables, signatures | Prose, diagrams, "why" |
| **Question** | "What is the syntax?" | "Why is it designed this way?" |

**Fix:** Move design rationale from specs to foundation architecture or reports. Move field lists from guides to specs/OpenAPI.

## Common mixed-mode symptoms

| Symptom | Likely fix |
| ------- | ---------- |
| Runbook section explains historical product decisions | Link to `docs/foundation/` or `docs/reports/` |
| Spec includes deploy shell commands | Move to guide/runbook; spec cites behavior only |
| FAQ answers "how do I deploy AWS" with full steps | Link to scenario path + runbook |
| Scenario path copies runbook commands | Replace with numbered links + exit criteria |
| Architecture doc has copy-paste integration steps | Extract to `docs/guides/` how-to |
| OpenAPI description tells a story | Trim to contract facts; link guide for narrative |

## Quality checks (before merge)

### Tutorial
- [ ] Reader can complete without prior repo knowledge (within stated prerequisites)
- [ ] Steps are ordered; each step verifiable
- [ ] No optional branching that loses the novice

### How-to
- [ ] Title states the goal ("Deploy AWS charter pilot")
- [ ] Prerequisites explicit
- [ ] Steps are actions, not concepts
- [ ] Exit criteria are observable (smoke green, checklist signed)

### Reference
- [ ] Complete for its scope (no "etc." for normative fields)
- [ ] Structure consistent (headings, tables)
- [ ] No instructional "you should now run…"

### Explanation
- [ ] Makes no normative requirements that belong in specs
- [ ] Links to reference for facts, how-to for procedures
- [ ] Acceptable to read out of order

## This repo's Diátaxis → tier map

| Diátaxis | Primary tier | Notes |
| -------- | ------------ | ----- |
| Tutorial | T1 (`foundation/setup.md`) | Local dev onboarding |
| How-to | T3 (`guides/`, `guides/scenarios/`) | Scenarios are routers, not SSoT |
| Reference | T2 + T5 (`specs/`, `api/`, schemas) | Requirements + machine contracts |
| Explanation | T1 + reports (`foundation/`, `reports/`) | Architecture, terminology, dated analysis |

T4 (`.cursor/plans/`) is implementation sequencing — not a Diátaxis quadrant; do not merge plan tasks into customer guides.
