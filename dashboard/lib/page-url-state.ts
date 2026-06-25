/**
 * Registry of dashboard URL query parameters that affect page UI.
 *
 * Normative: docs/specs/dashboard-design-requirements.md §2.1 (URL query parameters)
 * Enforcement: dashboard/lib/__tests__/page-url-state.test.ts
 * Agent rule: .cursor/rules/dashboard-url-linked-state/RULE.md
 */

export type PageUrlStateKind =
  /** Narrows list/table data — must mirror a filter control. */
  | 'data-filter'
  /** Explains navigation origin — dismissible chip or back link. */
  | 'entry-context'
  /** Selects entity sub-state — version picker, review bar, active tab. */
  | 'entity-state'
  /** Accepted only on redirect routes; never rendered as a page filter. */
  | 'redirect-only';

export type PageUrlParamDef = {
  kind: PageUrlStateKind;
  /** Routes where this param may appear (prefix match). */
  routes: readonly string[];
  /**
   * Visible UI that mirrors this param (filter label, chip text, bar region).
   * Required for data-filter and entry-context; required for entity-state when
   * the param changes what the user sees.
   */
  visibleControl?: string;
  /** Allowed values when enumerated (entry-context / redirect-only). */
  allowedValues?: readonly string[];
};

/** Single source of truth — add a row before introducing a new ?param. */
export const PAGE_URL_PARAMS = {
  trend: {
    kind: 'data-filter',
    routes: ['/learners'],
    visibleControl: 'Trend filter',
  },
  skill: {
    kind: 'data-filter',
    routes: ['/learners'],
    visibleControl: 'Skill filter',
  },
  from: {
    kind: 'entry-context',
    routes: ['/attention', '/learners'],
    allowedValues: ['pending', 'attention'],
  },
  reviewDecision: {
    kind: 'entity-state',
    routes: ['/learners'],
    visibleControl: 'Attention review bar',
  },
  version: {
    kind: 'entity-state',
    routes: ['/learners'],
    visibleControl: 'State version selector',
  },
  status: {
    kind: 'redirect-only',
    routes: ['/decisions'],
    allowedValues: ['pending'],
  },
  reviewed: {
    kind: 'data-filter',
    routes: ['/decisions'],
    visibleControl: 'Review status filter',
    allowedValues: ['pending', 'session'],
  },
} as const satisfies Record<string, PageUrlParamDef>;

export type PageUrlParamKey = keyof typeof PAGE_URL_PARAMS;

export const ATTENTION_FROM_PARAM = 'from' as const;
export const ATTENTION_FROM_PENDING_VALUE = 'pending' as const;

export function attentionFromPendingUrl(): string {
  return `/attention?${ATTENTION_FROM_PARAM}=${ATTENTION_FROM_PENDING_VALUE}`;
}

export const DECISIONS_REVIEWED_PARAM = 'reviewed' as const;
export const DECISIONS_REVIEWED_SESSION_VALUE = 'session' as const;

export function decisionsReviewedSessionUrl(): string {
  return `/decisions?${DECISIONS_REVIEWED_PARAM}=${DECISIONS_REVIEWED_SESSION_VALUE}`;
}

export function parseQueryKeys(href: string): string[] {
  const queryIndex = href.indexOf('?');
  if (queryIndex === -1) return [];
  const search = href.slice(queryIndex + 1);
  return [...new URLSearchParams(search).keys()];
}

export function assertRegisteredQueryKeys(href: string, routePrefix: string): void {
  for (const key of parseQueryKeys(href)) {
    const def = PAGE_URL_PARAMS[key as PageUrlParamKey];
    if (!def) {
      throw new Error(`Unregistered query param "${key}" in href "${href}"`);
    }
    if (!def.routes.some((route) => routePrefix.startsWith(route))) {
      throw new Error(
        `Query param "${key}" is not registered for route "${routePrefix}"`
      );
    }
  }
}
