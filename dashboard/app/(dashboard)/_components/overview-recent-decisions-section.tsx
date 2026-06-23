import { getOverviewData } from '@/lib/api/fetch-overview-data.server';
import type { Decision } from '@/lib/api/types';

import { OverviewSectionError } from './overview-section-error';
import { RecentDecisionsTable } from './recent-decisions-table';

type OverviewRecentDecisionsSectionProps = {
  orgId: string;
};

export async function OverviewRecentDecisionsSection({
  orgId,
}: OverviewRecentDecisionsSectionProps) {
  let recentDecisions: Decision[] | undefined;
  let error: unknown;

  try {
    ({ recentDecisions } = await getOverviewData(orgId));
  } catch (caught) {
    error = caught;
  }

  if (error) {
    return <OverviewSectionError error={error} />;
  }

  return <RecentDecisionsTable decisions={recentDecisions!} />;
}
