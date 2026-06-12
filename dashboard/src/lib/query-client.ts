import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

export const queryKeys = {
  learnerSummary: (orgId: string, learnerRef: string, recentDecisionsLimit = 10) =>
    ['learner-summary', orgId, learnerRef, recentDecisionsLimit] as const,
};
