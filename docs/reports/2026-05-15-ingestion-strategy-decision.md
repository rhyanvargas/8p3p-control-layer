# 8P3P Control Layer — Ingestion Strategy + Pilot Persistence Decision

**Date:** 2026-05-15
**Baseline:** working tree at `HEAD`; doc-only changes; no API or schema changes
**Audience:** CEO, CS lead, engineering

## Summary

The next customer pilot will not ingest weekly flat-file batches. It will stream data on the 8P3P side — through pre-built connector templates, raw webhooks, or an SFTP/S3 file-watcher — with a non-negotiable preflight gate on every new feed. Any pilot longer than the Springs dry run also gets durable storage (Fly Volume + nightly off-host backup) instead of ephemeral SQLite. This decision is aligned with the 9th-grade literacy pilot direction, which was already built for customer-agnostic, mapping-template-driven onboarding.

## What Changed

### Strategic doc updates (Tier 1)
- **`internal-docs/foundation/roadmap.md`** (gitignored) — Items 11 (Webhook adapters) and 17 (Connector Layer) **promoted from "post-pilot" to Pre-Month 0**. New roadmap items: 29 (Ingestion Strategy — streaming + preflight + mappings), 30 (Ingestion Preflight — pilot-blocking gate), 31 (Pilot Persistence). v1.1 execution diagram gains a **Pilot Wave 4 (Ingestion strategy)** block.
- **`internal-docs/pilot-operations/pilot-readiness-definition.md`** (gitignored) — § Integration rewrite + preflight BLOCKING gate **scheduled in TASK-016 of `.cursor/plans/ingestion-preflight.plan.md`**; not yet on disk.
- **`internal-docs/pilot-operations/configure-lms-source-system.md`** (gitignored) — Direct-API-only language replaced with the 4-path picker plus the non-negotiable preflight callout.
- **`.cursor/plans/ingestion-preflight.plan.md`** — Status set to `active — pilot-blocking`; CEO direction note added inline.
- **`docs/specs/ingestion-preflight.md`** — Pilot-readiness gate language rewritten; obsolete "follow-up doc edit needed" note removed. Readiness-doc gate row lands with TASK-016 (see above).

### Persistence + deployment alignment (Tier 2)
- **`docs/guides/pilot-host-deployment.md`** — New **§ 7 Pilot persistence (3–6 month)**: six SQLite paths listed, Fly Volume + nightly backup recipe (`fly volumes create data --size 3`, `[[mounts]]` mounted at `/app/data`, `min_machines_running = 1`), restore drill, data-loss tripwire, migration tripwires to AWS (DynamoDB) explicitly defined.
- **`fly.toml`** — Header rewritten with the three-mode persistence ladder (dry-run / real pilot / production). Commented `[[mounts]]` block + `min_machines_running` guidance added inline.
- **`.env.example`** — `FEEDBACK_DB_PATH=./data/feedback.db` added for parity with the other five DB paths.
- **`docs/specs/program-metrics.md`** — § Measurement Windows now has an explicit **"reporting cadence ≠ ingestion cadence"** note. Defines `degraded_by_ingestion_cadence` for the fallback weekly-batch case so MC-A04 / MC-B05 latency budgets stay coherent.

## Verification

- `npm test`: **666 passed**, 8 skipped, 0 failed (40 test files, 1.94s)
- `npm run validate:contracts`: **All contracts aligned** (3 mappings verified)
- `fly.toml`: parses cleanly via `tomllib`
- No code, API, schema, or OpenAPI changes — doc / strategy / infra-config only

## Impact

- **9th-grade literacy pilot alignment.** The literacy pilot plan was already customer-agnostic (`apply-template literacy && seed-literacy-demo --org-id <id>`). The streaming-first strategy is what that plan was designed for; weekly batch was a regression. This decision closes the round-trip without changing the literacy pilot itself.
- **Latency budgets become structurally achievable.** MC-B05 (decision-to-action ≤ 48 h) and MC-A04 (signal → decision P95 ≤ 300 s) are achievable under continuous ingestion. They were structurally blocked under weekly batch.
- **Evidence retention is now real.** Pilots longer than 1 week move from ephemeral SQLite (~$5/mo, dies on every redeploy) to Fly Volume + nightly off-host backup (~$8–12/mo, survives restarts and a full pilot window). Tripwires (`signal-log.db > 1 GB`, write rate > 100k/day, multi-writer needed, SOC 2/FERPA required) trigger the migration to the existing AWS CDK deployment path — no rewrite required.
- **Onboarding cost per customer drops.** Preflight + apply-template + tenant field mappings convert "unknown customer data" from a per-pilot research project into a ~30-minute checklist that any team member can execute.
- **Engineering commitment.** Three pieces of work are now pilot-blocking before the next customer onboards: (1) `ingestion-preflight` plan execution (all 16 tasks already staged), (2) `webhook-adapters` implementation, (3) `integration-templates` activation UX. Roughly 1–2 weeks of solo-dev effort.

## What's Next

1. **CEO review** of this report + the seven strategic decisions encoded in the doc edits (see chat thread 2026-05-15 for the decision table).
2. On approval, open Tier 3 plans:
   - `.cursor/plans/pilot-persistence.plan.md` (Fly Volume + backup automation + restore drill)
   - `.cursor/plans/signal-streamer.plan.md` (SFTP/S3 file-watcher → row-level webhook posts)
   - Rewrite of `docs/guides/pilot-integration-guide.md` (customer-facing; currently still says "Direct API as the sole pilot integration path")
3. Run `/post-impl-doc-sync` against `educator-feedback-api.md` once that branch lands so it consistently references the new ingestion gate.
