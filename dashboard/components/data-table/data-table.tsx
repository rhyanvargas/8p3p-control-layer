'use client';

import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';

import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { EmptyState } from '@/components/states/empty-state';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Column id used for the global text filter. */
  filterColumn?: string;
  filterPlaceholder?: string;
  pageSize?: number;
  /** Row click opens L1 DetailSheet — preserves list scroll via controlled sheet state in parent. */
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData, index: number) => string;
  emptyMessage?: string;
  showPagination?: boolean;
  showFilter?: boolean;
  className?: string;
};

export function DataTable<TData>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = 'Filter…',
  pageSize = 10,
  onRowClick,
  getRowId,
  emptyMessage = 'No results.',
  showPagination = true,
  showFilter = true,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      globalFilter: filterColumn ? undefined : globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
    globalFilterFn: 'includesString',
  });

  const filterValue = filterColumn
    ? ((table.getColumn(filterColumn)?.getFilterValue() as string) ?? '')
    : globalFilter;

  function handleFilterChange(value: string) {
    if (filterColumn) {
      table.getColumn(filterColumn)?.setFilterValue(value);
      return;
    }
    setGlobalFilter(value);
  }

  const rows = table.getRowModel().rows;
  const isInteractive = Boolean(onRowClick);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {showFilter ? (
        <Input
          value={filterValue}
          onChange={(event) => handleFilterChange(event.target.value)}
          placeholder={filterPlaceholder}
          className="max-w-sm"
          aria-label={filterPlaceholder}
        />
      ) : null}

      <div className="border-border rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  className={cn(isInteractive && 'cursor-pointer')}
                  onClick={
                    isInteractive
                      ? () => onRowClick?.(row.original)
                      : undefined
                  }
                  onKeyDown={
                    isInteractive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick?.(row.original);
                          }
                        }
                      : undefined
                  }
                  role={isInteractive ? 'button' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState message={emptyMessage} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && rows.length > 0 ? (
        <DataTablePagination table={table} />
      ) : null}
    </div>
  );
}
