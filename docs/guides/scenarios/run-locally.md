# Run locally

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Run the control-layer API and Decision Panel on your machine with no AWS spend.

---

## Prerequisites

- Node.js **22.x** (`nvm use`) and npm ≥ 10
- Repo cloned; no AWS credentials required

---

## Path

1. [First-time setup](../../foundation/setup.md#first-time-setup) — API install, seed, dashboard install
2. [Environment profiles](../../foundation/setup.md#environment-profiles) — Profile A (default) or Profile B (pilot-like auth)
3. [Verify](../../foundation/setup.md#4-verify) — `/health` and dashboard URL
4. [Daily dev loop](../../foundation/setup.md#daily-dev-loop) — two-process workflow
5. [Making changes](../../foundation/setup.md#making-changes) — API vs dashboard edit paths
6. [Tests and validation](../../foundation/setup.md#tests-and-validation) — `npm test`, `npm run check` (full pre-commit gate)

---

## Gates / reference

- [Local Dev & Testing (full doc)](../../foundation/setup.md)
- [Architecture (local)](../../foundation/setup.md#architecture-local)
- [`.env.example`](../../../.env.example) · [`dashboard/.env.example`](../../../dashboard/.env.example)

---

## Exit criteria

- `GET http://localhost:3000/health` returns `{"status":"ok"}`
- Decision Panel Overview loads at `http://localhost:3001` (or your configured port) with seeded demo data when applicable
