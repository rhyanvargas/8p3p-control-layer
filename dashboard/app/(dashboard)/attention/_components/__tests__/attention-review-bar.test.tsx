import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttentionReviewBar } from '@/app/(dashboard)/attention/_components/attention-review-bar';
import { formatDecisionTime } from '@/lib/overview-metrics';
import { educatorBodyCopy } from '@/lib/panel-helpers';
import type { RecentDecisionItem } from '@/lib/api/types';

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  state: 'expanded' as 'expanded' | 'collapsed',
}));

const summaryState = vi.hoisted(() => {
  const decision = {
    decision_id: 'decision-1',
    decision_type: 'intervene' as const,
    decided_at: '2026-07-11T15:00:00.000Z',
    educator_summary: 'Needs support',
    educator_explanation: null as string | null,
    rationale: 'Rule matched intervene threshold',
    matched_rule_id: null,
    policy_version: 'v1',
  } satisfies RecentDecisionItem;

  return {
    decision,
    extraPending: [] as RecentDecisionItem[],
  };
});

const baseDecision: RecentDecisionItem = {
  decision_id: 'decision-1',
  decision_type: 'intervene',
  decided_at: '2026-07-11T15:00:00.000Z',
  educator_summary: 'Needs support',
  educator_explanation: null,
  rationale: 'Rule matched intervene threshold',
  matched_rule_id: null,
  policy_version: 'v1',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/ui/sidebar', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/sidebar')>(
    '@/components/ui/sidebar'
  );

  return {
    ...actual,
    useSidebar: () => ({
      isMobile: sidebarState.isMobile,
      state: sidebarState.state,
    }),
  };
});

vi.mock('@/hooks/use-learner-summary', () => ({
  useLearnerSummary: () => ({
    data: {
      org_id: 'org-1',
      learner_reference: 'staff-0201',
      generated_at: '2026-07-11T15:00:00.000Z',
      current_state: {
        state_id: 'state-1',
        state_version: 1,
        updated_at: '2026-07-11T15:00:00.000Z',
        fields: { skill: 'algebra' },
        mastery_breakdown: null,
      },
      recent_decisions: [summaryState.decision, ...summaryState.extraPending],
      field_trajectories: {},
      active_policy: null,
      signals_summary: {
        total_count: 0,
        first_signal_at: null,
        last_signal_at: null,
      },
    },
  }),
}));

vi.mock('@/hooks/use-decision-feedback-status', () => ({
  collectUrgentDecisionIds: () => [
    summaryState.decision.decision_id,
    ...summaryState.extraPending.map((item) => item.decision_id),
  ],
  invalidateDecisionFeedbackQuery: vi.fn(),
  useFeedbackStatusForDecisionIds: () => ({
    serverReviewedIds: new Set<string>(),
    latestActionByDecisionId: new Map(),
    feedbackQueries: [],
  }),
}));

function renderReviewBar(fromAttention = false, decisionId = summaryState.decision.decision_id) {
  return render(
    <AttentionReviewBar
      orgId="org-1"
      learnerRef="staff-0201"
      decisionId={decisionId}
      fromAttention={fromAttention}
    />
  );
}

describe('AttentionReviewBar layout', () => {
  beforeEach(() => {
    sidebarState.isMobile = false;
    sidebarState.state = 'expanded';
    summaryState.decision = { ...baseDecision };
    summaryState.extraPending = [];
  });

  it('matches the main content width rules on desktop', () => {
    sidebarState.isMobile = false;
    sidebarState.state = 'expanded';

    renderReviewBar();

    const region = screen.getByRole('region', { name: 'Attention review actions' });

    expect(region).toHaveClass('mx-auto', 'w-full', 'max-w-(--content-max-width)');
    expect(region.parentElement).toHaveClass(
      'bottom-6',
      'right-0',
      'md:left-(--sidebar-width)'
    );
  });

  it('matches the main content width rules on mobile', () => {
    sidebarState.isMobile = true;

    renderReviewBar();

    const region = screen.getByRole('region', { name: 'Attention review actions' });

    expect(region).toHaveClass('mx-auto', 'w-full', 'max-w-(--content-max-width)');
    expect(region.parentElement).toHaveClass(
      'inset-x-0',
      'bottom-4',
      'px-4'
    );
  });

  it('places queue position and Next beside Approve/Reject when multiple pending', () => {
    summaryState.extraPending = [
      {
        ...baseDecision,
        decision_id: 'decision-2',
        decided_at: '2026-07-10T15:00:00.000Z',
        educator_summary: 'Second pending',
      },
    ];

    renderReviewBar();

    const queueGroup = screen.getByRole('group', { name: 'Pending review queue' });
    expect(queueGroup).toHaveTextContent('1 of 2 pending');
    expect(
      screen.getByRole('button', { name: 'Next' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })?.closest('[role="group"]')).toBe(
      queueGroup
    );
  });

  it('hides queue navigator when only one pending decision', () => {
    renderReviewBar();

    expect(
      screen.queryByRole('group', { name: 'Pending review queue' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});

describe('AttentionReviewBar identity (RTC-001, RTC-002, RTC-008)', () => {
  beforeEach(() => {
    sidebarState.isMobile = false;
    sidebarState.state = 'expanded';
    summaryState.decision = { ...baseDecision };
    summaryState.extraPending = [];
  });

  it('RTC-001: narrative uses educatorBodyCopy when educator_explanation is set', () => {
    summaryState.decision = {
      ...summaryState.decision,
      educator_summary: 'Short summary only',
      educator_explanation:
        'Long explanation that educators should see instead of the short summary alone.',
    };

    renderReviewBar();

    const expected = educatorBodyCopy(summaryState.decision);
    expect(expected).toBe(summaryState.decision.educator_explanation);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('Short summary only')).not.toBeInTheDocument();
  });

  it('RTC-002: falls back to educator_summary; never hardcoded intervene/pause copy when summary exists', () => {
    summaryState.decision = {
      ...summaryState.decision,
      educator_summary: 'Custom summary from the decision payload',
      educator_explanation: null,
      rationale: null,
    };

    renderReviewBar();

    const expected = educatorBodyCopy(summaryState.decision);
    expect(expected).toBe('Custom summary from the decision payload');
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('Needs stronger support now')).not.toBeInTheDocument();
    expect(
      screen.queryByText('High decay risk — consider pausing')
    ).not.toBeInTheDocument();
  });

  it('RTC-008: shows type badge, formatted time, narrative; omits learner ref when fromAttention=false', () => {
    summaryState.decision = {
      ...summaryState.decision,
      educator_summary: 'Needs support',
      educator_explanation: 'Check-in recommended based on stability signals.',
    };

    renderReviewBar(false);

    const region = screen.getByRole('region', { name: 'Attention review actions' });
    expect(region).toHaveTextContent('Intervene');
    expect(region).toHaveTextContent(
      formatDecisionTime(summaryState.decision.decided_at)
    );
    expect(region).toHaveTextContent(educatorBodyCopy(summaryState.decision));
    expect(region).not.toHaveTextContent('staff-0201');
  });
});
