import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveFilterChips } from '@/app/(dashboard)/_components/active-filter-chips';
import {
  OverviewSyncProvider,
  useOverviewFilter,
  type OverviewSyncData,
} from '@/app/(dashboard)/_components/overview-sync-provider';
import { SyncFilterToggle } from '@/app/(dashboard)/_components/sync-filter-toggle';
import { SectionCards } from '@/components/dashboard/section-cards';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Decision, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import { applyOverviewFilter, DEFAULT_OVERVIEW_FILTER } from '@/lib/overview/overview-filter';
import { computeOverviewKpis } from '@/lib/overview-metrics';

vi.mock('@/lib/overview/feature-flag', () => ({
  isOverviewCrossFilterEnabled: () => true,
}));

const NOW = new Date(2026, 5, 25, 12, 0, 0);

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function makeDecision(
  overrides: Partial<Decision> & Pick<Decision, 'decision_id' | 'learner_reference' | 'decision_type' | 'decided_at'>
): Decision {
  return {
    org_id: 'org-1',
    decision_context: {},
    trace: {
      state_id: 'state-1',
      state_version: 1,
      policy_id: 'policy-1',
      policy_version: '1.0.0',
      matched_rule_id: 'rule-1',
      state_snapshot: {},
      matched_rule: {
        rule_id: 'rule-1',
        condition: { field: 'riskSignal', op: 'gte', value: 0.5 },
        evaluated_fields: [],
      },
      rationale: 'test',
    },
    output_metadata: {},
    ...overrides,
  };
}

const MOCK_DECISIONS: Decision[] = [
  makeDecision({
    decision_id: 'd1',
    learner_reference: 'stu-40123',
    decision_type: 'reinforce',
    decided_at: daysAgo(0),
  }),
  makeDecision({
    decision_id: 'd2',
    learner_reference: 'stu-50000',
    decision_type: 'reinforce',
    decided_at: daysAgo(1),
  }),
  makeDecision({
    decision_id: 'd3',
    learner_reference: 'stu-40123',
    decision_type: 'intervene',
    decided_at: daysAgo(2),
  }),
  makeDecision({
    decision_id: 'd4',
    learner_reference: 'stu-99999',
    decision_type: 'pause',
    decided_at: daysAgo(3),
  }),
];

const MOCK_INGESTION: IngestionLogEntry[] = [
  {
    signal_id: 'sig-1',
    source_system: 'lms',
    learner_reference: 'stu-40123',
    timestamp: daysAgo(0),
    schema_version: '1',
    outcome: 'rejected',
    received_at: daysAgo(0),
    rejection_reason: { code: 'INVALID' },
  },
  {
    signal_id: 'sig-2',
    source_system: 'lms',
    learner_reference: 'stu-50000',
    timestamp: daysAgo(0),
    schema_version: '1',
    outcome: 'accepted',
    received_at: daysAgo(0),
    rejection_reason: null,
  },
];

const MOCK_LEARNER_STATES: LearnerStateResponse[] = [
  {
    org_id: 'org-1',
    learner_reference: 'stu-40123',
    state_id: 'state-1',
    state_version: 1,
    updated_at: daysAgo(0),
    state: { masteryScore: 0.8, masteryScore_direction: 'improving' },
    provenance: { source: 'test' },
  },
  {
    org_id: 'org-1',
    learner_reference: 'stu-50000',
    state_id: 'state-2',
    state_version: 1,
    updated_at: daysAgo(0),
    state: { masteryScore: 0.5, masteryScore_direction: 'stable' },
    provenance: { source: 'test' },
  },
];

function buildMockOverviewData(): OverviewSyncData {
  const kpis = computeOverviewKpis(MOCK_DECISIONS, MOCK_INGESTION, MOCK_LEARNER_STATES);
  return {
    decisions: MOCK_DECISIONS,
    recentDecisions: [...MOCK_DECISIONS].sort((a, b) => b.decided_at.localeCompare(a.decided_at)),
    learnerStates: MOCK_LEARNER_STATES,
    ingestionToday: MOCK_INGESTION,
    kpis,
  };
}

function FilterProbe() {
  const { filter, syncEnabled } = useOverviewFilter();
  return (
    <div
      data-testid="filter-probe"
      data-sync-enabled={String(syncEnabled)}
      data-decision-type={filter.decisionType ?? ''}
      data-learner={filter.learner ?? ''}
    />
  );
}

function SyncOnWithFilter({
  decisionType,
  learner,
}: {
  decisionType?: Decision['decision_type'];
  learner?: string;
}) {
  const { setSyncEnabled, setFilter } = useOverviewFilter();

  useEffect(() => {
    setSyncEnabled(true);
    setFilter((prev) => ({
      ...prev,
      ...(decisionType !== undefined ? { decisionType } : {}),
      ...(learner !== undefined ? { learner } : {}),
    }));
  }, [decisionType, learner, setFilter, setSyncEnabled]);

  return null;
}

