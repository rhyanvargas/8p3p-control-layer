# KPI / StatCard metric-card doctrine (normative)

BI glance tiles answer one question in ~1 second. Competing unlabeled numbers break that contract.

Canonical implementation: `dashboard/components/dashboard/stat-card.tsx`, wired in `section-cards.tsx`. Spec: `docs/specs/dashboard-design-requirements.md` §2.1 (KPI metric cards) + §8.

## Hard rules

1. **One primary metric per card.** The large `CardTitle` value is a single number — never two peer numbers competing as heroes.
2. **Title matches the primary.** If the title is "Rejected today", the hero number is rejected count only.
3. **Value-row companions stay inline.** Optional delta and labeled `secondaryLine` sit on the **same row** as the hero value (flex + baseline), not on a second line that inflates card height. Keep all Overview KPI cards the same height when they share that pattern.
4. **Secondary context is labeled text.** Put related counts on `secondaryLine` with a noun: `17 accepted`, `3 reviewed`, `Program-wide`. Never an icon + bare digit.
5. **Delta uses a simple arrow.** Positive → `ArrowUp`, negative → `ArrowDown` (not `TrendingUp` / squiggle). Color still encodes direction via semantic tokens.
6. **One status icon on the card face.** The leading title icon encodes the card's job. Do not add a second opposing status icon (e.g. green check next to red X) on the value row.
7. **Tooltip holds nuance.** Full dual-outcome or methodology copy goes in the info tooltip — not on the face.
8. **Accessible name includes both dimensions** when a secondary exists: e.g. `Rejected signals today: 0. 17 accepted.`

## Fail conditions (flag 🔴 in analysis)

Any of these on a KPI/StatCard face is a defect:

- Two numbers on the primary value row without words explaining the second
- Unlabeled icon-chip / icon+digit "comparison" beside the hero value
- Title that names metric A while the hero number is metric B (or a compound of A+B)
- Delta or `secondaryLine` stacked on its own row below the hero (inconsistent height / not glance-aligned)
- Delta using a chart/trend squiggle (`TrendingUp` / `TrendingDown`) instead of a simple up/down arrow
- Prose sentences on the card face (D3 / §2.1 anti-clutter)

## Correct pattern

```tsx
// Value row: hero + optional delta + optional labeled secondary (all inline)
<div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
  <CardTitle>{value}</CardTitle>
  {delta != null ? <DeltaBadge delta={delta} /> : null} // ArrowUp / ArrowDown
  {secondaryLine ? <span>{secondaryLine}</span> : null}
</div>

<StatCard
  title="Rejected today"
  value={rejected} // single number
  icon={XCircle}
  tooltip={`${accepted} accepted and ${rejected} rejected since midnight.`}
  secondaryLine={`${accepted} accepted`} // labeled; inline beside hero
  ariaLabel={`Rejected signals today: ${rejected}. ${accepted} accepted.`}
  href="/signals"
/>

<StatCard
  title="Needs action"
  value={needsAttention.count}
  delta={needsAttention.delta} // +N / −N with ArrowUp / ArrowDown, inline
  ...
/>
```

Same pattern as Pending: hero = pending count; `secondaryLine` = `N reviewed` (inline).

## Incorrect pattern (do not recommend or reintroduce)

```tsx
// ❌ Dual peer metrics + unlabeled checkmark
value={
  <span>
    {rejected}
    <CheckCircle2 /> {accepted}
  </span>
}

// ❌ Secondary or delta on a separate row under the hero
<>
  <CardTitle>{value}</CardTitle>
  <p>{secondaryLine}</p>
  <DeltaBadge delta={delta} />
</>

// ❌ Squiggle trend icon for delta
const Icon = positive ? TrendingUp : TrendingDown;
```

## When a second metric deserves equal weight

Promote it to its **own** card (still ≤4 Overview KPIs) or move the pair into a non-KPI surface (chart, table, Signals page). Do not stretch one StatCard into a mini dashboard.
