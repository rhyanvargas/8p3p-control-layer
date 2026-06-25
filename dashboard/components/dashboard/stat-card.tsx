'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  tooltip?: string;
  /** Secondary line below value (e.g. reviewed-today copy on Pending KPI). */
  secondaryLine?: React.ReactNode;
  delta?: number;
  href?: string;
  /** Overrides default title+value aria-label when value is not plain text. */
  ariaLabel?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  className?: string;
};

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-muted-foreground text-xs font-medium">No change vs yesterday</span>
    );
  }

  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        positive ? 'text-[var(--urgency-high)]' : 'text-[var(--progress-improved)]'
      )}
    >
      <Icon aria-hidden="true" />
      {positive ? '+' : ''}
      {delta} vs yesterday
    </span>
  );
}

export function StatCard({
  title,
  value,
  tooltip,
  secondaryLine,
  delta,
  href,
  ariaLabel,
  icon: Icon,
  iconClassName,
  className,
}: StatCardProps) {
  const accessibleName =
    ariaLabel ??
    (typeof value === 'string' || typeof value === 'number'
      ? `${title}: ${value}`
      : title);

  return (
    <Card
      className={cn(
        href && 'relative transition-colors hover:bg-muted/40',
        className
      )}
    >
      {href ? (
        <Link
          href={href}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={accessibleName}
        />
      ) : null}
      <CardHeader className={cn(href && 'pointer-events-none relative')}>
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon
              aria-hidden="true"
              className={cn('size-4 shrink-0', iconClassName)}
            />
          ) : null}
          <CardDescription className="flex-1">{title}</CardDescription>
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger
                type="button"
                className="text-muted-foreground hover:text-foreground pointer-events-auto relative z-20 inline-flex shrink-0 rounded-sm"
                aria-label={`More about ${title}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {secondaryLine ? (
          <p className="text-muted-foreground text-xs font-medium">{secondaryLine}</p>
        ) : null}
        {delta != null ? <DeltaBadge delta={delta} /> : null}
      </CardHeader>
    </Card>
  );
}
