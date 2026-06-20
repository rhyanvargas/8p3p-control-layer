import { SectionCards } from '@/components/dashboard/section-cards';
import { getOverviewData } from '@/lib/api/fetch-overview-data.server';
import type { OverviewKpis } from '@/lib/overview-metrics';

import { OverviewSectionError } from './overview-section-error';

type OverviewKpiSectionProps = {
  orgId: string;
};

export async function OverviewKpiSection({ orgId }: OverviewKpiSectionProps) {
  let kpis: OverviewKpis | undefined;
  let error: unknown;

  try {
    ({ kpis } = await getOverviewData(orgId));
  } catch (caught) {
    error = caught;
  }

  if (error) {
    return <OverviewSectionError error={error} />;
  }

  return <SectionCards kpis={kpis!} />;
}
