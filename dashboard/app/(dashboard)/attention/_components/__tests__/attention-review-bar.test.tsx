import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AttentionReviewBar } from '@/app/(dashboard)/attention/_components/attention-review-bar';

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  state: 'expanded' as 'expanded' | 'collapsed',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
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
      recent_decisions: [
        {
          decision_id: 'decision-1',
          decision_type: 'intervene',
          educator_summary: 'Needs stronger support now',
        },
      ],
    },
  }),
}));

function renderReviewBar() {
  return render(
    <AttentionReviewBar
      orgId="org-1"
      learnerRef="staff-0201"
      decisionId="decision-1"
    />
  );
}

describe('AttentionReviewBar layout', () => {
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
});
