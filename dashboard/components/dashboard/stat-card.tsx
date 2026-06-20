import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  description?: string;
  delta?: number;
  href?: string;
  footerLabel?: string;
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
  description,
  delta,
  href,
  footerLabel,
  className,
}: StatCardProps) {
  const footer =
    href && footerLabel ? (
      <Link
        href={href}
        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
      >
        {footerLabel}
      </Link>
    ) : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
        {delta != null ? <DeltaBadge delta={delta} /> : null}
      </CardHeader>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}
