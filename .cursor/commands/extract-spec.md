# /extract-spec

Reverse-engineer a specification from existing code (brownfield documentation).

**Source of truth:** `.cursor/skills/extract-spec/SKILL.md` (workflow is maintained there to avoid duplication).

## Usage

Extract spec for a module:
```
/extract-spec src/auth/
```

Extract spec for a feature:
```
/extract-spec "user authentication"
```

Extract spec for specific files:
```
/extract-spec src/services/UserService.ts
```

## Instructions

When the user invokes `/extract-spec`, follow `.cursor/skills/extract-spec/SKILL.md`.
