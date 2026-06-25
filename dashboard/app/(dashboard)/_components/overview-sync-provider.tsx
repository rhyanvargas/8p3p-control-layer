'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  useDeferredValue,
  startTransition,
  type ReactNode,
} from 'react';

import type { Decision, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import {
  applyOverviewFilter,
  DEFAULT_OVERVIEW_FILTER,
  type OverviewFilter,
  type OverviewFilterResult,
} from '@/lib/overview/overview-filter';
import { readSyncToggle, writeSyncToggle } from '@/lib/overview/sync-toggle-persistence';
import type { OverviewKpis } from '@/lib/overview-metrics';

export type OverviewSyncData = {
  decisions: Decision[];
  recentDecisions: Decision[];
  learnerStates: LearnerStateResponse[];
  ingestionToday: IngestionLogEntry[];
  kpis: OverviewKpis;
  fetchedAt?: string;
};

type OverviewFilterContextValue = {
  syncEnabled: boolean;
  setSyncEnabled: (enabled: boolean) => void;
  filter: OverviewFilter;
  setFilter: (update: OverviewFilter | ((prev: OverviewFilter) => OverviewFilter)) => void;
  deferredFilter: OverviewFilter;
  data: OverviewSyncData;
  derived: OverviewFilterResult;
};

const OverviewFilterContext = createContext<OverviewFilterContextValue | null>(null);

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function buildSyncOffDerived(data: OverviewSyncData): OverviewFilterResult {
  return {
    filteredDecisions: data.decisions,
    filteredRecentDecisions: data.recentDecisions,
    decisionDerivedKpis: {
      needsAttention: data.kpis.needsAttention,
      pendingDecisions: data.kpis.pendingDecisions,
    },
    programWideKpis: {
      signalsToday: data.kpis.signalsToday,
      improvingLearners: data.kpis.improvingLearners,
    },
  };
}

type OverviewSyncProviderProps = {
  data: OverviewSyncData;
  children: ReactNode;
};

export function OverviewSyncProvider({ data, children }: OverviewSyncProviderProps) {
  const mounted = useMounted();
  const [syncHydrated, setSyncHydrated] = useState(false);
  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [filter, setFilterState] = useState<OverviewFilter>(DEFAULT_OVERVIEW_FILTER);

  if (mounted && !syncHydrated) {
    setSyncHydrated(true);
    setSyncEnabledState(readSyncToggle());
  }

  const setSyncEnabled = useCallback((enabled: boolean) => {
    setSyncEnabledState(enabled);
    writeSyncToggle(enabled);
    if (!enabled) {
      setFilterState(DEFAULT_OVERVIEW_FILTER);
    }
  }, []);

  const setFilter = useCallback(
    (update: OverviewFilter | ((prev: OverviewFilter) => OverviewFilter)) => {
      startTransition(() => {
        setFilterState(update);
      });
    },
    []
  );

  const deferredFilter = useDeferredValue(filter);

  const filterData = useMemo(
    () => ({
      decisions: data.decisions,
      ingestionToday: data.ingestionToday,
      learnerStates: data.learnerStates,
    }),
    [data.decisions, data.ingestionToday, data.learnerStates]
  );

  const derived = useMemo(() => {
    if (!syncEnabled) {
      return buildSyncOffDerived(data);
    }
    return applyOverviewFilter(filterData, deferredFilter);
  }, [syncEnabled, data, filterData, deferredFilter]);

  const value = useMemo(
    (): OverviewFilterContextValue => ({
      syncEnabled,
      setSyncEnabled,
      filter,
      setFilter,
      deferredFilter,
      data,
      derived,
    }),
    [syncEnabled, setSyncEnabled, filter, setFilter, deferredFilter, data, derived]
  );

  return (
    <OverviewFilterContext.Provider value={value}>{children}</OverviewFilterContext.Provider>
  );
}

export function useOverviewFilter(): OverviewFilterContextValue {
  const context = useContext(OverviewFilterContext);
  if (!context) {
    throw new Error('useOverviewFilter must be used within OverviewSyncProvider');
  }
  return context;
}

/** Returns null outside OverviewSyncProvider — for surfaces that also render in tests. */
export function useOptionalOverviewFilter(): OverviewFilterContextValue | null {
  return useContext(OverviewFilterContext);
}
