'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { AttentionReviewBar } from '@/app/(dashboard)/attention/_components/attention-review-bar';
import { LearnerOverviewTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-overview-tab';
import { LearnerStateTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-state-tab';
import { LearnerStrugglesTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-struggles-tab';
import { LearnerTrajectoryTab } from '@/app/(dashboard)/learners/[ref]/_components/learner-trajectory-tab';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type LearnerDetailViewProps = {
  orgId: string;
  learnerRef: string;
  version?: number;
  reviewDecisionId?: string;
  fromAttention?: boolean;
};

export function LearnerDetailView({
  orgId,
  learnerRef,
  version,
  reviewDecisionId,
  fromAttention = false,
}: LearnerDetailViewProps) {
  const showReviewBar = reviewDecisionId != null && reviewDecisionId !== '';

  return (
    <div className={showReviewBar ? 'flex flex-col gap-6 pb-36 md:pb-40' : 'flex flex-col gap-6'}>
      <PageHeader title={learnerRef} description="Learner detail — one concern per tab.">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link href={fromAttention ? '/attention' : '/learners'} />
          }
        >
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          {fromAttention ? 'Back to Attention' : 'Back to roster'}
        </Button>
      </PageHeader>

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="trajectory">Trajectory</TabsTrigger>
          <TabsTrigger value="struggles">Struggles & progress</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <LearnerOverviewTab orgId={orgId} learnerRef={learnerRef} />
        </TabsContent>

        <TabsContent value="state" className="pt-4">
          <LearnerStateTab
            orgId={orgId}
            learnerRef={learnerRef}
            version={version}
          />
        </TabsContent>

        <TabsContent value="trajectory" className="pt-4">
          <LearnerTrajectoryTab orgId={orgId} learnerRef={learnerRef} />
        </TabsContent>

        <TabsContent value="struggles" className="pt-4">
          <LearnerStrugglesTab orgId={orgId} learnerRef={learnerRef} />
        </TabsContent>
      </Tabs>

      {showReviewBar ? (
        <AttentionReviewBar
          orgId={orgId}
          learnerRef={learnerRef}
          decisionId={reviewDecisionId}
        />
      ) : null}
    </div>
  );
}
