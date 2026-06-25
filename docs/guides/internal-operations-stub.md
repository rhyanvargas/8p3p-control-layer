# Internal Operations Documentation

**Audience:** Customer success, solutions engineering, leadership  
**Purpose:** Index of gitignored internal-only documents. These files are **not** in the public repository and are not required for implementation or CI.

Available locally in gitignored `internal-docs/` on machines that have the internal docs vault checked out or synced.

---

## Pilot operations

| Document | Description |
| -------- | ----------- |
| Onboarding Runbook | Step-by-step pilot onboarding: sales handoff → provisioning → onboarding call → first week → pilot close |
| Pilot Runbook | CEO-authored pilot operating procedures: policy rules, LIU counting, privacy, educator workflow |
| Pilot Readiness Definition (full) | Complete go/no-go narrative beyond the committed gate tables — customer-specific context and procedures |
| Configure LMS Source System | Add and configure an LMS source system: sample payload → mapping config → admin PUT → test |
| Controlled Evaluation Runbook | Local/SQLite controlled-data-evaluation workflow; tier A/B/C deploy disambiguation |
| Dry-run Script | Saturday pre-flight timeline and observation log for pilot launch rehearsals |

**Committed gate criteria:** Normative gate tables live in [`pilot-readiness-gates.md`](pilot-readiness-gates.md) — use that file for specs, checklists, and CI.

---

## Foundation (internal mirrors and strategy)

| Document | Description |
| -------- | ----------- |
| Logic Model | DOE-shaped outcomes map linking IP capabilities to MC-* success metrics |
| IP Defensibility and Value Proposition | Technical defensibility narrative and canonical-field domain ownership |
| Documentation Experience | Aspirational customer-facing doc-site UX (not yet implemented) |

**Committed engineering rules:** API naming, roadmap, and definitive workflow are authoritative in [`docs/foundation/`](../foundation/) — internal copies are mirrors only.

---

## Compliance and enterprise posture

| Document | Description |
| -------- | ----------- |
| Compliance Security Posture and Migration Path | Phased SOC 2–class controls, HIPAA-class data handling, government-program checklist |

Committed specs reference this as: *Internal compliance posture doc (local only)* — no public href.

---

## Reports and append-only logs

| Document | Description |
| -------- | ----------- |
| Pilot Feedback Log | Append-only CS triage ledger for closed-loop product feedback |
| Pilot smoke reports | Ops artifact pattern: `internal-docs/reports/pilot-smoke-*.md` |
| SBIR / pilot evidence reports | Phase-scoped evidence pulls filed under `internal-docs/reports/` |
| IT pilot positioning alignment | Internal positioning memo for pilot customer conversations |

Checklists may cite smoke-report paths as **literal filename patterns** (backticks), not markdown links.

---

## Engagement and demo artifacts

| Document | Description |
| -------- | ----------- |
| Proposal for Controlled Data Evaluation | Outbound controlled-evaluation scope document (unsigned until engagement is signed) |
| 9th Grade Literacy Pilot | Internal demo layout reference for the Decision Panel |

Committed specs reference evaluation engagements in prose only — no public href to these files.

---

## Related (committed)

| Need | Go to |
| ---- | ----- |
| Pilot gate criteria | [`pilot-readiness-gates.md`](pilot-readiness-gates.md) |
| Deployment and launch checklists | [`deployment-checklist.md`](deployment-checklist.md), [`pilot-launch-checklist.md`](pilot-launch-checklist.md) |
| Local dev and testing | [`docs/foundation/setup.md`](../foundation/setup.md) |
| Documentation tier model | [`docs/foundation/documentation-boundaries.md`](../foundation/documentation-boundaries.md) |
