/** Client-safe gate for the opt-out "Link chart and table" toggle (NEXT_PUBLIC_ — no secrets). */
export function isOverviewCrossFilterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OVERVIEW_CROSS_FILTER !== 'false';
}
