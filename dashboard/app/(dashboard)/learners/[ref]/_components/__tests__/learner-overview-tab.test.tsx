import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LearnerOverviewTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-overview-tab';
import type { LearnerSummaryResponse } from '@/lib/api/types';
import { DashboardPersonaProvider } from '@/lib/persona-context';

const summaryFixture: LearnerSummaryResponse = {
  org_id: 'org-1',
  learner_reference: 'Malosi',
  generated_at: '2026-03-28T14:45:30Z',
  current_state: {
    state_id: 's1',
    state_version: 2,
    updated_at: '2026-03-28T14:45:30Z',
    fields: {
      masteryScore: 0.62,
      masteryScore_direction: 'improving',
      skill: 'ELA-201',
    },
    mastery_breakdown: null,
  },
  recent_decisions: [
    {
      decision_id: 'decision-a',
      decision_type: 'intervene',
      decided_at: '2026-03-28T14:00:00Z',
      educator_summary: 'Needs support now',
      educator_explanation: 'Long explanation for decision A that should match the bar.',
      rationale: 'Low stability',
      matched_rule_id: 'rule-1',
      policy_version: '1',
    },
    {
      decision_id: 'decision-b',
      decision_type: 'pause',
      decided_at: '2026-03-27T14:00:00Z',
      educator_summary: 'Consider pausing',
      educator_explanation: null,
      rationale: 'Decay risk',
      matched_rule_id: 'rule-2',
      policy_version: '1',
    },
  ],
  field_trajectories: {
    masteryScore: {
      first_value: 0.5,
      latest_value: 0.62,
      overall_direction: 'improving',
      version_count: 2,
    },
  },
  active_policy: {
    policy_id: 'p1',
    policy_key: 'learner',
    policy_version: '1',
    rule_count: 1,
  },
  signals_summary: {
    total_count: 3,
    first_signal_at: '2026-03-01T00:00:00Z',
    last_signal_at: '2026-03-28T14:45:30Z',
  },
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-learner-summary', () => ({
  useLearnerSummary: () => ({
    data: summaryFixture,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-decision-feedback-status', () => ({
  useFeedbackStatusForDecisionIds: () => ({
    latestActionByDecisionId: new Map<string, string>(),
    serverReviewedIds: new Set<string>(),
  }),
}));

vi.mock('@/lib/decision-review', () => ({
  getReviewRecord: () => null,
  isReviewedLocally: () => false,
}));

function renderOverview(
  activePendingDecisionId?: string,
  options?: { fromAttention?: boolean }
) {
  return render(
    <DashboardPersonaProvider persona="educator">
      <LearnerOverviewTab
        orgId="org-1"
        learnerRef="Malosi"
        activePendingDecisionId={activePendingDecisionId}
        fromAttention={options?.fromAttention}
      />
    </DashboardPersonaProvider>
  );
}

describe('LearnerOverviewTab review identity (RTC-006, RTC-007, RTC-F14)', () => {
  it('RTC-006: active pending row Your action shows Reviewing, not em dash', () => {
    renderOverview('decision-a');

    const activeRow = screen.getByText(/Long explanation for decision A/).closest('tr');
    expect(activeRow).toHaveAttribute('data-state', 'active');
    expect(within(activeRow as HTMLElement).getByText('Reviewing')).toBeInTheDocument();
    expect(within(activeRow as HTMLElement).queryByText('—')).not.toBeInTheDocument();

    const otherRow = screen.getByText('Consider pausing').closest('tr');
    expect(otherRow).not.toHaveAttribute('data-state', 'active');
    // Non-active pending shows Review link (RTC-F14), not em dash.
    expect(within(otherRow as HTMLElement).getByRole('link', { name: 'Review' })).toBeInTheDocument();
  });

  it('RTC-007: Overview has no Approve/Reject when active pending (LPR-F08)', () => {
    renderOverview('decision-a');

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('RTC-F14: non-active pending Review link sets reviewDecision only', () => {
    renderOverview('decision-a');

    const otherRow = screen.getByText('Consider pausing').closest('tr');
    const reviewLink = within(otherRow as HTMLElement).getByRole('link', {
      name: 'Review',
    });
    expect(reviewLink).toHaveAttribute(
      'href',
      '/learners/Malosi?reviewDecision=decision-b'
    );
    expect(reviewLink).not.toHaveAttribute('href', expect.stringContaining('from='));
    expect(within(otherRow as HTMLElement).queryByText('Reviewing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('RTC-F14: Attention-originated Review preserves from=attention', () => {
    renderOverview('decision-a', { fromAttention: true });

    const otherRow = screen.getByText('Consider pausing').closest('tr');
    const reviewLink = within(otherRow as HTMLElement).getByRole('link', {
      name: 'Review',
    });
    expect(reviewLink).toHaveAttribute(
      'href',
      '/learners/Malosi?reviewDecision=decision-b&from=attention'
    );
  });
});
