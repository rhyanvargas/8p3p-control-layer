'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';

function formatRelativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'just now';

  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

type FreshnessChipProps = {
  fetchedAt: string;
  className?: string;
};

export function FreshnessChip({ fetchedAt, className }: FreshnessChipProps) {
  // Start `null` so server and initial client render agree; the real
  // Date.now()-based value is computed after mount to avoid a hydration
  // mismatch (server and client render at different instants).
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setRelative(formatRelativeTime(fetchedAt, Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [fetchedAt]);

  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
        className
      )}
    >
      <Clock aria-hidden="true" className="size-3.5" />
      Updated {relative ?? 'just now'}
    </span>
  );
}
