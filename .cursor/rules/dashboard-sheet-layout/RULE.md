---
description: Dashboard sheet/footer layout with shadcn/ui — DetailSheet, SheetFooter, DrillDownLink; prevent horizontal overflow in fixed-width panels
globs: dashboard/**/*.tsx
alwaysApply: false
---

# Dashboard sheet & footer layout (shadcn/ui)

When editing dashboard sheets, footers, or drill-down CTAs, follow shadcn composition — do not fight built-in layout models with custom flex overrides.

Read `.agents/skills/shadcn/SKILL.md` before adding or restyling sheet UI. Prefer existing components (`SheetFooter`, `Button`, `DrillDownLink`, `DetailSheet`) over custom markup.

## SheetFooter is column-first

`SheetFooter` ships as `flex flex-col gap-2`. `DetailSheet` passes footer content into it.

- **Do:** pass multiple footer children — review actions on one row, `DrillDownLink` on the next.
- **Don't:** wrap footer content in `sm:flex-row` or other row layouts that fight `SheetFooter`.

```tsx
// ✅ GOOD — stacks inside SheetFooter
footer={
  <>
    <div className="flex flex-wrap gap-2">
      <Button size="sm">Approve</Button>
      <Button size="sm" variant="outline">Reject</Button>
    </div>
    <DrillDownLink href={href} />
  </>
}

// ❌ BAD — w-full link + row layout overflows the ~480px sheet
footer={
  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
    <div className="flex gap-2">...</div>
    <DrillDownLink href={href} className="sm:ml-auto" />
  </div>
}
```

## DrillDownLink is a full-width sole CTA

`DrillDownLink` applies `w-full` for the common single-CTA footer. That is correct when it is the **only** footer child.

- **Do:** stack it below other actions (column layout).
- **Don't:** place it in a horizontal row with other buttons unless you explicitly override width (`sm:w-auto`) and verify fit.

## No viewport breakpoints inside fixed-width panels

`DetailSheet` content is `sm:max-w-[480px]`. Tailwind `sm:` follows the **viewport** (640px), not the sheet width.

- **Do:** use column stacking, `flex-wrap`, and `min-w-0` inside sheets.
- **Don't:** use `sm:flex-row`, `md:grid-cols-*`, etc. to lay out footer actions horizontally in sheets.

## Overflow guards

- Keep `w-full min-w-0` on `SheetFooter` in `DetailSheet` — do not remove.
- For multi-action footers, add or extend e2e coverage with `expectSheetFooterFits` from `dashboard/e2e/fixtures.ts`.

## Button groups

Use shadcn `ButtonGroup` only for visually connected controls (segmented toolbars). Independent actions like Approve/Reject stay as separate `Button`s with `gap-2`; do not fuse them when semantics differ.
