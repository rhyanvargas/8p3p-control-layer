---
name: post-impl-doc-sync
description: Reconcile docs/specs and plans with implementation after a feature lands — constants, API shapes, immutability. Use when the user runs /post-impl-doc-sync.
disable-model-invocation: true
---

# /post-impl-doc-sync

Close the loop between **spec prose**, **plan TASK bodies**, and **merged code** so literal details do not drift.

## Usage

```
/post-impl-doc-sync docs/specs/{feature-name}.md
```

Optional second path:

```
/post-impl-doc-sync docs/specs/{feature-name}.md .cursor/plans/{feature-name}.plan.md
```

## Behavior

1. Read the spec (and plan if provided).
2. Identify **literal** claims: numeric substitution values, max limits, error codes, public function signatures, immutability (`ReadonlySet`, `readonly`, etc.).
3. Cross-check against `src/` (and `tests/` where tests encode the contract).
4. Update **the owning document** when prose is wrong; update code only when the spec is the source of truth and code diverged incorrectly.
5. Report what was synced and what was already aligned.

## Instructions

- Follow `.cursor/rules/document-traceability/RULE.md` § "Spec ↔ implementation parity".
- Prefer updating **spec Implementation Notes** when TypeScript idioms (overload + impl, eslint `no-redeclare` for `.ts`) differ from informal "two functions" wording.
- Do not expand scope to unrelated refactors.

## When to run

- After `/implement-spec`, before merge, especially if validation constants or public exports changed.
- When `/review --spec` reports **info**-level spec/impl mismatches.
