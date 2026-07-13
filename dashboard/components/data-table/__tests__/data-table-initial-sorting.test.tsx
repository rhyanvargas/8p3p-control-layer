import { render, screen, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/data-table';

type Row = { id: string; decided_at: string; label: string };

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'decided_at',
    header: 'Time',
  },
  {
    accessorKey: 'label',
    header: 'Label',
  },
];

const data: Row[] = [
  { id: 'older', decided_at: '2026-01-01T10:00:00.000Z', label: 'Older decision' },
  { id: 'newest', decided_at: '2026-06-15T18:00:00.000Z', label: 'Newest decision' },
  { id: 'middle', decided_at: '2026-03-01T12:00:00.000Z', label: 'Middle decision' },
];

describe('DataTable initialSorting (RTC-010)', () => {
  it('RTC-010: decided_at desc puts newest row first', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        initialSorting={[{ id: 'decided_at', desc: true }]}
        showFilter={false}
        showPagination={false}
      />
    );

    const rows = screen.getAllByRole('row');
    // Header row + 3 data rows
    expect(rows).toHaveLength(4);

    const firstDataRow = rows[1]!;
    expect(within(firstDataRow).getByText('Newest decision')).toBeInTheDocument();
    expect(within(firstDataRow).getByText('2026-06-15T18:00:00.000Z')).toBeInTheDocument();
  });
});
