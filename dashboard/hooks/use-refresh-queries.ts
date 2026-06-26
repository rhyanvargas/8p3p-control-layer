'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/** Invalidates TanStack caches and re-fetches RSC sections (Overview KPIs, etc.). */
export function useRefreshQueries() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(async () => {
    await queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}
