import { TrendChart } from '@/components/dashboard/trend-chart';
import { getOverviewData } from '@/lib/api/fetch-overview-data.server';
import type { Decision, LearnerStateResponse } from '@/lib/api/types';

import { OverviewSectionError } from './overview-section-error';

type OverviewTrendSectionProps = {
  orgId: string;
};

export async function OverviewTrendSection({ orgId }: OverviewTrendSectionProps) {
  let decisions: Decision[] | undefined;
  let learnerStates: LearnerStateResponse[] | undefined;
  let error: unknown;

  try {
    ({ decisions, learnerStates } = await getOverviewData(orgId));
  } catch (caught) {
    error = caught;
  }

  if (error) {
    return <OverviewSectionError error={error} />;
  }

  return <TrendChart decisions={decisions!} learnerStates={learnerStates!} />;
}
