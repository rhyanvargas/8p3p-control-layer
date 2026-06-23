'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/** Invalidates all active TanStack Query caches (global refresh control). */
export function useRefreshQueries() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);
}
