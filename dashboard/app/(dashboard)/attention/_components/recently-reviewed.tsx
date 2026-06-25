'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { DecisionBadge } from '@/components/shared/decision-badge';
import { ReviewActionChip } from '@/components/shared/review-action-chip';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  listRecentReviews,
  type DecisionReviewRecord,
} from '@/lib/decision-review';
import { cn } from '@/lib/utils';

function formatReviewRelativeTime(iso: string, nowMs: number): string {
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

type RecentlyReviewedProps = {
  reviewTick: number;
  onRowClick: (record: DecisionReviewRecord) => void;
};

export function RecentlyReviewed({ reviewTick, onRowClick }: RecentlyReviewedProps) {
  const reviews = useMemo(() => {
    void reviewTick;
    return listRecentReviews(10);
  }, [reviewTick]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const reviewSignature = reviews
    .map((record) => `${record.decisionId}:${record.reviewedAt}:${record.source}`)
    .join('|');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (reviews.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Recently reviewed decisions"
      className="border-border flex flex-col gap-4 border-t pt-6"
    >
      <Collapsible key={reviewSignature} defaultOpen>
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-left text-sm font-medium transition-colors">
          <ChevronDown
            className={cn(
              'size-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180'
            )}
            aria-hidden="true"
          />
          Recently reviewed ({reviews.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 flex flex-col gap-1">
          <ul className="flex flex-col gap-1">
            {reviews.map((record) => (
              <li key={record.decisionId}>
                <div className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                    onClick={() => onRowClick(record)}
                  >
                    <span className="text-foreground font-medium">
                      {record.learnerReference || record.decisionId}
                    </span>
                    <DecisionBadge type={record.decisionType} />
                    <ReviewActionChip action={record.action} />
                    <span
                      className="text-muted-foreground text-xs"
                      title={
                        record.source === 'api'
                          ? new Date(record.reviewedAt).toLocaleString()
                          : undefined
                      }
                    >
                      {formatReviewRelativeTime(record.reviewedAt, nowMs)}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-8 shrink-0 px-2"
                    nativeButton={false}
                    render={
                      <Link
                        href={`/decisions/${encodeURIComponent(record.decisionId)}`}
                      />
                    }
                  >
                    View
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
