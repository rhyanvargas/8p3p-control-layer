---
description: Dashboard URL query params must mirror visible UI — linked state is always visible (§2.1)
globs:
  - dashboard/**/*.tsx
  - dashboard/lib/page-url-state.ts
  - dashboard/lib/**/navigation*.ts
  - dashboard/components/dashboard/section-cards.tsx
alwaysApply: false
---

# Dashboard URL linked state

When a URL query parameter changes what the educator sees (filters, context, selected entity state), the UI **must** show that state. Never add hidden `?param=value` flags that only alter copy or layout without a visible control or chip.

**Normative spec:** `docs/specs/dashboard-design-requirements.md` §2.1 — *Linked state is always visible.*

## Rule of thumb

> If a URL parameter affects what the user sees, they must be able to see and control it on the page. Analytics-only params are fine hidden; params that look like filters are not.

## Before adding `?foo=bar`

1. **Register** the param in `dashboard/lib/page-url-state.ts` (`PAGE_URL_PARAMS`).
2. **Pick a kind:**
   - `data-filter` — narrows table/list → paired `Select`, tabs, or removable chip (`Trend filter`, `Action type`).
   - `entry-context` — drill-down origin → dismissible chip (`From: Pending decisions ✕`) or back link (`Back to Attention`).
   - `entity-state` — sub-entity on L2 → version picker, review bar, active tab.
   - `redirect-only` — legacy/compat URLs that **redirect** elsewhere; never a silent page filter.
3. **Mirror in UI** — implement the visible control before merging.
4. **Run** `npm test -- page-url-state` (registry + href contract).

## Patterns

```tsx
// ✅ GOOD — data filter synced with URL
const trend = parseRosterTrendFilter(searchParams.get('trend'));
<Select aria-label="Trend filter" value={trend ?? 'all'} onValueChange={...} />

// ✅ GOOD — entry context chip
{fromPending ? (
  <Badge variant="outline">
    From: Pending decisions
    <button aria-label="Dismiss entry context" onClick={() => router.replace('/attention')} />
  </Badge>
) : null}

// ❌ BAD — URL changes behavior with no visible mirror
const focusReview = searchParams.get('focus') === 'review';
description={focusReview ? 'Review mode...' : 'Default...'}
```

## Drill-down links (KPI cards, toasts, redirects)

- Build hrefs with helpers from `page-url-state.ts` (e.g. `attentionFromPendingUrl()`).
- Do not invent new query keys in `section-cards.tsx` or page `redirect()` without registry entry.

## E2E

When a KPI or nav link includes query params, add an assertion that the visible control or chip matches (see `e2e/overview-kpi-drilldown.spec.ts`).

## References

- Registry: `dashboard/lib/page-url-state.ts`
- Contract test: `dashboard/lib/__tests__/page-url-state.test.ts`
- Gold standard: `learners-roster.tsx` (`trend`, `skill` ↔ filter bar)
- Entry context: `attention-queue.tsx` (`from=pending` ↔ chip)
