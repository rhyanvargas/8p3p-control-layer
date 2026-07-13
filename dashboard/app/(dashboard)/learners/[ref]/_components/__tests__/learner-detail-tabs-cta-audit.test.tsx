import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LearnerOverviewTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-overview-tab';
import { LearnerStateTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-state-tab';
import { LearnerStrugglesTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-struggles-tab';
import { LearnerTrajectoryTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-trajectory-tab';
import type { LearnerStateResponse, LearnerSummaryResponse } from '@/lib/api/types';
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
      decision_id: 'decision-001',
      decision_type: 'intervene',
      decided_at: '2026-03-28T14:00:00Z',
      educator_summary: 'Needs support',
      rationale: 'Low stability',
      matched_rule_id: 'rule-1',
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

const stateFixture: LearnerStateResponse = {
  org_id: 'org-1',
  learner_reference: 'Malosi',
  state_id: 's1',
  state_version: 2,
  updated_at: '2026-03-28T14:45:30Z',
  state: {
    skills: [
      {
        skillName: 'ELA-201',
        stabilityScore: 0.3,
        stabilityScore_direction: 'declining',
        masteryScore: 0.62,
        masteryScore_direction: 'improving',
        masteryScore_delta: 0.1,
      },
    ],
  },
  provenance: {
    last_signal_id: 'sig-1',
    last_signal_timestamp: '2026-03-28T14:45:30Z',
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

vi.mock('@/hooks/use-learner-states', () => ({
  useLearnerState: () => ({
    data: stateFixture,
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

function expectNoReviewActionButtons() {
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
}

describe('LPR-F08: learner detail tabs omit duplicate Approve/Reject CTAs', () => {
  it('overview tab shows read-only history chips only', () => {
    render(
      <DashboardPersonaProvider persona="educator">
        <LearnerOverviewTab orgId="org-1" learnerRef="Malosi" />
      </DashboardPersonaProvider>
    );

    expectNoReviewActionButtons();
  });

  it('state tab has no review action buttons', () => {
    render(<LearnerStateTab orgId="org-1" learnerRef="Malosi" />);

    expectNoReviewActionButtons();
  });

  it('trajectory tab has no review action buttons', () => {
    render(<LearnerTrajectoryTab orgId="org-1" learnerRef="Malosi" />);

    expectNoReviewActionButtons();
  });

  it('struggles tab has no review action buttons', () => {
    render(<LearnerStrugglesTab orgId="org-1" learnerRef="Malosi" />);

    expectNoReviewActionButtons();
  });
});
