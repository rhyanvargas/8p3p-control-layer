# /review

Perform a post-implementation quality review.

**Source of truth:** `.cursor/skills/review/SKILL.md` (workflow is maintained there to avoid duplication).

## Usage

Review recent changes:
```
/review
```

Review specific files:
```
/review path/to/file.ts
```

Review against a spec:
```
/review --spec docs/specs/{feature-name}.md
```

## Instructions

When the user invokes `/review`, follow `.cursor/skills/review/SKILL.md`.
