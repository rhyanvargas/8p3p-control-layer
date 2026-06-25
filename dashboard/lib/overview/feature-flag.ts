/** Client-safe gate for Overview cross-filter UI (NEXT_PUBLIC_ — no secrets). */
export function isOverviewCrossFilterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OVERVIEW_CROSS_FILTER !== 'false';
}
