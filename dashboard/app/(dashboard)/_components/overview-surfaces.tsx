import { getOverviewData } from '@/lib/api/fetch-overview-data.server';

import { OverviewExplorer } from './overview-explorer';
import { OverviewSectionError } from './overview-section-error';
import { OverviewSyncProvider } from './overview-sync-provider';

type OverviewSurfacesProps = {
  orgId: string;
};

export async function OverviewSurfaces({ orgId }: OverviewSurfacesProps) {
  let error: unknown;
  let overviewData: Awaited<ReturnType<typeof getOverviewData>> | undefined;

  try {
    overviewData = await getOverviewData(orgId);
  } catch (caught) {
    error = caught;
  }

  if (error) {
    return <OverviewSectionError error={error} />;
  }

  const { decisions, recentDecisions, learnerStates, ingestionToday, kpis, fetchedAt } =
    overviewData!;

  return (
    <OverviewSyncProvider
      data={{
        decisions,
        recentDecisions,
        learnerStates,
        ingestionToday,
        kpis,
        fetchedAt,
      }}
    >
      <OverviewExplorer />
    </OverviewSyncProvider>
  );
}
