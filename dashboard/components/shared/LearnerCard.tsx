import type { ReactNode } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface LearnerCardProps {
  learnerRef: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional right-side header slot (e.g. urgency). */
  headerRight?: ReactNode;
}

export function LearnerCard({ learnerRef, children, footer, headerRight }: LearnerCardProps) {
  return (
    <Card
      className="gap-0 py-0"
      aria-label={`Learner card for ${learnerRef}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-3">
        <CardTitle className="text-base font-semibold tracking-tight">{learnerRef}</CardTitle>
        {headerRight}
      </CardHeader>
      <CardContent className="space-y-2 py-3">{children}</CardContent>
      {footer ? <CardFooter className="py-3">{footer}</CardFooter> : null}
    </Card>
  );
}
