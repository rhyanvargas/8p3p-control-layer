# .cursor Configuration

Cursor configuration for spec-driven development in this repository.

## Directory Structure

```
.cursor/
├── commands/   # Slash-command entrypoints (lightweight wrappers)
├── rules/      # Persistent standards and constraints
├── skills/     # Canonical step-by-step workflow instructions
└── plans/      # Generated implementation plans
```

## Ownership Model (No Redundancy)

- **Rules** define policy and standards.
- **Commands** provide concise invocation UX.
- **Skills** contain workflow logic.

Detailed workflow instructions must live in `.cursor/skills/`.

## Canonical Workflow

See: `docs/foundation/definitive-workflow.md`

Core path:
1. `/draft-spec`
2. `/plan-impl`
3. `/implement-spec`
4. `/sync-contracts` (when contracts changed)
5. `/review`

Brownfield path: `/extract-spec` before `/draft-spec`.

## Key References

- `docs/foundation/definitive-workflow.md`
- `docs/foundation/roadmap.md`
- `docs/specs/README.md`
