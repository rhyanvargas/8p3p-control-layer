# 8P3P Control Layer — Dashboard Created, Multi-Source Transforms Shipped

**Date:** 2026-04-15
**Baseline:** `59811a8` (feat: implement skill-level tracking and assessment type filters)

## Summary

The educator-facing Decision Panel dashboard is built and undergoing testing — a React/Vite SPA served at `/dashboard` that surfaces the four core intelligence panels (Who Needs Attention, Why Stuck, What To Do, Did It Work). In parallel, multi-source transforms landed in the transform engine, the seed script was rewritten for a realistic 4-LMS onboarding demo, and pilot documentation was updated to reflect the direct-API-only approach for launch.

## What Changed

### Decision Panel Dashboard (new — undergoing testing)
- Full React + Vite + TypeScript SPA in `dashboard/` with Tailwind, shadcn/ui components, and React Query data hooks.
- Four panels: **WhoNeedsAttention**, **WhyAreTheyStuck**, **WhatToDo**, **DidItWork** — each driven by live API data.
- Passphrase gate for pilot access control (spec: `docs/specs/dashboard-passphrase-gate.md`).
- Server mounts the SPA via `fastify-static` at `/dashboard/` when built artifacts exist — zero impact when unbuilt.
- Playwright e2e scaffold and contract tests for panel data shapes in place.
- **Status:** Created, undergoing integration testing against seeded data before pilot handoff.

### Multi-Source Transforms (v1.1.1)
- Transform expressions can now reference multiple payload paths (e.g. `score / total → masteryScore`).
- Admin PUT validates: reserved source keys blocked, `source` vs `sources` mutual exclusivity enforced, expression-variable agreement checked.
- 10 new tests (MST-003 through MST-011) covering unit + contract layers.
- ESLint `no-redeclare` disabled for `.ts` to support TypeScript overload signatures.

### Seed Script v2
- Complete rewrite of `seed-springs-demo.mjs`: Phase 1 registers field mappings for 4 LMS sources (Canvas, Blackboard, i-Ready, Absorb) via admin API; Phase 2 sends 11 signals across 5 named personas; Phase 3 verifies decisions.
- Springs routing policy updated to match new demo scenarios.
- New pilot demo guide at `docs/guides/springs-pilot-demo.md`.

### Pilot Documentation (v3)
- Pilot Integration Guide promoted to v3 — connectors deferred to post-pilot roadmap; all integrations use Direct API.
- Customer Onboarding Quick Start now references the Decision Panel and links to the integration guide.
- Guides README adds internal ops guide links (Pilot Readiness, Onboarding Runbook, Configure LMS).
- New field-mapping onboarding guide at `docs/guides/onboarding-field-mappings.md`.

### Dev Tooling
- Agent skills added: Vercel React best practices, Fastify best practices, frontend design.
- Cursor rules updated for spec ↔ implementation parity checks; new post-impl doc sync skill.
- Plan files added for decision panel UI, multi-source transforms, and springs seed.

## Verification

- `npm test`: **625 passed**, 8 skipped, 0 failed (33 test files, 1.85s)
- `npm run validate:contracts`: **All contracts aligned** (3 mappings verified)
- `npm run validate:api`: **Valid** (1 pre-existing warning on `/health` 4XX response)

## Impact

- **Pilot readiness:** The dashboard gives educators a concrete proof surface — this is the primary artifact for the Springs pilot demo. Currently undergoing testing to validate panel rendering against seeded multi-source data.
- **Integration flexibility:** Multi-source transforms let us onboard LMS systems that require compound score calculations (e.g. earned/possible → mastery) without asking customers to pre-compute.
- **Demo quality:** The v2 seed script produces a realistic, end-to-end onboarding-to-intelligence walkthrough across 4 LMS sources — directly demoable to prospects.

## What's Next

- Complete dashboard integration testing (panel data accuracy, passphrase gate UX, mobile responsiveness).
- Run `/review --spec docs/specs/dashboard-passphrase-gate.md` for requirement verification.
- Build and mount dashboard for Springs pilot environment (`npm run build:dashboard`).
