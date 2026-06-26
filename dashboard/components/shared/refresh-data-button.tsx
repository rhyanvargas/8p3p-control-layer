'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useRefreshQueries } from '@/hooks/use-refresh-queries';
import { cn } from '@/lib/utils';

/** Reuse one toast slot so rapid refreshes do not stack identical notifications. */
const REFRESH_TOAST_ID = 'dashboard-data-refresh';

type RefreshDataButtonProps = {
  /** Shown in the toast after refresh completes. Defaults to "Page data refreshed". */
  successMessage?: string;
  className?: string;
};

export function RefreshDataButton({
  successMessage = 'Page data refreshed',
  className,
}: RefreshDataButtonProps) {
  const refresh = useRefreshQueries();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    if (isRefreshing) return;

    setIsRefreshing(true);
    toast.loading('Refreshing data…', { id: REFRESH_TOAST_ID });

    try {
      await refresh();
      toast.success(successMessage, { id: REFRESH_TOAST_ID });
    } catch {
      toast.error('Could not refresh data', { id: REFRESH_TOAST_ID });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleRefresh()}
      disabled={isRefreshing}
      className={className}
    >
      <RefreshCw
        aria-hidden="true"
        className={cn('size-4', isRefreshing && 'animate-spin')}
      />
      Refresh data
    </Button>
  );
}
