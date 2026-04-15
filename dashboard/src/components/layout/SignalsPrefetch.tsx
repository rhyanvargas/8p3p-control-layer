import { useSignals } from '@/hooks/use-signals';

/** Warms the sampled signals query for future panel use (org-wide bounded fan-out). */
export function SignalsPrefetch({ orgId }: { orgId: string }) {
  useSignals(orgId);
  return null;
}
