import { FreshnessChip } from '@/components/shared/freshness-chip';
import { getOverviewData } from '@/lib/api/fetch-overview-data.server';

type OverviewFreshnessProps = {
  orgId: string;
};

export async function OverviewFreshness({ orgId }: OverviewFreshnessProps) {
  const { fetchedAt } = await getOverviewData(orgId);
  return <FreshnessChip fetchedAt={fetchedAt} />;
}
