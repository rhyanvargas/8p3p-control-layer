import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { FreshnessChip } from '@/components/shared/freshness-chip';

describe('FRSH-002: FreshnessChip relative time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Updated relative from ISO timestamp', () => {
    render(<FreshnessChip fetchedAt="2026-06-23T11:59:00Z" />);
    expect(screen.getByText(/Updated 1m ago/)).toBeInTheDocument();
  });
});
