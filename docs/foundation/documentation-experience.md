# Documentation Experience (GTM Requirement)

## Goal

When we go to market, our documentation must be **beautiful, fast, and self-serve**—comparable in UX to:

- Stripe docs: `https://stripe.com/docs`
- Plaid docs: `https://plaid.com/docs/`

This is not “nice to have.” It is a **sales + integration + support** lever: better docs reduce onboarding time, lower support burden, and increase confidence during technical evaluation.

## What “Stripe/Plaid-like” Means (Requirements)

### 1) Information Architecture

- Clear split between:
  - **Quickstart** (first success in <15 minutes)
  - **Guides** (workflows and integration patterns)
  - **API Reference** (complete, searchable endpoint docs)
  - **Changelog** (product + API changes)
- Persistent left-nav with sensible grouping and deep links.
- Every page has “next steps” and cross-links to adjacent concepts.

### 2) Navigation + Search

- Global search that is fast and relevant (titles, headings, endpoints, error codes, schemas).
- URL structure is stable and shareable (no brittle hash routing).
- “Copy link to heading” support for every section.

### 3) Developer Ergonomics

- Code examples with:
  - Language tabs (at minimum: `curl`, TypeScript/Node)
  - Copy-to-clipboard buttons
  - Correct auth examples (API key usage) and realistic payloads
- Error model documented with examples (status codes, error codes, common failure modes).
- Common tasks documented as recipes (pagination, retries/idempotency, filtering by org/learner, troubleshooting).

### 4) Trust Surfaces (What enterprise evaluators look for)

- Explicitly documented guarantees and invariants (determinism, idempotency, org isolation).
- Clear “How to validate this works” sections that map to:
  - contracts (`docs/api/openapi.yaml`, JSON Schemas)
  - inspection surfaces (`/docs`, `/inspect`)
  - test evidence (contract tests / QA reports)

## Non-Goals (Until GTM)

- Polished marketing site content and brand system.
- Full SDK ecosystem (beyond minimal examples).
- Extensive design-system work beyond docs UX.

## Definition of Done (GTM)

- A new engineer can complete a Quickstart and retrieve decisions end-to-end without live help.
- API reference is searchable and complete (endpoints + schemas + errors + auth).
- Docs are easy to navigate and “feel” like Plaid/Stripe in usability.

