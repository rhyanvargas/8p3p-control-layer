'use client';

import { DecisionReviewSection } from '@/app/(dashboard)/attention/_components/decision-review-section';
import { WhoNeedsAttention } from '@/app/(dashboard)/attention/_components/who-needs-attention';

type AttentionQueueProps = {
  orgId: string;
};

export function AttentionQueue({ orgId }: AttentionQueueProps) {
  return (
    <div className="flex flex-col gap-8">
      <WhoNeedsAttention orgId={orgId} />
      <DecisionReviewSection orgId={orgId} />
    </div>
  );
}
