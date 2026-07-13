'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';

export type RowActionDef<TData> = {
  id: string;
  label: string;
  onClick: (row: TData) => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  ariaLabel?: (row: TData) => string;
};

type CreateRowActionsColumnOptions = {
  id?: string;
  size?: number;
  headerLabel?: string;
};

/**
 * Factory for a TanStack actions column that stops click propagation so row
 * `onRowClick` does not fire when an action control is used (RTC-F09).
 */
export function createRowActionsColumn<TData>(
  actions: RowActionDef<TData>[],
  options: CreateRowActionsColumnOptions = {},
): ColumnDef<TData, unknown> {
  const { id = 'actions', size = 160, headerLabel = 'Review actions' } = options;

  return {
    id,
    enableSorting: false,
    enableHiding: false,
    size,
    header: () => <span className="sr-only">{headerLabel}</span>,
    cell: ({ row }) => {
      const item = row.original;

      return (
        <div className="flex justify-end gap-1">
          {actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.variant ?? 'default'}
              className="h-8 px-2.5"
              onClick={(event) => {
                event.stopPropagation();
                action.onClick(item);
              }}
              aria-label={action.ariaLabel?.(item) ?? action.label}
            >
              {action.label}
            </Button>
          ))}
        </div>
      );
    },
  };
}
