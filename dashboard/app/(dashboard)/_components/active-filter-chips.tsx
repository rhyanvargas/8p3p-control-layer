'use client';

import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DecisionType } from '@/lib/api/types';
import {
  DEFAULT_OVERVIEW_FILTER,
  type OverviewFilter,
} from '@/lib/overview/overview-filter';

import { useOverviewFilter } from './overview-sync-provider';

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  reinforce: 'Reinforce',
  advance: 'Advance',
  intervene: 'Intervene',
  pause: 'Pause',
};

function isFilterActive(filter: OverviewFilter): boolean {
  return (
    filter.decisionType !== null ||
    (filter.learner !== null && filter.learner.trim() !== '') ||
    filter.range !== DEFAULT_OVERVIEW_FILTER.range
  );
}

type FilterChipProps = {
  label: string;
  onRemove: () => void;
};

function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-muted rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Remove ${label} filter`}
      >
        <X aria-hidden="true" />
      </button>
    </Badge>
  );
}

export function ActiveFilterChips() {
  const { syncEnabled, filter, setFilter } = useOverviewFilter();

  if (!syncEnabled || !isFilterActive(filter)) {
    return null;
  }

  function clearAll() {
    setFilter(DEFAULT_OVERVIEW_FILTER);
  }

  function clearDecisionType() {
    setFilter((prev) => ({ ...prev, decisionType: null }));
  }

  function clearLearner() {
    setFilter((prev) => ({ ...prev, learner: null }));
  }

  function clearRange() {
    setFilter((prev) => ({ ...prev, range: DEFAULT_OVERVIEW_FILTER.range }));
  }

  const learnerLabel =
    filter.learner !== null && filter.learner.trim() !== '' ? filter.learner.trim() : null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Active overview filters"
    >
      {filter.decisionType !== null ? (
        <FilterChip
          label={`Filtered: ${DECISION_TYPE_LABELS[filter.decisionType]}`}
          onRemove={clearDecisionType}
        />
      ) : null}
      {learnerLabel ? (
        <FilterChip label={`Learner: ${learnerLabel}`} onRemove={clearLearner} />
      ) : null}
      {filter.range !== DEFAULT_OVERVIEW_FILTER.range ? (
        <FilterChip label={`Range: ${filter.range}d`} onRemove={clearRange} />
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
        Clear all
      </Button>
    </div>
  );
}
