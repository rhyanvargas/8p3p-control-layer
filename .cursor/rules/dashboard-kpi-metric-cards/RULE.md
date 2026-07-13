---
description: Overview KPI / StatCard metric cards — one primary value, inline labeled secondaryLine/delta, simple up/down arrows, no unlabeled dual icons
globs:
  - dashboard/components/dashboard/stat-card.tsx
  - dashboard/components/dashboard/section-cards.tsx
  - dashboard/components/dashboard/__tests__/stat-card.test.tsx
alwaysApply: false
---

# KPI metric cards (StatCard)

When editing Overview KPI cards, follow BI glance-tile doctrine. Full rules: `.cursor/skills/dashboard-uiux-analysis/references/kpi-metric-cards.md` and `docs/specs/dashboard-design-requirements.md` §2.1.

## Do

- One hero number; title names that metric
- Keep **delta** and labeled **`secondaryLine`** on the **same row** as the hero value (not stacked below)
- Related counts on `secondaryLine` with a noun (`17 accepted`, `3 reviewed`)
- Delta icons: `ArrowUp` / `ArrowDown` only (not `TrendingUp` / `TrendingDown`)
- One leading title icon; nuance in the info tooltip
- `ariaLabel` includes primary + secondary when both exist

## Don't

- Two peer numbers on the value row
- Icon + bare digit / unlabeled chip beside the hero (e.g. green check + `17` next to rejected `0`)
- Opposing status icons on the same card face
- Delta or secondary on a separate line that grows card height unevenly
- Prose sentences on the card face

```tsx
// ✅ GOOD — hero + companions share one value row
value={rejected}
secondaryLine={`${accepted} accepted`}
delta={needsAttention.delta} // ArrowUp / ArrowDown inline

// ❌ BAD
value={<>{rejected}<CheckCircle2 />{accepted}</>}
// ❌ BAD — stacked under the hero
<>
  <CardTitle>{value}</CardTitle>
  <p>{secondaryLine}</p>
</>
```
