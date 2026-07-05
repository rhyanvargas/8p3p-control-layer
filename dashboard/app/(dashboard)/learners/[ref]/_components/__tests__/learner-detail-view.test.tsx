import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LearnerDetailView } from '@/app/(dashboard)/learners/[ref]/_components/learner-detail-view';
import { DashboardPersonaProvider } from '@/lib/persona-context';

const pendingReviewState = vi.hoisted(() => ({
  effectivePendingDecisionId: null as string | null,
  isLoading: false,
}));

vi.mock('@/hooks/use-pending-review-for-learner', () => ({
  usePendingReviewForLearner: () => ({
    effectivePendingDecisionId: pendingReviewState.effectivePendingDecisionId,
    isLoading: pendingReviewState.isLoading,
    summaryQuery: { isLoading: pendingReviewState.isLoading },
  }),
}));

vi.mock('@/app/(dashboard)/learners/[ref]/_components/learner-overview-tab', () => ({
  LearnerOverviewTab: () => <div>Overview tab</div>,
}));

vi.mock('@/app/(dashboard)/learners/[ref]/_components/learner-state-tab', () => ({
  LearnerStateTab: () => <div>State tab</div>,
}));

vi.mock('@/app/(dashboard)/learners/[ref]/_components/learner-trajectory-tab', () => ({
  LearnerTrajectoryTab: () => <div>Trajectory tab</div>,
}));

vi.mock('@/app/(dashboard)/learners/[ref]/_components/learner-struggles-tab', () => ({
  LearnerStrugglesTab: () => <div>Struggles tab</div>,
}));

vi.mock('@/app/(dashboard)/attention/_components/attention-review-bar', () => ({
  AttentionReviewBar: () => (
    <div role="region" aria-label="Attention review actions">
      Review bar
    </div>
  ),
}));

function renderLearnerDetailView() {
  return render(
    <DashboardPersonaProvider persona="compliance">
      <LearnerDetailView orgId="org-1" learnerRef="Malosi" />
    </DashboardPersonaProvider>
  );
}

describe('LearnerDetailView review bar visibility', () => {
  it('LPR-008: hides the review bar when no pending decision remains', () => {
    pendingReviewState.effectivePendingDecisionId = null;
    pendingReviewState.isLoading = false;

    renderLearnerDetailView();

    expect(
      screen.queryByRole('region', { name: 'Attention review actions' })
    ).not.toBeInTheDocument();
  });

  it('shows the review bar when a pending decision is resolved', () => {
    pendingReviewState.effectivePendingDecisionId = 'decision-001';
    pendingReviewState.isLoading = false;

    renderLearnerDetailView();

    expect(
      screen.getByRole('region', { name: 'Attention review actions' })
    ).toBeInTheDocument();
  });
});
