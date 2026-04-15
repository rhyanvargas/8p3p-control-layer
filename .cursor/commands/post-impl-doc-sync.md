# /post-impl-doc-sync

Reconcile **spec** and **plan** prose with **implementation** so literals and API shapes stay aligned (validation constants, `ReadonlySet` vs `Set`, overload style, limits).

**Source of truth:** `.cursor/skills/post-impl-doc-sync/SKILL.md`

## Usage

```
/post-impl-doc-sync docs/specs/{feature-name}.md
```

With plan:

```
/post-impl-doc-sync docs/specs/{feature-name}.md .cursor/plans/{feature-name}.plan.md
```

## Instructions

When the user invokes `/post-impl-doc-sync`, follow `.cursor/skills/post-impl-doc-sync/SKILL.md` and `.cursor/rules/document-traceability/RULE.md` (§ Spec ↔ implementation parity).
