import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();
const refresh = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { useRefreshQueries } from '@/hooks/use-refresh-queries';

describe('FRSH-003: useRefreshQueries router.refresh', () => {
  it('invalidates TanStack queries and calls router.refresh', () => {
    const { result } = renderHook(() => useRefreshQueries());

    act(() => {
      result.current();
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
