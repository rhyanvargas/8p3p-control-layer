'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';

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
import { icon } from '@/lib/semantic-colors';

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  tooltip?: string;
  /** Labeled context beside the hero value (e.g. `17 accepted`, `3 reviewed`). */
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
      <span className="text-muted-foreground text-xs font-medium">Unchanged</span>
    );
  }

  const positive = delta > 0;
  const Icon = positive ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        positive ? icon.danger : icon.success
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {positive ? '+' : ''}
      {delta}
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
      <CardHeader className={cn('min-w-0', href && 'pointer-events-none relative')}>
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <Icon
              aria-hidden="true"
              className={cn('size-4 shrink-0', iconClassName)}
            />
          ) : null}
          <CardDescription className="min-w-0 flex-1 truncate">{title}</CardDescription>
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
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {value}
          </CardTitle>
          {delta != null ? <DeltaBadge delta={delta} /> : null}
          {secondaryLine ? (
            <span className="text-muted-foreground text-xs font-medium">
              {secondaryLine}
            </span>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}
