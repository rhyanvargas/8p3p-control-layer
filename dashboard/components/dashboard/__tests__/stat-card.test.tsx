import { render, screen } from '@testing-library/react';
import { AlertCircle } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { SectionCards } from '@/components/dashboard/section-cards';
import { StatCard } from '@/components/dashboard/stat-card';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OverviewKpis } from '@/lib/overview-metrics';

function renderCard(props: React.ComponentProps<typeof StatCard>) {
  return render(
    <TooltipProvider>
      <StatCard {...props} />
    </TooltipProvider>
  );
}

const sampleKpis: OverviewKpis = {
  needsAttention: { count: 3, delta: 1 },
  pendingDecisions: 5,
  signalsToday: { accepted: 2, rejected: 1 },
  improvingLearners: 4,
};

describe('KPI-001 / KPI-004: StatCard icon and clickability', () => {
  it('renders optional leading icon', () => {
    renderCard({
      title: 'Needs attention',
      value: 3,
      icon: AlertCircle,
      iconClassName: 'text-red-500',
    });
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('wraps card in link when href is provided', () => {
    renderCard({
      title: 'Pending',
      value: 2,
      href: '/attention?from=pending',
    });
    const link = screen.getByRole('link', { name: /Pending: 2/ });
    expect(link).toHaveAttribute('href', '/attention?from=pending');
  });

  it('is keyboard-focusable when href is provided', () => {
    renderCard({
      title: 'Pending',
      value: 2,
      href: '/attention?from=pending',
    });
    const link = screen.getByRole('link', { name: /Pending: 2/ });
    link.focus();
    expect(link).toHaveFocus();
  });

  it('does not render prose description on card face', () => {
    renderCard({
      title: 'Test',
      value: 1,
      tooltip: 'Hidden nuance',
    });
    expect(screen.queryByText('Hidden nuance')).not.toBeInTheDocument();
  });

  it('renders delta inline with the metric value using a simple arrow', () => {
    const { container } = renderCard({
      title: 'Needs action',
      value: 4,
      delta: 3,
    });

    const value = screen.getByText('4');
    const delta = screen.getByText('+3');
    expect(value.parentElement).toContainElement(delta);
    expect(container.querySelector('svg.lucide-arrow-up')).toBeTruthy();
    expect(container.querySelector('svg.lucide-trending-up')).toBeNull();
  });

  it('uses a down arrow for negative deltas', () => {
    const { container } = renderCard({
      title: 'Needs action',
      value: 1,
      delta: -2,
    });

    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-arrow-down')).toBeTruthy();
  });

  it('renders labeled secondary context inline with the metric value', () => {
    renderCard({
      title: 'Rejected today',
      value: 0,
      secondaryLine: '17 accepted',
    });

    const value = screen.getByText('0');
    const secondary = screen.getByText('17 accepted');
    expect(value.parentElement).toContainElement(secondary);
  });
});

describe('KPI-004: SectionCards drill targets and declutter', () => {
  it('renders all four KPI cards as links to their drill targets', () => {
    render(
      <TooltipProvider>
        <SectionCards kpis={sampleKpis} />
      </TooltipProvider>
    );

    expect(screen.getByRole('link', { name: /Needs attention: 3/ })).toHaveAttribute(
      'href',
      '/attention'
    );
    expect(
      screen.getByRole('link', { name: /Rejected signals today: 1\. 2 accepted\./ })
    ).toHaveAttribute('href', '/signals');
    expect(screen.getByRole('link', { name: /Pending decisions: 5/ })).toHaveAttribute(
      'href',
      '/attention?from=pending'
    );
    expect(screen.getByRole('link', { name: /Improving learners: 4/ })).toHaveAttribute(
      'href',
      '/learners?trend=improving'
    );
  });

  it('does not render prose descriptions on card faces', () => {
    render(
      <TooltipProvider>
        <SectionCards kpis={sampleKpis} />
      </TooltipProvider>
    );

    expect(
      screen.queryByText('Intervene and pause decisions awaiting your review. Approve or reject each one.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Learners with at least one improving mastery signal.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/accepted and .* rejected since midnight/)).not.toBeInTheDocument();
  });

  it('shows rejected as the primary value with labeled accepted context inline', () => {
    render(
      <TooltipProvider>
        <SectionCards kpis={sampleKpis} />
      </TooltipProvider>
    );

    expect(screen.getByText('Rejected today')).toBeInTheDocument();
    expect(screen.queryByText(/Signals today:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Rejected signals today: 1\. 2 accepted\./ })
    ).toBeInTheDocument();
    const secondary = screen.getByText('2 accepted');
    const valueRow = secondary.parentElement;
    expect(valueRow).toHaveTextContent(/^12 accepted$/);
  });
});
