import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

export const queryKeys = {
  decisions: (orgId: string) => ['decisions', orgId] as const,
  learnerList: (orgId: string) => ['learner-list', orgId] as const,
  learnerState: (orgId: string, learnerRef: string, version?: number) =>
    ['learner-state', orgId, learnerRef, version ?? 'current'] as const,
  learnerIngestion: (orgId: string, learnerRef: string) =>
    ['learner-ingestion', orgId, learnerRef] as const,
  learnerSummary: (orgId: string, learnerRef: string, recentDecisionsLimit = 10) =>
    ['learner-summary', orgId, learnerRef, recentDecisionsLimit] as const,
  signals: (orgId: string) => ['signals', orgId] as const,
  ingestionLog: (orgId: string, outcome: string, cursor: string) =>
    ['ingestion-log', orgId, outcome, cursor] as const,
  policies: (orgId: string) => ['policies', orgId] as const,
  programMetrics: (orgId: string, from: string, to: string) =>
    ['program-metrics', orgId, from, to] as const,
};
