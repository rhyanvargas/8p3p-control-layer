import 'server-only';

import { getServerEnv } from '@/lib/env';

/** Resolved org for server components; empty when multi-org mode (no pin). */
export function getServerOrgId(): string {
  return getServerEnv().CONTROL_LAYER_ORG_ID ?? '';
}
