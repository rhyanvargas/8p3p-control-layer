import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

import { createRowActionsColumn } from '@/components/data-table/create-row-actions-column';
import { DataTable } from '@/components/data-table/data-table';

type Row = { id: string; label: string };

describe('createRowActionsColumn (RTC-009)', () => {
  it('RTC-009: Approve in actions cell fires onApprove and does not fire onRowClick', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onRowClick = vi.fn();

    const columns: ColumnDef<Row>[] = [
      {
        accessorKey: 'label',
        header: 'Label',
      },
      createRowActionsColumn<Row>([
        {
          id: 'approve',
          label: 'Approve',
          onClick: onApprove,
          ariaLabel: (row) => `Approve decision for ${row.label}`,
        },
      ]),
    ];

    render(
      <DataTable
        columns={columns}
        data={[{ id: 'dec-1', label: 'learner-alpha' }]}
        getRowId={(row) => row.id}
        onRowClick={onRowClick}
        showFilter={false}
        showPagination={false}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Approve decision for learner-alpha' })
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith({ id: 'dec-1', label: 'learner-alpha' });
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
