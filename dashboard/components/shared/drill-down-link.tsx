import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DrillDownLinkProps = {
  href: string;
  /** Footer CTA label — e.g. "Open full view" or "Open trace". */
  label?: string;
  className?: string;
};

export function DrillDownLink({
  href,
  label = 'Open full view',
  className,
}: DrillDownLinkProps) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      className={cn('w-full', className)}
    >
      {label}
      <ArrowRight data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}
