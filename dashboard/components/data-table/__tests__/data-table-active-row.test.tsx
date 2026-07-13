import { render, screen, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/data-table';

type Row = { id: string; label: string };

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'label',
    header: 'Label',
  },
];

const data: Row[] = [
  { id: 'decision-a', label: 'Decision A' },
  { id: 'decision-b', label: 'Decision B' },
];

describe('DataTable activeRowId (RTC-005)', () => {
  it('RTC-005: activeRowId marks matching row active and leaves others unmarked', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        activeRowId="decision-a"
        showFilter={false}
        showPagination={false}
      />
    );

    const rowA = screen.getByText('Decision A').closest('tr');
    const rowB = screen.getByText('Decision B').closest('tr');

    expect(rowA).toHaveAttribute('data-state', 'active');
    expect(rowB).not.toHaveAttribute('data-state', 'active');
    expect(within(rowB as HTMLElement).queryByText('Decision B')).toBeInTheDocument();
  });
});
