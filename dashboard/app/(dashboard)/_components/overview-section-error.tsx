'use client';

import { useRouter } from 'next/navigation';

import { ErrorState } from '@/components/states/error-state';

type OverviewSectionErrorProps = {
  error: unknown;
};

export function OverviewSectionError({ error }: OverviewSectionErrorProps) {
  const router = useRouter();

  return (
    <ErrorState
      error={error}
      onRetry={() => {
        router.refresh();
      }}
    />
  );
}
