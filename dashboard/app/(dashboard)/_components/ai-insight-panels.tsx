'use client';

import { EducatorInsights } from '@/components/panels/EducatorInsights';
import { isAiExplanationsDemoEnabled } from '@/lib/ai/mock-explanations';

/**
 * Educator AI insights on Overview.
 * Shown when demo mode is on so feature-tour screenshots can showcase generative copy.
 * In production this consumes cached `educator_explanation` from the API.
 */
export function AiInsightPanels({ orgId }: { orgId: string }) {
  if (!isAiExplanationsDemoEnabled()) return null;

  return <EducatorInsights orgId={orgId} />;
}