function renderOverviewSurfaces(options?: {
  syncOn?: boolean;
  decisionType?: Decision['decision_type'];
  learner?: string;
}) {
  const data = buildMockOverviewData();

  return render(
    <TooltipProvider>
      <OverviewSyncProvider data={data}>
        <FilterProbe />
        {options?.syncOn ? (
          <SyncOnWithFilter decisionType={options.decisionType} learner={options.learner} />
        ) : null}
        <SyncFilterToggle />
        <ActiveFilterChips />
        <SectionCards kpis={data.kpis} />
      </OverviewSyncProvider>
    </TooltipProvider>
  );
}

describe('XFILTER-008: toggle OFF renders today’s behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows no chip row, full KPI counts, and navigation links', () => {
    const data = buildMockOverviewData();
    renderOverviewSurfaces();

    expect(screen.queryByRole('group', { name: 'Active overview filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Needs attention: \d+/ })).toHaveAttribute(
      'href',
      '/attention'
    );
    expect(screen.getByRole('link', { name: /Pending decisions: \d+/ })).toHaveAttribute(
      'href',
      '/attention?from=pending'
    );
    expect(
      screen.getByRole('link', {
        name: `Rejected signals today: ${data.kpis.signalsToday.rejected}`,
      })
    ).toHaveAttribute('href', '/signals');
    expect(
      screen.getByRole('link', {
        name: `Improving learners: ${data.kpis.improvingLearners}`,
      })
    ).toHaveAttribute('href', '/learners?trend=improving');

    expect(
      screen.getByRole('link', { name: `Needs attention: ${data.kpis.needsAttention.count}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: `Pending decisions: ${data.kpis.pendingDecisions}` })
    ).toBeInTheDocument();
  });
});

describe('XFILTER-009: toggle ON shows chips and partial KPI recompute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows Reinforce chip, recomputes decision-derived KPIs, keeps program-wide totals', async () => {
    const data = buildMockOverviewData();
    const reinforceFilter = { ...DEFAULT_OVERVIEW_FILTER, decisionType: 'reinforce' as const };
    const filtered = applyOverviewFilter(
      {
        decisions: data.decisions,
        ingestionToday: data.ingestionToday,
        learnerStates: data.learnerStates,
      },
      reinforceFilter,
      NOW
    );

    renderOverviewSurfaces({ syncOn: true, decisionType: 'reinforce' });

    await waitFor(() => {
      expect(screen.getByText('Filtered: Reinforce')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', {
        name: `Needs attention: ${filtered.decisionDerivedKpis.needsAttention.count}`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: `Pending decisions: ${filtered.decisionDerivedKpis.pendingDecisions}`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: `Rejected signals today: ${data.kpis.signalsToday.rejected}`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: `Improving learners: ${data.kpis.improvingLearners}`,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Program-wide').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Needs attention:/ })).toHaveAttribute(
      'href',
      '/attention'
    );
  });
});

describe('XFILTER-014: KPI cards navigate when sync ON', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('navigates to /attention without changing the shared filter', async () => {
    renderOverviewSurfaces({ syncOn: true, decisionType: 'reinforce' });

    await waitFor(() => {
      expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-decision-type', 'reinforce');
    });

    const link = screen.getByRole('link', { name: /Needs attention:/ });
    expect(link).toHaveAttribute('href', '/attention');

    fireEvent.click(link);

    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-decision-type', 'reinforce');
    expect(screen.getByText('Filtered: Reinforce')).toBeInTheDocument();
  });
});

describe('XFILTER-010: chip remove and Clear all reset filter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clears learner filter when chip ✕ is clicked', async () => {
    renderOverviewSurfaces({ syncOn: true, learner: 'stu-40123' });

    await waitFor(() => {
      expect(screen.getByText('Learner: stu-40123')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Learner: stu-40123 filter' }));

    await waitFor(() => {
      expect(screen.queryByText('Learner: stu-40123')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-learner', '');
  });

  it('resets all filters when Clear all is clicked', async () => {
    renderOverviewSurfaces({ syncOn: true, decisionType: 'reinforce', learner: 'stu-40123' });

    await waitFor(() => {
      expect(screen.getByText('Filtered: Reinforce')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Active overview filters' })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-decision-type', '');
    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-learner', '');
  });
});

describe('XFILTER-011: no hydration flash for persisted ON state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reconciles to ON from localStorage after mount without leaving filter selection', async () => {
    localStorage.setItem('overview:sync-filters:v1', 'on');

    renderOverviewSurfaces();

    const switchControl = screen.getByRole('switch', { name: /Sync filters/i });

    await waitFor(() => {
      expect(switchControl).toHaveAttribute('aria-checked', 'true');
    });

    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-sync-enabled', 'true');
    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-decision-type', '');
    expect(screen.getByTestId('filter-probe')).toHaveAttribute('data-learner', '');
    expect(screen.queryByRole('group', { name: 'Active overview filters' })).not.toBeInTheDocument();
  });

  it('SSR HTML shows unchecked switch when localStorage is ON (mounted guard)', () => {
    localStorage.setItem('overview:sync-filters:v1', 'on');
    const data = buildMockOverviewData();

    const html = renderToString(
      <TooltipProvider>
        <OverviewSyncProvider data={data}>
          <SyncFilterToggle />
        </OverviewSyncProvider>
      </TooltipProvider>
    );

    expect(html).toContain('data-unchecked=""');
    expect(html).toContain('aria-checked="false"');
  });
});
